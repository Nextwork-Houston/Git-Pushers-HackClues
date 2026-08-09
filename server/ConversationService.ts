'use server'

import {
  MessageSchema,
  NewMessageSchema,
  type Build,
  type BuildStatus,
  type Message,
  type NewMessage,
} from './types'
import { createClient, getUser } from './server'

const MESSAGE_COLUMNS =
  'id, pet_id, user_id, role, kind, content, input_tokens, output_tokens, created_at'

/** How much history is loaded for context and replay. */
const DEFAULT_HISTORY_LIMIT = 40

/**
 * Reads the most recent messages for a pet, oldest first.
 *
 * The `user_id` filter is redundant against row level security but makes a
 * wrong pet id read as "empty" rather than an authorisation error, and keeps
 * the query on the owner index.
 */
export async function getMessages(
  petId: string,
  limit = DEFAULT_HISTORY_LIMIT,
): Promise<Message[]> {
  const user = await getUser()
  const client = await createClient()

  const { data, error } = await client
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .eq('pet_id', petId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error(`[MESSAGE-ERROR] fetch: ${error.message}`)
    throw new Error('Could not load the conversation.')
  }

  const messages = MessageSchema.array().safeParse(data ?? [])

  if (!messages.success) {
    console.error(`[MESSAGE-ERROR] parse: ${messages.error.message}`)
    throw new Error('Could not read the stored conversation.')
  }

  // Fetched newest-first so the index does the work; returned oldest-first
  // because that is the order both the model and the chat panel expect.
  return messages.data.reverse()
}

/**
 * Appends messages to a pet's history.
 *
 * Each message is a row, so concurrent replies cannot overwrite one another
 * the way appending to a single JSON document could.
 */
export async function appendMessages(
  petId: string,
  newMessages: NewMessage[],
): Promise<Message[]> {
  if (newMessages.length === 0) return []

  const parsed = NewMessageSchema.array().safeParse(newMessages)

  if (!parsed.success) {
    console.error(`[MESSAGE-ERROR] input: ${parsed.error.message}`)
    throw new Error('Invalid message passed to appendMessages.')
  }

  const user = await getUser()
  const client = await createClient()

  const { data, error } = await client
    .from('messages')
    .insert(
      parsed.data.map((message) => ({
        ...message,
        pet_id: petId,
        user_id: user.id,
      })),
    )
    .select(MESSAGE_COLUMNS)

  if (error || !data) {
    console.error(`[MESSAGE-ERROR] insert: ${error?.message}`)
    throw new Error('Could not save the conversation.')
  }

  return MessageSchema.array().parse(data)
}

/**
 * Records an instruction handed to native.builder.
 *
 * native.builder offers no way to query what it was sent, so this table is
 * the only record that the request happened.
 */
export async function recordBuild(
  petId: string,
  prompt: string,
  messageId?: string,
): Promise<Build | null> {
  const user = await getUser()
  const client = await createClient()

  const { data, error } = await client
    .from('builds')
    .insert({
      pet_id: petId,
      user_id: user.id,
      message_id: messageId ?? null,
      prompt,
    })
    .select()
    .maybeSingle()

  if (error) {
    // A build that fails to log should not stop the build from being sent.
    console.error(`[BUILD-ERROR] insert: ${error.message}`)
    return null
  }

  return data as Build
}

/** Marks a recorded build as delivered to, or rejected by, native.builder. */
export async function updateBuildStatus(
  buildId: string,
  status: BuildStatus,
  errorMessage?: string,
): Promise<void> {
  const user = await getUser()
  const client = await createClient()

  const { error } = await client
    .from('builds')
    .update({
      status,
      error: errorMessage ?? null,
      delivered_at: status === 'sent' ? new Date().toISOString() : null,
    })
    .eq('id', buildId)
    .eq('user_id', user.id)

  if (error) console.error(`[BUILD-ERROR] update: ${error.message}`)
}
