import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { formatResearch, isResearchConfigured, research } from '@/server/brightdata'

const ORIGINAL_KEY = process.env.BRIGHTDATA_API_KEY

beforeEach(() => {
  process.env.BRIGHTDATA_API_KEY = 'test-key'
})

afterEach(() => {
  vi.restoreAllMocks()
  if (ORIGINAL_KEY === undefined) delete process.env.BRIGHTDATA_API_KEY
  else process.env.BRIGHTDATA_API_KEY = ORIGINAL_KEY
})

function mockSerp(body: unknown, ok = true) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status: ok ? 200 : 500,
    }),
  )
}

describe('isResearchConfigured', () => {
  test('is false without a key', () => {
    delete process.env.BRIGHTDATA_API_KEY

    expect(isResearchConfigured()).toBe(false)
  })

  test('is true with a key', () => {
    expect(isResearchConfigured()).toBe(true)
  })
})

describe('research', () => {
  test('asks the SERP zone for parsed JSON rather than HTML', async () => {
    const fetchMock = mockSerp({ organic: [] })

    await research('gym tracker competitors')

    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    expect(body.zone).toBe('serp_api1')
    // Without brd_json the zone returns raw HTML and there is no parser here.
    expect(body.url).toContain('brd_json=1')
    expect(body.url).toContain('gym+tracker+competitors')
  })

  test('normalises organic results', async () => {
    mockSerp({
      organic: [
        { title: 'Strong', link: 'https://strong.app', description: '  Workout   logging  ' },
        { title: 'Hevy', link: 'https://hevy.com', snippet: 'Lifting tracker' },
      ],
    })

    const findings = await research('workout apps')

    expect(findings.results).toEqual([
      { title: 'Strong', url: 'https://strong.app', snippet: 'Workout logging' },
      { title: 'Hevy', url: 'https://hevy.com', snippet: 'Lifting tracker' },
    ])
  })

  // A result with no link cannot be cited or followed, so it is noise.
  test('drops results missing a link or title', async () => {
    mockSerp({
      organic: [
        { title: 'No link' },
        { link: 'https://example.com' },
        { title: 'Good', link: 'https://good.com', description: 'yes' },
      ],
    })

    const findings = await research('anything')

    expect(findings.results).toHaveLength(1)
    expect(findings.results[0].title).toBe('Good')
  })

  // The findings go into a prompt; an unbounded result set would crowd out
  // the conversation and blow the token budget.
  test('caps the number of results', async () => {
    mockSerp({
      organic: Array.from({ length: 25 }, (_, index) => ({
        title: `Result ${index}`,
        link: `https://example.com/${index}`,
        description: 'x',
      })),
    })

    const findings = await research('anything')

    expect(findings.results.length).toBeLessThanOrEqual(6)
  })

  test('truncates a very long snippet', async () => {
    mockSerp({
      organic: [{ title: 'Long', link: 'https://example.com', description: 'x'.repeat(5000) }],
    })

    const findings = await research('anything')

    expect(findings.results[0].snippet.length).toBeLessThanOrEqual(300)
  })

  test('rejects an empty query before spending a request', async () => {
    const fetchMock = mockSerp({ organic: [] })

    await expect(research('   ')).rejects.toThrow(/empty/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('throws when the response is not JSON', async () => {
    mockSerp('<html>blocked</html>')

    await expect(research('anything')).rejects.toThrow(/unreadable/i)
  })

  test('throws when Bright Data fails', async () => {
    mockSerp('rate limited', false)

    await expect(research('anything')).rejects.toThrow(/500/)
  })

  test('throws when no key is configured', async () => {
    delete process.env.BRIGHTDATA_API_KEY

    await expect(research('anything')).rejects.toThrow(/BRIGHTDATA_API_KEY/)
  })
})

describe('formatResearch', () => {
  test('renders numbered results with their URLs', () => {
    const block = formatResearch({
      query: 'workout apps',
      results: [{ title: 'Strong', url: 'https://strong.app', snippet: 'Logging' }],
    })

    expect(block).toContain('workout apps')
    expect(block).toContain('1. Strong')
    expect(block).toContain('https://strong.app')
  })

  // The model must be told the search came back empty, or it will fill the
  // gap from memory and present guesses as findings.
  test('says so when nothing was found', () => {
    const block = formatResearch({ query: 'asdkjhasd', results: [] })

    expect(block).toMatch(/nothing useful/i)
  })
})
