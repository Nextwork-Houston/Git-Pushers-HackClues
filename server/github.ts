import { createAppAuth } from '@octokit/auth-app'
import { Octokit } from '@octokit/rest'

import { githubAppCredentials } from './env'

/**
 * Writes to GitHub on the user's behalf, through the installed App.
 *
 * The App is installed org-wide with `contents: write`, which means an
 * installation token can write to every repository in the org. So the
 * installation and the target repository are both resolved here, from server
 * configuration — never from the request. Letting a caller name the repo would
 * turn any signed-in account into write access across the whole organisation.
 */

/** Repositories Roisin is allowed to write to. */
function allowedRepositories(): string[] {
  return (process.env.GITHUB_SCAFFOLD_REPOS || 'Nextwork-Houston/demo-repository')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function defaultRepository(): string {
  return allowedRepositories()[0]
}

export function isRepositoryAllowed(repoFullName: string): boolean {
  return allowedRepositories().includes(repoFullName)
}

function appOctokit(): Octokit {
  const credentials = githubAppCredentials()

  if (!credentials) throw new Error('GitHub App credentials are not configured.')

  return new Octokit({
    authStrategy: createAppAuth,
    auth: { appId: credentials.appId, privateKey: credentials.privateKey },
  })
}

/** Installations rarely change, so the lookup is cached for the process. */
let cachedInstallationId: number | null = null

/**
 * Finds the installation that can reach a repository.
 *
 * Resolved rather than accepted as input: the request should not be able to
 * choose which installation's token gets minted.
 */
export async function resolveInstallationId(repoFullName: string): Promise<number> {
  if (cachedInstallationId) return cachedInstallationId

  const [owner, repo] = repoFullName.split('/')
  const { data } = await appOctokit().apps.getRepoInstallation({ owner, repo })

  cachedInstallationId = data.id
  return data.id
}

async function installationOctokit(repoFullName: string): Promise<Octokit> {
  const credentials = githubAppCredentials()

  if (!credentials) throw new Error('GitHub App credentials are not configured.')

  const installationId = await resolveInstallationId(repoFullName)

  // Minted fresh every time and never stored: installation tokens last an hour
  // and there is nothing to gain from caching one.
  const auth = createAppAuth({
    appId: credentials.appId,
    privateKey: credentials.privateKey,
  })

  const { token } = await auth({ type: 'installation', installationId })

  return new Octokit({ auth: token })
}

export type CommitResult = {
  sha: string | null
  url: string | null
  path: string
  repository: string
}

/**
 * Creates or updates a single file.
 *
 * The existing SHA is required to update a file that is already there, so a
 * missing file (404) is the create case rather than an error.
 */
export async function commitFile({
  repoFullName,
  filePath,
  content,
  commitMessage,
  branch,
}: {
  repoFullName: string
  filePath: string
  content: string
  commitMessage: string
  branch?: string
}): Promise<CommitResult> {
  if (!isRepositoryAllowed(repoFullName)) {
    throw new Error(`Repository ${repoFullName} is not an allowed target.`)
  }

  const [owner, repo] = repoFullName.split('/')
  const octokit = await installationOctokit(repoFullName)

  let targetBranch = branch

  if (!targetBranch) {
    const { data: repoInfo } = await octokit.repos.get({ owner, repo })
    targetBranch = repoInfo.default_branch
  }

  let sha: string | undefined

  try {
    const { data: existing } = await octokit.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref: targetBranch,
    })

    if (!Array.isArray(existing) && 'sha' in existing) sha = existing.sha
  } catch (error) {
    if ((error as { status?: number }).status !== 404) throw error
  }

  const { data } = await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    message: commitMessage,
    content: Buffer.from(content, 'utf-8').toString('base64'),
    branch: targetBranch,
    sha,
  })

  return {
    sha: data.commit.sha ?? null,
    url: data.content?.html_url ?? null,
    path: filePath,
    repository: repoFullName,
  }
}

/** Turns a request into a filename-safe slug. */
export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'build'
  )
}
