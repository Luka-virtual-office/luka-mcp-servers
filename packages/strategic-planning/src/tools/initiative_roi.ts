import { z } from 'zod'
import { validateInput } from '../utils/validation.js'
import { logger } from '../utils/logger.js'

export const initiativeROIShape = {
  initiative: z.string().min(1).describe('Description of the initiative to evaluate'),
  investment_usd: z.number().positive().describe('Total investment amount in USD'),
  timeframe_months: z.number().int().min(1).max(120).describe('Timeframe for ROI calculation in months'),
  strategic_goals: z.array(z.string()).min(1).describe('List of strategic goals to align against'),
}

const inputSchema = z.object(initiativeROIShape)
type Input = z.infer<typeof inputSchema>

interface InitiativeROIOutput {
  financial_roi: { estimated_return_usd: number; payback_months: number; npv: number }
  strategic_value: { score: number; rationale: string; aligned_goals: string[] }
  risk_assessment: { level: 'low' | 'medium' | 'high'; main_risks: string[]; mitigations: string[] }
  overall_recommendation: 'approve' | 'review' | 'reject'
  recommendation_rationale: string
}

const DISCOUNT_RATE_MONTHLY = 0.01

function computeNPV(cashFlows: number[], discountRateMonthly: number): number {
  return cashFlows.reduce((npv, cf, t) => npv + cf / Math.pow(1 + discountRateMonthly, t + 1), 0)
}

function estimateReturnMultiplier(initiative: string, timeframe_months: number): number {
  const lower = initiative.toLowerCase()
  let multiplier = 1.5
  if (lower.includes('revenue') || lower.includes('sales') || lower.includes('growth')) multiplier += 0.8
  if (lower.includes('platform') || lower.includes('product') || lower.includes('launch')) multiplier += 0.6
  if (lower.includes('automation') || lower.includes('efficiency') || lower.includes('cost')) multiplier += 0.5
  if (lower.includes('market') || lower.includes('expansion') || lower.includes('new')) multiplier += 0.4
  if (lower.includes('infrastructure') || lower.includes('security') || lower.includes('compliance')) multiplier += 0.2
  const timeBonus = Math.min(1.0, timeframe_months / 24 * 0.5)
  multiplier += timeBonus
  return Math.min(multiplier, 5.0)
}

function computeStrategicScore(initiative: string, strategic_goals: string[]): { score: number, aligned_goals: string[] } {
  const lower = initiative.toLowerCase()
  const aligned: string[] = []
  for (const goal of strategic_goals) {
    const goalWords = goal.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    const matchCount = goalWords.filter(w => lower.includes(w)).length
    if (matchCount > 0 || lower.includes(goal.toLowerCase().substring(0, 10))) aligned.push(goal)
  }
  const alignmentRatio = aligned.length / Math.max(strategic_goals.length, 1)
  let score = Math.round(alignmentRatio * 60)
  const highValueTerms = ['market share', 'competitive', 'moat', 'scale', 'platform', 'ecosystem', 'network effect', 'latam', 'expansion']
  const bonusTerms = highValueTerms.filter(t => lower.includes(t)).length
  score += Math.min(40, bonusTerms * 8)
  score = Math.max(score, 20)
  return { score: Math.min(100, score), aligned_goals: aligned.length > 0 ? aligned : [strategic_goals[0] ?? 'General strategy'] }
}

function assessRisk(initiative: string, investment_usd: number, timeframe_months: number): { level: 'low' | 'medium' | 'high', main_risks: string[], mitigations: string[] } {
  const lower = initiative.toLowerCase()
  const risks: string[] = []
  const mitigations: string[] = []
  if (investment_usd > 500000) {
    risks.push('Large capital commitment increases downside exposure')
    mitigations.push('Implement staged funding tranches tied to milestone achievement')
  }
  if (timeframe_months > 18) {
    risks.push('Extended timeline increases market and execution uncertainty')
    mitigations.push('Establish quarterly review gates with go/no-go decision points')
  }
  if (lower.includes('new market') || lower.includes('expansion')) {
    risks.push('Market entry risk in unfamiliar territory')
    mitigations.push('Conduct pilot in one market before full rollout')
  }
  if (lower.includes('technology') || lower.includes('platform') || lower.includes('build')) {
    risks.push('Technology execution risk and potential scope creep')
    mitigations.push('Adopt agile methodology with 2-week sprint reviews')
  }
  if (lower.includes('partner') || lower.includes('vendor') || lower.includes('third')) {
    risks.push('Third-party dependency and integration risk')
    mitigations.push('Maintain fallback options and contractual protections')
  }
  if (risks.length < 2) {
    risks.push('Opportunity cost from alternative uses of capital')
    mitigations.push('Document and review alternative investment scenarios quarterly')
  }
  if (risks.length < 3) {
    risks.push('Team bandwidth constraints during peak execution phases')
    mitigations.push('Identify dedicated team members before initiative launch')
  }
  const riskLevel: 'low' | 'medium' | 'high' =
    investment_usd > 1000000 || timeframe_months > 24 ? 'high'
    : investment_usd > 200000 || timeframe_months > 12 ? 'medium'
    : 'low'
  return { level: riskLevel, main_risks: risks.slice(0, 3), mitigations: mitigations.slice(0, 3) }
}

export async function initiativeROIHandler(args: Input): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const input = validateInput(inputSchema, args)
  logger.info('Running initiative_roi', { investment_usd: input.investment_usd, timeframe_months: input.timeframe_months })

  const returnMultiplier = estimateReturnMultiplier(input.initiative, input.timeframe_months)
  const estimatedReturn = Math.round(input.investment_usd * returnMultiplier)
  const monthlyReturn = estimatedReturn / input.timeframe_months
  const cashFlows: number[] = []
  for (let m = 0; m < input.timeframe_months; m++) {
    cashFlows.push(m < 2 ? 0 : monthlyReturn)
  }
  const npv = Math.round(computeNPV(cashFlows, DISCOUNT_RATE_MONTHLY) - input.investment_usd)

  let cumulative = 0
  let paybackMonths = input.timeframe_months
  for (let m = 0; m < cashFlows.length; m++) {
    cumulative += cashFlows[m]
    if (cumulative >= input.investment_usd) { paybackMonths = m + 1; break }
  }

  const { score: strategicScore, aligned_goals } = computeStrategicScore(input.initiative, input.strategic_goals)
  const riskAssessment = assessRisk(input.initiative, input.investment_usd, input.timeframe_months)
  const roiRatio = estimatedReturn / input.investment_usd

  let recommendation: 'approve' | 'review' | 'reject'
  let rationale: string
  if (npv > 0 && strategicScore >= 60 && riskAssessment.level !== 'high') {
    recommendation = 'approve'
    rationale = `Positive NPV of $${npv.toLocaleString()}, strong strategic alignment score of ${strategicScore}/100, and ${riskAssessment.level} risk profile collectively support approval. Estimated ${Math.round((roiRatio - 1) * 100)}% ROI over ${input.timeframe_months} months.`
  } else if (npv < 0 && strategicScore < 40) {
    recommendation = 'reject'
    rationale = `Negative NPV of $${npv.toLocaleString()} combined with weak strategic alignment (${strategicScore}/100) and ${riskAssessment.level} risk level do not justify investment. Recommend exploring alternative approaches or significantly reducing scope.`
  } else {
    recommendation = 'review'
    rationale = `Mixed signals: NPV of $${npv.toLocaleString()}, strategic score of ${strategicScore}/100, and ${riskAssessment.level} risk require deeper analysis. Recommend revisiting investment size, timeline, or scope before final decision.`
  }

  const result: InitiativeROIOutput = {
    financial_roi: { estimated_return_usd: estimatedReturn, payback_months: paybackMonths, npv },
    strategic_value: {
      score: strategicScore,
      rationale: `Initiative aligns with ${aligned_goals.length} of ${input.strategic_goals.length} stated strategic goals. Key alignment: ${aligned_goals[0] ?? 'General strategic direction'}.`,
      aligned_goals,
    },
    risk_assessment: riskAssessment,
    overall_recommendation: recommendation,
    recommendation_rationale: rationale,
  }

  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
}
