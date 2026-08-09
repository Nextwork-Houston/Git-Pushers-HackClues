import { createAppAuth } from '@octokit/auth-app'
import { Octokit } from '@octokit/rest'

import {
  brightDataApiKey,
  githubAppCredentials,
  llmApiKey,
  speechmaticsApiKey,
  supabaseConfigured,
} from './env'

/**
 * Everything Roisin can be connected to.
 *
 * A capability that quietly does nothing because a service was never linked is
 * the worst failure mode for a companion — she looks broken rather than
 * blocked. So each connector states what it enables, how to tell whether it is
 * ready, and where to send someone who needs to connect it. When a task needs
 * one that is not ready, she can say so, take the user there, and pick the
 * task back up afterwards.
 */

export type ConnectorState =
  /** Ready to use. */
  | 'connected'
  /** The user can fix this themselves; `actionUrl` says where. */
  | 'needs_user'
  /** Only an operator can fix this — a missing server key. */
  | 'needs_operator'

export type ConnectorId =
  | 'orbit'
  | 'speechmatics'
  | 'model'
  | 'bright_data'
  | 'github'
  | 'native_builder'

export type Connector = {
  id: ConnectorId
  name: string
  /** What stops working without it, in the user's terms. */
  enables: string
  state: ConnectorState
  /** Where to send the user. Only meaningful when state is `needs_user`. */
  actionUrl?: string
  /** What Roisin should say when a task is blocked on this. */
  prompt?: string
}

const GITHUB_APP_SLUG = process.env.GITHUB_APP_SLUG || 'ai-pet-committer'

/**
 * Whether the GitHub App is installed anywhere.
 *
 * Checked against GitHub rather than assumed from configuration: having
 * credentials and having somewhere to write are different things, and the gap
 * between them is exactly what leaves a build silently unsaved.
 */
async function githubInstalled(): Promise<boolean> {
  const credentials = githubAppCredentials()

  if (!credentials) return false

  try {
    const octokit = new Octokit({
      authStrategy: createAppAuth,
      auth: { appId: credentials.appId, privateKey: credentials.privateKey },
    })

    const { data } = await octokit.apps.listInstallations({ per_page: 1 })
    return data.length > 0
  } catch (error) {
    console.error('[CONNECTOR-ERROR] github', error)
    return false
  }
}

/** Server-side keys: present or not, and only an operator can change that. */
function serverConnector(
  id: ConnectorId,
  name: string,
  enables: string,
  configured: boolean,
): Connector {
  return {
    id,
    name,
    enables,
    state: configured ? 'connected' : 'needs_operator',
    prompt: configured
      ? undefined
      : `${name} is not configured on this server, so I cannot ${enables}.`,
  }
}

export async function listConnectors(builderUrl: string): Promise<Connector[]> {
  const [github] = await Promise.all([githubInstalled()])

  return [
    serverConnector('orbit', 'Orbit', 'remember anything', supabaseConfigured()),
    serverConnector('speechmatics', 'Speechmatics', 'hear or speak', Boolean(speechmaticsApiKey())),
    serverConnector('model', 'Roisin’s model', 'think', Boolean(llmApiKey())),
    serverConnector('bright_data', 'Bright Data', 'research the web', Boolean(brightDataApiKey())),
    {
      id: 'github',
      name: 'GitHub',
      enables: 'save your builds as specs',
      state: github ? 'connected' : 'needs_user',
      actionUrl: github
        ? undefined
        : `https://github.com/apps/${GITHUB_APP_SLUG}/installations/new`,
      prompt: github
        ? undefined
        : 'I need GitHub access before I can save that. Installing it now — pick your organisation and I will carry on.',
    },
    {
      // Only the desktop shell can tell: the session lives in its window, and
      // native.builder has no API to ask.
      id: 'native_builder',
      name: 'native.builder',
      enables: 'build what you describe',
      state: 'needs_user',
      actionUrl: builderUrl,
      prompt:
        'Sign in to native.builder in the window I opened, then say it again and I will type it straight in.',
    },
  ]
}

/** The connector a given capability depends on. */
export const CAPABILITY_CONNECTORS: Record<string, ConnectorId> = {
  research: 'bright_data',
  scaffold: 'github',
  build: 'native_builder',
  speech: 'speechmatics',
}

export function blockingConnector(
  connectors: Connector[],
  capability: keyof typeof CAPABILITY_CONNECTORS,
): Connector | null {
  const required = CAPABILITY_CONNECTORS[capability]
  const connector = connectors.find((entry) => entry.id === required)

  if (!connector || connector.state === 'connected') return null

  return connector
}
