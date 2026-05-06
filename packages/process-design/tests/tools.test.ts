import { describe, it, expect } from 'vitest'
import { mapProcessHandler } from '../src/tools/map_process.js'
import { generateSOPHandler } from '../src/tools/generate_sop.js'
import { measureEfficiencyHandler } from '../src/tools/measure_efficiency.js'
import { optimizeWorkflowHandler } from '../src/tools/optimize_workflow.js'
import { capacityPlanningHandler } from '../src/tools/capacity_planning.js'

// ─── map_process ──────────────────────────────────────────────────────────────

describe('map_process', () => {
  it('returns valid process map with all required fields', async () => {
    const result = await mapProcessHandler({
      process_name: 'Payment Reconciliation',
      description: 'Monthly reconciliation of all payment transactions against bank statements to ensure accuracy and identify discrepancies',
      participants: ['Finance Analyst', 'Finance Manager', 'Operations Team'],
      inputs: ['Bank statements', 'Payment records', 'Transaction logs'],
      outputs: ['Reconciliation report', 'Discrepancy log', 'Approved financial summary'],
    })

    const data = JSON.parse(result.content[0].text)
    expect(data).toHaveProperty('process_steps')
    expect(data).toHaveProperty('bottlenecks')
    expect(data).toHaveProperty('total_estimated_duration_minutes')
    expect(data).toHaveProperty('efficiency_score')
    expect(data).toHaveProperty('improvement_opportunities')
    expect(Array.isArray(data.process_steps)).toBe(true)
    expect(data.process_steps.length).toBeGreaterThanOrEqual(4)
    expect(data.process_steps[0]).toHaveProperty('step_number')
    expect(data.process_steps[0]).toHaveProperty('responsible')
    expect(data.process_steps[0]).toHaveProperty('bottleneck_risk')
    expect(['low', 'medium', 'high']).toContain(data.process_steps[0].bottleneck_risk)
    expect(data.total_estimated_duration_minutes).toBeGreaterThan(0)
    expect(data.efficiency_score).toBeGreaterThanOrEqual(20)
    expect(data.efficiency_score).toBeLessThanOrEqual(100)
  })

  it('identifies bottlenecks for processes with single participants', async () => {
    const result = await mapProcessHandler({
      process_name: 'CEO Approval Process',
      description: 'All decisions must go through the CEO for approval including budget approvals and vendor sign-offs',
      participants: ['CEO'],
      inputs: ['Request form'],
      outputs: ['Approved decision'],
    })

    const data = JSON.parse(result.content[0].text)
    const highRiskSteps = data.process_steps.filter((s: { bottleneck_risk: string }) => s.bottleneck_risk === 'high')
    expect(highRiskSteps.length).toBeGreaterThan(0)
    expect(data.bottlenecks.length).toBeGreaterThan(0)
  })
})

// ─── generate_sop ─────────────────────────────────────────────────────────────

describe('generate_sop', () => {
  it('generates complete SOP with all required sections', async () => {
    const result = await generateSOPHandler({
      process_name: 'Customer Onboarding',
      process_description: 'Onboarding new enterprise customers onto the LUKA payment platform, including KYC verification, API setup, and go-live support',
      department: 'Sales Operations',
      frequency: 'Weekly',
      tools_used: ['Salesforce CRM', 'LUKA Dashboard', 'Slack', 'DocuSign'],
    })

    const data = JSON.parse(result.content[0].text)
    expect(data).toHaveProperty('sop_title')
    expect(data).toHaveProperty('version')
    expect(data).toHaveProperty('purpose')
    expect(data).toHaveProperty('scope')
    expect(data).toHaveProperty('responsibilities')
    expect(data).toHaveProperty('procedure_steps')
    expect(data).toHaveProperty('quality_checkpoints')
    expect(data).toHaveProperty('exceptions_handling')
    expect(data).toHaveProperty('review_frequency')
    expect(data.sop_title).toContain('Customer Onboarding')
    expect(data.responsibilities.length).toBeGreaterThanOrEqual(3)
    expect(data.procedure_steps.length).toBeGreaterThanOrEqual(5)
    expect(data.quality_checkpoints.length).toBeGreaterThanOrEqual(3)
    expect(data.exceptions_handling.length).toBeGreaterThanOrEqual(4)
  })

  it('assigns department-specific roles correctly', async () => {
    const salesResult = await generateSOPHandler({
      process_name: 'Sales Forecast',
      process_description: 'Weekly sales forecasting and pipeline review',
      department: 'Sales',
      frequency: 'Weekly',
      tools_used: ['Salesforce', 'Slack'],
    })
    const techResult = await generateSOPHandler({
      process_name: 'Code Deployment',
      process_description: 'Deploy new code to production environment',
      department: 'Engineering',
      frequency: 'Daily',
      tools_used: ['GitHub', 'CI/CD Pipeline'],
    })

    const salesData = JSON.parse(salesResult.content[0].text)
    const techData = JSON.parse(techResult.content[0].text)
    const salesRoles = salesData.responsibilities.map((r: { role: string }) => r.role.toLowerCase())
    const techRoles = techData.responsibilities.map((r: { role: string }) => r.role.toLowerCase())
    expect(salesRoles.some((r: string) => r.includes('sales'))).toBe(true)
    expect(techRoles.some((r: string) => r.includes('engineer') || r.includes('developer'))).toBe(true)
  })
})

// ─── measure_efficiency ───────────────────────────────────────────────────────

describe('measure_efficiency', () => {
  it('correctly classifies metric statuses', async () => {
    const result = await measureEfficiencyHandler({
      process_name: 'Invoice Processing',
      metrics: [
        { name: 'Processing time (minutes)', current_value: 45, unit: 'minutes', target_value: 30 },
        { name: 'Customer satisfaction score', current_value: 85, unit: 'score', target_value: 90 },
        { name: 'Error rate', current_value: 2, unit: '%', target_value: 5 },
      ],
    })

    const data = JSON.parse(result.content[0].text)
    expect(data).toHaveProperty('overall_efficiency_score')
    expect(data).toHaveProperty('metrics_analysis')
    expect(data).toHaveProperty('top_improvement_areas')
    expect(data).toHaveProperty('estimated_efficiency_gain_percent')
    expect(data).toHaveProperty('recommendations')

    const processingTime = data.metrics_analysis.find((m: { metric: string }) => m.metric === 'Processing time (minutes)')
    const errorRate = data.metrics_analysis.find((m: { metric: string }) => m.metric === 'Error rate')
    expect(processingTime.status).toBe('off_track') // 45 > 30 for time = off track
    expect(errorRate.status).toBe('on_track') // 2 < 5 for error rate = on track
    expect(data.overall_efficiency_score).toBeGreaterThanOrEqual(0)
    expect(data.overall_efficiency_score).toBeLessThanOrEqual(100)
    expect(data.recommendations.length).toBeGreaterThan(0)
  })

  it('scores high efficiency for all on-track metrics', async () => {
    const result = await measureEfficiencyHandler({
      process_name: 'Perfect Process',
      metrics: [
        { name: 'Throughput', current_value: 100, unit: 'units', target_value: 90 },
        { name: 'Accuracy', current_value: 99, unit: '%', target_value: 95 },
      ],
    })

    const data = JSON.parse(result.content[0].text)
    expect(data.overall_efficiency_score).toBeGreaterThanOrEqual(90)
    data.metrics_analysis.forEach((m: { status: string }) => {
      expect(m.status).toBe('on_track')
    })
  })
})

// ─── optimize_workflow ────────────────────────────────────────────────────────

describe('optimize_workflow', () => {
  it('returns valid optimization recommendations and roadmap', async () => {
    const result = await optimizeWorkflowHandler({
      process_name: 'Client Reporting',
      current_issues: [
        'Manual data export from multiple systems every Monday',
        'Approval bottleneck — reports sit with manager for 2+ days',
        'No visibility into report status for client-facing team',
      ],
      team_size: 4,
      process_frequency: 'Weekly',
    })

    const data = JSON.parse(result.content[0].text)
    expect(data).toHaveProperty('optimization_recommendations')
    expect(data).toHaveProperty('automation_opportunities')
    expect(data).toHaveProperty('estimated_time_savings_percent')
    expect(data).toHaveProperty('implementation_roadmap')
    expect(data.optimization_recommendations.length).toBeGreaterThan(0)
    expect(data.optimization_recommendations[0]).toHaveProperty('title')
    expect(data.optimization_recommendations[0]).toHaveProperty('effort')
    expect(data.optimization_recommendations[0]).toHaveProperty('impact')
    expect(data.optimization_recommendations[0]).toHaveProperty('priority')
    expect(data.automation_opportunities.length).toBeGreaterThan(0)
    expect(data.estimated_time_savings_percent).toBeGreaterThan(0)
    expect(data.implementation_roadmap).toHaveLength(3)
  })

  it('identifies automation opportunities for manual issues', async () => {
    const result = await optimizeWorkflowHandler({
      process_name: 'Data Entry Process',
      current_issues: ['Manual data entry from spreadsheets takes 4 hours daily', 'Email chain updates for status tracking', 'Manual copy-paste between systems'],
      team_size: 2,
      process_frequency: 'Daily',
    })

    const data = JSON.parse(result.content[0].text)
    const automationText = data.automation_opportunities.join(' ').toLowerCase()
    expect(automationText).toMatch(/automat|rpa|integrat/)
    expect(data.estimated_time_savings_percent).toBeGreaterThan(20)
  })
})

// ─── capacity_planning ────────────────────────────────────────────────────────

describe('capacity_planning', () => {
  it('returns valid capacity analysis with correct status', async () => {
    const futureDate1 = new Date()
    futureDate1.setDate(futureDate1.getDate() + 30)
    const futureDate2 = new Date()
    futureDate2.setDate(futureDate2.getDate() + 60)

    const result = await capacityPlanningHandler({
      team_members: [
        { name: 'Ana García', role: 'Product Manager', available_hours_per_week: 40, current_utilization_percent: 70 },
        { name: 'Carlos López', role: 'Senior Engineer', available_hours_per_week: 40, current_utilization_percent: 80 },
        { name: 'María Ruiz', role: 'Designer', available_hours_per_week: 35, current_utilization_percent: 60 },
      ],
      upcoming_projects: [
        { name: 'Payment Dashboard V2', required_hours: 120, deadline: futureDate1.toISOString().split('T')[0] },
        { name: 'API Integration Project', required_hours: 80, deadline: futureDate2.toISOString().split('T')[0] },
      ],
    })

    const data = JSON.parse(result.content[0].text)
    expect(data).toHaveProperty('team_capacity_summary')
    expect(data).toHaveProperty('member_analysis')
    expect(data).toHaveProperty('bottlenecks')
    expect(data).toHaveProperty('recommendations')
    expect(data).toHaveProperty('capacity_forecast')
    expect(['healthy', 'at_risk', 'overloaded']).toContain(data.team_capacity_summary.status)
    expect(data.member_analysis).toHaveLength(3)
    expect(data.recommendations.length).toBeGreaterThan(0)
    expect(data.capacity_forecast.length).toBeGreaterThan(20)
  })

  it('flags overloaded status when utilization is very high', async () => {
    const nearDeadline = new Date()
    nearDeadline.setDate(nearDeadline.getDate() + 7)

    const result = await capacityPlanningHandler({
      team_members: [
        { name: 'Solo Dev', role: 'Developer', available_hours_per_week: 40, current_utilization_percent: 95 },
      ],
      upcoming_projects: [
        { name: 'Huge Project', required_hours: 200, deadline: nearDeadline.toISOString().split('T')[0] },
        { name: 'Another Big Project', required_hours: 160, deadline: nearDeadline.toISOString().split('T')[0] },
      ],
    })

    const data = JSON.parse(result.content[0].text)
    expect(data.team_capacity_summary.status).toBe('overloaded')
    expect(data.member_analysis[0].risk_level).toBe('high')
  })
})
