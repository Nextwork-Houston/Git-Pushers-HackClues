import { NextResponse } from 'next/server'
import { z } from 'zod'

import { updateBuildStatus } from '@/server/ConversationService'
import { getUser } from '@/server/server'
import { BuildStatusSchema } from '@/server/types'

/**
 * Records what happened to a build instruction after Roisin handed it over.
 *
 * /api/conversation writes the build as `pending` because at that moment
 * nobody knows whether native.builder accepted it — only the shell that types
 * it in finds out. Without this the ledger would say "pending" forever and
 * could not distinguish a delivered build from a failed one.
 */
const StatusUpdateSchema = z
  .object({
    status: BuildStatusSchema,
    error: z.string().trim().max(500).optional(),
  })
  .strict()

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await getUser()
  } catch {
    return NextResponse.json({ error: 'Unauthorized Build Access' }, { status: 401 })
  }

  const { id } = await params

  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid build id' }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  const parsed = StatusUpdateSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid status update', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  try {
    await updateBuildStatus(id, parsed.data.status, parsed.data.error)
  } catch (error) {
    console.error('[BUILD-STATUS-ROUTE]', error)
    return NextResponse.json(
      { error: 'Could not update the build.' },
      { status: 500 },
    )
  }

  return NextResponse.json(
    { id, status: parsed.data.status },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
