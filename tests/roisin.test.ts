import { describe, expect, test } from 'vitest'

import { coerceReply } from '@/server/roisin'

describe('coerceReply', () => {
  test('reads a well-formed reply', () => {
    const reply = coerceReply(
      JSON.stringify({
        say: 'Building that now.',
        action: 'build',
        builderPrompt: 'Build a todo app with Supabase auth.',
        mood: 'happy',
      }),
    )

    expect(reply).toEqual({
      say: 'Building that now.',
      action: 'build',
      builderPrompt: 'Build a todo app with Supabase auth.',
      researchQuery: null,
      mood: 'happy',
    })
  })

  test('unwraps a fenced code block', () => {
    const reply = coerceReply('```json\n{"say":"Hi","action":"chat","builderPrompt":null,"mood":"idle"}\n```')

    expect(reply.say).toBe('Hi')
    expect(reply.action).toBe('chat')
  })

  test('finds JSON surrounded by prose', () => {
    const reply = coerceReply(
      'Sure! {"say":"On it","action":"ask","builderPrompt":null,"mood":"curious"} Hope that helps.',
    )

    expect(reply.say).toBe('On it')
    expect(reply.action).toBe('ask')
  })

  // A "build" the shell cannot act on is worse than no build at all: it would
  // award build XP and animate a celebration for nothing.
  test('demotes a build that carries no prompt', () => {
    const reply = coerceReply(
      JSON.stringify({ say: 'Doing it', action: 'build', builderPrompt: null, mood: 'happy' }),
    )

    expect(reply.action).toBe('chat')
    expect(reply.builderPrompt).toBeNull()
  })

  test('demotes a build whose prompt is only whitespace', () => {
    const reply = coerceReply(
      JSON.stringify({ say: 'Doing it', action: 'build', builderPrompt: '   ', mood: 'happy' }),
    )

    expect(reply.action).toBe('chat')
    expect(reply.builderPrompt).toBeNull()
  })

  test('keeps unparseable output as something Roisin can still say', () => {
    const reply = coerceReply('I could not reach the build service.')

    expect(reply.say).toBe('I could not reach the build service.')
    expect(reply.action).toBe('chat')
    expect(reply.builderPrompt).toBeNull()
  })

  test('rejects an unknown action', () => {
    const reply = coerceReply(
      JSON.stringify({ say: 'Hm', action: 'deploy', builderPrompt: null, mood: 'idle' }),
    )

    expect(reply.action).toBe('chat')
  })

  test('falls back when the model returns an empty string', () => {
    const reply = coerceReply('')

    expect(reply.say.length).toBeGreaterThan(0)
    expect(reply.action).toBe('chat')
  })
})

describe('coerceReply — research', () => {
  test('accepts a research action with a query', () => {
    const reply = coerceReply(
      JSON.stringify({
        say: 'Let me look that up.',
        action: 'research',
        builderPrompt: null,
        researchQuery: 'gym workout tracker competitors',
        mood: 'thinking',
      }),
    )

    expect(reply.action).toBe('research')
    expect(reply.researchQuery).toBe('gym workout tracker competitors')
  })

  // A research action with no query would send an empty search to Bright Data
  // and bill a request for nothing.
  test('demotes research that carries no query', () => {
    const reply = coerceReply(
      JSON.stringify({ say: 'Looking…', action: 'research', researchQuery: null, mood: 'thinking' }),
    )

    expect(reply.action).toBe('chat')
    expect(reply.researchQuery).toBeNull()
  })

  test('demotes research whose query is only whitespace', () => {
    const reply = coerceReply(
      JSON.stringify({ say: 'Looking…', action: 'research', researchQuery: '  ', mood: 'thinking' }),
    )

    expect(reply.action).toBe('chat')
  })

  // A query only means something on a research action; carrying it elsewhere
  // would let a stale value trigger a search on a later turn.
  test('drops a query from a non-research action', () => {
    const reply = coerceReply(
      JSON.stringify({
        say: 'Building it.',
        action: 'build',
        builderPrompt: 'Build a tracker.',
        researchQuery: 'leftover query',
        mood: 'happy',
      }),
    )

    expect(reply.action).toBe('build')
    expect(reply.researchQuery).toBeNull()
  })
})
