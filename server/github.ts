// Runs on the BACKEND (Jaiden's server) only. Never import this in frontend code.
//
// Install first:
//   npm install @octokit/auth-app @octokit/rest
//
// Env vars needed (put these in your server's .env, NEVER commit them):
//   GITHUB_APP_ID=123456
//   GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
//   (paste the whole .pem content; keep the \n's if your env loader needs them escaped)

import { createAppAuth } from '@octokit/auth-app'
import { Octokit } from '@octokit/rest'

/**
 * Gets a short-lived (1 hour) installation token for a specific user's
 * repo installation. Call this fresh every time you need to commit --
 * do not cache/store this token anywhere.
 */
async function getInstallationOctokit(installationId: string | number) {
  const auth = createAppAuth({
    appId: process.env.GITHUB_APP_ID!,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY!,
  })

  const installationAuth = await auth({
    type: 'installation',
    installationId,
  })

  return new Octokit({ auth: installationAuth.token })
}


type commitFileProps = {
  installationId: number,
  repoFullName: string,
  filePath: string,
  content: string,
  commitMessage: string,
  branch: string,
};

export async function commitFile({installationId, repoFullName, filePath, content, commitMessage, branch}: commitFileProps) {
  const [owner, repo] = repoFullName.split('/')
  const octokit = await getInstallationOctokit(installationId)

  // Figure out the target branch if none given
  if (!branch) {
    const { data: repoInfo } = await octokit.repos.get({ owner, repo })
    branch = repoInfo.default_branch
  }

  // Check if the file already exists, to get its sha (required for updates)
  let sha: string | undefined;

  try {
    const { data: existing } = await octokit.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref: branch,
    })
    sha = (existing as any).sha;
  } catch (err) {
    if ((err as any).status !== 404) throw err
    // 404 is fine -- means the file doesn't exist yet, we're creating it
  }

  const { data } = await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    message: commitMessage,
    content: Buffer.from(content, 'utf-8').toString('base64'),
    branch,
    sha, // omit-if-undefined is fine -- octokit ignores undefined fields
  })

  return data.commit // contains sha, html_url, etc.
}