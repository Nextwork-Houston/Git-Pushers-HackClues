import { NextResponse } from 'next/server'
import { z } from 'zod'

import { commitFile } from '@/server/github'
import { getUser } from '@/server/server'

const CommitRequestSchema = z
  .object({
    installationId: z.coerce.number().int().positive(),
    repoFullName: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
    filePath: z
      .string()
      .trim()
      .min(1)
      .max(512)
      .refine(
        (value) =>
          !value.startsWith('/') &&
          !value.split('/').some((segment) => segment === '..'),
        'filePath must be a relative repository path',
      ),
    content: z.string().max(1_000_000),
    commitMessage: z.string().trim().min(1).max(200),
    branch: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .regex(/^[A-Za-z0-9._/-]+$/)
      .optional(),
  })
  .strict()

export async function POST(request: Request) {
  try {
    await getUser()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 })
  }

  const parsed = CommitRequestSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid commit request', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  try {
    const commit = await commitFile({
      ...parsed.data,
      branch: parsed.data.branch ?? '',
    })

    return NextResponse.json({
      commit: {
        sha: commit.sha ?? null,
        url: commit.html_url ?? null,
      },
    })
  } catch (error) {
    console.error('[GITHUB-COMMIT-ERROR]', error)
    return NextResponse.json({ error: 'Unable to commit file to GitHub' }, { status: 502 })
  }
}
