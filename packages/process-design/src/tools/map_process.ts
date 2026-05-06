import { z } from 'zod'
import { validateInput } from '../utils/validation.js'
import { logger } from '../utils/logger.js'

export const mapProcessShape = {
  process_name: z.string().min(1).describe('Name of the process to map'),
  description: z.string().min(1).describe('Description of what the process does'),
  participants: z.array(z.string()).min(1).describe('People/roles involved in the process'),
  inputs: z.array(z.string()).min(1).describe('Inputs required to start the process'),
  outputs: z.array(z.string()).min(1).describe('Outputs/deliverables produced by the process'),
}

const inputSchema = z.object(mapProcessShape)
type Input = z.infer<typeof inputSchema>

interface ProcessStep {
  step_number: number
  name: string
  responsible: string
  inputs: string[]
  outputs: string[]
  estimated_duration_minutes: number
  bottleneck_risk: 'low' | 'medium' | 'high'
}

interface MapProcessOutput {
  process_steps: ProcessStep[]
  bottlenecks: Array<{ step: string; issue: string; impact: 'low' | 'medium' | 'high' }>
  total_estimated_duration_minutes: number
  efficiency_score: number
  improvement_opportunities: string[]
}

function estimateStepDuration(stepName: string, descriptionContext: string): number {
  const all = `${stepName} ${descriptionContext}`.toLowerCase()
  if (all.includes('review') || all.includes('approval') || all.includes('validate')) return 30
  if (all.includes('meeting') || all.includes('sync') || all.includes('call')) return 45
  if (all.includes('analysis') || all.includes('report') || all.includes('research')) return 60
  if (all.includes('document') || all.includes('write') || all.includes('draft')) return 45
  if (all.includes('notify') || all.includes('email') || all.includes('communicate')) return 15
  if (all.includes('test') || all.includes('qa') || all.includes('check')) return 30
  if (all.includes('deploy') || all.includes('implement') || all.includes('execute')) return 90
  if (all.includes('intake') || all.includes('receive') || all.includes('collect')) return 20
  if (all.includes('process') || all.includes('transform') || all.includes('convert')) return 30
  return 25
}

function assessBottleneckRisk(stepName: string, responsible: string, participants: string[]): 'low' | 'medium' | 'high' {
  const lower = `${stepName} ${responsible}`.toLowerCase()
  if (lower.includes('ceo') || lower.includes('cto') || lower.includes('director') || lower.includes('vp')) return 'high'
  if (lower.includes('approval') || lower.includes('review') || lower.includes('sign')) return 'high'
  if (lower.includes('manual') || lower.includes('hand') || lower.includes('excel')) return 'medium'
  if (participants.length === 1) return 'medium'
  return 'low'
}

function generateProcessSteps(processName: string, description: string, participants: string[], inputs: string[], outputs: string[]): ProcessStep[] {
  const descLower = description.toLowerCase()
  const baseSteps = [
    {
      name: `Receive and validate ${inputs[0] ?? 'request'}`,
      responsible: participants[0] ?? 'Process Owner',
      stepInputs: inputs.slice(0, 2),
      stepOutputs: [`Validated ${inputs[0] ?? 'request'}`, 'Initial log entry'],
    },
    {
      name: `Review and analyze ${processName.toLowerCase()} requirements`,
      responsible: participants[Math.min(1, participants.length - 1)],
      stepInputs: [`Validated ${inputs[0] ?? 'request'}`],
      stepOutputs: ['Requirements document', 'Scope confirmation'],
    },
    {
      name: `Assign responsibilities and prepare execution plan`,
      responsible: participants[0] ?? 'Process Owner',
      stepInputs: ['Requirements document'],
      stepOutputs: ['Execution plan', 'Task assignments'],
    },
    {
      name: `Execute core ${processName.toLowerCase()} activities`,
      responsible: participants[Math.min(participants.length - 1, 1)],
      stepInputs: ['Execution plan', ...inputs.slice(1)],
      stepOutputs: ['In-progress work artifacts', 'Status updates'],
    },
    {
      name: `Quality review and validation of outputs`,
      responsible: participants[0] ?? 'Process Owner',
      stepInputs: ['In-progress work artifacts'],
      stepOutputs: ['Reviewed artifacts', 'QA sign-off'],
    },
    {
      name: `Deliver and communicate ${outputs[0] ?? 'final output'}`,
      responsible: participants[Math.min(participants.length - 1, participants.length - 1)],
      stepInputs: ['Reviewed artifacts'],
      stepOutputs: outputs.slice(0, 2),
    },
  ]

  if (descLower.includes('document') || descLower.includes('report') || outputs.length > 2) {
    baseSteps.push({
      name: `Archive and document process results`,
      responsible: participants[0] ?? 'Process Owner',
      stepInputs: outputs.slice(0, 2),
      stepOutputs: ['Process documentation', 'Archived records'],
    })
  }

  return baseSteps.map((step, index) => ({
    step_number: index + 1,
    name: step.name,
    responsible: step.responsible,
    inputs: step.stepInputs,
    outputs: step.stepOutputs,
    estimated_duration_minutes: estimateStepDuration(step.name, description),
    bottleneck_risk: assessBottleneckRisk(step.name, step.responsible, participants),
  }))
}

export async function mapProcessHandler(args: Input): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const input = validateInput(inputSchema, args)
  logger.info('Running map_process', { process_name: input.process_name, participants_count: input.participants.length })

  const steps = generateProcessSteps(input.process_name, input.description, input.participants, input.inputs, input.outputs)

  const bottlenecks = steps
    .filter(s => s.bottleneck_risk !== 'low')
    .map(s => ({
      step: s.name,
      issue: s.bottleneck_risk === 'high'
        ? 'Single point of failure — step depends on one decision-maker or manual approval'
        : 'Manual handling or limited parallel execution reduces throughput',
      impact: s.bottleneck_risk,
    }))

  const totalDuration = steps.reduce((sum, s) => sum + s.estimated_duration_minutes, 0)
  const highRiskCount = steps.filter(s => s.bottleneck_risk === 'high').length
  const mediumRiskCount = steps.filter(s => s.bottleneck_risk === 'medium').length
  const bottleneckPenalty = highRiskCount * 15 + mediumRiskCount * 7
  const participantBonus = Math.min(20, input.participants.length * 5)
  const efficiencyScore = Math.max(20, Math.min(95, 80 - bottleneckPenalty + participantBonus))

  const improvements: string[] = []
  if (highRiskCount > 0) improvements.push(`Eliminate ${highRiskCount} single-point-of-failure approval steps by implementing delegation matrix`)
  if (input.participants.length === 1) improvements.push('Cross-train additional team members to reduce single-person dependency')
  if (totalDuration > 240) improvements.push('Identify parallel execution opportunities to reduce total cycle time')
  improvements.push('Implement automated status notifications to reduce manual communication overhead')
  improvements.push(`Digitize inputs (${input.inputs.slice(0, 2).join(', ')}) to enable real-time tracking`)
  if (efficiencyScore < 60) improvements.push('Consider process re-engineering to eliminate non-value-adding steps')

  const result: MapProcessOutput = {
    process_steps: steps,
    bottlenecks,
    total_estimated_duration_minutes: totalDuration,
    efficiency_score: efficiencyScore,
    improvement_opportunities: improvements.slice(0, 5),
  }

  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
}
