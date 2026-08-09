import { createSpeechmaticsJWT } from '@speechmatics/auth'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { speechmaticsApiKey } from '@/server/env'
import { getUser } from '@/server/server'

/**
 * Mints a short-lived Speechmatics JWT for the browser.
 *
 * The long-lived API key never leaves the server. The browser gets a token
 * that expires in a couple of minutes and is scoped to one product.
 */
const TokenRequestSchema = z.object({
  type: z.enum(['flow', 'rt']).default('flow'),
})

const DEFAULT_TTL_SECONDS = 120
const MAX_TTL_SECONDS = 3600

function resolveTtl() {
  const configured = Number.parseInt(process.env.SPEECHMATICS_JWT_TTL ?? '', 10)

  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_TTL_SECONDS

  return Math.min(configured, MAX_TTL_SECONDS)
}

export async function POST(request: Request) {
  let user

  try {
    user = await getUser()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = speechmaticsApiKey()

  if (!apiKey) {
    console.error('[SPEECH-TOKEN-ERROR] no Speechmatics API key is configured')
    return NextResponse.json(
      { error: 'Speech is not configured on this server.' },
      { status: 503 },
    )
  }

  const body = await request.json().catch(() => ({}))
  const parsed = TokenRequestSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid token request' }, { status: 400 })
  }

  const ttl = resolveTtl()

  try {
    const jwt = await createSpeechmaticsJWT({
      type: parsed.data.type,
      apiKey,
      // Lets Speechmatics usage be attributed per account.
      clientRef: user.id,
      ttl,
    })

    return NextResponse.json(
      {
        jwt,
        type: parsed.data.type,
        expiresIn: ttl,
        appId: process.env.SPEECHMATICS_APP_ID || 'orbit-roisin',
        templateId:
          process.env.SPEECHMATICS_FLOW_TEMPLATE_ID ||
          'flow-service-assistant-amelia',
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.error('[SPEECH-TOKEN-ERROR]', error)
    return NextResponse.json(
      { error: 'Could not mint a speech token.' },
      { status: 502 },
    )
  }
}
