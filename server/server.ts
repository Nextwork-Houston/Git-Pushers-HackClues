"use server"

import { createServerClient } from '@supabase/ssr'
import { User } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
          }
        },
      },
    }
  )
}

export async function getUserProfile() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username')
    .eq('id', user.id)
    .single()

  return profile
}

export async function getUser(): Promise<User>
{
    const client = await createClient();

    const { data: {user}, error: authError } = await client.auth.getUser();

    if(authError || !user)
    {
        console.error(`[AUTH_ERROR]: ${authError?.message}`);
        throw new Error("Unauthorized to access this PET!");
    }

    return user;
}