import { NextResponse } from 'next/server'
import { z } from 'zod'

import {
  appendConversationMessages,
  createMessage,
  getConversationHistory,
} from '@/server/ConversationService'
import {
  getCurrentPet,
  getPetInformation,
  modifyPetInformation,
} from '@/server/PetService'
import { composeReply } from '@/server/roisin'

/**
 * Turns one spoken request into Roisin's reply plus, when she has enough to go
 * on, an instruction for the desktop shell to type into native.builder.
 */
const ConversationRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(4000),
    petId: z.uuid().optional(),
  })
  .strict()

/** XP awarded per exchange. Builds are worth more than chat. */
const XP_PER_CHAT = 2
const XP_PER_BUILD = 10

/** Roisin's mood vocabulary, matching the pet spritesheet states. */
const MOODS = new Set([
  'idle',
  'happy',
  'sad',
  'angry',
  'curious',
  'thinking',
  'love',
  'confused',
  'celebrate',
])

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
    history = await getConversationHistory(pet.id)
  } catch (error) {
    console.error('[CONVERSATION-ROUTE] history', error)
    return NextResponse.json(
      { error: 'Could not load the conversation.' },
      { status: 500 },
    )
  }

  let reply

  try {
    reply = await composeReply(parsed.data.text, history.messages)
  } catch (error) {
    console.error('[CONVERSATION-ROUTE] compose', error)
    return NextResponse.json(
      { error: 'Roisin could not think of a reply right now.' },
      { status: 502 },
    )
  }

  const messages = [
    await createMessage('user', parsed.data.text, { type: 'transcript' }),
    await createMessage('assistant', reply.say, { type: 'text' }),
  ]

  if (reply.builderPrompt) {
    messages.push(
      await createMessage('assistant', reply.builderPrompt, {
        type: 'builder_prompt',
      }),
    )
  }

  try {
    await appendConversationMessages(pet.id, messages)
  } catch (error) {
    // The reply is still useful even if persistence failed, so this is logged
    // rather than turned into an error the user hears.
    console.error('[CONVERSATION-ROUTE] persist', error)
  }

  const awardedXp = reply.builderPrompt ? XP_PER_BUILD : XP_PER_CHAT
  const mood = MOODS.has(reply.mood) ? reply.mood : 'idle'
  let xp = pet.xp

  try {
    const updated = await modifyPetInformation({
      id: pet.id,
      xp: pet.xp + awardedXp,
      mood,
    })
    xp = updated.xp
  } catch (error) {
    console.error('[CONVERSATION-ROUTE] pet update', error)
  }

  return NextResponse.json(
    {
      reply: reply.say,
      action: reply.action,
      builderPrompt: reply.builderPrompt,
      mood,
      pet: { id: pet.id, name: pet.pet_name, xp, awardedXp },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
