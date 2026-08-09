import { describe, expect, test } from 'vitest'

import {
  ConversationMessageSchema,
  ModifyPetSchema,
  messageText,
} from '@/server/types'

const VALID_UUID = '3f1a6c2e-2f7b-4f0e-9a1d-9c2f0b1d4e55'

describe('ConversationMessageSchema', () => {
  const base = {
    id: VALID_UUID,
    role: 'user',
    type: 'transcript',
    created_at: '2026-08-09T00:00:00.000Z',
    content: [{ content: 'Build me a dashboard', type: 'text' }],
  }

  test('accepts a message without usage', () => {
    expect(ConversationMessageSchema.safeParse(base).success).toBe(true)
  })

  test('rejects a role outside the vocabulary', () => {
    const result = ConversationMessageSchema.safeParse({ ...base, role: 'pet' })

    expect(result.success).toBe(false)
  })

  test('rejects a message with no content parts', () => {
    const result = ConversationMessageSchema.safeParse({ ...base, content: [] })

    expect(result.success).toBe(false)
  })
})

describe('messageText', () => {
  test('joins multiple content parts', () => {
    const message = ConversationMessageSchema.parse({
      id: VALID_UUID,
      role: 'assistant',
      type: 'text',
      created_at: '2026-08-09T00:00:00.000Z',
      content: [
        { content: 'First line', type: 'text' },
        { content: 'Second line', type: 'text' },
      ],
    })

    expect(messageText(message)).toBe('First line\nSecond line')
  })
})

describe('ModifyPetSchema', () => {
  test('rejects negative xp', () => {
    const result = ModifyPetSchema.safeParse({ id: VALID_UUID, xp: -5 })

    expect(result.success).toBe(false)
  })

  // The route spreads the parsed result into a Supabase update, so an unknown
  // key reaching the database would be a write we never intended.
  test('drops unknown keys rather than forwarding them', () => {
    const result = ModifyPetSchema.parse({
      id: VALID_UUID,
      xp: 10,
      user_id: 'someone-else',
    })

    expect(result).not.toHaveProperty('user_id')
  })
})
