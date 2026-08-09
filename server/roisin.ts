import { messageText, type ConversationMessage } from './types'

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
- "ask" when one specific detail is genuinely missing and guessing it would waste a build. Ask for exactly one thing in "say". builderPrompt is null.
- "chat" for greetings, questions about how things work, or encouragement. builderPrompt is null.

Writing builderPrompt:
- Address the builder agent directly and imperatively: "Build…", "Add…", "Change…".
- Name the purpose, the key screens, and the must-have features. Be specific about behaviour, not styling adjectives.
- Fold in anything already established earlier in the conversation, because the builder does not hear the voice session.
- Name a partner service explicitly when the user needs one: say "Speechmatics" for speech, "Supabase" for database, auth, or storage, "Bright Data" for web scraping. The builder picks a generic library otherwise.
- Never invent a scope the user did not ask for. One request, one instruction.

Bias toward "build". A person talking to a software factory wants to see something appear.`

const DEFAULT_BASE_URL = 'https://api.aimlapi.com/v1'
const DEFAULT_MODEL = 'gpt-4o-mini'
const REQUEST_TIMEOUT_MS = 30_000
/** How much prior conversation Roisin is given for context. */
const HISTORY_WINDOW = 12

export type RoisinReply = {
  say: string
  action: 'build' | 'ask' | 'chat'
  builderPrompt: string | null
  mood: string
}

const FALLBACK: RoisinReply = {
  say: "I did not quite catch that. Could you say it again?",
  action: 'chat',
  builderPrompt: null,
  mood: 'confused',
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
    const action =
      parsed.action === 'build' || parsed.action === 'ask' ? parsed.action : 'chat'
    // An empty or whitespace-only prompt is not a build instruction; it would
    // award build XP and celebrate for nothing.
    const trimmedPrompt =
      action === 'build' && typeof parsed.builderPrompt === 'string'
        ? parsed.builderPrompt.trim()
        : ''
    const builderPrompt = trimmedPrompt || null

    return {
      say: typeof parsed.say === 'string' && parsed.say.trim() ? parsed.say.trim() : FALLBACK.say,
      // A "build" with no prompt is not a build.
      action: builderPrompt ? 'build' : action === 'build' ? 'chat' : action,
      builderPrompt,
      mood: typeof parsed.mood === 'string' ? parsed.mood : 'idle',
    }
  } catch {
    return { ...FALLBACK, say: unfenced.trim() || FALLBACK.say, mood: 'idle' }
  }
}

/**
 * Asks Roisin's model what to do with a spoken request.
 *
 * Throws when the gateway is unreachable or misconfigured; the caller decides
 * how to surface that, because a silent fallback would look like Roisin
 * ignoring the user.
 */
export async function composeReply(
  transcript: string,
  history: ConversationMessage[],
): Promise<RoisinReply> {
  const apiKey = process.env.LLM_API_KEY

  if (!apiKey) {
    throw new Error('LLM_API_KEY is not configured.')
  }

  const baseUrl = (process.env.LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '')
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
        model: process.env.LLM_MODEL || DEFAULT_MODEL,
        temperature: 0.6,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...history.slice(-HISTORY_WINDOW).map((message) => ({
            role: message.role === 'assistant' ? 'assistant' : 'user',
            content: messageText(message),
          })),
          { role: 'user', content: transcript },
        ],
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

    if (!content) {
      throw new Error('Model gateway returned no content.')
    }

    return coerceReply(content)
  } finally {
    clearTimeout(timeout)
  }
}

export { SYSTEM_PROMPT, coerceReply }
