import { NextResponse } from 'next/server'
import { z } from 'zod'

import {
  appendMessages,
  getMessages,
  recordBuild,
} from '@/server/ConversationService'
import {
  awardXp,
  getCurrentPet,
  getPetInformation,
} from '@/server/PetService'
import {
  formatResearch,
  isResearchConfigured,
  research,
  type ResearchResult,
} from '@/server/brightdata'
import { composeFromResearch, composeReply } from '@/server/roisin'
import { blockingConnector, listConnectors, type Connector } from '@/server/connectors'
import { PetMoodSchema, type NewMessage } from '@/server/types'

/**
 * Turns one spoken request into Roisin's reply and, when she has enough to go
 * on, an instruction for the shell to type into native.builder.
 */
const ConversationRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(4000),
    petId: z.uuid().optional(),
  })
  .strict()

/** Builds are worth more than chat, so shipping something moves the meter. */
const XP_PER_CHAT = 2
const XP_PER_BUILD = 10

export async function POST(request: Request) {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Request body must be valid JSON' },
      { status: 400 },
    )
  }

  const parsed = ConversationRequestSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  let pet

  try {
    pet = parsed.data.petId
      ? await getPetInformation(parsed.data.petId)
      : await getCurrentPet()
  } catch (error) {
    console.error('[CONVERSATION-ROUTE] pet lookup', error)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let history

  try {
    history = await getMessages(pet.id)
  } catch (error) {
    console.error('[CONVERSATION-ROUTE] history', error)
    return NextResponse.json(
      { error: 'Could not load the conversation.' },
      { status: 500 },
    )
  }

  let reply

  try {
    reply = await composeReply(parsed.data.text, history)
  } catch (error) {
    console.error('[CONVERSATION-ROUTE] compose', error)
    return NextResponse.json(
      { error: 'Roisin could not think of a reply right now.' },
      { status: 502 },
    )
  }

  // When Roisin asks for facts, go and get them, then let her write the build
  // instruction against real results rather than from memory.
  let sources: ResearchResult[] = []

  if (reply.action === 'research' && reply.researchQuery) {
    if (!isResearchConfigured()) {
      // Falling through silently would look like she ignored the request.
      reply = {
        ...reply,
        action: 'chat',
        say: 'I cannot look things up right now — research is not configured on this server.',
        mood: 'confused',
      }
    } else {
      try {
        const findings = await research(reply.researchQuery)
        sources = findings.results

        const grounded = await composeFromResearch(
          parsed.data.text,
          formatResearch(findings),
          history,
        )

        // Keep the query on the reply so it can be persisted and shown.
        reply = { ...grounded, researchQuery: reply.researchQuery }
      } catch (error) {
        console.error('[CONVERSATION-ROUTE] research', error)
        reply = {
          ...reply,
          action: 'chat',
          say: 'I could not reach the web just now. Tell me what you know and I will work from that.',
          mood: 'confused',
        }
      }
    }
  }

  const toWrite: NewMessage[] = [
    { role: 'user', kind: 'transcript', content: parsed.data.text },
    {
      role: 'assistant',
      kind: 'text',
      content: reply.say,
      // Recorded per message so usage can be reported from what actually
      // happened rather than estimated after the fact.
      input_tokens: reply.usage?.inputTokens,
      output_tokens: reply.usage?.outputTokens,
    },
  ]

  if (sources.length > 0) {
    toWrite.push({
      role: 'assistant',
      kind: 'research',
      content: formatResearch({ query: reply.researchQuery ?? '', results: sources }),
    })
  }

  if (reply.builderPrompt) {
    toWrite.push({
      role: 'assistant',
      kind: 'builder_prompt',
      content: reply.builderPrompt,
    })
  }

  let buildId: string | null = null

  try {
    const written = await appendMessages(pet.id, toWrite)

    if (reply.builderPrompt) {
      const promptMessage = written.find((m) => m.kind === 'builder_prompt')
      const build = await recordBuild(pet.id, reply.builderPrompt, {
        messageId: promptMessage?.id,
        request: parsed.data.text,
        sources,
      })
      buildId = build?.id ?? null
    }
  } catch (error) {
    // The reply is still worth delivering; losing the log is not worth
    // turning into an error the user hears.
    console.error('[CONVERSATION-ROUTE] persist', error)
  }

  // If a build was produced but somewhere to save it was never connected,
  // say so with a way to fix it rather than letting the save fail silently
  // after the conversation has moved on.
  let connect: Connector | null = null

  if (reply.builderPrompt) {
    try {
      const connectors = await listConnectors(
        process.env.NEXT_PUBLIC_NATIVE_BUILDER_URL || 'https://builder.nativelyai.com',
      )
      connect = blockingConnector(connectors, 'scaffold')
    } catch (error) {
      console.error('[CONVERSATION-ROUTE] connectors', error)
    }
  }

  const mood = PetMoodSchema.safeParse(reply.mood)
  let xp = pet.xp
  let level = pet.level
  const awardedXp = reply.builderPrompt ? XP_PER_BUILD : XP_PER_CHAT

  try {
    const updated = await awardXp(
      pet.id,
      awardedXp,
      mood.success ? mood.data : undefined,
    )
    xp = updated.xp
    level = updated.level
  } catch (error) {
    console.error('[CONVERSATION-ROUTE] award xp', error)
  }

  return NextResponse.json(
    {
      reply: reply.say,
      action: reply.action,
      builderPrompt: reply.builderPrompt,
      buildId,
      sources,
      connect: connect ? { ...connect, resume: parsed.data.text } : null,
      mood: mood.success ? mood.data : 'idle',
      pet: { id: pet.id, name: pet.name, xp, level, awardedXp },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
