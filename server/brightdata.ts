/**
 * Bright Data research.
 *
 * When someone asks Roisin to build something in a space she knows nothing
 * about, the honest options are to guess or to look. This looks: a real search
 * through Bright Data's SERP zone, so the instruction that reaches
 * native.builder is grounded in what actually exists rather than in whatever
 * the model happens to remember.
 */

const REQUEST_ENDPOINT = 'https://api.brightdata.com/request'
const DEFAULT_SERP_ZONE = 'serp_api1'
const DEFAULT_UNLOCKER_ZONE = 'web_unlocker1'

/** Research must not outlast a spoken exchange; the person is waiting. */
const REQUEST_TIMEOUT_MS = 20_000

/** Enough context for a build instruction without flooding the model. */
const MAX_RESULTS = 6
const MAX_SNIPPET_LENGTH = 300

export type ResearchResult = {
  title: string
  url: string
  snippet: string
}

export type Research = {
  query: string
  results: ResearchResult[]
}

function serpZone() {
  return process.env.BRIGHTDATA_SERP_ZONE || DEFAULT_SERP_ZONE
}

export function unlockerZone() {
  return process.env.BRIGHTDATA_UNLOCKER_ZONE || DEFAULT_UNLOCKER_ZONE
}

export function isResearchConfigured() {
  return Boolean(process.env.BRIGHTDATA_API_KEY)
}

type SerpOrganicItem = {
  title?: string
  link?: string
  description?: string
  snippet?: string
}

function normalise(items: SerpOrganicItem[]): ResearchResult[] {
  return items
    .filter((item) => item.link && item.title)
    .slice(0, MAX_RESULTS)
    .map((item) => ({
      title: String(item.title).trim(),
      url: String(item.link),
      snippet: String(item.description ?? item.snippet ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_SNIPPET_LENGTH),
    }))
}

async function brightDataRequest(body: Record<string, unknown>): Promise<string> {
  const apiKey = process.env.BRIGHTDATA_API_KEY

  if (!apiKey) throw new Error('BRIGHTDATA_API_KEY is not configured.')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(REQUEST_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify(body),
    })

    const text = await response.text()

    if (!response.ok) {
      console.error(`[BRIGHTDATA-ERROR] ${response.status}: ${text.slice(0, 300)}`)
      throw new Error(`Bright Data returned ${response.status}.`)
    }

    return text
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Searches the web for a research question.
 *
 * `brd_json=1` asks the SERP zone for parsed results rather than raw HTML, so
 * there is no scraping logic here to rot when Google changes its markup.
 */
export async function research(query: string): Promise<Research> {
  const trimmed = query.trim()

  if (!trimmed) throw new Error('Research query is empty.')

  const searchUrl = new URL('https://www.google.com/search')
  searchUrl.searchParams.set('q', trimmed)
  searchUrl.searchParams.set('brd_json', '1')

  const raw = await brightDataRequest({
    zone: serpZone(),
    url: searchUrl.toString(),
    format: 'raw',
  })

  let payload: { organic?: SerpOrganicItem[] }

  try {
    payload = JSON.parse(raw)
  } catch {
    console.error('[BRIGHTDATA-ERROR] SERP response was not JSON')
    throw new Error('Bright Data returned an unreadable response.')
  }

  return { query: trimmed, results: normalise(payload.organic ?? []) }
}

/**
 * Fetches a single page through the unlocker zone.
 *
 * Not used by the conversation flow — searching is enough to ground a build
 * instruction, and fetching every result would blow the time budget of a
 * spoken exchange. Exposed for deliberate follow-up on one source.
 */
export async function fetchPage(url: string): Promise<string> {
  return brightDataRequest({ zone: unlockerZone(), url, format: 'raw' })
}

/** Renders findings as the compact block handed to the model. */
export function formatResearch(findings: Research): string {
  if (findings.results.length === 0) {
    return `Search for "${findings.query}" returned nothing useful.`
  }

  const lines = findings.results.map(
    (result, index) =>
      `${index + 1}. ${result.title}\n   ${result.url}\n   ${result.snippet}`,
  )

  return `Web research for "${findings.query}":\n\n${lines.join('\n\n')}`
}
