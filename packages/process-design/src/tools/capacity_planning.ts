import { z } from 'zod'
import { validateInput } from '../utils/validation.js'
import { logger } from '../utils/logger.js'

const teamMemberSchema = z.object({
  name: z.string(),
  role: z.string(),
  available_hours_per_week: z.number().positive(),
  current_utilization_percent: z.number().min(0).max(100),
})

const projectSchema = z.object({
  name: z.string(),
  required_hours: z.number().positive(),
  deadline: z.string(),
})

export const capacityPlanningShape = {
  team_members: z.array(teamMemberSchema).min(1).describe('List of team members with availability and utilization'),
  upcoming_projects: z.array(projectSchema).min(1).describe('Upcoming projects with required hours and deadlines'),
}

const inputSchema = z.object(capacityPlanningShape)
type Input = z.infer<typeof inputSchema>

interface CapacityPlanningOutput {
  team_capacity_summary: { total_available_hours: number; total_allocated_hours: number; utilization_percent: number; status: 'healthy' | 'at_risk' | 'overloaded' }
  member_analysis: Array<{ member: string; available_hours: number; allocated_hours: number; risk_level: 'low' | 'medium' | 'high' }>
  bottlenecks: string[]
  recommendations: Array<{ action: string; impact: string }>
  capacity_forecast: string
}

function getWeeksUntilDeadline(deadlineStr: string): number {
  const deadline = new Date(deadlineStr)
  const today = new Date()
  const diffMs = deadline.getTime() - today.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  return Math.max(1, Math.ceil(diffDays / 7))
}

function computeMemberAllocatedHours(
  member: z.infer<typeof teamMemberSchema>,
  projects: z.infer<typeof projectSchema>[],
  totalTeamAvailableHours: number
): number {
  const currentlyUsed = member.available_hours_per_week * (member.current_utilization_percent / 100)
  const memberShare = member.available_hours_per_week / Math.max(totalTeamAvailableHours, 1)
  const projectHoursWeekly = projects.reduce((sum, p) => {
    const weeks = getWeeksUntilDeadline(p.deadline)
    return sum + (p.required_hours / weeks)
  }, 0)
  const memberProjectHours = projectHoursWeekly * memberShare
  return Math.round((currentlyUsed + memberProjectHours) * 10) / 10
}

function assessMemberRisk(availableHours: number, allocatedHours: number): 'low' | 'medium' | 'high' {
  const utilization = allocatedHours / availableHours
  if (utilization > 0.9) return 'high'
  if (utilization > 0.75) return 'medium'
  return 'low'
}

function identifyBottlenecks(
  memberAnalyses: CapacityPlanningOutput['member_analysis'],
  projects: z.infer<typeof projectSchema>[],
  teamMembers: z.infer<typeof teamMemberSchema>[]
): string[] {
  const bottlenecks: string[] = []
  const overloadedMembers = memberAnalyses.filter(m => m.risk_level === 'high')
  if (overloadedMembers.length > 0) {
    bottlenecks.push(`${overloadedMembers.length} team member(s) overloaded: ${overloadedMembers.slice(0, 3).map(m => m.member).join(', ')}`)
  }
  const urgentProjects = projects.filter(p => getWeeksUntilDeadline(p.deadline) <= 4)
  if (urgentProjects.length > 1) {
    bottlenecks.push(`${urgentProjects.length} projects due within 4 weeks — parallel execution creates resource contention`)
  }
  const totalAllocated = memberAnalyses.reduce((sum, m) => sum + m.allocated_hours, 0)
  const totalAvailable = memberAnalyses.reduce((sum, m) => sum + m.available_hours, 0)
  if (totalAllocated > totalAvailable * 0.85) {
    bottlenecks.push('Team overall utilization exceeds 85% — limited buffer for urgent requests or scope changes')
  }
  const specialistRoles = teamMembers.filter(m => /lead|senior|principal|architect|director|manager/.test(m.role.toLowerCase()))
  if (specialistRoles.length <= 1 && projects.length > 2) {
    bottlenecks.push('Limited senior/specialist coverage creates knowledge concentration risk across multiple projects')
  }
  if (bottlenecks.length === 0) {
    bottlenecks.push('No critical bottlenecks identified — team capacity appears manageable for current project load')
  }
  return bottlenecks
}

function generateRecommendations(
  summary: CapacityPlanningOutput['team_capacity_summary'],
  memberAnalyses: CapacityPlanningOutput['member_analysis'],
  projects: z.infer<typeof projectSchema>[],
  teamSize: number
): Array<{ action: string; impact: string }> {
  const recs: Array<{ action: string; impact: string }> = []
  if (summary.status === 'overloaded') {
    recs.push({ action: 'Immediately deprioritize or defer at least one upcoming project to reduce team load below 85% utilization', impact: 'Prevents burnout, reduces error rates, and preserves capacity for urgent requests' })
    recs.push({ action: 'Engage temporary contractors or freelancers to offload specific project work', impact: 'Adds flex capacity within 1-2 weeks without long-term headcount commitment' })
  }
  if (summary.status === 'at_risk') {
    recs.push({ action: 'Review project scopes and negotiate deadline extensions for non-critical deliverables', impact: 'Creates breathing room and reduces risk of quality degradation under time pressure' })
  }
  const overloadedMembers = memberAnalyses.filter(m => m.risk_level === 'high')
  if (overloadedMembers.length > 0) {
    recs.push({ action: `Redistribute workload from overloaded members (${overloadedMembers[0].member}) to team members with lower utilization`, impact: 'Balances team load and reduces single-point-of-failure risk' })
  }
  if (teamSize < 4) {
    recs.push({ action: 'Initiate hiring process for at least one additional team member to address structural under-capacity', impact: 'Resolves chronic overload and enables sustainable growth without burning out existing team' })
  }
  const urgentProjects = projects.filter(p => getWeeksUntilDeadline(p.deadline) <= 3)
  if (urgentProjects.length > 1) {
    recs.push({ action: `Establish clear priority ranking among ${urgentProjects.length} urgent projects — define which gets full resources first`, impact: 'Prevents context-switching overhead and ensures at least the top priority ships on time' })
  }
  if (summary.status === 'healthy') {
    recs.push({ action: 'Use available capacity (buffer) for proactive technical debt, documentation, or skill development', impact: 'Builds long-term team capabilities and reduces future maintenance burden' })
  }
  return recs.slice(0, 5)
}

export async function capacityPlanningHandler(args: Input): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const input = validateInput(inputSchema, args)
  logger.info('Running capacity_planning', { team_size: input.team_members.length, projects_count: input.upcoming_projects.length })

  const totalAvailable = input.team_members.reduce((sum, m) => sum + m.available_hours_per_week, 0)

  const memberAnalyses = input.team_members.map(member => {
    const allocated = computeMemberAllocatedHours(member, input.upcoming_projects, totalAvailable)
    return {
      member: member.name,
      available_hours: member.available_hours_per_week,
      allocated_hours: allocated,
      risk_level: assessMemberRisk(member.available_hours_per_week, allocated),
    }
  })

  const totalAllocated = Math.round(memberAnalyses.reduce((sum, m) => sum + m.allocated_hours, 0) * 10) / 10
  const utilizationPercent = Math.round((totalAllocated / totalAvailable) * 100)
  const status: 'healthy' | 'at_risk' | 'overloaded' =
    utilizationPercent > 90 ? 'overloaded' : utilizationPercent > 75 ? 'at_risk' : 'healthy'

  const summary = { total_available_hours: totalAvailable, total_allocated_hours: totalAllocated, utilization_percent: utilizationPercent, status }
  const bottlenecks = identifyBottlenecks(memberAnalyses, input.upcoming_projects, input.team_members)
  const recommendations = generateRecommendations(summary, memberAnalyses, input.upcoming_projects, input.team_members.length)

  const nearestDeadline = [...input.upcoming_projects].sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())[0]

  const forecastMessage = status === 'overloaded'
    ? `Team is currently overloaded at ${utilizationPercent}% utilization with ${input.upcoming_projects.length} projects in flight. Without scope reduction or resource addition, delivery risk is HIGH — particularly for ${nearestDeadline?.name ?? 'the nearest deadline project'} due ${nearestDeadline?.deadline ?? 'soon'}. Immediate intervention recommended.`
    : status === 'at_risk'
      ? `Team utilization at ${utilizationPercent}% — approaching capacity ceiling. Current project commitments are achievable but leave minimal buffer for scope changes or new requests. Monitor weekly and prepare contingency plan if utilization exceeds 85%.`
      : `Team is operating at ${utilizationPercent}% utilization — healthy range. Current capacity can absorb ${input.upcoming_projects.length} active projects with buffer remaining. Team is well-positioned for upcoming ${nearestDeadline?.name ?? 'project'} deadline of ${nearestDeadline?.deadline ?? 'TBD'}.`

  const result: CapacityPlanningOutput = {
    team_capacity_summary: summary,
    member_analysis: memberAnalyses,
    bottlenecks,
    recommendations,
    capacity_forecast: forecastMessage,
  }

  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
}
