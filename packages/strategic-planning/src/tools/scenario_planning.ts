import { z } from 'zod'
import { validateInput } from '../utils/validation.js'
import { logger } from '../utils/logger.js'

export const scenarioPlanningShape = {
  situation: z.string().min(1).describe('Current situation to analyze'),
  variables: z.array(z.string()).min(1).describe('Key variables that affect the scenario'),
  horizon_months: z.number().int().min(1).max(120).describe('Planning horizon in months'),
}

const inputSchema = z.object(scenarioPlanningShape)
type Input = z.infer<typeof inputSchema>

interface ScenarioCase {
  description: string
  probability: number
  key_drivers: string[]
  expected_outcome: string
}

interface ScenarioPlanningOutput {
  best_case: ScenarioCase
  worst_case: ScenarioCase
  likely_case: ScenarioCase
  recommended_strategy: string
  early_warning_signals: string[]
}

function classifyVariables(variables: string[]): { positive: string[], negative: string[], neutral: string[] } {
  const positive: string[] = []
  const negative: string[] = []
  const neutral: string[] = []
  const positiveTerms = ['growth', 'revenue', 'adoption', 'partnership', 'expansion', 'investment', 'demand', 'efficiency', 'hire', 'launch']
  const negativeTerms = ['risk', 'competition', 'churn', 'cost', 'regulation', 'delay', 'loss', 'shortage', 'threat', 'decline']
  for (const v of variables) {
    const lower = v.toLowerCase()
    if (positiveTerms.some(t => lower.includes(t))) positive.push(v)
    else if (negativeTerms.some(t => lower.includes(t))) negative.push(v)
    else neutral.push(v)
  }
  return { positive, negative, neutral }
}

function computeProbabilities(horizon_months: number): { best: number, worst: number, likely: number } {
  const uncertainty = Math.min(0.4, horizon_months / 120 * 0.4)
  const likely = Math.round((0.50 - uncertainty * 0.1) * 100) / 100
  const best = Math.round((0.25 + uncertainty * 0.05) * 100) / 100
  const worst = Math.round((1 - likely - best) * 100) / 100
  return { best, worst, likely }
}

export async function scenarioPlanningHandler(args: Input): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const input = validateInput(inputSchema, args)
  logger.info('Running scenario_planning', { horizon_months: input.horizon_months, variables_count: input.variables.length })

  const classified = classifyVariables(input.variables)
  const probs = computeProbabilities(input.horizon_months)
  const horizonLabel = `${input.horizon_months} months`
  const positiveDrivers = [...classified.positive, ...classified.neutral.slice(0, 2)]
  const negativeDrivers = [...classified.negative, ...classified.neutral.slice(0, 2)]
  const likelyDrivers = input.variables.slice(0, 3)

  const result: ScenarioPlanningOutput = {
    best_case: {
      description: `All key variables trend favorably over ${horizonLabel}. Market conditions align with strategic objectives and execution risk remains low.`,
      probability: probs.best,
      key_drivers: positiveDrivers.length > 0
        ? positiveDrivers.slice(0, 3)
        : ['Strong market adoption', 'Successful product launches', 'Favorable macroeconomic conditions'],
      expected_outcome: `Significant revenue growth and market share gains. The situation resolves with clear competitive advantage established.`,
    },
    worst_case: {
      description: `Adverse conditions materialize simultaneously over ${horizonLabel}. Key risks compound and execution challenges intensify.`,
      probability: probs.worst,
      key_drivers: negativeDrivers.length > 0
        ? negativeDrivers.slice(0, 3)
        : ['Competitive pressure intensifies', 'Regulatory headwinds', 'Resource constraints limit execution'],
      expected_outcome: `Stagnation or contraction in key metrics. Defensive posture required without intervention.`,
    },
    likely_case: {
      description: `Mixed variable performance over ${horizonLabel}. Moderate progress with some setbacks. Gradual improvement trajectory.`,
      probability: probs.likely,
      key_drivers: likelyDrivers.slice(0, 3),
      expected_outcome: `Steady but measured progress with manageable challenges requiring active management.`,
    },
    recommended_strategy: `Given a ${horizonLabel} horizon with ${input.variables.length} key variables, adopt a "hedge and accelerate" strategy: protect downside by stress-testing ${negativeDrivers[0] ?? 'key risks'} through contingency planning, while accelerating upside via ${positiveDrivers[0] ?? 'high-leverage opportunities'}. Establish milestone reviews every ${Math.max(1, Math.floor(input.horizon_months / 4))} months to pivot between scenarios.`,
    early_warning_signals: [
      `${input.variables[0] ?? 'Primary variable'} deviates more than 20% from baseline projection`,
      `Customer acquisition cost increases >30% for two consecutive months`,
      `Competitor launches directly competing product in core market`,
      `Key team attrition exceeds 15% in any quarter`,
      `Revenue growth falls below 5% month-over-month for 3 consecutive months`,
      `Regulatory inquiry or compliance issue emerges in primary market`,
    ],
  }

  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
}
