import { describe, it, expect } from 'vitest'
import { qualifyLeadHandler } from '../src/tools/qualify_lead.js'
import { predictCloseProbabilityHandler } from '../src/tools/predict_close_probability.js'
import { identifyAtRiskDealsHandler } from '../src/tools/identify_at_risk_deals.js'
import { nextBestActionHandler } from '../src/tools/next_best_action.js'
import { forecastRevenueHandler } from '../src/tools/forecast_revenue.js'

// ─── qualify_lead ─────────────────────────────────────────────────────────────

describe('qualify_lead', () => {
  it('returns valid BANT and MEDDIC structure', async () => {
    const result = await qualifyLeadHandler({
      company: 'Acme Payments Corp',
      contact_name: 'Maria Rodriguez',
      budget_usd: 80000,
      authority: 'CFO and decision maker for technology investments',
      need: 'Critical need to automate payment reconciliation — currently manual and causing daily errors',
      timeline: 'Q2 this quarter, needs to go live in 30 days',
      additional_context: 'Enterprise client in fintech space',
    })

    const data = JSON.parse(result.content[0].text)
    expect(data).toHaveProperty('bant_score')
    expect(data).toHaveProperty('meddic_flags')
    expect(data).toHaveProperty('qualification_level')
    expect(data).toHaveProperty('recommended_next_step')
    expect(data).toHaveProperty('deal_potential_usd')
    expect(data).toHaveProperty('close_probability')
    expect(data.bant_score.total).toBeGreaterThanOrEqual(0)
    expect(data.bant_score.total).toBeLessThanOrEqual(100)
    expect(['hot', 'warm', 'cold', 'disqualified']).toContain(data.qualification_level)
    expect(data.close_probability).toBeGreaterThanOrEqual(5)
    expect(data.close_probability).toBeLessThanOrEqual(95)
    expect(typeof data.meddic_flags.economic_buyer).toBe('boolean')
  })

  it('scores hot lead higher than cold lead', async () => {
    const hotResult = await qualifyLeadHandler({
      company: 'BigCorp Enterprise',
      contact_name: 'CEO Carlos Mendez',
      budget_usd: 200000,
      authority: 'CEO and final decision maker with full budget authority and approval rights',
      need: 'Critical pain point — manual payment processing causing costly problems and inefficiency. Need solution immediately.',
      timeline: 'This month — board has approved, need to move ASAP',
      additional_context: 'Enterprise client. ROI metrics tracked, decision criteria defined, evaluation process underway. Champion identified.',
    })
    const coldResult = await qualifyLeadHandler({
      company: 'TinyStartup',
      contact_name: 'Junior Analyst',
      budget_usd: 1000,
      authority: 'Junior analyst exploring options with no purchase authority',
      need: 'Maybe interested someday in considering exploring payments',
      timeline: 'No rush, no timeline defined, evaluating eventually',
    })

    const hotData = JSON.parse(hotResult.content[0].text)
    const coldData = JSON.parse(coldResult.content[0].text)
    expect(hotData.bant_score.total).toBeGreaterThan(coldData.bant_score.total)
    expect(hotData.close_probability).toBeGreaterThan(coldData.close_probability)
    expect(['hot', 'warm']).toContain(hotData.qualification_level)
    expect(['cold', 'disqualified']).toContain(coldData.qualification_level)
  })
})

// ─── predict_close_probability ────────────────────────────────────────────────

describe('predict_close_probability', () => {
  it('returns valid prediction structure', async () => {
    const result = await predictCloseProbabilityHandler({
      deal_name: 'Acme Q2 Deal',
      stage: 'Negotiation',
      days_in_stage: 5,
      engagement_level: 'high',
      budget_confirmed: true,
      decision_maker_engaged: true,
      competitor_present: false,
    })

    const data = JSON.parse(result.content[0].text)
    expect(data).toHaveProperty('close_probability')
    expect(data).toHaveProperty('estimated_close_date')
    expect(data).toHaveProperty('confidence_level')
    expect(data).toHaveProperty('positive_signals')
    expect(data).toHaveProperty('risk_signals')
    expect(data).toHaveProperty('recommended_actions')
    expect(data.close_probability).toBeGreaterThanOrEqual(5)
    expect(data.close_probability).toBeLessThanOrEqual(95)
    expect(['low', 'medium', 'high']).toContain(data.confidence_level)
    expect(data.estimated_close_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('reduces probability for risky conditions', async () => {
    const strongResult = await predictCloseProbabilityHandler({
      deal_name: 'Strong Deal',
      stage: 'Proposal',
      days_in_stage: 3,
      engagement_level: 'high',
      budget_confirmed: true,
      decision_maker_engaged: true,
      competitor_present: false,
    })
    const weakResult = await predictCloseProbabilityHandler({
      deal_name: 'Weak Deal',
      stage: 'Proposal',
      days_in_stage: 45,
      engagement_level: 'low',
      budget_confirmed: false,
      decision_maker_engaged: false,
      competitor_present: true,
    })

    const strongData = JSON.parse(strongResult.content[0].text)
    const weakData = JSON.parse(weakResult.content[0].text)
    expect(strongData.close_probability).toBeGreaterThan(weakData.close_probability)
    expect(weakData.risk_signals.length).toBeGreaterThan(0)
  })
})

// ─── identify_at_risk_deals ───────────────────────────────────────────────────

describe('identify_at_risk_deals', () => {
  it('correctly identifies at-risk deals', async () => {
    const today = new Date()
    const pastDate = new Date(today)
    pastDate.setDate(today.getDate() - 30)
    const futureDate = new Date(today)
    futureDate.setDate(today.getDate() + 30)

    const result = await identifyAtRiskDealsHandler({
      deals: [
        {
          id: 'deal-001',
          name: 'Silent Deal',
          stage: 'Proposal',
          days_since_last_contact: 30,
          amount_usd: 50000,
          close_date: pastDate.toISOString().split('T')[0],
        },
        {
          id: 'deal-002',
          name: 'Healthy Deal',
          stage: 'Negotiation',
          days_since_last_contact: 2,
          amount_usd: 75000,
          close_date: futureDate.toISOString().split('T')[0],
        },
      ],
    })

    const data = JSON.parse(result.content[0].text)
    expect(data).toHaveProperty('at_risk_deals')
    expect(data).toHaveProperty('total_at_risk_value')
    expect(data).toHaveProperty('summary')
    const atRiskIds = data.at_risk_deals.map((d: { deal_id: string }) => d.deal_id)
    expect(atRiskIds).toContain('deal-001')
    expect(data.at_risk_deals[0].risk_reasons.length).toBeGreaterThan(0)
  })

  it('returns empty at_risk_deals for healthy pipeline', async () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 60)

    const result = await identifyAtRiskDealsHandler({
      deals: [
        {
          id: 'healthy-001',
          name: 'On Track Deal',
          stage: 'Negotiation',
          days_since_last_contact: 1,
          amount_usd: 40000,
          close_date: futureDate.toISOString().split('T')[0],
        },
      ],
    })

    const data = JSON.parse(result.content[0].text)
    expect(data.at_risk_deals).toHaveLength(0)
    expect(data.total_at_risk_value).toBe(0)
  })
})

// ─── next_best_action ─────────────────────────────────────────────────────────

describe('next_best_action', () => {
  it('returns valid action recommendation', async () => {
    const result = await nextBestActionHandler({
      deal_name: 'Banco Nacional LATAM',
      stage: 'Discovery',
      last_interaction: 'Email sent 5 days ago with product overview',
      deal_context: 'Large bank interested in automating payment reconciliation. CTO is the champion.',
    })

    const data = JSON.parse(result.content[0].text)
    expect(data).toHaveProperty('recommended_action')
    expect(data).toHaveProperty('action_type')
    expect(data).toHaveProperty('priority')
    expect(data).toHaveProperty('suggested_message')
    expect(data).toHaveProperty('timing_recommendation')
    expect(data).toHaveProperty('expected_outcome')
    expect(['call', 'email', 'demo', 'proposal', 'follow_up', 'escalate']).toContain(data.action_type)
    expect(['urgent', 'high', 'medium', 'low']).toContain(data.priority)
    expect(data.suggested_message.length).toBeGreaterThan(50)
  })

  it('recommends escalate for stalled deals', async () => {
    const result = await nextBestActionHandler({
      deal_name: 'Ghost Deal',
      stage: 'Proposal',
      last_interaction: 'Call 3 weeks ago, no response since',
      deal_context: 'Deal has gone silent, no response to 3 follow-up emails, prospect may have gone cold',
    })

    const data = JSON.parse(result.content[0].text)
    expect(data.action_type).toBe('escalate')
    expect(['urgent', 'high']).toContain(data.priority)
  })
})

// ─── forecast_revenue ────────────────────────────────────────────────────────

describe('forecast_revenue', () => {
  it('correctly weights deals by close probability', async () => {
    const result = await forecastRevenueHandler({
      deals: [
        { name: 'Deal A', amount_usd: 100000, stage: 'Negotiation', close_probability: 80 },
        { name: 'Deal B', amount_usd: 50000, stage: 'Proposal', close_probability: 40 },
        { name: 'Deal C', amount_usd: 200000, stage: 'Closing', close_probability: 90 },
      ],
      period: 'Q2 2026',
    })

    const data = JSON.parse(result.content[0].text)
    expect(data).toHaveProperty('weighted_forecast')
    expect(data).toHaveProperty('best_case_forecast')
    expect(data).toHaveProperty('committed_forecast')
    expect(data).toHaveProperty('deals_breakdown')
    expect(data).toHaveProperty('forecast_period')
    expect(data).toHaveProperty('confidence_level')
    // 100000*0.8 + 50000*0.4 + 200000*0.9 = 80000+20000+180000 = 280000
    expect(data.weighted_forecast).toBe(280000)
    expect(data.best_case_forecast).toBeGreaterThanOrEqual(data.weighted_forecast)
    expect(data.deals_breakdown).toHaveLength(3)
  })

  it('computes higher confidence for high-probability pipelines', async () => {
    const highConfResult = await forecastRevenueHandler({
      deals: [
        { name: 'Strong A', amount_usd: 80000, stage: 'Closing', close_probability: 85 },
        { name: 'Strong B', amount_usd: 60000, stage: 'Negotiation', close_probability: 75 },
        { name: 'Strong C', amount_usd: 40000, stage: 'Contract', close_probability: 90 },
      ],
      period: 'June 2026',
    })
    const lowConfResult = await forecastRevenueHandler({
      deals: [
        { name: 'Weak A', amount_usd: 80000, stage: 'Prospecting', close_probability: 10 },
        { name: 'Weak B', amount_usd: 60000, stage: 'Qualification', close_probability: 15 },
      ],
      period: 'June 2026',
    })

    const highData = JSON.parse(highConfResult.content[0].text)
    const lowData = JSON.parse(lowConfResult.content[0].text)
    expect(highData.confidence_level).toBe('high')
    expect(lowData.confidence_level).toBe('low')
  })
})
