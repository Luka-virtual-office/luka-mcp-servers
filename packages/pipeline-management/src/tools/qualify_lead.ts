import { z } from 'zod'
import { validateInput } from '../utils/validation.js'
import { logger } from '../utils/logger.js'

export const qualifyLeadShape = {
  company: z.string().min(1).describe('Company name'),
  contact_name: z.string().min(1).describe('Primary contact name'),
  budget_usd: z.number().nonnegative().optional().describe('Available budget in USD'),
  authority: z.string().min(1).describe('Contact\'s authority level and role'),
  need: z.string().min(1).describe('Description of the prospect\'s need'),
  timeline: z.string().min(1).describe('Decision timeline'),
  additional_context: z.string().optional().describe('Additional context about the lead'),
}

const inputSchema = z.object(qualifyLeadShape)
type Input = z.infer<typeof inputSchema>

interface QualifyLeadOutput {
  bant_score: { budget: number; authority: number; need: number; timeline: number; total: number }
  meddic_flags: { metrics: boolean; economic_buyer: boolean; decision_criteria: boolean; decision_process: boolean; identify_pain: boolean; champion: boolean }
  qualification_level: 'hot' | 'warm' | 'cold' | 'disqualified'
  recommended_next_step: string
  deal_potential_usd: number
  close_probability: number
}

function scoreBudget(budget_usd: number | undefined, context: string): number {
  if (budget_usd === undefined) {
    const lower = context.toLowerCase()
    if (lower.includes('enterprise') || lower.includes('large')) return 65
    if (lower.includes('mid') || lower.includes('medium') || lower.includes('smb')) return 45
    if (lower.includes('startup') || lower.includes('small')) return 25
    return 40
  }
  if (budget_usd >= 100000) return 100
  if (budget_usd >= 50000) return 85
  if (budget_usd >= 25000) return 70
  if (budget_usd >= 10000) return 55
  if (budget_usd >= 5000) return 35
  return 15
}

function scoreAuthority(authority: string): number {
  const lower = authority.toLowerCase()
  const executiveTerms = ['ceo', 'cto', 'cfo', 'coo', 'president', 'founder', 'owner', 'vp', 'vice president', 'director', 'head of', 'chief']
  const midTerms = ['manager', 'lead', 'senior', 'principal', 'partner']
  const lowTerms = ['analyst', 'coordinator', 'specialist', 'associate', 'junior']
  if (executiveTerms.some(t => lower.includes(t))) return 90
  if (midTerms.some(t => lower.includes(t))) return 65
  if (lowTerms.some(t => lower.includes(t))) return 30
  if (lower.includes('decision') || lower.includes('approve') || lower.includes('sign')) return 80
  if (lower.includes('influence') || lower.includes('recommend')) return 55
  return 45
}

function scoreNeed(need: string): number {
  const lower = need.toLowerCase()
  let score = 40
  const urgencyTerms = ['urgent', 'critical', 'pain', 'problem', 'issue', 'challenge', 'struggling', 'need', 'require', 'must']
  const strengthTerms = ['strong', 'clear', 'high priority', 'top priority', 'immediate', 'asap', 'now']
  const weakTerms = ['maybe', 'considering', 'exploring', 'interested', 'curious', 'potential']
  if (urgencyTerms.some(t => lower.includes(t))) score += 20
  if (strengthTerms.some(t => lower.includes(t))) score += 20
  if (weakTerms.some(t => lower.includes(t))) score -= 15
  if (lower.includes('payment') || lower.includes('transaction') || lower.includes('invoice')) score += 15
  if (lower.includes('manual') || lower.includes('inefficient') || lower.includes('automat')) score += 10
  return Math.max(10, Math.min(100, score))
}

function scoreTimeline(timeline: string): number {
  const lower = timeline.toLowerCase()
  if (lower.includes('immediate') || lower.includes('asap') || lower.includes('this month') || lower.includes('this week')) return 100
  if (lower.includes('q') || lower.includes('quarter') || lower.includes('30 day') || lower.includes('next month')) return 80
  if (lower.includes('6 month') || lower.includes('half year') || lower.includes('2 quarter')) return 60
  if (lower.includes('year') || lower.includes('12 month') || lower.includes('annual')) return 40
  if (lower.includes('someday') || lower.includes('no rush') || lower.includes('eventually')) return 15
  if (lower.includes('2') || lower.includes('3') || lower.includes('month')) return 65
  return 50
}

function computeMEDDIC(authority: string, need: string, context: string): QualifyLeadOutput['meddic_flags'] {
  const all = `${authority} ${need} ${context}`.toLowerCase()
  return {
    metrics: /roi|kpi|metric|measur|benchmark|number|percent|target/.test(all),
    economic_buyer: /ceo|cfo|founder|budget|approve|executive|owner|decision maker/.test(all),
    decision_criteria: /criteria|requirement|must have|feature|capability|need/.test(all),
    decision_process: /process|committee|approval|evaluat|review|pilot|poc/.test(all),
    identify_pain: /pain|problem|issue|challenge|struggl|inefficien|manual|slow|costly/.test(all),
    champion: /champion|advocate|internal|sponsor|support/.test(all),
  }
}

function estimateDealPotential(budget_usd: number | undefined, company: string, context: string): number {
  const lower = `${company} ${context}`.toLowerCase()
  let base = budget_usd ?? 0
  if (base === 0) {
    if (lower.includes('enterprise') || lower.includes('large corp')) base = 120000
    else if (lower.includes('mid') || lower.includes('smb') || lower.includes('medium')) base = 45000
    else if (lower.includes('startup') || lower.includes('small')) base = 15000
    else base = 30000
  }
  if (lower.includes('latam') || lower.includes('region') || lower.includes('international')) base *= 1.3
  if (lower.includes('platform') || lower.includes('integration') || lower.includes('api')) base *= 1.2
  return Math.round(base)
}

export async function qualifyLeadHandler(args: Input): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const input = validateInput(inputSchema, args)
  logger.info('Running qualify_lead', { company: input.company })

  const context = `${input.additional_context ?? ''} ${input.company}`
  const budgetScore = scoreBudget(input.budget_usd, context)
  const authorityScore = scoreAuthority(input.authority)
  const needScore = scoreNeed(input.need)
  const timelineScore = scoreTimeline(input.timeline)
  const bantTotal = Math.round((budgetScore + authorityScore + needScore + timelineScore) / 4)
  const meddicFlags = computeMEDDIC(input.authority, input.need, context)
  const meddicCount = Object.values(meddicFlags).filter(Boolean).length

  const qualificationLevel: 'hot' | 'warm' | 'cold' | 'disqualified' =
    bantTotal >= 75 && meddicCount >= 4 ? 'hot'
    : bantTotal >= 55 && meddicCount >= 2 ? 'warm'
    : bantTotal >= 35 ? 'cold'
    : 'disqualified'

  const closeProbability = Math.round(bantTotal * 0.5 + meddicCount * 5 + (qualificationLevel === 'hot' ? 15 : qualificationLevel === 'warm' ? 5 : 0))
  const dealPotential = estimateDealPotential(input.budget_usd, input.company, context)

  const nextStep =
    qualificationLevel === 'hot'
      ? `Schedule executive demo with ${input.contact_name} within 48 hours. Prepare ROI-focused presentation tailored to ${input.company}'s specific payment needs.`
      : qualificationLevel === 'warm'
        ? `Send personalized case study relevant to ${input.company}'s industry. Follow up within 3 business days to schedule discovery call.`
        : qualificationLevel === 'cold'
          ? `Add ${input.contact_name} to nurture sequence. Check back in 30 days to re-assess readiness.`
          : `Deprioritize ${input.company} in active pipeline. Document disqualification reason and set 90-day re-engagement reminder.`

  const result: QualifyLeadOutput = {
    bant_score: { budget: budgetScore, authority: authorityScore, need: needScore, timeline: timelineScore, total: bantTotal },
    meddic_flags: meddicFlags,
    qualification_level: qualificationLevel,
    recommended_next_step: nextStep,
    deal_potential_usd: dealPotential,
    close_probability: Math.min(95, Math.max(5, closeProbability)),
  }

  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
}
