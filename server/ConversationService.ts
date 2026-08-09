'use server'

import { randomUUID } from 'node:crypto'

import {
  ConversationSchema,
  type Conversation,
  type ConversationMessage,
} from './types'
import { createClient, getUser } from './server'

/** Keeps the stored history from growing without bound. */
const MAX_STORED_MESSAGES = 200

/**
 * Reads a pet's conversation.
 *
 * The `user_id` filter is deliberate: row level security already blocks other
 * accounts, but filtering here means a wrong pet id fails as "not found"
 * rather than leaking the existence of someone else's conversation.
 */
export async function getConversationHistory(
  petId: string,
): Promise<Conversation> {
  const user = await getUser()
  const client = await createClient()

  const { data, error } = await client
    .from('conversations')
    .select('pet_id, user_id, messages')
    .eq('pet_id', petId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error || !data) {
    console.error(
      `[CONVERSATION-ERROR] fetch: ${error?.message ?? 'no conversation found'}`,
    )
    throw new Error('Error fetching conversation history!')
  }

  const conversation = ConversationSchema.safeParse(data)

  if (!conversation.success) {
    console.error(`[CONVERSATION-ERROR] parse: ${conversation.error.message}`)
    throw new Error('Error parsing conversation data to Conversation schema.')
  }

  return conversation.data
}

/** Builds a well-formed message ready to be appended to a history. */
export async function createMessage(
  role: ConversationMessage['role'],
  text: string,
  options: { type?: string; usage?: ConversationMessage['usage'] } = {},
): Promise<ConversationMessage> {
  return {
    id: randomUUID(),
    role,
    type: options.type ?? 'text',
    created_at: new Date(),
    usage: options.usage,
    content: [{ content: text, type: 'text' }],
  }
}

/**
 * Appends messages to a pet's history and persists the result.
 *
 * Appending server-side rather than accepting a whole history from the client
 * means a caller can never rewrite or truncate what was said earlier.
 */
export async function appendConversationMessages(
  petId: string,
  newMessages: ConversationMessage[],
): Promise<Conversation> {
  if (newMessages.length === 0) {
    throw new Error('No messages provided to append.')
  }

  const user = await getUser()
  const existing = await getConversationHistory(petId)
  const messages = [...existing.messages, ...newMessages].slice(
    -MAX_STORED_MESSAGES,
  )

  const client = await createClient()

  const { data, error } = await client
    .from('conversations')
    .update({ messages })
    .eq('pet_id', petId)
    .eq('user_id', user.id)
    .select('pet_id, user_id, messages')
    .maybeSingle()

  if (error || !data) {
    console.error(`[CONVERSATION-ERROR] update: ${error?.message}`)
    throw new Error('Something went wrong while saving the conversation!')
  }

  const conversation = ConversationSchema.safeParse(data)

  if (!conversation.success) {
    console.error(`[CONVERSATION-ERROR] parse: ${conversation.error.message}`)
    throw new Error('Something went wrong parsing the saved conversation!')
  }

  return conversation.data
}
