import type { Metadata } from 'next'

import { getConversationHistory } from '@/server/ConversationService'
import { getCurrentPet } from '@/server/PetService'
import { messageText, type ConversationMessage } from '@/server/types'

import { CompanionClient } from './companion-client'

export const metadata: Metadata = { title: 'Companion' }

/** Auth state lives in cookies, so this page can never be prerendered. */
export const dynamic = 'force-dynamic'

/** How many past messages are replayed into the chat panel on load. */
const REPLAYED_MESSAGES = 20

function toChatMessage(message: ConversationMessage) {
  return {
    id: message.id,
    role: message.role,
    type: message.type,
    text: messageText(message),
  }
}

export default async function CompanionPage() {
  const pet = await getCurrentPet()

  let history: ConversationMessage[] = []

  try {
    history = (await getConversationHistory(pet.id)).messages
  } catch (error) {
    // A missing conversation row should not block the companion from loading.
    console.error('[COMPANION-PAGE] history', error)
  }

  return (
    <CompanionClient
      pet={{
        id: pet.id,
        name: pet.pet_name,
        xp: pet.xp,
        mood: pet.mood,
        spritesheetUrl: pet.spritesheet_url,
      }}
      history={history.slice(-REPLAYED_MESSAGES).map(toChatMessage)}
      builderUrl={
        process.env.NEXT_PUBLIC_NATIVE_BUILDER_URL ||
        'https://builder.nativelyai.com'
      }
    />
  )
}
