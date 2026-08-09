#!/usr/bin/env node
/**
 * Mirrors the Orbit source in `orbit/` into `public/orbit/`.
 *
 * `orbit/` is the single source of truth: it is what the Electron shell loads
 * and what ships inside the desktop download. `public/orbit/` is a published
 * copy so the static showcase and the Next app can serve the same component
 * without a bundler. Editing the copy by hand is how the two drift apart, so
 * this script makes the copy reproducible.
 *
 *   node scripts/sync-orbit-assets.mjs           copy
 *   node scripts/sync-orbit-assets.mjs --check   fail if the copy is stale
 */

import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, stat } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(ROOT, 'orbit')
const TARGET = join(ROOT, 'public', 'orbit')

/** Files the showcase needs. The Electron shell and installers stay behind. */
const PATTERNS = [
  /^avatar-companion\.js$/,
  /^speech-bridge\.js$/,
  /^demo\.html$/,
  /^service-worker\.js$/,
  /^manifest\.webmanifest$/,
  /^orbit\.pet\.json$/,
  /^icon-\d+\.png$/,
  /^orbit-.*\.png$/,
]

async function collect() {
  const entries = await readdir(SOURCE, { withFileTypes: true })

  return entries
    .filter((entry) => entry.isFile() && PATTERNS.some((pattern) => pattern.test(entry.name)))
    .map((entry) => entry.name)
    .sort()
}

async function hash(path) {
  try {
    return createHash('sha256').update(await readFile(path)).digest('hex')
  } catch {
    return null
  }
}

async function main() {
  const check = process.argv.includes('--check')
  const files = await collect()

  if (files.length === 0) {
    console.error('No Orbit assets found in orbit/. Nothing to sync.')
    process.exit(1)
  }

  const stale = []
  let copied = 0

  for (const name of files) {
    const from = join(SOURCE, name)
    const to = join(TARGET, name)

    const [sourceHash, targetHash] = await Promise.all([hash(from), hash(to)])

    if (sourceHash === targetHash) continue

    if (check) {
      stale.push(relative(ROOT, to))
      continue
    }

    await mkdir(dirname(to), { recursive: true })
    await copyFile(from, to)
    copied += 1
    console.log(`synced ${name}`)
  }

  if (check && stale.length > 0) {
    console.error(
      `public/orbit is out of date with orbit/:\n  ${stale.join('\n  ')}\n\n` +
        'Run `npm run sync:orbit` and commit the result.',
    )
    process.exit(1)
  }

  console.log(
    check
      ? `public/orbit matches orbit/ (${files.length} files).`
      : `Synced ${copied} of ${files.length} files.`,
  )
}

await stat(SOURCE).catch(() => {
  console.error('orbit/ not found.')
  process.exit(1)
})

await main()
