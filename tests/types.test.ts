import { describe, expect, test } from 'vitest'

import {
  MessageSchema,
  ModifyPetSchema,
  NewMessageSchema,
  PetMoodSchema,
  PetSchema,
} from '@/server/types'

const UUID = '3f1a6c2e-2f7b-4f0e-9a1d-9c2f0b1d4e55'
const OTHER_UUID = '8a2b4c6d-1e3f-4a5b-9c7d-0e1f2a3b4c5d'

describe('PetSchema', () => {
  const pet = {
    id: UUID,
    user_id: OTHER_UUID,
    name: 'Roisin',
    skin: 'pink',
    xp: 250,
    level: 3,
    mood: 'happy',
    created_at: '2026-08-09T00:00:00.000Z',
    updated_at: '2026-08-09T00:00:00.000Z',
  }

  test('accepts a well-formed pet', () => {
    expect(PetSchema.safeParse(pet).success).toBe(true)
  })

  // The sprite sheets only animate the moods in the enum; anything else would
  // silently render as idle rather than failing where it went wrong.
  test('rejects a mood outside the enum', () => {
    expect(PetSchema.safeParse({ ...pet, mood: 'murderous' }).success).toBe(false)
  })

  test('rejects a skin outside the enum', () => {
    expect(PetSchema.safeParse({ ...pet, skin: 'teal' }).success).toBe(false)
  })

  test('rejects negative xp', () => {
    expect(PetSchema.safeParse({ ...pet, xp: -1 }).success).toBe(false)
  })
})

describe('ModifyPetSchema', () => {
  // The service spreads the parsed result into a Supabase update, so an
  // unknown key reaching the database would be a write we never intended —
  // and xp must only ever move through award_xp, never a direct set.
  test('drops keys that are not updatable', () => {
    const result = ModifyPetSchema.parse({
      id: UUID,
      name: 'Nimbus',
      xp: 999999,
      user_id: 'someone-else',
      level: 42,
    })

    expect(result).toEqual({ id: UUID, name: 'Nimbus' })
  })

  test('rejects an empty name', () => {
    expect(ModifyPetSchema.safeParse({ id: UUID, name: '   ' }).success).toBe(false)
  })
})

describe('NewMessageSchema', () => {
  test('defaults kind to text', () => {
    const message = NewMessageSchema.parse({ role: 'user', content: 'Build me a dashboard' })

    expect(message.kind).toBe('text')
  })

  test('rejects blank content', () => {
    expect(NewMessageSchema.safeParse({ role: 'user', content: '   ' }).success).toBe(false)
  })

  test('rejects a role outside the enum', () => {
    expect(NewMessageSchema.safeParse({ role: 'pet', content: 'hi' }).success).toBe(false)
  })

  test('rejects content beyond the column limit', () => {
    const result = NewMessageSchema.safeParse({
      role: 'user',
      content: 'x'.repeat(20001),
    })

    expect(result.success).toBe(false)
  })
})

describe('MessageSchema', () => {
  test('accepts null token counts', () => {
    const result = MessageSchema.safeParse({
      id: UUID,
      pet_id: OTHER_UUID,
      user_id: OTHER_UUID,
      role: 'assistant',
      kind: 'builder_prompt',
      content: 'Build a todo app with Supabase auth.',
      input_tokens: null,
      output_tokens: null,
      created_at: '2026-08-09T00:00:00.000Z',
    })

    expect(result.success).toBe(true)
  })
})

describe('PetMoodSchema', () => {
  // The conversation route feeds the model's free-text mood through this
  // before it reaches an enum column, so a hallucinated mood must not 500.
  test('rejects a mood the model invented', () => {
    expect(PetMoodSchema.safeParse('ecstatic').success).toBe(false)
  })

  test('accepts every mood the route can emit', () => {
    for (const mood of ['idle', 'thinking', 'happy', 'love', 'confused', 'celebrate']) {
      expect(PetMoodSchema.safeParse(mood).success).toBe(true)
    }
  })
})
