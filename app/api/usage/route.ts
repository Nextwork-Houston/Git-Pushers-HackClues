import { NextResponse } from 'next/server'

import { createClient, getUser } from '@/server/server'
import { llmModel } from '@/server/env'

/**
 * What Roisin has actually cost this account.
 *
 * Reported from the token counts the gateway returned on each exchange, which
 * are stored per message — not estimated from message length. Estimating would
 * be worse than showing nothing, because it would look authoritative.
 */
export async function GET() {
  try {
    await getUser()
  } catch {
    return NextResponse.json({ error: 'Unauthorized User' }, { status: 401 })
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('messages')
    .select('kind, input_tokens, output_tokens, created_at')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    console.error(`[USAGE-ERROR] ${error.message}`)
    return NextResponse.json({ error: 'Could not read usage.' }, { status: 500 })
  }

  const rows = data ?? []

  const totals = rows.reduce(
    (accumulator, row) => ({
      inputTokens: accumulator.inputTokens + (row.input_tokens ?? 0),
      outputTokens: accumulator.outputTokens + (row.output_tokens ?? 0),
    }),
    { inputTokens: 0, outputTokens: 0 },
  )

  const byKind = rows.reduce<Record<string, number>>((accumulator, row) => {
    accumulator[row.kind] = (accumulator[row.kind] ?? 0) + 1
    return accumulator
  }, {})

  return NextResponse.json(
    {
      model: llmModel(),
      totals: { ...totals, totalTokens: totals.inputTokens + totals.outputTokens },
      exchanges: byKind.transcript ?? 0,
      builds: byKind.builder_prompt ?? 0,
      researched: byKind.research ?? 0,
      messages: rows.length,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
