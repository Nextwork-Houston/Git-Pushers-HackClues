import { NextResponse } from 'next/server'

/**
 * Reports which parts of the stack are actually wired up.
 *
 * Only reports whether a secret is present, never its value, so this is safe
 * to surface in Orbit's action menu.
 */
export async function GET() {
  const services = {
    supabase: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
    speechmatics: Boolean(process.env.SPEECHMATICS_API_KEY),
    model: Boolean(process.env.LLM_API_KEY),
    github: Boolean(
      process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY,
    ),
    brightData: Boolean(process.env.BRIGHTDATA_API_KEY),
  }

  const missing = Object.entries(services)
    .filter(([, configured]) => !configured)
    .map(([name]) => name)

  return NextResponse.json(
    {
      status: missing.length === 0 ? 'ok' : 'degraded',
      services,
      missing,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
