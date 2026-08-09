import { NextResponse } from 'next/server'

import { createClient } from '@/server/server'

/**
 * Gives the visitor a session without asking them for anything.
 *
 * Roisin needs a session to work at all — Speechmatics tokens are minted per
 * account, and her memory and XP hang off a pet row. Demanding a sign-up form
 * before she will even listen is backwards for a companion whose whole promise
 * is "just talk to me".
 *
 * So an anonymous Supabase user is created on first contact. It is a real
 * account: it gets a pet, keeps its history, and row level security applies to
 * it exactly as it would to anyone else. It can be upgraded to a named account
 * later without losing anything.
 *
 * Idempotent — an existing session, anonymous or not, is returned untouched.
 */
export async function POST() {
  const supabase = await createClient()

  const {
    data: { user: existing },
  } = await supabase.auth.getUser()

  if (existing) {
    return NextResponse.json(
      { ok: true, created: false, anonymous: existing.is_anonymous ?? false },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const { data, error } = await supabase.auth.signInAnonymously()

  if (error || !data.user) {
    console.error(`[GUEST-AUTH-ERROR] ${error?.message ?? 'no user returned'}`)
    return NextResponse.json(
      { ok: false, error: 'Could not start a guest session.' },
      { status: 503 },
    )
  }

  return NextResponse.json(
    { ok: true, created: true, anonymous: true },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
