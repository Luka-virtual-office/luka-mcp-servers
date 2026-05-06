import { z } from 'zod'
import { validateInput } from '../utils/validation.js'
import { logger } from '../utils/logger.js'

export const optimizeWorkflowShape = {
  process_name: z.string().min(1).describe('Name of the process to optimize'),
  current_issues: z.array(z.string()).min(1).describe('List of current process issues or pain points'),
  team_size: z.number().int().min(1).describe('Number of people involved in the process'),
  process_frequency: z.string().min(1).describe('How often the process runs'),
}

const inputSchema = z.object(optimizeWorkflowShape)
type Input = z.infer<typeof inputSchema>

interface Recommendation {
  title: string
  description: string
  effort: 'low' | 'medium' | 'high'
  impact: 'low' | 'medium' | 'high'
  priority: number
}

interface OptimizeWorkflowOutput {
  optimization_recommendations: Recommendation[]
  automation_opportunities: string[]
  estimated_time_savings_percent: number
  implementation_roadmap: Array<{ phase: number; actions: string[]; expected_outcome: string }>
}

function classifyIssues(issues: string[]): { bottlenecks: string[], manual: string[], communication: string[], quality: string[] } {
  const bottlenecks: string[] = []
  const manual: string[] = []
  const communication: string[] = []
  const quality: string[] = []
  for (const issue of issues) {
    const lower = issue.toLowerCase()
    if (/slow|bottleneck|wait|delay|stuck|approval|backlog/.test(lower)) bottlenecks.push(issue)
    else if (/manual|excel|spreadsheet|hand|paper|email chain/.test(lower)) manual.push(issue)
    else if (/communicat|notify|inform|update|visibility|track/.test(lower)) communication.push(issue)
    else if (/error|quality|defect|mistake|inconsistent|wrong/.test(lower)) quality.push(issue)
    else bottlenecks.push(issue)
  }
  return { bottlenecks, manual, communication, quality }
}

function generateRecommendations(processName: string, issues: string[], teamSize: number, frequency: string): Recommendation[] {
  const classified = classifyIssues(issues)
  const recs: Recommendation[] = []
  let priority = 1

  if (classified.bottlenecks.length > 0) {
    recs.push({
      title: 'Eliminate Approval Bottlenecks',
      description: `Redesign the approval flow in ${processName} by implementing a delegation matrix. Empower team members to approve items under defined thresholds without escalation. Issues addressed: ${classified.bottlenecks[0]}.`,
      effort: 'low', impact: 'high', priority: priority++,
    })
  }
  if (classified.manual.length > 0) {
    recs.push({
      title: 'Automate Manual Data Entry and Handoffs',
      description: `Replace manual steps in ${processName} with automated triggers and integrations. Eliminating manual handoffs between tools reduces errors and cycle time. Issues addressed: ${classified.manual.slice(0, 2).join(', ')}.`,
      effort: 'medium', impact: 'high', priority: priority++,
    })
  }
  if (classified.communication.length > 0) {
    recs.push({
      title: 'Implement Real-Time Status Visibility',
      description: `Build a shared dashboard or automated status notifications for ${processName}. All stakeholders should have real-time visibility without needing to request updates. Issues addressed: ${classified.communication[0]}.`,
      effort: 'low', impact: 'medium', priority: priority++,
    })
  }
  if (classified.quality.length > 0) {
    recs.push({
      title: 'Add Automated Quality Validation Gates',
      description: `Implement validation rules and automated checks at key stages of ${processName} to catch errors before they propagate. Issues addressed: ${classified.quality.slice(0, 2).join(', ')}.`,
      effort: 'medium', impact: 'high', priority: priority++,
    })
  }
  if (teamSize < 3) {
    recs.push({
      title: 'Cross-Train Team for Redundancy',
      description: `With a team of ${teamSize}, single points of failure are high risk. Document all tacit knowledge and cross-train at least one backup for each critical role in ${processName}.`,
      effort: 'medium', impact: 'medium', priority: priority++,
    })
  } else if (teamSize > 8) {
    recs.push({
      title: 'Introduce Sub-Team Specialization',
      description: `With ${teamSize} team members, consider splitting ${processName} into specialized sub-teams with clear handoff protocols to increase throughput and reduce coordination overhead.`,
      effort: 'medium', impact: 'medium', priority: priority++,
    })
  }
  const freqLower = frequency.toLowerCase()
  if (freqLower.includes('daily') || freqLower.includes('real')) {
    recs.push({
      title: 'Implement SLA Monitoring and Alerting',
      description: `For daily/real-time execution of ${processName}, implement automated SLA tracking with alerts when tasks exceed time thresholds. This prevents silent delays from accumulating.`,
      effort: 'low', impact: 'high', priority: priority++,
    })
  }
  recs.push({
    title: 'Establish Process Metrics Baseline and Review Cadence',
    description: `Define 3-5 KPIs for ${processName} (cycle time, error rate, completion rate) and schedule monthly reviews. Data-driven optimization requires a baseline to measure against.`,
    effort: 'low', impact: 'medium', priority: priority++,
  })

  return recs.slice(0, 6)
}

function identifyAutomationOpportunities(issues: string[], processName: string): string[] {
  const opportunities: string[] = []
  const allContext = `${issues.join(' ')} ${processName}`.toLowerCase()
  if (/email|notification|alert|communicat/.test(allContext)) {
    opportunities.push('Automated email/Slack notifications triggered by status changes (no-code: Zapier or Make)')
  }
  if (/data entry|copy|paste|spreadsheet|excel|manual input/.test(allContext)) {
    opportunities.push('RPA or form automation to eliminate manual data entry (tools: UiPath, Power Automate)')
  }
  if (/approval|review|sign.?off/.test(allContext)) {
    opportunities.push('Automated approval workflows with conditional routing (tools: Jira, Notion, or custom workflow engine)')
  }
  if (/report|dashboard|metric|kpi/.test(allContext)) {
    opportunities.push('Automated reporting and dashboard updates connected to live data sources (tools: Looker, Metabase, Google Data Studio)')
  }
  if (/schedule|recurring|calendar/.test(allContext)) {
    opportunities.push('Scheduled task automation for recurring process triggers (tools: cron jobs, scheduled workflows)')
  }
  opportunities.push('API integration between existing tools to eliminate manual copy-paste handoffs')
  opportunities.push('Automated SLA breach detection and escalation alerts')
  return opportunities.slice(0, 5)
}

function buildRoadmap(recommendations: Recommendation[]): OptimizeWorkflowOutput['implementation_roadmap'] {
  const quickWins = recommendations.filter(r => r.effort === 'low')
  const medium = recommendations.filter(r => r.effort === 'medium')
  const complex = recommendations.filter(r => r.effort === 'high')
  return [
    {
      phase: 1,
      actions: quickWins.slice(0, 3).map(r => r.title).concat(
        quickWins.length < 2 ? ['Define process KPI baseline and current state metrics', 'Document all process steps and responsible owners'] : []
      ).slice(0, 4),
      expected_outcome: 'Quick wins implemented, baseline metrics established, and team alignment achieved on optimization goals',
    },
    {
      phase: 2,
      actions: medium.slice(0, 3).map(r => r.title).concat(
        ['Build automated notification and status visibility system', 'Pilot optimized process with one sub-team or use case']
      ).slice(0, 4),
      expected_outcome: 'Core automation deployed, manual steps reduced by 40-60%, and measurable cycle time improvement achieved',
    },
    {
      phase: 3,
      actions: complex.slice(0, 2).map(r => r.title).concat([
        'Roll out optimized process to full team',
        'Establish continuous improvement review cadence',
        'Document lessons learned and update SOP',
      ]).slice(0, 4),
      expected_outcome: 'Full process optimization achieved, team operating at improved efficiency baseline, ongoing improvement framework active',
    },
  ]
}

export async function optimizeWorkflowHandler(args: Input): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const input = validateInput(inputSchema, args)
  logger.info('Running optimize_workflow', { process_name: input.process_name, issues_count: input.current_issues.length })

  const recommendations = generateRecommendations(input.process_name, input.current_issues, input.team_size, input.process_frequency)
  const automationOpportunities = identifyAutomationOpportunities(input.current_issues, input.process_name)

  const classified = classifyIssues(input.current_issues)
  let timeSavings = 0
  if (classified.manual.length > 0) timeSavings += 25
  if (classified.bottlenecks.length > 0) timeSavings += 20
  if (classified.communication.length > 0) timeSavings += 10
  if (classified.quality.length > 0) timeSavings += 10
  const highImpactRecs = recommendations.filter(r => r.impact === 'high').length
  timeSavings += highImpactRecs * 5
  timeSavings = Math.min(60, timeSavings)

  const roadmap = buildRoadmap(recommendations)

  const result: OptimizeWorkflowOutput = {
    optimization_recommendations: recommendations,
    automation_opportunities: automationOpportunities,
    estimated_time_savings_percent: timeSavings,
    implementation_roadmap: roadmap,
  }

  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
}
