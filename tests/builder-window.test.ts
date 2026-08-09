import { createRequire } from 'node:module'

import { describe, expect, test } from 'vitest'

// builder-window.js is CommonJS and pulls in Electron at require time, so it is
// loaded lazily and only the pure string builder is exercised here.
const require = createRequire(import.meta.url)

function loadInjectionScript() {
  const module = require('../orbit/desktop/builder-window.js')
  return module.injectionScript as (
    prompt: string,
    selectors?: { input?: string; send?: string },
  ) => string
}

describe('injectionScript', () => {
  test('embeds the prompt as escaped JSON, not raw text', () => {
    const injectionScript = loadInjectionScript()
    const script = injectionScript('Build a "todo" app')

    expect(script).toContain('const PROMPT = "Build a \\"todo\\" app"')
  })

  /**
   * Reads back the PROMPT literal the script declares.
   *
   * This is the property that matters: whatever the user said has to survive
   * as data. If it escaped its string it would run as code inside
   * native.builder's page, under the user's own logged-in session.
   */
  function evaluatePromptLiteral(script: string): unknown {
    const match = script.match(/const PROMPT = (.*);\n/)
    expect(match).not.toBeNull()

    // eslint-disable-next-line no-new-func -- evaluating our own generated literal
    return new Function(`return ${match![1]}`)()
  }

  test.each([
    ['a quote-and-semicolon break-out', '"; window.stolen = document.cookie; //'],
    ['a closing script tag', '</script><img src=x onerror=alert(1)>'],
    ['a template literal break-out', '${process.exit(1)}`'],
    ['a backslash run', 'C:\\path\\to\\"thing"'],
    ['a newline injection', 'line one\nwindow.stolen = 1'],
    ['a U+2028 line separator', 'before\u2028window.stolen = 1'],
  ])('keeps %s as inert data', (_label, prompt) => {
    const injectionScript = loadInjectionScript()
    const script = injectionScript(prompt)

    expect(evaluatePromptLiteral(script)).toBe(prompt)
  })

  test('carries configured selectors through', () => {
    const injectionScript = loadInjectionScript()
    const script = injectionScript('hello', {
      input: '#chat-input',
      send: '#send-button',
    })

    expect(script).toContain('"input":"#chat-input"')
    expect(script).toContain('"send":"#send-button"')
  })

  test('defaults selectors to empty when none are configured', () => {
    const injectionScript = loadInjectionScript()
    const script = injectionScript('hello')

    expect(script).toContain('"input":""')
    expect(script).toContain('"send":""')
  })
})
