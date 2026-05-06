import { z } from 'zod'
import { validateInput } from '../utils/validation.js'
import { logger } from '../utils/logger.js'

export const missionAlignmentCheckShape = {
  decision: z.string().min(1).describe('Decision or action to evaluate'),
  mission: z.string().min(1).describe('Mission statement to align against'),
  values: z.array(z.string()).min(1).describe('Company values to check alignment with'),
}

const inputSchema = z.object(missionAlignmentCheckShape)
type Input = z.infer<typeof inputSchema>

interface MissionAlignmentOutput {
  alignment_score: number
  alignment_level: 'strong' | 'moderate' | 'weak' | 'misaligned'
  aligned_aspects: string[]
  misaligned_aspects: string[]
  recommendation: string
}

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2)
}

function computeTextSimilarity(text1: string, text2: string): number {
  const tokens1 = new Set(tokenize(text1))
  const tokens2 = new Set(tokenize(text2))
  const intersection = [...tokens1].filter(t => tokens2.has(t))
  const union = new Set([...tokens1, ...tokens2])
  return intersection.length / Math.max(union.size, 1)
}

function findAlignedAspects(decision: string, mission: string, values: string[]): string[] {
  const aligned: string[] = []
  const decisionLower = decision.toLowerCase()
  const missionKeywords = tokenize(mission).filter(w => w.length > 4)
  const matchedMissionWords = missionKeywords.filter(kw => decisionLower.includes(kw))
  if (matchedMissionWords.length > 0) {
    aligned.push(`Supports mission by addressing: ${matchedMissionWords.slice(0, 3).join(', ')}`)
  }
  for (const value of values) {
    const valueTokens = tokenize(value)
    const matchedValueTokens = valueTokens.filter(t => decisionLower.includes(t))
    if (matchedValueTokens.length > 0) aligned.push(`Aligns with value "${value}"`)
    else if (decisionLower.includes(value.toLowerCase().substring(0, Math.min(6, value.length)))) {
      aligned.push(`Partially reflects value "${value}"`)
    }
  }
  const positivePatterns = [
    { pattern: /customer|user|client/, label: 'Customer-centric approach' },
    { pattern: /innovat|technolog|digital/, label: 'Technology and innovation focus' },
    { pattern: /grow|expand|scale|revenue/, label: 'Growth orientation' },
    { pattern: /sustain|long.?term|future/, label: 'Long-term thinking' },
    { pattern: /team|people|talent|hire/, label: 'People and talent investment' },
    { pattern: /partner|collaborat|ecosystem/, label: 'Partnership and collaboration' },
  ]
  for (const { pattern, label } of positivePatterns) {
    if (pattern.test(decisionLower) && pattern.test(mission.toLowerCase())) {
      if (!aligned.some(a => a.includes(label))) aligned.push(label)
    }
  }
  return aligned.slice(0, 5)
}

function findMisalignedAspects(decision: string, mission: string, values: string[]): string[] {
  const misaligned: string[] = []
  const decisionLower = decision.toLowerCase()
  const concernPatterns = [
    { pattern: /short.?term|quick.?win|tactical/, missionConflict: /long.?term|sustain|strategic/, label: 'Short-term focus may conflict with long-term mission' },
    { pattern: /cost.?cut|reduc|eliminat/, missionConflict: /grow|expand|invest/, label: 'Cost reduction may hinder growth objectives' },
    { pattern: /competitor|copy|follow/, missionConflict: /lead|pioneer|innovat/, label: 'Reactive stance conflicts with leadership aspirations' },
    { pattern: /single|exclusive|lock/, missionConflict: /platform|ecosystem|partner/, label: 'Exclusivity may limit ecosystem development' },
  ]
  for (const { pattern, missionConflict, label } of concernPatterns) {
    if (pattern.test(decisionLower) && missionConflict.test(mission.toLowerCase())) misaligned.push(label)
  }
  const unrepresentedValues = values.filter(value => {
    const tokens = tokenize(value)
    return tokens.every(t => !decisionLower.includes(t))
  })
  if (unrepresentedValues.length > 0) {
    misaligned.push(`Decision does not explicitly address values: ${unrepresentedValues.slice(0, 2).join(', ')}`)
  }
  return misaligned.slice(0, 4)
}

export async function missionAlignmentCheckHandler(args: Input): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const input = validateInput(inputSchema, args)
  logger.info('Running mission_alignment_check', { decision_length: input.decision.length, values_count: input.values.length })

  const textSimilarity = computeTextSimilarity(input.decision, input.mission)
  const aligned = findAlignedAspects(input.decision, input.mission, input.values)
  const misaligned = findMisalignedAspects(input.decision, input.mission, input.values)
  const similarityScore = Math.round(textSimilarity * 40)
  const alignedBonus = Math.min(40, aligned.length * 10)
  const misalignedPenalty = Math.min(30, misaligned.length * 10)
  const rawScore = 20 + similarityScore + alignedBonus - misalignedPenalty
  const alignmentScore = Math.max(0, Math.min(100, rawScore))

  const alignmentLevel: 'strong' | 'moderate' | 'weak' | 'misaligned' =
    alignmentScore >= 75 ? 'strong'
    : alignmentScore >= 50 ? 'moderate'
    : alignmentScore >= 25 ? 'weak'
    : 'misaligned'

  let recommendation: string
  switch (alignmentLevel) {
    case 'strong':
      recommendation = `Decision strongly supports the mission. Proceed with confidence. Ensure ${misaligned[0] ? `you address: ${misaligned[0]}` : 'execution quality remains high'} during implementation.`
      break
    case 'moderate':
      recommendation = `Decision partially aligns with mission. Consider strengthening alignment by ${aligned[0] ? `building on "${aligned[0]}"` : 'revisiting mission principles'} and addressing gaps: ${misaligned[0] ?? 'unclear long-term impact'}. Review before proceeding.`
      break
    case 'weak':
      recommendation = `Decision shows weak mission alignment (score: ${alignmentScore}/100). Significant revision recommended. Focus on how this decision advances "${input.mission.substring(0, 60)}..." before committing resources.`
      break
    case 'misaligned':
      recommendation = `Decision appears misaligned with the stated mission. Strong recommendation to revisit or reject. If proceeding, document clear rationale for why this exception serves long-term mission goals.`
      break
  }

  const result: MissionAlignmentOutput = {
    alignment_score: alignmentScore,
    alignment_level: alignmentLevel,
    aligned_aspects: aligned.length > 0 ? aligned : ['Decision context provided for evaluation'],
    misaligned_aspects: misaligned.length > 0 ? misaligned : ['No major misalignment detected'],
    recommendation,
  }

  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
}
