#!/usr/bin/env node
/**
 * Builds the desktop download ZIPs from `orbit/`.
 *
 * The published ZIPs went stale because they were assembled by hand and their
 * installer scripts existed nowhere else — editing the repo could not change
 * what people downloaded. Everything the bundle needs now lives in `orbit/`
 * and this script is the only way the ZIPs are produced.
 *
 *   node scripts/package-desktop.mjs
 */

import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(ROOT, 'orbit')
const DOWNLOADS = join(ROOT, 'public', 'orbit', 'downloads')

/** Everything the Electron shell loads at runtime, plus the installers. */
const FILES = [
  'avatar-companion.js',
  'speech-bridge.js',
  'voice.js',
  'orbit.pet.json',
  'pet.json',
  'package.json',
  'README.md',
  'README-INSTALL.txt',
  'install-orbit-desktop.cmd',
  'install-orbit-desktop.ps1',
  'install-orbit-desktop.sh',
  'launch-orbit.bat',
  'launch-orbit.command',
  'launch-orbit.ps1',
  'launch-orbit.sh',
]

const DIRECTORIES = ['desktop']

/** Sprite atlases and icons. */
const ASSET_PATTERN = /^(orbit-.*|icon-\d+)\.png$/

const BUNDLES = [
  { name: 'orbit-desktop-windows.zip' },
  { name: 'orbit-desktop-universal.zip' },
]

function copyInto(stage) {
  for (const file of FILES) {
    const from = join(SOURCE, file)

    try {
      statSync(from)
    } catch {
      console.warn(`skipping missing ${file}`)
      continue
    }

    cpSync(from, join(stage, file))
  }

  for (const directory of DIRECTORIES) {
    // node_modules and lockfiles are installed on the user's machine at first
    // launch; shipping them would multiply the download size for nothing.
    cpSync(join(SOURCE, directory), join(stage, directory), {
      recursive: true,
      filter: (path) =>
        !path.includes('node_modules') && !path.endsWith('package-lock.json'),
    })
  }

  const assets = execFileSync('node', [
    '-e',
    `const {readdirSync}=require('fs');process.stdout.write(readdirSync(${JSON.stringify(SOURCE)}).filter(n=>${ASSET_PATTERN}.test(n)).join('\\n'))`,
  ])
    .toString()
    .split('\n')
    .filter(Boolean)

  for (const asset of assets) cpSync(join(SOURCE, asset), join(stage, asset))

  return assets.length
}

function zip(stage, target) {
  // PowerShell ships with Windows and handles the archive without a dependency.
  execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path '${stage}\\*' -DestinationPath '${target}' -Force -CompressionLevel Optimal`,
    ],
    { stdio: 'inherit' },
  )
}

const version = JSON.parse(readFileSync(join(SOURCE, 'package.json'), 'utf8')).version
const stage = mkdtempSync(join(tmpdir(), 'orbit-desktop-'))

try {
  mkdirSync(DOWNLOADS, { recursive: true })
  const assetCount = copyInto(stage)

  for (const bundle of BUNDLES) {
    const target = join(DOWNLOADS, bundle.name)
    rmSync(target, { force: true })
    zip(stage, target)
    const size = (statSync(target).size / 1024 / 1024).toFixed(1)
    console.log(`built ${bundle.name} (${size} MB)`)
  }

  console.log(`Orbit ${version} packaged with ${assetCount} sprite assets.`)
} finally {
  rmSync(stage, { recursive: true, force: true })
}
