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
import { composeReply } from '@/server/roisin'
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

  const toWrite: NewMessage[] = [
    { role: 'user', kind: 'transcript', content: parsed.data.text },
    { role: 'assistant', kind: 'text', content: reply.say },
  ]

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
      const build = await recordBuild(pet.id, reply.builderPrompt, promptMessage?.id)
      buildId = build?.id ?? null
    }
  } catch (error) {
    // The reply is still worth delivering; losing the log is not worth
    // turning into an error the user hears.
    console.error('[CONVERSATION-ROUTE] persist', error)
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
      mood: mood.success ? mood.data : 'idle',
      pet: { id: pet.id, name: pet.name, xp, level, awardedXp },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
