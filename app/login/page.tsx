import type { Metadata } from 'next'

import { LoginForm } from './login-form'

export const metadata: Metadata = {
  title: 'Sign in · Orbit',
  description: 'Sign in to talk to Roisin and build with native.builder.',
}

export default function LoginPage() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <header className="auth-header">
          <p className="auth-eyebrow">Orbit</p>
          <h1>Talk. She builds.</h1>
          <p className="auth-lede">
            Sign in to wake Roisin and start shipping through native.builder.
          </p>
        </header>
        <LoginForm />
      </section>
    </main>
  )
}
