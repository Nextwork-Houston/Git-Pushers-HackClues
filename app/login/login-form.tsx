'use client'

import { useState, useTransition } from 'react'

import { login, signUp } from '@/server/auth'

type Mode = 'login' | 'signup'

export function LoginForm() {
  const [mode, setMode] = useState<Mode>('login')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    setError(null)

    startTransition(async () => {
      // A successful action redirects, so only failures return here.
      const action = mode === 'login' ? login : signUp
      const result = await action(formData)

      if (result?.error) setError(result.error)
    })
  }

  return (
    <form className="auth-form" action={handleSubmit}>
      <label className="auth-field">
        <span>Username</span>
        <input
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          minLength={3}
          maxLength={32}
          placeholder="roisin.fan"
        />
      </label>

      <label className="auth-field">
        <span>Password</span>
        <input
          name="password"
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          required
          minLength={8}
          maxLength={128}
          placeholder="At least 8 characters"
        />
      </label>

      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}

      <button className="auth-submit" type="submit" disabled={pending}>
        {pending
          ? 'Just a moment…'
          : mode === 'login'
            ? 'Sign in'
            : 'Create account'}
      </button>

      <button
        className="auth-switch"
        type="button"
        onClick={() => {
          setMode(mode === 'login' ? 'signup' : 'login')
          setError(null)
        }}
      >
        {mode === 'login'
          ? 'No account yet? Create one'
          : 'Already have an account? Sign in'}
      </button>
    </form>
  )
}
