'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'

import { createClient } from './server'

/**
 * Usernames become synthetic email addresses, so the character set has to be
 * something Supabase will accept on the left side of an `@`.
 */
const CredentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Username must be at least 3 characters.')
    .max(32, 'Username must be 32 characters or fewer.')
    .regex(
      /^[a-z0-9._-]+$/,
      'Username may only contain letters, numbers, dots, underscores, and hyphens.',
    ),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(128, 'Password must be 128 characters or fewer.'),
})

export type AuthResult = { error: string } | undefined

/**
 * Sign-in is by username, but Supabase authenticates by email, so each
 * username is mapped to a synthetic address.
 *
 * The domain has to be one Supabase's validator accepts — `.local` and other
 * reserved suffixes are rejected outright with `email_address_invalid`, which
 * makes every sign-up fail. Nothing is ever delivered here, so the project has
 * `mailer_autoconfirm` enabled; without it Supabase withholds the session
 * pending a confirmation link that no one can receive.
 */
const USERNAME_EMAIL_DOMAIN = 'orbit.app'

function emailForUsername(username: string) {
  return `${username}@${USERNAME_EMAIL_DOMAIN}`
}

function readCredentials(formData: FormData) {
  return CredentialsSchema.safeParse({
    username: formData.get('username'),
    password: formData.get('password'),
  })
}

export async function signUp(formData: FormData): Promise<AuthResult> {
  const credentials = readCredentials(formData)

  if (!credentials.success) {
    return { error: credentials.error.issues[0]?.message ?? 'Invalid details.' }
  }

  const { username, password } = credentials.data
  const supabase = await createClient()

  // `profiles` is closed by row level security, so availability is checked
  // through a security-definer function rather than a direct select.
  const { data: available, error: availabilityError } = await supabase.rpc(
    'username_available',
    { candidate: username },
  )

  if (availabilityError) {
    console.error(`[AUTH-ERROR] username lookup: ${availabilityError.message}`)
    return { error: 'Could not check that username. Try again.' }
  }

  if (!available) {
    return { error: 'That username is already taken.' }
  }

  const { data, error } = await supabase.auth.signUp({
    email: emailForUsername(username),
    password,
  })

  if (error) {
    console.error(`[AUTH-ERROR] sign up: ${error.message}`)
    return { error: 'Could not create that account.' }
  }

  if (!data.user) {
    return { error: 'Account created but no session was returned.' }
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .insert({ id: data.user.id, username })

  if (profileError) {
    console.error(`[AUTH-ERROR] profile insert: ${profileError.message}`)
    return { error: 'Account created but the profile could not be saved.' }
  }

  redirect('/companion')
}

export async function login(formData: FormData): Promise<AuthResult> {
  const credentials = readCredentials(formData)

  if (!credentials.success) {
    return { error: 'Invalid username or password.' }
  }

  const { username, password } = credentials.data
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email: emailForUsername(username),
    password,
  })

  if (error) {
    return { error: 'Invalid username or password.' }
  }

  redirect('/companion')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
