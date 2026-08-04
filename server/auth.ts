// app/actions/auth.ts
'use server'

import { createClient } from './server'
import { redirect } from 'next/navigation'

export async function signUp(formData: FormData) {
  const username = formData.get('username') as string
  const password = formData.get('password') as string
  const email = `${username}@yourapp.local`

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('profiles')
    .select('username')
    .eq('username', username)
    .maybeSingle()

  if (existing) {
    return { error: 'Username already taken' }
  }

  const { data, error } = await supabase.auth.signUp({ email, password })

  if (error) {
    return { error: error.message }
  }

  if (data.user) {
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({ id: data.user.id, username })

    if (profileError) {
      return { error: profileError.message }
    }
  }

  redirect('/orbit')
}

export async function login(formData: FormData) {
  const username = formData.get('username') as string
  const password = formData.get('password') as string
  const email = `${username}@yourapp.local`

  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: 'Invalid username or password' }
  }

  redirect('/orbit')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}