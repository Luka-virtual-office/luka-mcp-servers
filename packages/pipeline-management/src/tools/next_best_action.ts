import { z } from 'zod'
import { validateInput } from '../utils/validation.js'
import { logger } from '../utils/logger.js'

export const nextBestActionShape = {
  deal_name: z.string().min(1).describe('Name of the deal'),
  stage: z.string().min(1).describe('Current pipeline stage'),
  last_interaction: z.string().min(1).describe('Description of the last interaction with the prospect'),
  deal_context: z.string().min(1).describe('Additional context about the deal and prospect'),
}

const inputSchema = z.object(nextBestActionShape)
type Input = z.infer<typeof inputSchema>

interface NextBestActionOutput {
  recommended_action: string
  action_type: 'call' | 'email' | 'demo' | 'proposal' | 'follow_up' | 'escalate'
  priority: 'urgent' | 'high' | 'medium' | 'low'
  suggested_message: string
  timing_recommendation: string
  expected_outcome: string
}

function determineActionType(stage: string, last_interaction: string, context: string): NextBestActionOutput['action_type'] {
  const stageLower = stage.toLowerCase()
  const lastLower = last_interaction.toLowerCase()
  const ctxLower = context.toLowerCase()
  if (ctxLower.includes('stall') || ctxLower.includes('silent') || ctxLower.includes('no response') || ctxLower.includes('overdue')) return 'escalate'
  if (stageLower.includes('negotiat') || stageLower.includes('contract') || stageLower.includes('closing')) return 'call'
  if (stageLower.includes('proposal') && !lastLower.includes('proposal')) return 'proposal'
  if (stageLower.includes('demo') || stageLower.includes('discovery') || stageLower.includes('qualif')) return 'demo'
  if (lastLower.includes('email') || lastLower.includes('message')) return 'call'
  if (lastLower.includes('call') || lastLower.includes('meeting')) return 'follow_up'
  return 'email'
}

function determinePriority(stage: string, context: string, last_interaction: string): NextBestActionOutput['priority'] {
  const all = `${stage} ${context} ${last_interaction}`.toLowerCase()
  if (all.includes('overdue') || all.includes('stall') || all.includes('lost') || all.includes('no response') || all.includes('competitor')) return 'urgent'
  if (all.includes('closing') || all.includes('negotiat') || all.includes('contract') || all.includes('decision')) return 'high'
  if (all.includes('proposal') || all.includes('demo') || all.includes('evaluat')) return 'medium'
  return 'low'
}

function generateSuggestedMessage(deal_name: string, stage: string, action_type: string, context: string): string {
  const ctxLower = context.toLowerCase()

  const templates: Record<string, string> = {
    call: `Hi [Contact Name], I wanted to follow up on our recent conversation about ${deal_name}. I have a few ideas that could directly address your specific needs. Do you have 15 minutes this week to connect? I'm flexible on timing.`,
    email: `Subject: Quick update + next steps for ${deal_name}\n\nHi [Contact Name],\n\nI wanted to share a quick insight relevant to your situation — [relevant case study based on context]. Would it make sense to jump on a brief call this week to explore how this applies to your use case?\n\nBest, [Your Name]`,
    demo: `Hi [Contact Name], Based on what you shared about ${ctxLower.includes('payment') ? 'your payments workflow challenges' : 'your business needs'}, I'd love to show you how LUKA handles this specifically. I have a tailored demo ready — are you available for 30 minutes [propose 2-3 specific time slots]?`,
    proposal: `Hi [Contact Name], Following our discovery session on ${deal_name}, I've prepared a customized proposal that addresses your key priorities. I'll send this over by tomorrow and would love to walk through it together. Does [day/time] work for a review call?`,
    follow_up: `Hi [Contact Name], Just checking in on ${deal_name} — I want to make sure you have everything you need to move forward. Any questions I can answer? Happy to loop in any additional team members if helpful.`,
    escalate: `Hi [Contact Name], I realize we've not connected in a while on ${deal_name}. I want to make sure this is still a priority for you — if timing has changed, I completely understand. If there's still interest, I'd love to find a quick 15-minute slot to re-sync this week. What does your calendar look like?`,
  }

  return templates[action_type] ?? templates['follow_up']
}

function generateExpectedOutcome(action_type: string): string {
  const outcomes: Record<string, string> = {
    call: 'Verbal commitment to next step or clear understanding of decision timeline and blockers. Move deal to next pipeline stage.',
    email: 'Re-engagement response within 48 hours. Re-establish active status and schedule follow-up conversation.',
    demo: 'Prospect confirms product-fit and identifies specific use cases. Advance to proposal stage with documented requirements.',
    proposal: 'Prospect reviews and provides feedback within 5 business days. Initiate negotiation phase.',
    follow_up: 'Confirmation of deal status and any outstanding concerns resolved. Maintain positive momentum toward close.',
    escalate: 'Determine whether deal is still active or should be closed/lost. If active, re-establish clear next steps and timeline commitment.',
  }
  return outcomes[action_type] ?? outcomes['follow_up']
}

export async function nextBestActionHandler(args: Input): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const input = validateInput(inputSchema, args)
  logger.info('Running next_best_action', { deal_name: input.deal_name, stage: input.stage })

  const actionType = determineActionType(input.stage, input.last_interaction, input.deal_context)
  const priority = determinePriority(input.stage, input.deal_context, input.last_interaction)
  const suggestedMessage = generateSuggestedMessage(input.deal_name, input.stage, actionType, input.deal_context)
  const expectedOutcome = generateExpectedOutcome(actionType)

  const timingMap: Record<string, string> = {
    urgent: 'Execute within the next 4 hours — same business day at the latest',
    high: 'Execute within the next 24 hours',
    medium: 'Execute within the next 2-3 business days',
    low: 'Execute within the next week during regular pipeline review',
  }

  const actionDescriptions: Record<string, string> = {
    call: `Place a direct phone call to the primary contact at ${input.deal_name} to discuss deal progression`,
    email: `Send a personalized email to re-engage and advance the ${input.deal_name} opportunity`,
    demo: `Schedule and conduct a product demonstration tailored to ${input.deal_name}'s specific use case`,
    proposal: `Prepare and deliver a customized commercial proposal for ${input.deal_name}`,
    follow_up: `Send a focused follow-up to ${input.deal_name} to confirm next steps and maintain momentum`,
    escalate: `Escalate ${input.deal_name} to senior leadership or re-engage with a compelling re-activation message`,
  }

  const result: NextBestActionOutput = {
    recommended_action: actionDescriptions[actionType] ?? `Take action on ${input.deal_name}`,
    action_type: actionType,
    priority,
    suggested_message: suggestedMessage,
    timing_recommendation: timingMap[priority] ?? 'Execute within the next week',
    expected_outcome: expectedOutcome,
  }

  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
}
