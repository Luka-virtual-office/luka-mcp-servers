import { z } from 'zod'
import { validateInput } from '../utils/validation.js'
import { logger } from '../utils/logger.js'

export const predictCloseProbabilityShape = {
  deal_name: z.string().min(1).describe('Name of the deal'),
  stage: z.string().min(1).describe('Current pipeline stage'),
  days_in_stage: z.number().int().min(0).describe('Number of days the deal has been in the current stage'),
  engagement_level: z.enum(['low', 'medium', 'high']).describe('Prospect engagement level'),
  budget_confirmed: z.boolean().describe('Whether budget has been confirmed'),
  decision_maker_engaged: z.boolean().describe('Whether the decision maker is engaged'),
  competitor_present: z.boolean().describe('Whether a competitor is present in this deal'),
}

const inputSchema = z.object(predictCloseProbabilityShape)
type Input = z.infer<typeof inputSchema>

interface PredictCloseOutput {
  close_probability: number
  estimated_close_date: string
  confidence_level: 'low' | 'medium' | 'high'
  positive_signals: string[]
  risk_signals: string[]
  recommended_actions: string[]
}

const STAGE_BASE_PROBABILITIES: Record<string, number> = {
  'prospecting': 10, 'qualification': 20, 'discovery': 30, 'proposal': 45,
  'negotiation': 65, 'closing': 80, 'closed won': 100, 'closed lost': 0,
  'lead': 10, 'qualified': 25, 'demo': 35, 'demo scheduled': 35, 'contract': 70, 'verbal': 75,
}

function getStageBaseProbability(stage: string): number {
  const lower = stage.toLowerCase()
  for (const [key, prob] of Object.entries(STAGE_BASE_PROBABILITIES)) {
    if (lower.includes(key)) return prob
  }
  if (lower.includes('early') || lower.includes('initial')) return 15
  if (lower.includes('mid') || lower.includes('active')) return 40
  if (lower.includes('late') || lower.includes('final')) return 70
  return 35
}

function getExpectedDaysInStage(stage: string): number {
  const lower = stage.toLowerCase()
  if (lower.includes('prospect') || lower.includes('lead')) return 14
  if (lower.includes('qualif') || lower.includes('discovery')) return 21
  if (lower.includes('proposal') || lower.includes('demo')) return 14
  if (lower.includes('negotiat') || lower.includes('contract')) return 10
  if (lower.includes('closing') || lower.includes('verbal')) return 7
  return 14
}

function estimateCloseDays(stage: string, baseProbability: number, days_in_stage: number): number {
  const expectedDays = getExpectedDaysInStage(stage)
  const stagesRemaining = Math.max(1, Math.ceil((100 - baseProbability) / 20))
  const base = stagesRemaining * expectedDays
  const overage = Math.max(0, days_in_stage - expectedDays)
  const adjustment = overage > 7 ? -Math.min(overage * 0.3, base * 0.3) : 0
  return Math.max(3, Math.round(base + adjustment))
}

export async function predictCloseProbabilityHandler(args: Input): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const input = validateInput(inputSchema, args)
  logger.info('Running predict_close_probability', { deal_name: input.deal_name, stage: input.stage })

  let probability = getStageBaseProbability(input.stage)
  const expectedDaysInStage = getExpectedDaysInStage(input.stage)
  const positiveSignals: string[] = []
  const riskSignals: string[] = []

  if (input.budget_confirmed) { probability += 15; positiveSignals.push('Budget has been confirmed by the prospect') }
  if (input.decision_maker_engaged) { probability += 12; positiveSignals.push('Decision maker is actively engaged in the process') }
  if (input.engagement_level === 'high') { probability += 10; positiveSignals.push('High engagement level indicates strong prospect interest') }
  else if (input.engagement_level === 'medium') { probability += 3; positiveSignals.push('Moderate engagement — prospect is still evaluating') }

  if (input.competitor_present) { probability -= 15; riskSignals.push('Competitor is present — deal is actively contested') }
  if (input.engagement_level === 'low') { probability -= 12; riskSignals.push('Low engagement level suggests prospect is cooling off') }
  if (input.days_in_stage > expectedDaysInStage * 2) {
    probability -= 10
    riskSignals.push(`Deal has been in "${input.stage}" stage for ${input.days_in_stage} days (2x expected) — momentum loss risk`)
  } else if (input.days_in_stage > expectedDaysInStage * 1.5) {
    probability -= 5
    riskSignals.push(`Deal has stalled in "${input.stage}" stage for ${input.days_in_stage} days`)
  }
  if (!input.budget_confirmed) riskSignals.push('Budget not yet confirmed — financial commitment uncertainty remains')
  if (!input.decision_maker_engaged) riskSignals.push('Decision maker not yet engaged — risk of champion not having executive backing')

  probability = Math.max(5, Math.min(95, probability))

  const confidenceLevel: 'low' | 'medium' | 'high' =
    positiveSignals.length >= 3 && riskSignals.length <= 1 ? 'high'
    : riskSignals.length >= 3 || input.engagement_level === 'low' ? 'low'
    : 'medium'

  const daysToClose = estimateCloseDays(input.stage, getStageBaseProbability(input.stage), input.days_in_stage)
  const closeDate = new Date()
  closeDate.setDate(closeDate.getDate() + daysToClose)

  const recommendedActions: string[] = []
  if (!input.decision_maker_engaged) {
    recommendedActions.push(`Request executive introduction meeting — ask champion to arrange a call with the final decision maker at ${input.deal_name}`)
  }
  if (input.competitor_present) {
    recommendedActions.push('Prepare competitive battlecard and differentiation narrative focusing on LUKA\'s unique LATAM expertise')
  }
  if (input.days_in_stage > expectedDaysInStage) {
    recommendedActions.push(`Create urgency: propose a time-limited commercial incentive or deadline to accelerate decision in "${input.stage}" stage`)
  }
  if (input.engagement_level === 'low') {
    recommendedActions.push('Re-engage with fresh value-add content (ROI case study, customer reference, or product update relevant to their pain)')
  }
  if (!input.budget_confirmed) {
    recommendedActions.push('Schedule a budget conversation — prepare ROI calculator to help prospect build internal business case')
  }
  if (recommendedActions.length === 0) {
    recommendedActions.push(`Maintain deal momentum with regular check-ins — target close by ${closeDate.toISOString().split('T')[0]}`)
  }

  const result: PredictCloseOutput = {
    close_probability: probability,
    estimated_close_date: closeDate.toISOString().split('T')[0],
    confidence_level: confidenceLevel,
    positive_signals: positiveSignals.length > 0 ? positiveSignals : ['Deal is progressing through standard pipeline stages'],
    risk_signals: riskSignals.length > 0 ? riskSignals : ['No critical risk signals detected at this time'],
    recommended_actions: recommendedActions.slice(0, 4),
  }

  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
}
