import { z } from 'zod'
import { validateInput } from '../utils/validation.js'
import { logger } from '../utils/logger.js'

const metricSchema = z.object({
  name: z.string(),
  current_value: z.number(),
  unit: z.string(),
  target_value: z.number(),
})

export const measureEfficiencyShape = {
  process_name: z.string().min(1).describe('Name of the process to measure'),
  metrics: z.array(metricSchema).min(1).describe('KPI metrics with current and target values'),
}

const inputSchema = z.object(measureEfficiencyShape)
type Input = z.infer<typeof inputSchema>

interface MeasureEfficiencyOutput {
  overall_efficiency_score: number
  metrics_analysis: Array<{ metric: string; current: number; target: number; gap: number; status: 'on_track' | 'at_risk' | 'off_track' }>
  top_improvement_areas: string[]
  estimated_efficiency_gain_percent: number
  recommendations: string[]
}

function computeMetricStatus(current: number, target: number, metricName: string): 'on_track' | 'at_risk' | 'off_track' {
  const lower = metricName.toLowerCase()
  const lowerIsBetter = /time|cost|error|defect|churn|delay|manual|waste|overhead|incident|complaint/.test(lower)
  if (lowerIsBetter) {
    const ratio = current / Math.max(target, 0.001)
    if (ratio <= 1.0) return 'on_track'
    if (ratio <= 1.3) return 'at_risk'
    return 'off_track'
  } else {
    if (target === 0) return 'on_track'
    const ratio = current / target
    if (ratio >= 0.95) return 'on_track'
    if (ratio >= 0.75) return 'at_risk'
    return 'off_track'
  }
}

function computeMetricScore(current: number, target: number, metricName: string): number {
  const lower = metricName.toLowerCase()
  const lowerIsBetter = /time|cost|error|defect|churn|delay|manual|waste|overhead|incident|complaint/.test(lower)
  if (target === 0) return 100
  if (lowerIsBetter) {
    const ratio = current / target
    if (ratio <= 1.0) return 100
    if (ratio <= 1.5) return Math.round(100 - (ratio - 1.0) * 80)
    return Math.max(10, Math.round(100 - ratio * 40))
  } else {
    const ratio = current / target
    return Math.min(100, Math.max(0, Math.round(ratio * 100)))
  }
}

function generateRecommendation(metric: MeasureEfficiencyOutput['metrics_analysis'][0]): string {
  const lower = metric.metric.toLowerCase()
  const gapPercent = Math.abs(metric.gap / Math.max(Math.abs(metric.target), 0.001) * 100)
  if (metric.status === 'on_track') return `"${metric.metric}" is on track — maintain current approach and monitor for regression`
  if (/time|duration|cycle/.test(lower)) return `Reduce "${metric.metric}" by ${gapPercent.toFixed(0)}%: implement parallel execution, eliminate approval bottlenecks, or automate handoff steps`
  if (/cost|expense|budget/.test(lower)) return `Reduce "${metric.metric}" by ${gapPercent.toFixed(0)}%: conduct cost driver analysis, renegotiate vendor contracts, or automate manual tasks`
  if (/error|defect|quality/.test(lower)) return `Reduce "${metric.metric}" by ${gapPercent.toFixed(0)}%: implement input validation rules, add peer review step, or automate quality checks`
  if (/satisfaction|nps|score|rating/.test(lower)) return `Improve "${metric.metric}" by ${gapPercent.toFixed(0)}%: gather qualitative feedback from stakeholders, identify top pain points, and target quick wins`
  if (/utilization|capacity|throughput/.test(lower)) return `Improve "${metric.metric}" by ${gapPercent.toFixed(0)}%: rebalance workload distribution, cross-train team, or optimize resource scheduling`
  return `Improve "${metric.metric}" by ${gapPercent.toFixed(0)}%: conduct root cause analysis on current gap and implement targeted countermeasures`
}

export async function measureEfficiencyHandler(args: Input): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const input = validateInput(inputSchema, args)
  logger.info('Running measure_efficiency', { process_name: input.process_name, metrics_count: input.metrics.length })

  const metricsAnalysis = input.metrics.map(m => ({
    metric: m.name,
    current: m.current_value,
    target: m.target_value,
    gap: Math.round((m.current_value - m.target_value) * 100) / 100,
    status: computeMetricStatus(m.current_value, m.target_value, m.name),
  }))

  const metricScores = input.metrics.map(m => computeMetricScore(m.current_value, m.target_value, m.name))
  const overallScore = Math.round(metricScores.reduce((sum, s) => sum + s, 0) / metricScores.length)

  const offTrack = metricsAnalysis.filter(m => m.status === 'off_track')
  const atRisk = metricsAnalysis.filter(m => m.status === 'at_risk')
  const topImprovementAreas = [...offTrack, ...atRisk]
    .slice(0, 3)
    .map(m => `${m.metric} (current: ${m.current}, target: ${m.target}, gap: ${m.gap})`)

  if (topImprovementAreas.length === 0) {
    topImprovementAreas.push('All metrics are on track — focus on sustaining current performance')
  }

  const gapMetrics = metricsAnalysis.filter(m => m.status !== 'on_track')
  const avgGapPercent = gapMetrics.length === 0
    ? 0
    : gapMetrics.reduce((sum, m) => {
        const base = Math.abs(m.target) || 1
        return sum + Math.min(50, Math.abs(m.gap / base) * 100)
      }, 0) / gapMetrics.length

  const estimatedGain = Math.round(avgGapPercent * 0.7)

  const recommendations = metricsAnalysis
    .sort((a, b) => {
      const order: Record<string, number> = { off_track: 0, at_risk: 1, on_track: 2 }
      return (order[a.status] ?? 3) - (order[b.status] ?? 3)
    })
    .slice(0, 5)
    .map(generateRecommendation)

  const result: MeasureEfficiencyOutput = {
    overall_efficiency_score: overallScore,
    metrics_analysis: metricsAnalysis,
    top_improvement_areas: topImprovementAreas,
    estimated_efficiency_gain_percent: estimatedGain,
    recommendations,
  }

  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
}
