import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { llmApiKey, llmBaseUrl, llmModel, speechmaticsApiKey } from '@/server/env'

const MANAGED = [
  'SPEECHMATICS_API_KEY',
  'SPEECHMATIC_API_KEY',
  'LLM_API_KEY',
  'MLAI_API_KEY',
  'LLM_BASE_URL',
  'LLM_MODEL',
]

let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = Object.fromEntries(MANAGED.map((name) => [name, process.env[name]]))
  MANAGED.forEach((name) => delete process.env[name])
})

afterEach(() => {
  MANAGED.forEach((name) => {
    if (saved[name] === undefined) delete process.env[name]
    else process.env[name] = saved[name]
  })
})

// The deployed project predates these routes and carries the older names.
// Dropping support for them would 503 production without touching any code.
describe('speechmaticsApiKey', () => {
  test('reads the canonical name', () => {
    process.env.SPEECHMATICS_API_KEY = 'canonical'

    expect(speechmaticsApiKey()).toBe('canonical')
  })

  test('falls back to the legacy singular spelling', () => {
    process.env.SPEECHMATIC_API_KEY = 'legacy'

    expect(speechmaticsApiKey()).toBe('legacy')
  })

  test('prefers the canonical name when both are set', () => {
    process.env.SPEECHMATIC_API_KEY = 'legacy'
    process.env.SPEECHMATICS_API_KEY = 'canonical'

    expect(speechmaticsApiKey()).toBe('canonical')
  })

  test('treats a blank value as unset', () => {
    process.env.SPEECHMATICS_API_KEY = '   '

    expect(speechmaticsApiKey()).toBeUndefined()
  })

  test('is undefined when nothing is configured', () => {
    expect(speechmaticsApiKey()).toBeUndefined()
  })
})

describe('llmApiKey', () => {
  test('falls back to MLAI_API_KEY', () => {
    process.env.MLAI_API_KEY = 'aiml'

    expect(llmApiKey()).toBe('aiml')
  })

  test('prefers LLM_API_KEY', () => {
    process.env.MLAI_API_KEY = 'aiml'
    process.env.LLM_API_KEY = 'explicit'

    expect(llmApiKey()).toBe('explicit')
  })
})

describe('llmBaseUrl', () => {
  test('defaults to AI/ML API, matching the legacy key', () => {
    expect(llmBaseUrl()).toBe('https://api.aimlapi.com/v1')
  })

  // The caller appends "/chat/completions", so a trailing slash would produce
  // a double slash and a 404 from some gateways.
  test('strips a trailing slash', () => {
    process.env.LLM_BASE_URL = 'https://example.com/v1/'

    expect(llmBaseUrl()).toBe('https://example.com/v1')
  })
})

describe('llmModel', () => {
  test('has a default', () => {
    expect(llmModel()).toBe('gpt-4o-mini')
  })

  test('is overridable', () => {
    process.env.LLM_MODEL = 'claude-sonnet-5'

    expect(llmModel()).toBe('claude-sonnet-5')
  })
})
