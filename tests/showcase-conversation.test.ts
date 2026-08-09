import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

/**
 * Executes the showcase's conversation flow rather than inspecting it.
 *
 * This exists because a previous check asserted the source `includes` a
 * release of the in-flight guard. It matched the declaration `let pending =
 * false` and passed on a change that had never been applied, so a bug that
 * made Roisin answer once and then go silent shipped to production believing
 * itself tested. Running the real control flow is the only assertion worth
 * making about it.
 */
const DEMO = join(process.cwd(), 'orbit', 'demo.html')

function loadAskRoisin(onRequest: () => void) {
  const html = readFileSync(DEMO, 'utf8').replace(/\r\n/g, '\n')
  const start = html.indexOf('async function askRoisin(text) {')

  expect(start).toBeGreaterThan(-1)

  // Brace-walk to the end of the function so the extraction cannot silently
  // grab a truncated body.
  let depth = 0
  let end = start

  for (let index = html.indexOf('{', start); index < html.length; index += 1) {
    if (html[index] === '{') depth += 1
    else if (html[index] === '}') {
      depth -= 1
      if (depth === 0) {
        end = index + 1
        break
      }
    }
  }

  const source = html.slice(start, end)
  const state = { pending: false }

  const orbit = {
    startWaiting() {},
    stopWaiting() {},
    addMessage() {},
    playAction() {},
    setState() {},
  }

  const fetchStub = async () => ({
    ok: true,
    json: async () => {
      onRequest()
      return { reply: 'ok', builderPrompt: null, sources: [] }
    },
  })

  const build = new Function(
    'orbit',
    'showcaseVoice',
    'connectThenResume',
    'fetch',
    'setTimeout',
    'navigator',
    'getPending',
    'setPending',
    `${source
      .replace('if (pending) return;', 'if (getPending()) return;')
      .replace('pending = true;', 'setPending(true);')
      .replace('pending = false;', 'setPending(false);')}
     return askRoisin;`,
  )

  const askRoisin = build(
    orbit,
    null,
    () => {},
    fetchStub,
    () => {},
    {},
    () => state.pending,
    (value: boolean) => {
      state.pending = value
    },
  ) as (text: string) => Promise<void>

  return { askRoisin, state }
}

describe('showcase conversation', () => {
  test('answers every utterance, not only the first', async () => {
    let requests = 0
    const { askRoisin } = loadAskRoisin(() => {
      requests += 1
    })

    for (const utterance of ['first', 'second', 'third', 'fourth']) {
      await askRoisin(utterance)
    }

    expect(requests).toBe(4)
  })

  test('releases the in-flight guard when a turn completes', async () => {
    const { askRoisin, state } = loadAskRoisin(() => {})

    await askRoisin('anything')

    expect(state.pending).toBe(false)
  })
})
