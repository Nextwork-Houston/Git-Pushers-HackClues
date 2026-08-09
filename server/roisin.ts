import { llmApiKey, llmBaseUrl, llmModel } from './env'
import type { Message } from './types'

/**
 * Roisin is a voice guide for native.builder.
 *
 * native.builder has no public API — it is a chat-driven web product — so
 * Roisin's job is not to call it, but to turn loose spoken intent into a
 * single, precise instruction that the desktop shell can type into the
 * builder's own chat surface on the user's behalf.
 */
const SYSTEM_PROMPT = `You are Roisin, a warm, brisk voice companion who guides people through native.builder, an AI software factory that plans, builds, and ships web apps from chat instructions.

The person is speaking out loud, so they ramble, correct themselves, and leave things implied. Your job is to turn that into action.

Always reply with a JSON object and nothing else:
{
  "say": "One or two short sentences, written to be spoken aloud. No markdown, no lists, no URLs.",
  "action": "build" | "ask" | "chat",
  "builderPrompt": "The instruction to type into native.builder, or null",
  "mood": "idle" | "thinking" | "happy" | "love" | "confused" | "celebrate"
}

Choose the action:
- "build" when you have enough to give native.builder a concrete, self-contained instruction. Put that instruction in builderPrompt.
- "research" when the request depends on facts you do not have: competitors, market data, pricing, current APIs, what similar products do, or anything the person asks you to look up. Put the search query in researchQuery and say you are looking it up. builderPrompt is null.
- "ask" when one specific detail is genuinely missing and guessing it would waste a build. Ask for exactly one thing in "say". builderPrompt is null.
- "chat" for greetings, questions about how things work, or encouragement. builderPrompt is null.

Writing builderPrompt:
- Address the builder agent directly and imperatively: "Build…", "Add…", "Change…".
- Name the purpose, the key screens, and the must-have features. Be specific about behaviour, not styling adjectives.
- Fold in anything already established earlier in the conversation, because the builder does not hear the voice session.
- Name a partner service explicitly when the user needs one: say "Speechmatics" for speech, "Supabase" for database, auth, or storage, "Bright Data" for web scraping. The builder picks a generic library otherwise.
- Never invent a scope the user did not ask for. One request, one instruction.

Prefer "research" over "ask" when the missing information is something you could look up rather than something only the person knows. Do not ask someone to name their competitors — go and find them.

One hard rule: if the request compares itself to anything that already exists — "better than what is out there", "like X but", "beat the competition", "what everyone else charges" — the action is "research". Not "ask". You cannot beat a field you have not looked at, and the person cannot describe it for you.

Otherwise bias toward "build". A person talking to a software factory wants to see something appear.`

const REQUEST_TIMEOUT_MS = 30_000
/** How much prior conversation Roisin is given for context. */
const HISTORY_WINDOW = 12

export type ModelUsage = { inputTokens: number; outputTokens: number }

export type RoisinAction = 'build' | 'research' | 'ask' | 'chat'

export type RoisinReply = {
  say: string
  action: RoisinAction
  builderPrompt: string | null
  researchQuery: string | null
  mood: string
  /** What the exchange cost, so usage can be reported rather than estimated. */
  usage?: ModelUsage
}

const FALLBACK: RoisinReply = {
  say: "I did not quite catch that. Could you say it again?",
  action: 'chat',
  builderPrompt: null,
  researchQuery: null,
  mood: 'confused',
}

const ACTIONS = new Set<RoisinAction>(['build', 'research', 'ask', 'chat'])

/** Trims a string field, treating whitespace-only values as absent. */
function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function coerceReply(raw: string): RoisinReply {
  // Models sometimes wrap JSON in a code fence despite instructions.
  const unfenced = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '')
  const start = unfenced.indexOf('{')
  const end = unfenced.lastIndexOf('}')

  if (start === -1 || end <= start) {
    return { ...FALLBACK, say: unfenced.trim() || FALLBACK.say, mood: 'idle' }
  }

  try {
    const parsed = JSON.parse(unfenced.slice(start, end + 1)) as Partial<RoisinReply>
    const claimed = ACTIONS.has(parsed.action as RoisinAction)
      ? (parsed.action as RoisinAction)
      : 'chat'

    // An action is only real if it carries what it needs to act on. A "build"
    // with no prompt would award build XP and celebrate for nothing, and a
    // "research" with no query would send an empty search to Bright Data.
    const builderPrompt = claimed === 'build' ? text(parsed.builderPrompt) : null
    const researchQuery = claimed === 'research' ? text(parsed.researchQuery) : null

    let action: RoisinAction = claimed
    if (claimed === 'build' && !builderPrompt) action = 'chat'
    if (claimed === 'research' && !researchQuery) action = 'chat'

    return {
      say: text(parsed.say) ?? FALLBACK.say,
      action,
      builderPrompt,
      researchQuery,
      mood: typeof parsed.mood === 'string' ? parsed.mood : 'idle',
    }
  } catch {
    return { ...FALLBACK, say: unfenced.trim() || FALLBACK.say, mood: 'idle' }
  }
}

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

/**
 * Calls the model gateway and returns the raw completion text.
 *
 * Throws when the gateway is unreachable or misconfigured; the caller decides
 * how to surface that, because a silent fallback would look like Roisin
 * ignoring the user.
 */
async function callModel(messages: ChatMessage[]): Promise<{ content: string; usage: ModelUsage }> {
  const apiKey = llmApiKey()

  if (!apiKey) {
    throw new Error('No model API key is configured (LLM_API_KEY or MLAI_API_KEY).')
  }

  const baseUrl = llmBaseUrl()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: llmModel(),
        temperature: 0.6,
        response_format: { type: 'json_object' },
        messages,
      }),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      console.error(`[ROISIN-ERROR] gateway ${response.status}: ${detail.slice(0, 500)}`)
      throw new Error(`Model gateway returned ${response.status}.`)
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[]
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }

    const content = payload.choices?.[0]?.message?.content

    if (!content) throw new Error('Model gateway returned no content.')

    return {
      content,
      usage: {
        inputTokens: payload.usage?.prompt_tokens ?? 0,
        outputTokens: payload.usage?.completion_tokens ?? 0,
      },
    }
  } finally {
    clearTimeout(timeout)
  }
}

function historyMessages(history: Message[]): ChatMessage[] {
  return history.slice(-HISTORY_WINDOW).map((message) => ({
    role: message.role === 'assistant' ? ('assistant' as const) : ('user' as const),
    content: message.content,
  }))
}

/** Asks Roisin's model what to do with a spoken request. */
export async function composeReply(
  transcript: string,
  history: Message[],
): Promise<RoisinReply> {
  const { content, usage } = await callModel([
    { role: 'system', content: SYSTEM_PROMPT },
    ...historyMessages(history),
    { role: 'user', content: transcript },
  ])

  return { ...coerceReply(content), usage }
}

/**
 * Turns web findings into a build instruction.
 *
 * Run after Roisin asks for research. Grounding the second pass in real search
 * results is the whole point: without it she would describe a competitor set
 * from memory, and the builder would build against something that may not
 * exist.
 */
export async function composeFromResearch(
  transcript: string,
  findings: string,
  history: Message[],
): Promise<RoisinReply> {
  const { content, usage } = await callModel([
    { role: 'system', content: SYSTEM_PROMPT },
    ...historyMessages(history),
    { role: 'user', content: transcript },
    {
      role: 'user',
      content: `${findings}

That is real search data, gathered just now.

Use it to write the build instruction. Ground concrete choices — features, competitors, pricing, integrations — in what the results actually show, and do not invent details they do not support. Say one short spoken sentence about what you found; keep URLs out of "say".

Translate what you found; do not copy it. The results describe other companies' products, most of them native mobile apps. native.builder ships web applications, so every feature you carry across has to be buildable on the web.

- Drop anything platform-specific: Siri Shortcuts, Apple Health, Google Fit, App Store billing, widgets, watch apps.
- Keep the underlying need and rebuild it for the web. "Syncs with Apple Health" becomes "import workout data from a CSV or a connected fitness API".
- If a feature needs speech, name Speechmatics. Data, auth, or storage, name Supabase. Scraping or market data, name Bright Data. Never name a competitor's vendor as our integration.
- Do not name a rival product inside the instruction. The builder is making our app, not a clone.

Reply with action "build" and a builderPrompt. Only choose "ask" if the results genuinely left one blocking question unanswered.`,
    },
  ])

  return { ...coerceReply(content), usage }
}

export { SYSTEM_PROMPT, coerceReply, callModel }
