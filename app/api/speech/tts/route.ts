import { NextResponse } from 'next/server'
import { z } from 'zod'

import { speechmaticsApiKey } from '@/server/env'
import { getUser } from '@/server/server'

/**
 * Speaks Roisin's reply using Speechmatics text to speech.
 *
 * Proxied rather than called from the browser because the TTS endpoint takes
 * the long-lived API key directly — unlike transcription, it has no
 * short-lived JWT flow — so the key must never reach the client.
 */
const TTS_ENDPOINT = 'https://preview.tts.speechmatics.com/generate'

/** The voices Speechmatics publishes. See VOICES in orbit/voice.js. */
const VOICE_IDS = ['sarah', 'theo', 'megan', 'jack'] as const

const TtsRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(2000),
    voice: z.enum(VOICE_IDS).default('megan'),
  })
  .strict()

export async function POST(request: Request) {
  try {
    await getUser()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = speechmaticsApiKey()

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Speech is not configured on this server.' },
      { status: 503 },
    )
  }

  const body = await request.json().catch(() => null)
  const parsed = TtsRequestSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid speech request' }, { status: 400 })
  }

  try {
    const upstream = await fetch(
      `${TTS_ENDPOINT}/${parsed.data.voice}?output_format=wav_16000`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: parsed.data.text }),
      },
    )

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => '')
      console.error(`[TTS-ERROR] ${upstream.status}: ${detail.slice(0, 300)}`)
      return NextResponse.json(
        { error: 'Could not generate speech.' },
        { status: 502 },
      )
    }

    // Streamed through, because playback can start before synthesis finishes.
    return new NextResponse(upstream.body, {
      headers: {
        'Content-Type': 'audio/wav',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[TTS-ERROR]', error)
    return NextResponse.json({ error: 'Could not generate speech.' }, { status: 502 })
  }
}
