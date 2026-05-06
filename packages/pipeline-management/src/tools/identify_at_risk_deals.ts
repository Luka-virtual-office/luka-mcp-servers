import { z } from 'zod'
import { validateInput } from '../utils/validation.js'
import { logger } from '../utils/logger.js'

const dealSchema = z.object({
  id: z.string(),
  name: z.string(),
  stage: z.string(),
  days_since_last_contact: z.number().int().min(0),
  amount_usd: z.number().nonnegative(),
  close_date: z.string(),
})

export const identifyAtRiskDealsShape = {
  deals: z.array(dealSchema).min(1).describe('List of deals to assess for risk'),
}

const inputSchema = z.object(identifyAtRiskDealsShape)
type Input = z.infer<typeof inputSchema>

interface AtRiskDeal {
  deal_id: string
  deal_name: string
  risk_level: 'critical' | 'high' | 'medium'
  risk_reasons: string[]
  immediate_actions: string[]
}

interface IdentifyAtRiskOutput {
  at_risk_deals: AtRiskDeal[]
  total_at_risk_value: number
  summary: string
}

function isOverdue(closeDateStr: string): { overdue: boolean, daysOverdue: number } {
  const closeDate = new Date(closeDateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  closeDate.setHours(0, 0, 0, 0)
  const diff = Math.floor((closeDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  return { overdue: diff < 0, daysOverdue: Math.abs(diff) }
}

function isDueSoon(closeDateStr: string, thresholdDays: number): boolean {
  const closeDate = new Date(closeDateStr)
  const today = new Date()
  const diff = Math.floor((closeDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  return diff >= 0 && diff <= thresholdDays
}

function assessDealRisk(deal: z.infer<typeof dealSchema>): { riskLevel: 'critical' | 'high' | 'medium' | null, reasons: string[], actions: string[] } {
  const reasons: string[] = []
  const actions: string[] = []
  let riskPoints = 0
  const { overdue, daysOverdue } = isOverdue(deal.close_date)
  const dueSoon14 = isDueSoon(deal.close_date, 14)
  const lower = deal.stage.toLowerCase()

  if (overdue && daysOverdue > 30) {
    riskPoints += 4
    reasons.push(`Close date was ${daysOverdue} days ago — severely overdue`)
    actions.push('Conduct immediate deal review call with account executive to reassess or formally close/remove from pipeline')
  } else if (overdue && daysOverdue > 7) {
    riskPoints += 3
    reasons.push(`Close date passed ${daysOverdue} days ago — overdue without resolution`)
    actions.push('Contact prospect today to get updated timeline commitment or formal decision')
  } else if (overdue) {
    riskPoints += 2
    reasons.push('Close date recently passed without a decision')
    actions.push('Reach out immediately to confirm deal status and new close date')
  }

  if (deal.days_since_last_contact > 21) {
    riskPoints += 3
    reasons.push(`No contact for ${deal.days_since_last_contact} days — deal has gone silent`)
    actions.push('Send re-engagement message with fresh value (new case study, product update, or time-sensitive offer)')
  } else if (deal.days_since_last_contact > 14) {
    riskPoints += 2
    reasons.push(`${deal.days_since_last_contact} days without contact — engagement dropping`)
    actions.push('Schedule a check-in call within 24 hours to maintain momentum')
  } else if (deal.days_since_last_contact > 7) {
    riskPoints += 1
    reasons.push(`7+ days since last contact in an active stage`)
    actions.push('Send follow-up email with relevant content to re-establish contact')
  }

  const isEarlyStage = lower.includes('prospect') || lower.includes('qualif') || lower.includes('lead') || lower.includes('discovery')
  if (isEarlyStage && dueSoon14) {
    riskPoints += 3
    reasons.push(`Deal is in early stage "${deal.stage}" but close date is within 14 days — unrealistic timeline`)
    actions.push('Reassess close date and pipeline stage — update CRM with realistic forecast date')
  }

  if (deal.amount_usd > 100000 && riskPoints > 0) {
    riskPoints += 1
    reasons.push(`High-value deal ($${deal.amount_usd.toLocaleString()}) with active risk signals requires executive attention`)
    actions.push('Escalate to sales leadership for executive sponsorship and support')
  }

  if (riskPoints === 0) return { riskLevel: null, reasons: [], actions: [] }
  const riskLevel: 'critical' | 'high' | 'medium' = riskPoints >= 5 ? 'critical' : riskPoints >= 3 ? 'high' : 'medium'
  return { riskLevel, reasons: reasons.slice(0, 4), actions: actions.slice(0, 3) }
}

export async function identifyAtRiskDealsHandler(args: Input): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const input = validateInput(inputSchema, args)
  logger.info('Running identify_at_risk_deals', { deals_count: input.deals.length })

  const atRiskDeals: AtRiskDeal[] = []
  let totalAtRiskValue = 0

  for (const deal of input.deals) {
    const { riskLevel, reasons, actions } = assessDealRisk(deal)
    if (riskLevel !== null) {
      atRiskDeals.push({ deal_id: deal.id, deal_name: deal.name, risk_level: riskLevel, risk_reasons: reasons, immediate_actions: actions })
      totalAtRiskValue += deal.amount_usd
    }
  }

  const riskOrder = { critical: 0, high: 1, medium: 2 }
  atRiskDeals.sort((a, b) => riskOrder[a.risk_level] - riskOrder[b.risk_level])

  const criticalCount = atRiskDeals.filter(d => d.risk_level === 'critical').length
  const highCount = atRiskDeals.filter(d => d.risk_level === 'high').length
  const mediumCount = atRiskDeals.filter(d => d.risk_level === 'medium').length

  const summary = atRiskDeals.length === 0
    ? `Pipeline looks healthy — no at-risk deals detected among ${input.deals.length} reviewed.`
    : `${atRiskDeals.length} of ${input.deals.length} deals are at risk, totaling $${totalAtRiskValue.toLocaleString()} in potential revenue. Breakdown: ${criticalCount} critical, ${highCount} high, ${mediumCount} medium. Immediate attention required on ${criticalCount + highCount} deals.`

  const result: IdentifyAtRiskOutput = { at_risk_deals: atRiskDeals, total_at_risk_value: totalAtRiskValue, summary }
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
}
