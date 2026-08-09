import { NextResponse } from 'next/server'

import {
  brightDataApiKey,
  githubAppCredentials,
  llmApiKey,
  llmBaseUrl,
  llmModel,
  speechmaticsApiKey,
  supabaseConfigured,
} from '@/server/env'

/**
 * Reports which parts of the stack are actually wired up.
 *
 * Only reports whether a secret is present, never its value, so this is safe
 * to surface in Orbit's action menu. The non-secret model settings are
 * included because a wrong base URL looks identical to a missing key.
 */
export async function GET() {
  const services = {
    supabase: supabaseConfigured(),
    speechmatics: Boolean(speechmaticsApiKey()),
    model: Boolean(llmApiKey()),
    github: Boolean(githubAppCredentials()),
    brightData: Boolean(brightDataApiKey()),
  }

  const missing = Object.entries(services)
    .filter(([, configured]) => !configured)
    .map(([name]) => name)

  return NextResponse.json(
    {
      status: missing.length === 0 ? 'ok' : 'degraded',
      services,
      missing,
      model: { baseUrl: llmBaseUrl(), model: llmModel() },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
