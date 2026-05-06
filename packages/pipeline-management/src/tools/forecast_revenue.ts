import { z } from 'zod'
import { validateInput } from '../utils/validation.js'
import { logger } from '../utils/logger.js'

const dealSchema = z.object({
  name: z.string(),
  amount_usd: z.number().nonnegative(),
  stage: z.string(),
  close_probability: z.number().min(0).max(100),
})

export const forecastRevenueShape = {
  deals: z.array(dealSchema).min(1).describe('List of deals with amounts and probabilities'),
  period: z.string().min(1).describe('Forecast period label (e.g. Q2 2026)'),
}

const inputSchema = z.object(forecastRevenueShape)
type Input = z.infer<typeof inputSchema>

interface DealBreakdown {
  name: string
  weighted_amount: number
  probability: number
}

interface ForecastRevenueOutput {
  weighted_forecast: number
  best_case_forecast: number
  committed_forecast: number
  deals_breakdown: DealBreakdown[]
  forecast_period: string
  confidence_level: 'low' | 'medium' | 'high'
  summary: string
}

function getCommitThreshold(stage: string): boolean {
  const lower = stage.toLowerCase()
  return lower.includes('negotiat') || lower.includes('contract') || lower.includes('closing') || lower.includes('verbal') || lower.includes('closed won')
}

function getBestCaseMultiplier(close_probability: number): number {
  if (close_probability >= 80) return 1.0
  if (close_probability >= 60) return 0.9
  if (close_probability >= 40) return 0.7
  if (close_probability >= 20) return 0.4
  return 0.15
}

export async function forecastRevenueHandler(args: Input): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const input = validateInput(inputSchema, args)
  logger.info('Running forecast_revenue', { deals_count: input.deals.length, period: input.period })

  const dealsBreakdown: DealBreakdown[] = input.deals.map(deal => ({
    name: deal.name,
    weighted_amount: Math.round(deal.amount_usd * (deal.close_probability / 100)),
    probability: deal.close_probability,
  }))

  const weightedForecast = dealsBreakdown.reduce((sum, d) => sum + d.weighted_amount, 0)

  const bestCaseForecast = input.deals.reduce((sum, deal) => {
    return sum + Math.round(deal.amount_usd * getBestCaseMultiplier(deal.close_probability))
  }, 0)

  const committedForecast = input.deals.reduce((sum, deal) => {
    const isCommitted = getCommitThreshold(deal.stage) || deal.close_probability >= 75
    return sum + (isCommitted ? deal.amount_usd : 0)
  }, 0)

  dealsBreakdown.sort((a, b) => b.weighted_amount - a.weighted_amount)

  const avgProbability = input.deals.reduce((sum, d) => sum + d.close_probability, 0) / input.deals.length
  const highProbDeals = input.deals.filter(d => d.close_probability >= 70).length
  const confidenceLevel: 'low' | 'medium' | 'high' =
    avgProbability >= 65 && highProbDeals >= Math.ceil(input.deals.length * 0.5) ? 'high'
    : avgProbability >= 40 ? 'medium'
    : 'low'

  const topDeal = dealsBreakdown[0]
  const summary = `${input.period} revenue forecast across ${input.deals.length} deals. Weighted pipeline value: $${weightedForecast.toLocaleString()}. Committed (high-probability): $${committedForecast.toLocaleString()}. Best-case scenario: $${bestCaseForecast.toLocaleString()}. Forecast confidence: ${confidenceLevel}. Largest weighted opportunity: ${topDeal?.name ?? 'N/A'} at $${(topDeal?.weighted_amount ?? 0).toLocaleString()}.`

  const result: ForecastRevenueOutput = {
    weighted_forecast: weightedForecast,
    best_case_forecast: bestCaseForecast,
    committed_forecast: committedForecast,
    deals_breakdown: dealsBreakdown,
    forecast_period: input.period,
    confidence_level: confidenceLevel,
    summary,
  }

  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
}
