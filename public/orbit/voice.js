/**
 * Roisin's speaking voice.
 *
 * Dependency-free, like the rest of the Orbit runtime, so the same file works
 * in the Next app, the static showcase, and the Electron renderer.
 *
 * Speechmatics text to speech is used when a session is available. Its four
 * published voices are mapped one-to-one onto the four avatars, so each
 * character sounds like itself. When Speechmatics is unavailable — the public
 * showcase, an expired session, an offline machine — playback falls back to
 * the browser's own speech synthesis, choosing a voice of the right gender.
 */
(function () {
  'use strict'

  /**
   * The four Speechmatics preview voices, keyed by avatar skin.
   *
   * Speechmatics currently publishes two male and two female voices, so the
   * four avatars split two and two rather than three and one. `synthesis`
   * describes the voice to look for when falling back to the browser.
   */
  const VOICES = {
    classic: {
      id: 'jack',
      avatar: 'Solis',
      label: 'Jack · English male (US)',
      gender: 'male',
      synthesis: ['Google US English', 'Microsoft Guy', 'Microsoft David', 'Daniel'],
    },
    electric: {
      id: 'theo',
      avatar: 'Orbit',
      label: 'Theo · English male (UK)',
      gender: 'male',
      synthesis: ['Google UK English Male', 'Microsoft Ryan', 'Daniel', 'Arthur'],
    },
    dove: {
      id: 'megan',
      avatar: 'Nimbus',
      label: 'Megan · English female (US)',
      gender: 'female',
      synthesis: ['Google US English', 'Microsoft Aria', 'Microsoft Zira', 'Samantha'],
    },
    pink: {
      id: 'sarah',
      avatar: 'Roisin',
      label: 'Sarah · English female (UK)',
      gender: 'female',
      synthesis: ['Google UK English Female', 'Microsoft Sonia', 'Kate', 'Serena'],
    },
  }

  const DEFAULT_SKIN = 'pink'
  const STORAGE_KEY = 'orbit-voice'

  /**
   * Playback speed for synthesised replies.
   *
   * Speechmatics TTS takes no speed or pitch parameter, so this is applied to
   * the audio instead. Rate and pitch move together — the recording is played
   * faster, which lifts it — which is the brighter, quicker read we want. A
   * separate pitch control would need real pitch shifting, and would sound
   * worse for the little it would add.
   *
   * 1.12 is about two semitones up. Past ~1.25 it starts to sound comical.
   */
  const DEFAULT_RATE = 1.12
  const MIN_RATE = 0.75
  const MAX_RATE = 1.6

  /** Keeps the rate inside what still sounds like a person. */
  function clampRate(value) {
    const rate = Number(value);
    if (!Number.isFinite(rate)) return DEFAULT_RATE;
    return Math.min(MAX_RATE, Math.max(MIN_RATE, rate));
  }

  function voiceForSkin(skin) {
    return VOICES[skin] || VOICES[DEFAULT_SKIN]
  }

  /** Picks the closest browser voice, preferring the named ones. */
  function pickSynthesisVoice(preferred) {
    const available = window.speechSynthesis ? window.speechSynthesis.getVoices() : []

    if (!available.length) return null

    for (const name of preferred) {
      const match = available.find((voice) => voice.name.includes(name))
      if (match) return match
    }

    return available.find((voice) => voice.lang.startsWith('en')) || available[0]
  }

  class OrbitVoice {
    constructor(options) {
      const settings = options || {}

      this.ttsUrl = settings.ttsUrl || '/api/speech/tts'
      /** Electron supplies this, since its renderer has no session cookie. */
      this.fetchAudio = settings.fetchAudio || null
      this.enabled = settings.enabled !== false
      this.skin = settings.skin || this._restoreSkin() || DEFAULT_SKIN
      this.rate = clampRate(settings.rate)

      this.context = null
      this.current = null
      /** Set once Speechmatics has failed, so we stop retrying every reply. */
      this.remoteUnavailable = false
    }

    _restoreSkin() {
      try {
        return window.localStorage.getItem(STORAGE_KEY)
      } catch {
        return null
      }
    }

    get voice() {
      return voiceForSkin(this.skin)
    }

    get voices() {
      return Object.entries(VOICES).map(([skin, voice]) => ({ skin, ...voice }))
    }

    setSkin(skin) {
      if (!VOICES[skin]) return

      this.skin = skin

      try {
        window.localStorage.setItem(STORAGE_KEY, skin)
      } catch {
        /* private browsing */
      }
    }

    /** Adjusts delivery speed, and with it the pitch. */
    setRate(value) {
      this.rate = clampRate(value);
      return this.rate;
    }

    setEnabled(enabled) {
      this.enabled = Boolean(enabled)
      if (!this.enabled) this.stop()
    }

    /** Speaks `text`, resolving with the transport that actually produced audio. */
    async speak(text) {
      const line = String(text || '').trim()

      if (!this.enabled || !line) return null

      this.stop()

      // Synthesis is a network round trip, so a newer line can be requested
      // while an older one is still in flight. Without this the older audio
      // would start playing after the newer, and the two would overlap.
      const generation = (this.generation || 0) + 1
      this.generation = generation

      if (!this.remoteUnavailable) {
        try {
          await this._speakRemote(line, generation)
          return 'speechmatics'
        } catch (error) {
          // One failure is enough; every later reply goes straight to the
          // browser rather than waiting on a request that will not succeed.
          this.remoteUnavailable = true
          console.warn('[orbit-voice] falling back to browser speech:', error.message)
        }
      }

      return this._speakLocal(line) ? 'browser' : null
    }

    async _speakRemote(text, generation) {
      const voiceId = this.voice.id
      let buffer

      if (this.fetchAudio) {
        buffer = await this.fetchAudio(text, voiceId)
      } else {
        const response = await fetch(this.ttsUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voice: voiceId }),
        })

        if (!response.ok) throw new Error(`Speech request failed (${response.status}).`)

        buffer = await response.arrayBuffer()
      }

      if (!buffer || !buffer.byteLength) throw new Error('Empty audio response.')

      // A newer line was requested while this one was being synthesised.
      if (generation !== undefined && generation !== this.generation) return

      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      this.context = this.context || new AudioContextClass()

      if (this.context.state === 'suspended') await this.context.resume()

      const decoded = await this.context.decodeAudioData(buffer.slice(0))

      if (generation !== undefined && generation !== this.generation) return

      const source = this.context.createBufferSource()
      source.buffer = decoded
      // Speeds the delivery and lifts the pitch together.
      source.playbackRate.value = this.rate
      source.connect(this.context.destination)

      this.current = source

      return new Promise((resolve) => {
        source.onended = () => {
          if (this.current === source) this.current = null
          resolve()
        }
        source.start()
      })
    }

    _speakLocal(text) {
      if (!window.speechSynthesis) return false

      const utterance = new SpeechSynthesisUtterance(text)
      const preferred = pickSynthesisVoice(this.voice.synthesis)

      if (preferred) utterance.voice = preferred

      // The browser engine exposes both, so the same brightness is set
      // explicitly rather than inferred from playback speed.
      utterance.rate = this.rate
      utterance.pitch = (this.voice.gender === 'female' ? 1.1 : 0.95) + (this.rate - 1) * 0.5

      window.speechSynthesis.speak(utterance)
      return true
    }

    /** Stops mid-sentence, so a new request can interrupt the last reply. */
    stop() {
      if (this.current) {
        try {
          this.current.stop()
        } catch {
          /* already finished */
        }
        this.current = null
      }

      if (window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel()
      }
    }
  }

  window.OrbitVoice = OrbitVoice
  window.OrbitVoice.VOICES = VOICES
})()
