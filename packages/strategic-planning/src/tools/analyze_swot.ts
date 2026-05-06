import { z } from 'zod'
import { validateInput } from '../utils/validation.js'
import { logger } from '../utils/logger.js'

export const analyzeSWOTShape = {
  context: z.string().min(1).describe('Situation description to analyze'),
  mission: z.string().optional().default('Become Latin America\'s leading payments platform').describe('LUKA mission context'),
  timeframe: z.enum(['short', 'medium', 'long']).optional().default('medium').describe('Analysis timeframe: short (0-6m), medium (6-18m), long (18-36m)'),
}

const inputSchema = z.object(analyzeSWOTShape)
type Input = z.infer<typeof inputSchema>

interface SWOTOutput {
  strengths: string[]
  weaknesses: string[]
  opportunities: string[]
  threats: string[]
  mission_alignment_score: number
  priority_actions: string[]
  analysis_summary: string
}

function computeMissionAlignmentScore(context: string, mission: string): number {
  const missionKeywords = mission.toLowerCase().split(/\s+/).filter(w => w.length > 3)
  const contextLower = context.toLowerCase()
  const matched = missionKeywords.filter(kw => contextLower.includes(kw))
  const base = Math.round((matched.length / Math.max(missionKeywords.length, 1)) * 60)
  const strategicTerms = ['growth', 'scale', 'market', 'revenue', 'customer', 'expand', 'partner', 'platform', 'payment', 'fintech', 'latam', 'latin', 'digital', 'technology', 'innovation', 'competitive', 'leadership']
  const strategicMatches = strategicTerms.filter(t => contextLower.includes(t)).length
  const bonus = Math.min(40, strategicMatches * 5)
  return Math.min(100, base + bonus)
}

function extractContextThemes(context: string): { positive: string[], negative: string[], external_pos: string[], external_neg: string[] } {
  const lower = context.toLowerCase()
  const positive: string[] = []
  const negative: string[] = []
  const external_pos: string[] = []
  const external_neg: string[] = []

  if (lower.includes('team') || lower.includes('talent')) positive.push('Experienced team')
  if (lower.includes('tech') || lower.includes('platform') || lower.includes('software')) positive.push('Technology infrastructure')
  if (lower.includes('brand') || lower.includes('reputation')) positive.push('Brand recognition')
  if (lower.includes('customer') || lower.includes('client') || lower.includes('user')) positive.push('Established customer base')
  if (lower.includes('revenue') || lower.includes('profit') || lower.includes('growth')) positive.push('Revenue growth trajectory')
  if (lower.includes('partner') || lower.includes('integration')) positive.push('Strategic partnerships')
  if (lower.includes('data') || lower.includes('analytics')) positive.push('Data-driven capabilities')
  if (positive.length < 3) positive.push('Operational efficiency', 'Agile decision-making', 'Domain expertise')

  if (lower.includes('cost') || lower.includes('expense') || lower.includes('budget')) negative.push('High operational costs')
  if (lower.includes('slow') || lower.includes('delay') || lower.includes('bottleneck')) negative.push('Process bottlenecks')
  if (lower.includes('resource') || lower.includes('capacity')) negative.push('Resource constraints')
  if (lower.includes('legacy') || lower.includes('technical debt')) negative.push('Technical debt')
  if (negative.length < 3) negative.push('Limited market reach', 'Dependency on key personnel', 'Scaling challenges')

  if (lower.includes('market') || lower.includes('demand') || lower.includes('growth')) external_pos.push('Growing market demand')
  if (lower.includes('latam') || lower.includes('latin') || lower.includes('region')) external_pos.push('Underserved LATAM markets')
  if (lower.includes('digital') || lower.includes('digital transformation')) external_pos.push('Digital transformation wave')
  if (lower.includes('regulation') || lower.includes('compliance')) external_pos.push('Favorable regulatory environment emerging')
  if (external_pos.length < 3) external_pos.push('Emerging fintech ecosystem', 'Increased mobile penetration', 'B2B payments modernization')

  if (lower.includes('competitor') || lower.includes('competition')) external_neg.push('Intensifying competition')
  if (lower.includes('regulation') || lower.includes('compliance')) external_neg.push('Regulatory uncertainty')
  if (lower.includes('economic') || lower.includes('inflation') || lower.includes('currency')) external_neg.push('Macroeconomic volatility')
  if (external_neg.length < 3) external_neg.push('Currency devaluation risk in LATAM', 'Big tech market entry', 'Cybersecurity threats')

  return {
    positive: positive.slice(0, 5),
    negative: negative.slice(0, 5),
    external_pos: external_pos.slice(0, 5),
    external_neg: external_neg.slice(0, 5),
  }
}

function generatePriorityActions(context: string, timeframe: string, score: number): string[] {
  const lower = context.toLowerCase()
  const actions: string[] = []
  if (score < 40) actions.push('Realign current initiatives with core mission statement')
  if (lower.includes('market') || lower.includes('expand')) {
    actions.push('Conduct targeted market expansion analysis for top 2 LATAM markets')
  }
  if (lower.includes('product') || lower.includes('feature')) {
    actions.push('Prioritize product roadmap items with highest market impact')
  }
  if (timeframe === 'short') {
    actions.push('Execute quick-win revenue initiatives within 90 days')
  } else if (timeframe === 'long') {
    actions.push('Build strategic moats through technology and partnership investments')
  } else {
    actions.push('Balance short-term revenue growth with long-term platform scalability')
  }
  actions.push('Establish quarterly OKRs aligned to strategic priorities')
  actions.push('Identify and mitigate top 3 operational risks')
  return actions.slice(0, 3)
}

export async function analyzeSWOTHandler(args: Input): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const input = validateInput(inputSchema, args)
  logger.info('Running analyze_swot', { context_length: input.context.length, timeframe: input.timeframe })

  const themes = extractContextThemes(input.context)
  const mission = input.mission ?? 'Become Latin America\'s leading payments platform'
  const timeframe = input.timeframe ?? 'medium'
  const alignmentScore = computeMissionAlignmentScore(input.context, mission)
  const priorityActions = generatePriorityActions(input.context, timeframe, alignmentScore)
  const timeframeLabel = timeframe === 'short' ? '0-6 months' : timeframe === 'long' ? '18-36 months' : '6-18 months'

  const result: SWOTOutput = {
    strengths: themes.positive,
    weaknesses: themes.negative,
    opportunities: themes.external_pos,
    threats: themes.external_neg,
    mission_alignment_score: alignmentScore,
    priority_actions: priorityActions,
    analysis_summary: `SWOT analysis for the ${timeframeLabel} horizon indicates a mission alignment score of ${alignmentScore}/100 against "${mission}". The organization shows ${themes.positive.length} identifiable strengths and faces ${themes.negative.length} internal challenges. Key opportunity: ${themes.external_pos[0] ?? 'N/A'}. Primary threat: ${themes.external_neg[0] ?? 'N/A'}. Immediate focus: ${priorityActions[0] ?? 'N/A'}.`,
  }

  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
}
