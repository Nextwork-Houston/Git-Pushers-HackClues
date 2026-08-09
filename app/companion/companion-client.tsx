'use client'

import Script from 'next/script'
import { useCallback, useEffect, useRef, useState } from 'react'

import { logout } from '@/server/auth'

/** XP needed to advance one level. */
const XP_PER_LEVEL = 100

/** Roisin is the pink sprite sheet. */
const ROISIN_SKIN = 'pink'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  type: string
  text: string
}

type PetSummary = {
  id: string
  name: string
  xp: number
  mood: string
  spritesheetUrl: string
}

type AvatarElement = HTMLElement & {
  setState(state: string): void
  setSkin(skin: string): void
  setTranscript(text: string, options?: { role?: string; final?: boolean }): void
  addMessage(text: string, role?: string): void
  openChat(): void
  startWaiting(options?: Record<string, unknown>): void
  stopWaiting(options?: Record<string, unknown>): void
  playAction(name: string, options?: Record<string, unknown>): void
}

type SpeechBridge = {
  start(): Promise<string>
  stop(): void
  sendText(text: string, options?: { interrupt?: boolean }): boolean
}

declare global {
  interface Window {
    OrbitSpeechBridge?: new (options: Record<string, unknown>) => SpeechBridge
  }
}

export function CompanionClient({
  pet,
  history,
  builderUrl,
}: {
  pet: PetSummary
  history: ChatMessage[]
  builderUrl: string
}) {
  const avatarRef = useRef<AvatarElement | null>(null)
  const bridgeRef = useRef<SpeechBridge | null>(null)
  const [xp, setXp] = useState(pet.xp)
  const [listening, setListening] = useState(false)
  const [status, setStatus] = useState('Ready when you are')
  const [scriptsReady, setScriptsReady] = useState(0)

  const level = Math.floor(xp / XP_PER_LEVEL) + 1
  const progress = xp % XP_PER_LEVEL

  /**
   * Sends a finished transcript to Roisin and plays back what she decides.
   *
   * A build instruction is handed to the desktop shell when one is present;
   * in the browser there is no builder window to type into, so it is shown in
   * chat and copied for the user to paste.
   */
  const handleTranscript = useCallback(
    async (text: string) => {
      const avatar = avatarRef.current
      if (!avatar || !text.trim()) return

      avatar.startWaiting({ openChat: true })
      setStatus('Thinking…')

      try {
        const response = await fetch('/api/conversation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, petId: pet.id }),
        })

        const payload = await response.json()

        if (!response.ok) {
          throw new Error(payload.error ?? `Roisin returned ${response.status}.`)
        }

        avatar.stopWaiting({ state: 'speaking' })
        avatar.addMessage(payload.reply, 'assistant')
        if (typeof payload.pet?.xp === 'number') setXp(payload.pet.xp)

        if (payload.builderPrompt) {
          avatar.playAction('celebrate', { duration: 2000 })
          setStatus('Build instruction ready')

          const delivered = window.orbitDesktop?.sendToBuilder
            ? await window.orbitDesktop.sendToBuilder(payload.builderPrompt)
            : false

          if (!delivered) {
            avatar.addMessage(
              `Here is the instruction for native.builder — paste it into ${new URL(builderUrl).host}:\n\n${payload.builderPrompt}`,
              'assistant',
            )
            await navigator.clipboard
              ?.writeText(payload.builderPrompt)
              .catch(() => undefined)
          }
        } else {
          setStatus('Ready when you are')
        }

        setTimeout(() => avatar.setState('idle'), 1200)
      } catch (error) {
        avatar.stopWaiting({ state: null })
        avatar.playAction('tantrum', { duration: 1600 })
        avatar.addMessage(
          error instanceof Error ? error.message : 'Something went wrong.',
          'assistant',
        )
        setStatus('Something went wrong')
      }
    },
    [builderUrl, pet.id],
  )

  // Replay stored history once the custom element has upgraded.
  useEffect(() => {
    if (scriptsReady < 2) return

    const avatar = document.querySelector<AvatarElement>('#roisin')
    if (!avatar) return

    avatarRef.current = avatar
    avatar.setSkin(ROISIN_SKIN)

    history
      .filter((message) => message.type !== 'builder_prompt')
      .forEach((message) =>
        avatar.addMessage(
          message.text,
          message.role === 'user' ? 'user' : 'assistant',
        ),
      )
  }, [history, scriptsReady])

  // Wire the speech bridge's events into the avatar.
  useEffect(() => {
    if (scriptsReady < 2) return

    const onPartial = (event: Event) => {
      const detail = (event as CustomEvent<{ text: string }>).detail
      avatarRef.current?.setTranscript(detail.text, { role: 'user' })
    }

    const onFinal = (event: Event) => {
      const detail = (event as CustomEvent<{ text: string }>).detail
      avatarRef.current?.setTranscript(detail.text, { role: 'user', final: true })
      void handleTranscript(detail.text)
    }

    const onTransport = (event: Event) => {
      const detail = (event as CustomEvent<{ transport: string }>).detail
      const labels: Record<string, string> = {
        flow: 'Listening · Speechmatics Flow',
        rt: 'Listening · Speechmatics',
        browser: 'Listening · browser speech',
      }
      setStatus(labels[detail.transport] ?? 'Listening')
    }

    const onError = (event: Event) => {
      const detail = (event as CustomEvent<{ message: string }>).detail
      setStatus(detail.message)
      setListening(false)
    }

    window.addEventListener('speechmatics.partial', onPartial)
    window.addEventListener('speechmatics.final', onFinal)
    window.addEventListener('speech.transport', onTransport)
    window.addEventListener('speech.error', onError)

    return () => {
      window.removeEventListener('speechmatics.partial', onPartial)
      window.removeEventListener('speechmatics.final', onFinal)
      window.removeEventListener('speech.transport', onTransport)
      window.removeEventListener('speech.error', onError)
    }
  }, [handleTranscript, scriptsReady])

  const toggleListening = useCallback(async () => {
    const avatar = avatarRef.current

    if (listening) {
      bridgeRef.current?.stop()
      bridgeRef.current = null
      setListening(false)
      setStatus('Ready when you are')
      avatar?.setState('idle')
      return
    }

    if (!window.OrbitSpeechBridge) {
      setStatus('Speech is still loading…')
      return
    }

    // Flow speaks its own replies, which would talk over Roisin's chat
    // response, so the browser surface uses transcription only.
    const bridge = new window.OrbitSpeechBridge({
      tokenUrl: '/api/speech/token',
      preferFlow: false,
    })

    try {
      await bridge.start()
      bridgeRef.current = bridge
      setListening(true)
      avatar?.openChat()
      avatar?.setState('listening')
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : 'Could not start listening.',
      )
    }
  }, [listening])

  useEffect(() => () => bridgeRef.current?.stop(), [])

  return (
    <main className="companion-page">
      <Script
        src="/orbit/avatar-companion.js"
        strategy="afterInteractive"
        onReady={() => setScriptsReady((count) => count + 1)}
      />
      <Script
        src="/orbit/speech-bridge.js"
        strategy="afterInteractive"
        onReady={() => setScriptsReady((count) => count + 1)}
      />

      <header className="companion-bar">
        <div className="companion-identity">
          <strong>{pet.name}</strong>
          <span>{status}</span>
        </div>

        <div className="xp-meter">
          <div className="xp-meter-label">
            <span>Level {level}</span>
            <span>
              {progress} / {XP_PER_LEVEL} XP
            </span>
          </div>
          <div
            className="xp-meter-track"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={XP_PER_LEVEL}
            aria-label={`${pet.name} experience`}
          >
            <div
              className="xp-meter-fill"
              style={{ width: `${(progress / XP_PER_LEVEL) * 100}%` }}
            />
          </div>
        </div>

        <button
          className="companion-signout"
          type="button"
          onClick={toggleListening}
        >
          {listening ? 'Stop listening' : 'Talk to Roisin'}
        </button>

        <form action={logout}>
          <button className="companion-signout" type="submit">
            Sign out
          </button>
        </form>
      </header>

      <section className="companion-stage">
        {/* The web component is defined by the script above, so React only
            needs to render the tag and leave it alone. */}
        <avatar-companion
          id="roisin"
          name={pet.name}
          sprite-src="/orbit/orbit-spritesheet.png"
          emotions-src="/orbit/orbit-actions-emotions.png"
          acrobatics-src="/orbit/orbit-actions-acrobatics.png"
          entertainment-src="/orbit/orbit-actions-entertainment.png"
          love-src="/orbit/orbit-actions-love.png"
          state="idle"
          skin={ROISIN_SKIN}
          skin-storage-key="orbit-companion-skin"
          agent-storage-key="orbit-companion-agents"
        />
        <p className="companion-hint">
          Press <strong>Talk to Roisin</strong> and describe what you want to
          build. She turns it into an instruction for native.builder.
        </p>
      </section>
    </main>
  )
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'avatar-companion': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > &
        Record<string, unknown>
    }
  }
}

declare global {
  interface Window {
    orbitDesktop?: {
      sendToBuilder?: (prompt: string) => Promise<boolean>
    }
  }
}
