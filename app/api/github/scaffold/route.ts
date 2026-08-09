import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getBuild, updateBuildStatus } from '@/server/ConversationService'
import { commitFile, defaultRepository, slugify } from '@/server/github'
import { getUser } from '@/server/server'

/**
 * Commits a build as a spec file.
 *
 * The whiteboard ended the pipeline at "create GitHub scaffolding", and this
 * is the part the App's permissions actually allow: `contents: write` can add
 * files to a repository, but creating one needs `administration: write`.
 *
 * What lands is the durable record of a build — the request in the user's own
 * words, the instruction Roisin derived, and the sources she read. Once the
 * voice session is over that is the only place any of it survives in a form a
 * developer can pick up.
 */
const ScaffoldRequestSchema = z
  .object({
    buildId: z.uuid(),
  })
  .strict()

function specDocument({
  request,
  instruction,
  sources,
  when,
}: {
  request: string
  instruction: string
  sources: { title: string; url: string }[]
  when: Date
}): string {
  const lines = [
    `# ${request.slice(0, 80)}`,
    '',
    `> Captured by Roisin on ${when.toISOString().slice(0, 16).replace('T', ' ')} UTC.`,
    '',
    '## What was asked for',
    '',
    request,
    '',
    '## Build instruction',
    '',
    'This is what was handed to native.builder, verbatim.',
    '',
    '```text',
    instruction,
    '```',
  ]

  if (sources.length > 0) {
    lines.push(
      '',
      '## Research',
      '',
      'Gathered live through Bright Data before the instruction was written, so',
      'the choices above are grounded in what existed at the time rather than',
      'in model recall.',
      '',
      ...sources.map((source) => `- [${source.title}](${source.url})`),
    )
  }

  return `${lines.join('\n')}\n`
}

export async function POST(request: Request) {
  try {
    await getUser()
  } catch {
    return NextResponse.json({ error: 'Unauthorized Scaffold Access' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = ScaffoldRequestSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid scaffold request' }, { status: 400 })
  }

  // The build is re-read rather than trusted from the request, so the content
  // committed is what was actually recorded and belongs to this account.
  const build = await getBuild(parsed.data.buildId)

  if (!build) {
    return NextResponse.json({ error: 'Build not found' }, { status: 404 })
  }

  const when = new Date(build.created_at)
  const repository = defaultRepository()
  const filePath = `orbit/specs/${when.toISOString().slice(0, 10)}-${slugify(build.prompt)}.md`

  try {
    const commit = await commitFile({
      repoFullName: repository,
      filePath,
      content: specDocument({
        request: build.request ?? build.prompt,
        instruction: build.prompt,
        sources: build.sources ?? [],
        when,
      }),
      commitMessage: `spec: ${build.prompt.slice(0, 64)}`,
    })

    await updateBuildStatus(build.id, 'sent')

    return NextResponse.json(
      { ok: true, commit },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.error('[SCAFFOLD-ERROR]', error)
    await updateBuildStatus(
      build.id,
      'failed',
      error instanceof Error ? error.message : 'Scaffold failed',
    )

    return NextResponse.json(
      { error: 'Could not write the spec to GitHub.' },
      { status: 502 },
    )
  }
}
