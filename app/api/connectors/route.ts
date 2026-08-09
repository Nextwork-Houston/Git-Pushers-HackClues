import { NextResponse } from 'next/server'

import { listConnectors } from '@/server/connectors'
import { getUser } from '@/server/server'

/**
 * Reports what Roisin is connected to, and where to fix what she is not.
 *
 * Drives the avatar's connection glow and the "take me there" flow. Nothing
 * here reveals a secret — only whether each service is reachable and, when the
 * user can do something about it, the page that lets them.
 */
export async function GET(request: Request) {
  try {
    await getUser()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const builderUrl =
    process.env.NEXT_PUBLIC_NATIVE_BUILDER_URL || 'https://builder.nativelyai.com'

  const connectors = await listConnectors(builderUrl)
  const url = new URL(request.url)
  const capability = url.searchParams.get('capability')

  const blocking = connectors.filter(
    (connector) => connector.state !== 'connected',
  )

  return NextResponse.json(
    {
      connectors,
      blocking,
      ready: blocking.length === 0,
      capability: capability ?? undefined,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
