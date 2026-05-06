import { z } from 'zod'
import { validateInput } from '../utils/validation.js'
import { logger } from '../utils/logger.js'

export const generateSOPShape = {
  process_name: z.string().min(1).describe('Name of the process to document'),
  process_description: z.string().min(1).describe('Detailed description of the process'),
  department: z.string().min(1).describe('Department that owns this process'),
  frequency: z.string().min(1).describe('How often the process runs (e.g. daily, weekly, monthly)'),
  tools_used: z.array(z.string()).min(1).describe('Tools and systems used in this process'),
}

const inputSchema = z.object(generateSOPShape)
type Input = z.infer<typeof inputSchema>

interface GenerateSOPOutput {
  sop_title: string
  version: string
  purpose: string
  scope: string
  responsibilities: Array<{ role: string; responsibility: string }>
  procedure_steps: Array<{ step: number; title: string; description: string; tools: string[]; expected_output: string }>
  quality_checkpoints: string[]
  exceptions_handling: string[]
  review_frequency: string
}

function determineDepartmentRoles(department: string): { owner: string, executor: string, reviewer: string } {
  const lower = department.toLowerCase()
  if (lower.includes('sales') || lower.includes('revenue')) return { owner: 'Sales Manager', executor: 'Account Executive', reviewer: 'Revenue Operations' }
  if (lower.includes('tech') || lower.includes('eng') || lower.includes('product')) return { owner: 'Engineering Lead', executor: 'Developer', reviewer: 'QA Engineer' }
  if (lower.includes('ops') || lower.includes('operation')) return { owner: 'Operations Manager', executor: 'Operations Analyst', reviewer: 'Process Owner' }
  if (lower.includes('finance') || lower.includes('accounting')) return { owner: 'Finance Manager', executor: 'Financial Analyst', reviewer: 'Controller' }
  if (lower.includes('hr') || lower.includes('people') || lower.includes('talent')) return { owner: 'HR Manager', executor: 'HR Specialist', reviewer: 'People Operations Lead' }
  if (lower.includes('market') || lower.includes('growth')) return { owner: 'Marketing Manager', executor: 'Marketing Specialist', reviewer: 'Brand Manager' }
  return { owner: `${department} Manager`, executor: `${department} Specialist`, reviewer: 'Quality Assurance' }
}

function determineReviewFrequency(frequency: string, tools_used: string[]): string {
  const lower = frequency.toLowerCase()
  const hasHighChangeTools = tools_used.some(t => /api|integration|automated|system/.test(t.toLowerCase()))
  if (lower.includes('daily') || lower.includes('real')) return 'Monthly review and update'
  if (lower.includes('weekly')) return 'Quarterly review and update'
  if (lower.includes('monthly')) return 'Semi-annual review and update'
  if (hasHighChangeTools) return 'Quarterly review (due to technology dependencies)'
  return 'Annual review and update, or upon significant process change'
}

function generateProcedureSteps(
  processName: string,
  description: string,
  tools: string[],
  roles: { owner: string, executor: string, reviewer: string }
): GenerateSOPOutput['procedure_steps'] {
  const descLower = description.toLowerCase()
  const primaryTool = tools[0] ?? 'relevant tool'
  const secondaryTool = tools[1] ?? tools[0] ?? 'tracking system'

  const steps: GenerateSOPOutput['procedure_steps'] = [
    {
      step: 1,
      title: 'Preparation and Prerequisites',
      description: `Before initiating the ${processName} process, confirm all required inputs and permissions are in place. Verify access to ${primaryTool} and that all necessary data is available. Review any pending items from the previous execution cycle.`,
      tools: tools.slice(0, 2),
      expected_output: 'Confirmed readiness checklist with all prerequisites verified',
    },
    {
      step: 2,
      title: 'Process Initiation',
      description: `Log the start of the ${processName} in ${primaryTool}. Assign a unique reference ID for tracking. Notify relevant stakeholders that the process has started. Document initial state and any context-specific parameters.`,
      tools: [primaryTool],
      expected_output: `Process record created in ${primaryTool} with unique ID and timestamp`,
    },
    {
      step: 3,
      title: 'Core Execution',
      description: `Execute the primary activities of ${processName} as described. Follow established guidelines and use ${secondaryTool} for intermediate tracking. Document any deviations or observations in real-time.`,
      tools: tools,
      expected_output: 'Primary process deliverables completed and documented',
    },
    {
      step: 4,
      title: 'Intermediate Quality Check',
      description: `The ${roles.reviewer} reviews intermediate outputs for accuracy and completeness. Cross-reference against established criteria using ${secondaryTool}. Flag any issues for immediate resolution before proceeding to finalization.`,
      tools: [secondaryTool, primaryTool],
      expected_output: 'QC sign-off document with pass/fail status for each checkpoint',
    },
    {
      step: 5,
      title: 'Finalization and Output Delivery',
      description: `Compile all outputs from the execution phase. Verify completeness against the defined output criteria. Deliver final outputs to designated recipients and update ${primaryTool} with completion status.`,
      tools: tools.slice(0, 2),
      expected_output: 'Finalized outputs delivered to stakeholders with confirmation receipt',
    },
    {
      step: 6,
      title: 'Documentation and Closure',
      description: `Update process records in ${primaryTool} with final status, actual duration, and any lessons learned. Archive all working documents. Trigger any downstream processes or notifications required. Close the process record.`,
      tools: [primaryTool],
      expected_output: 'Closed process record with completion summary and archived documentation',
    },
  ]

  if (descLower.includes('report') || descLower.includes('analy') || descLower.includes('review')) {
    steps.splice(5, 0, {
      step: 5,
      title: 'Analysis and Reporting',
      description: `Compile findings and generate required reports. Ensure all metrics are accurate and insights are clearly communicated. Distribute reports to stakeholder list.`,
      tools: tools,
      expected_output: 'Completed report distributed to all stakeholders with acknowledgement',
    })
    steps.forEach((s, i) => { s.step = i + 1 })
  }

  return steps
}

export async function generateSOPHandler(args: Input): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const input = validateInput(inputSchema, args)
  logger.info('Running generate_sop', { process_name: input.process_name, department: input.department })

  const roles = determineDepartmentRoles(input.department)
  const reviewFrequency = determineReviewFrequency(input.frequency, input.tools_used)
  const procedureSteps = generateProcedureSteps(input.process_name, input.process_description, input.tools_used, roles)

  const result: GenerateSOPOutput = {
    sop_title: `Standard Operating Procedure: ${input.process_name}`,
    version: '1.0',
    purpose: `This SOP defines the standardized procedure for executing "${input.process_name}" within the ${input.department} department. It ensures consistent, high-quality execution by providing clear step-by-step guidance, role assignments, and quality checkpoints.`,
    scope: `This procedure applies to all ${input.department} team members involved in ${input.process_name}. It covers the full lifecycle from initiation to closure, executed on a ${input.frequency} basis. Tools in scope: ${input.tools_used.join(', ')}.`,
    responsibilities: [
      { role: roles.owner, responsibility: `Process owner — accountable for overall process performance, SOP maintenance, and exception escalation` },
      { role: roles.executor, responsibility: `Primary executor — responsible for day-to-day execution of all procedure steps and real-time documentation` },
      { role: roles.reviewer, responsibility: `Quality reviewer — validates outputs at quality checkpoints and approves process closure` },
      { role: 'All participants', responsibility: `Adhere to this SOP, report deviations immediately, and complete assigned tasks within defined timeframes` },
    ],
    procedure_steps: procedureSteps,
    quality_checkpoints: [
      `Step 1: Prerequisites checklist signed off before execution begins`,
      `Step ${Math.ceil(procedureSteps.length / 2)}: Intermediate quality review by ${roles.reviewer} before proceeding to finalization`,
      `Step ${procedureSteps.length - 1}: All outputs verified against defined acceptance criteria`,
      `Step ${procedureSteps.length}: Process record closed with complete audit trail in ${input.tools_used[0] ?? 'primary tool'}`,
      `Monthly: ${roles.owner} reviews process metrics and SOP adherence rate`,
    ],
    exceptions_handling: [
      `If required inputs are unavailable: Document the gap, notify ${roles.owner} immediately, and delay execution until inputs are confirmed`,
      `If a tool (${input.tools_used[0] ?? 'primary tool'}) is unavailable: Switch to manual backup procedure, document the deviation, and notify IT`,
      `If quality checkpoint fails: Stop execution, log the defect with details, escalate to ${roles.reviewer} for root cause analysis before resuming`,
      `If a key participant is unavailable: ${roles.owner} designates a qualified backup — process should not be delayed more than one business day`,
      `If the process produces unexpected results: Quarantine outputs, do not proceed, escalate to ${roles.owner} for investigation`,
    ],
    review_frequency: reviewFrequency,
  }

  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
}
