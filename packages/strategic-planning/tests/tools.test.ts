import { describe, it, expect } from 'vitest'
import { analyzeSWOTHandler } from '../src/tools/analyze_swot.js'
import { scenarioPlanningHandler } from '../src/tools/scenario_planning.js'
import { initiativeROIHandler } from '../src/tools/initiative_roi.js'
import { missionAlignmentCheckHandler } from '../src/tools/mission_alignment_check.js'

// ─── analyze_swot ────────────────────────────────────────────────────────────

describe('analyze_swot', () => {
  it('returns valid SWOT structure with all required fields', async () => {
    const result = await analyzeSWOTHandler({
      context: 'LUKA is a growing fintech platform in Latin America focused on payments and revenue growth for SMEs. We have a strong tech team and partnerships.',
      mission: "Become Latin America's leading payments platform",
      timeframe: 'medium',
    })

    const data = JSON.parse(result.content[0].text)
    expect(data).toHaveProperty('strengths')
    expect(data).toHaveProperty('weaknesses')
    expect(data).toHaveProperty('opportunities')
    expect(data).toHaveProperty('threats')
    expect(data).toHaveProperty('mission_alignment_score')
    expect(data).toHaveProperty('priority_actions')
    expect(data).toHaveProperty('analysis_summary')

    expect(Array.isArray(data.strengths)).toBe(true)
    expect(Array.isArray(data.weaknesses)).toBe(true)
    expect(data.strengths.length).toBeGreaterThanOrEqual(3)
    expect(data.mission_alignment_score).toBeGreaterThanOrEqual(0)
    expect(data.mission_alignment_score).toBeLessThanOrEqual(100)
    expect(data.priority_actions).toHaveLength(3)
  })

  it('computes higher alignment score for mission-relevant context', async () => {
    const highAlignResult = await analyzeSWOTHandler({
      context: 'Expanding LUKA payment platform to lead Latin America market growth with payments technology',
      mission: "Become Latin America's leading payments platform",
      timeframe: 'long',
    })
    const lowAlignResult = await analyzeSWOTHandler({
      context: 'Reviewing office furniture procurement for HR department comfort',
      mission: "Become Latin America's leading payments platform",
      timeframe: 'short',
    })

    const highData = JSON.parse(highAlignResult.content[0].text)
    const lowData = JSON.parse(lowAlignResult.content[0].text)
    expect(highData.mission_alignment_score).toBeGreaterThan(lowData.mission_alignment_score)
  })

  it('handles minimal context input gracefully', async () => {
    const result = await analyzeSWOTHandler({
      context: 'New product launch',
      mission: 'Grow revenue',
      timeframe: 'short',
    })
    const data = JSON.parse(result.content[0].text)
    expect(data.strengths.length).toBeGreaterThan(0)
    expect(data.analysis_summary).toBeTruthy()
  })
})

// ─── scenario_planning ────────────────────────────────────────────────────────

describe('scenario_planning', () => {
  it('returns all three scenarios with correct probability structure', async () => {
    const result = await scenarioPlanningHandler({
      situation: 'Launching LUKA into the Brazilian market with a new B2B payments product',
      variables: ['market adoption rate', 'regulatory approval', 'competitor response', 'partnership deals', 'team hiring speed'],
      horizon_months: 12,
    })

    const data = JSON.parse(result.content[0].text)
    expect(data).toHaveProperty('best_case')
    expect(data).toHaveProperty('worst_case')
    expect(data).toHaveProperty('likely_case')
    expect(data).toHaveProperty('recommended_strategy')
    expect(data).toHaveProperty('early_warning_signals')

    const totalProb = data.best_case.probability + data.worst_case.probability + data.likely_case.probability
    expect(totalProb).toBeCloseTo(1.0, 1)
    expect(data.best_case.key_drivers.length).toBeGreaterThan(0)
    expect(data.early_warning_signals.length).toBeGreaterThanOrEqual(4)
  })

  it('handles long horizon correctly', async () => {
    const shortResult = await scenarioPlanningHandler({
      situation: 'Product launch decision',
      variables: ['sales performance', 'market demand'],
      horizon_months: 3,
    })
    const longResult = await scenarioPlanningHandler({
      situation: 'Product launch decision',
      variables: ['sales performance', 'market demand'],
      horizon_months: 48,
    })

    const shortData = JSON.parse(shortResult.content[0].text)
    const longData = JSON.parse(longResult.content[0].text)
    expect(shortData.likely_case.probability).toBeDefined()
    expect(longData.likely_case.probability).toBeDefined()
  })
})

// ─── initiative_roi ────────────────────────────────────────────────────────────

describe('initiative_roi', () => {
  it('returns full ROI structure with correct computation logic', async () => {
    const result = await initiativeROIHandler({
      initiative: 'Build a new revenue analytics platform to improve customer retention and grow revenue',
      investment_usd: 150000,
      timeframe_months: 18,
      strategic_goals: ['Increase ARR by 40%', 'Improve customer retention to 90%', 'Expand to 3 new LATAM markets'],
    })

    const data = JSON.parse(result.content[0].text)
    expect(data).toHaveProperty('financial_roi')
    expect(data).toHaveProperty('strategic_value')
    expect(data).toHaveProperty('risk_assessment')
    expect(data).toHaveProperty('overall_recommendation')
    expect(data).toHaveProperty('recommendation_rationale')
    expect(data.financial_roi.estimated_return_usd).toBeGreaterThan(0)
    expect(data.financial_roi.payback_months).toBeGreaterThan(0)
    expect(data.financial_roi.payback_months).toBeLessThanOrEqual(18)
    expect(['approve', 'review', 'reject']).toContain(data.overall_recommendation)
    expect(['low', 'medium', 'high']).toContain(data.risk_assessment.level)
  })

  it('flags large investment as higher risk', async () => {
    const smallResult = await initiativeROIHandler({
      initiative: 'Small process improvement',
      investment_usd: 10000,
      timeframe_months: 6,
      strategic_goals: ['Reduce costs'],
    })
    const largeResult = await initiativeROIHandler({
      initiative: 'Major market expansion into 5 new countries',
      investment_usd: 2000000,
      timeframe_months: 36,
      strategic_goals: ['Expand globally'],
    })

    const smallData = JSON.parse(smallResult.content[0].text)
    const largeData = JSON.parse(largeResult.content[0].text)
    expect(smallData.risk_assessment.level).toBe('low')
    expect(largeData.risk_assessment.level).toBe('high')
  })

  it('returns reject or review for misaligned expensive initiative', async () => {
    const result = await initiativeROIHandler({
      initiative: 'Random unrelated office decoration project',
      investment_usd: 500000,
      timeframe_months: 6,
      strategic_goals: ['Grow payments revenue', 'Expand Latin America market'],
    })
    const data = JSON.parse(result.content[0].text)
    expect(['review', 'reject']).toContain(data.overall_recommendation)
  })
})

// ─── mission_alignment_check ─────────────────────────────────────────────────

describe('mission_alignment_check', () => {
  it('returns valid alignment structure', async () => {
    const result = await missionAlignmentCheckHandler({
      decision: 'Launch a new payments product targeting Latin American SMEs to grow our platform market share',
      mission: "Become Latin America's leading payments platform",
      values: ['Innovation', 'Customer obsession', 'Transparency', 'Growth mindset'],
    })

    const data = JSON.parse(result.content[0].text)
    expect(data).toHaveProperty('alignment_score')
    expect(data).toHaveProperty('alignment_level')
    expect(data).toHaveProperty('aligned_aspects')
    expect(data).toHaveProperty('misaligned_aspects')
    expect(data).toHaveProperty('recommendation')
    expect(data.alignment_score).toBeGreaterThanOrEqual(0)
    expect(data.alignment_score).toBeLessThanOrEqual(100)
    expect(['strong', 'moderate', 'weak', 'misaligned']).toContain(data.alignment_level)
  })

  it('scores mission-aligned decisions higher than unrelated ones', async () => {
    const alignedResult = await missionAlignmentCheckHandler({
      decision: 'Invest in payments infrastructure expansion across Latin America to lead the market',
      mission: "Become Latin America's leading payments platform",
      values: ['Growth', 'Innovation'],
    })
    const unrelatedResult = await missionAlignmentCheckHandler({
      decision: 'Reorganize the office cafeteria seating arrangement',
      mission: "Become Latin America's leading payments platform",
      values: ['Growth', 'Innovation'],
    })

    const alignedData = JSON.parse(alignedResult.content[0].text)
    const unrelatedData = JSON.parse(unrelatedResult.content[0].text)
    expect(alignedData.alignment_score).toBeGreaterThan(unrelatedData.alignment_score)
    expect(alignedData.alignment_level).not.toBe('misaligned')
  })

  it('detects misalignment flags in contradictory decisions', async () => {
    const result = await missionAlignmentCheckHandler({
      decision: 'Cut all technology investment and follow competitor pricing to reduce costs short-term',
      mission: "Become Latin America's leading payments platform through innovation and technology leadership",
      values: ['Innovation', 'Long-term vision', 'Customer obsession'],
    })
    const data = JSON.parse(result.content[0].text)
    expect(data.misaligned_aspects.length).toBeGreaterThan(0)
    expect(['weak', 'misaligned']).toContain(data.alignment_level)
  })
})
