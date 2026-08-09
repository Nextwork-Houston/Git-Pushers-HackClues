/**
 * Environment lookups, in one place.
 *
 * The project was deployed with an earlier set of variable names before these
 * routes existed. Rather than force every secret to be re-entered, each
 * accessor accepts the historical name as a fallback. The canonical name wins
 * when both are present.
 */

function firstSet(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]
    if (value && value.trim()) return value
  }

  return undefined
}

/** Speechmatics REST key. `SPEECHMATIC_API_KEY` (no S) is the legacy spelling. */
export function speechmaticsApiKey(): string | undefined {
  return firstSet('SPEECHMATICS_API_KEY', 'SPEECHMATIC_API_KEY')
}

/**
 * Key for Roisin's reasoning model.
 *
 * `MLAI_API_KEY` is the legacy name for an AI/ML API key, which is also one of
 * native.builder's own BYOK providers.
 */
export function llmApiKey(): string | undefined {
  return firstSet('LLM_API_KEY', 'MLAI_API_KEY')
}

/** Defaults to AI/ML API, matching the legacy MLAI_API_KEY. */
export function llmBaseUrl(): string {
  return (firstSet('LLM_BASE_URL') ?? 'https://api.aimlapi.com/v1').replace(/\/$/, '')
}

export function llmModel(): string {
  return firstSet('LLM_MODEL') ?? 'gpt-4o-mini'
}

export function githubAppCredentials(): { appId: string; privateKey: string } | undefined {
  const appId = firstSet('GITHUB_APP_ID')
  const privateKey = firstSet('GITHUB_APP_PRIVATE_KEY')

  return appId && privateKey ? { appId, privateKey } : undefined
}

export function brightDataApiKey(): string | undefined {
  return firstSet('BRIGHTDATA_API_KEY')
}

export function supabaseConfigured(): boolean {
  return Boolean(
    firstSet('NEXT_PUBLIC_SUPABASE_URL') && firstSet('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  )
}
