import type { Metadata } from 'next'

import { getMessages } from '@/server/ConversationService'
import { getCurrentPet } from '@/server/PetService'
import type { Message } from '@/server/types'

import { CompanionClient } from './companion-client'

export const metadata: Metadata = { title: 'Companion' }

/** Auth state lives in cookies, so this page can never be prerendered. */
export const dynamic = 'force-dynamic'

/** How many past messages are replayed into the chat panel on load. */
const REPLAYED_MESSAGES = 20

export default async function CompanionPage() {
  const pet = await getCurrentPet()

  let history: Message[] = []

  try {
    history = await getMessages(pet.id, REPLAYED_MESSAGES)
  } catch (error) {
    // A history that will not load should not keep the companion offline.
    console.error('[COMPANION-PAGE] history', error)
  }

  return (
    <CompanionClient
      pet={{
        id: pet.id,
        name: pet.name,
        xp: pet.xp,
        level: pet.level,
        mood: pet.mood,
        skin: pet.skin,
      }}
      history={history.map((message) => ({
        id: message.id,
        role: message.role,
        kind: message.kind,
        content: message.content,
      }))}
      builderUrl={
        process.env.NEXT_PUBLIC_NATIVE_BUILDER_URL ||
        'https://builder.nativelyai.com'
      }
    />
  )
}
