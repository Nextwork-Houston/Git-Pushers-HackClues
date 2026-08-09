#!/usr/bin/env node
/**
 * Creates a Supabase project and applies the Orbit schema to it.
 *
 * Everything here goes through the Supabase Management API, which is the only
 * way to run DDL from outside the dashboard — the anon and publishable keys
 * can read and write rows but can never change the schema.
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/provision-supabase.mjs
 *
 * Options:
 *   --name <name>     project name          (default: orbit-roisin)
 *   --region <region> hosting region        (default: us-east-1)
 *   --org <id>        organization id       (default: the only one, if single)
 *   --ref <ref>       skip creation, apply the schema to an existing project
 *   --write-env       update .env.local with the resulting URL and key
 *
 * The token is read from the environment and never written to disk.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SCHEMA_PATH = join(ROOT, 'supabase', 'schema.sql')
const ENV_PATH = join(ROOT, '.env.local')
const API = 'https://api.supabase.com/v1'

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN

if (!TOKEN) {
  console.error(
    'SUPABASE_ACCESS_TOKEN is not set.\n' +
      'Create one at https://supabase.com/dashboard/account/tokens',
  )
  process.exit(1)
}

function flag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : process.argv[index + 1]
}

const hasFlag = (name) => process.argv.includes(`--${name}`)

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })

  const text = await response.text()
  let body

  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }

  if (!response.ok) {
    throw new Error(
      `${options.method || 'GET'} ${path} → ${response.status}: ${
        typeof body === 'string' ? body.slice(0, 300) : JSON.stringify(body).slice(0, 300)
      }`,
    )
  }

  return body
}

/** A password strong enough that it never needs rotating for weakness. */
function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

async function resolveOrganization() {
  const explicit = flag('org')
  if (explicit) return explicit

  const organizations = await api('/organizations')

  if (organizations.length === 0) {
    throw new Error('This account has no Supabase organizations.')
  }

  if (organizations.length > 1) {
    const list = organizations.map((o) => `  ${o.id}  ${o.name}`).join('\n')
    throw new Error(`Several organizations found; pass --org <id>:\n${list}`)
  }

  console.log(`organization: ${organizations[0].name} (${organizations[0].id})`)
  return organizations[0].id
}

/** A new project takes a couple of minutes before it will accept queries. */
async function waitUntilHealthy(ref) {
  const deadline = Date.now() + 6 * 60 * 1000
  let reported = ''

  while (Date.now() < deadline) {
    const project = await api(`/projects/${ref}`)

    if (project.status !== reported) {
      reported = project.status
      console.log(`status: ${reported}`)
    }

    if (project.status === 'ACTIVE_HEALTHY') return project

    await new Promise((resolve) => setTimeout(resolve, 5000))
  }

  throw new Error('Project did not become healthy within six minutes.')
}

async function applySchema(ref) {
  const query = readFileSync(SCHEMA_PATH, 'utf8')

  console.log(`applying schema.sql (${query.split('\n').length} lines)…`)
  await api(`/projects/${ref}/database/query`, {
    method: 'POST',
    body: JSON.stringify({ query }),
  })
  console.log('schema applied')
}

async function verify(ref) {
  const checks = [
    ["tables", `select table_name from information_schema.tables where table_schema = 'public' order by table_name`],
    ["rls disabled", `select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity`],
    ["policies", `select count(*)::int as count from pg_policies where schemaname = 'public'`],
    ["functions", `select routine_name from information_schema.routines where routine_schema = 'public' order by routine_name`],
  ]

  for (const [label, query] of checks) {
    const rows = await api(`/projects/${ref}/database/query`, {
      method: 'POST',
      body: JSON.stringify({ query }),
    })
    console.log(`${label}: ${JSON.stringify(rows)}`)
  }
}

async function publishableKey(ref) {
  const keys = await api(`/projects/${ref}/api-keys`)
  const anon = keys.find((k) => k.name === 'anon' || k.type === 'publishable')
  return anon ? anon.api_key : null
}

function writeEnv(url, key) {
  let env = readFileSync(ENV_PATH, 'utf8')

  const replace = (name, value) => {
    const pattern = new RegExp(`^${name}=.*$`, 'm')
    env = pattern.test(env)
      ? env.replace(pattern, `${name}=${value}`)
      : `${env.trimEnd()}\n${name}=${value}\n`
  }

  replace('NEXT_PUBLIC_SUPABASE_URL', url)
  replace('NEXT_PUBLIC_SUPABASE_ANON_KEY', key)

  writeFileSync(ENV_PATH, env)
  console.log('.env.local updated')
}

const existingRef = flag('ref')
let ref = existingRef
let password = null

if (!ref) {
  const organizationId = await resolveOrganization()
  const name = flag('name', 'orbit-roisin')
  const region = flag('region', 'us-east-1')
  password = generatePassword()

  console.log(`creating project "${name}" in ${region}…`)

  const project = await api('/projects', {
    method: 'POST',
    body: JSON.stringify({
      name,
      organization_id: organizationId,
      region,
      db_pass: password,
      plan: 'free',
    }),
  })

  ref = project.id ?? project.ref
  console.log(`project ref: ${ref}`)
}

await waitUntilHealthy(ref)
await applySchema(ref)
await verify(ref)

const url = `https://${ref}.supabase.co`
const key = await publishableKey(ref)

if (hasFlag('write-env') && key) writeEnv(url, key)

console.log('\n--- values for .env.local and Vercel ---')
console.log(`NEXT_PUBLIC_SUPABASE_URL=${url}`)
console.log(`NEXT_PUBLIC_SUPABASE_ANON_KEY=${key ?? '(fetch from the dashboard)'}`)
if (password) console.log(`\nDatabase password (store it now, it is not retrievable later):\n${password}`)
console.log(`\nDashboard: https://supabase.com/dashboard/project/${ref}`)
