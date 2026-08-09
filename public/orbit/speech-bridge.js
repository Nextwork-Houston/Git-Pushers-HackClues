/**
 * Speech bridge for Roisin.
 *
 * Dependency-free so the same file works in the Next app, the static showcase,
 * and the Electron renderer without a bundler.
 *
 * Three transports, tried in order:
 *   1. Speechmatics Flow — full voice agent: transcripts plus spoken replies.
 *   2. Speechmatics RT    — transcription only; replies come from our backend.
 *   3. Web Speech API     — browser fallback when Speechmatics is unavailable.
 *
 * Whichever transport runs, it emits the same events on `window`, so callers
 * never need to know which one is active:
 *   speech.start          {}
 *   speechmatics.partial  { text }
 *   speechmatics.final    { text }
 *   speech.reply          { text }        agent spoke (Flow only)
 *   speech.transport      { transport }   which one is live
 *   speech.error          { message }
 *   speech.end            {}
 */
(function () {
  'use strict'

  const FLOW_SERVER = 'wss://flow.api.speechmatics.com'
  const RT_SERVER = 'wss://eu2.rt.speechmatics.com/v2'
  const SAMPLE_RATE = 16000
  /** Frames per audio chunk sent upstream. 4096 keeps latency low. */
  const FRAME_SIZE = 4096

  function emit(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }))
  }

  /** Joins Speechmatics recognition results into a plain string. */
  function resultsToText(message) {
    if (typeof message.metadata?.transcript === 'string') {
      return message.metadata.transcript.trim()
    }

    return (message.results || [])
      .map((result) => result.alternatives?.[0]?.content || '')
      .join(' ')
      .replace(/\s+([.,!?;:])/g, '$1')
      .trim()
  }

  function floatToPcm16(input) {
    const output = new Int16Array(input.length)

    for (let index = 0; index < input.length; index += 1) {
      const clamped = Math.max(-1, Math.min(1, input[index]))
      output[index] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
    }

    return output
  }

  /**
   * Captures microphone audio as 16 kHz PCM16.
   *
   * Uses ScriptProcessorNode rather than an AudioWorklet because the worklet
   * needs a separately served module file, which would break the static
   * showcase and the file:// Electron renderer.
   */
  class Microphone {
    constructor(onChunk) {
      this.onChunk = onChunk
      this.stream = null
      this.context = null
      this.processor = null
      this.source = null
    }

    async start() {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })

      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      this.context = new AudioContextClass({ sampleRate: SAMPLE_RATE })

      if (this.context.state === 'suspended') await this.context.resume()

      this.source = this.context.createMediaStreamSource(this.stream)
      this.processor = this.context.createScriptProcessor(FRAME_SIZE, 1, 1)
      this.processor.onaudioprocess = (event) => {
        const samples = event.inputBuffer.getChannelData(0)
        this.onChunk(floatToPcm16(samples))
      }

      this.source.connect(this.processor)
      // Routing through a muted gain node keeps the processor pumping without
      // echoing the microphone back through the speakers.
      const sink = this.context.createGain()
      sink.gain.value = 0
      this.processor.connect(sink)
      sink.connect(this.context.destination)
    }

    stop() {
      if (this.processor) this.processor.onaudioprocess = null
      try {
        if (this.source) this.source.disconnect()
        if (this.processor) this.processor.disconnect()
      } catch {
        /* already torn down */
      }
      if (this.stream) this.stream.getTracks().forEach((track) => track.stop())
      if (this.context && this.context.state !== 'closed') this.context.close()
      this.stream = null
      this.context = null
      this.processor = null
      this.source = null
    }
  }

  /** Plays the PCM16 chunks Flow sends back, in order, without gaps. */
  class AgentSpeaker {
    constructor() {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      this.context = new AudioContextClass()
      this.playAt = 0
    }

    enqueue(int16) {
      if (!int16.length) return

      const buffer = this.context.createBuffer(1, int16.length, SAMPLE_RATE)
      const channel = buffer.getChannelData(0)

      for (let index = 0; index < int16.length; index += 1) {
        channel[index] = int16[index] / 0x8000
      }

      const source = this.context.createBufferSource()
      source.buffer = buffer
      source.connect(this.context.destination)

      const now = this.context.currentTime
      this.playAt = Math.max(this.playAt, now)
      source.start(this.playAt)
      this.playAt += buffer.duration
    }

    /** Drops anything still queued, so a barge-in stops the agent quickly. */
    flush() {
      this.playAt = 0
    }

    close() {
      if (this.context.state !== 'closed') this.context.close()
    }
  }

  class SpeechBridge {
    constructor(options) {
      const settings = options || {}
      this.tokenUrl = settings.tokenUrl || '/api/speech/token'
      this.language = settings.language || 'en'
      this.tools = settings.tools || []
      this.onToolInvoke = settings.onToolInvoke || null
      this.preferFlow = settings.preferFlow !== false
      this.allowBrowserFallback = settings.allowBrowserFallback !== false

      this.socket = null
      this.microphone = null
      this.speaker = null
      this.recognition = null
      this.transport = null
      this.serverSeqNo = 0
      this.active = false
    }

    async requestToken(type) {
      const response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      })

      if (!response.ok) {
        throw new Error(`Speech token request failed (${response.status}).`)
      }

      return response.json()
    }

    async start() {
      if (this.active) return this.transport
      this.active = true

      const attempts = []
      if (this.preferFlow) attempts.push(() => this.startFlow())
      attempts.push(() => this.startRealtime())

      for (const attempt of attempts) {
        try {
          const transport = await attempt()
          this.transport = transport
          emit('speech.transport', { transport })
          emit('speech.start', {})
          return transport
        } catch (error) {
          console.warn('[speech-bridge]', error)
          this.teardownTransport()
        }
      }

      if (this.allowBrowserFallback && this.startBrowserSpeech()) {
        this.transport = 'browser'
        emit('speech.transport', { transport: 'browser' })
        emit('speech.start', {})
        return 'browser'
      }

      this.active = false
      emit('speech.error', {
        message: 'No speech transport is available. Check your microphone and sign-in.',
      })
      throw new Error('No speech transport available.')
    }

    async openSocket(url) {
      return new Promise((resolve, reject) => {
        const socket = new WebSocket(url)
        socket.binaryType = 'arraybuffer'

        const timeout = setTimeout(() => {
          socket.close()
          reject(new Error('Speech socket timed out.'))
        }, 10000)

        socket.addEventListener('open', () => {
          clearTimeout(timeout)
          resolve(socket)
        })

        socket.addEventListener('error', () => {
          clearTimeout(timeout)
          reject(new Error('Speech socket failed to open.'))
        })
      })
    }

    // -- Flow: transcripts + spoken replies ---------------------------------
    async startFlow() {
      const token = await this.requestToken('flow')
      const url = new URL('/v1/flow', FLOW_SERVER)
      url.searchParams.set('jwt', token.jwt)
      url.searchParams.set('sm-app', token.appId)

      const socket = await this.openSocket(url.toString())
      this.socket = socket
      this.speaker = new AgentSpeaker()
      this.serverSeqNo = 0

      socket.send(
        JSON.stringify({
          message: 'StartConversation',
          audio_format: {
            type: 'raw',
            encoding: 'pcm_s16le',
            sample_rate: SAMPLE_RATE,
          },
          conversation_config: {
            template_id: token.templateId,
            template_variables: {},
          },
          tools: this.tools,
        }),
      )

      await new Promise((resolve, reject) => {
        const onMessage = ({ data }) => {
          if (typeof data !== 'string') return
          const message = JSON.parse(data)

          if (message.message === 'ConversationStarted') {
            socket.removeEventListener('message', onMessage)
            resolve()
          } else if (message.message === 'Error') {
            socket.removeEventListener('message', onMessage)
            reject(new Error(`Flow rejected the session: ${message.reason}`))
          }
        }

        socket.addEventListener('message', onMessage)
        setTimeout(() => reject(new Error('Flow did not start in time.')), 10000)
      })

      socket.addEventListener('message', ({ data }) => this.handleFlowMessage(data))
      socket.addEventListener('close', () => this.handleClose())

      await this.startMicrophone((chunk) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(chunk.buffer)
      })

      return 'flow'
    }

    handleFlowMessage(data) {
      if (data instanceof ArrayBuffer) {
        // Flow requires an acknowledgement for every audio frame it sends.
        this.send({ message: 'AudioReceived', seq_no: ++this.serverSeqNo })
        if (this.speaker) this.speaker.enqueue(new Int16Array(data))
        return
      }

      if (typeof data !== 'string') return

      let message
      try {
        message = JSON.parse(data)
      } catch {
        return
      }

      switch (message.message) {
        case 'AddPartialTranscript':
          emit('speechmatics.partial', { text: resultsToText(message) })
          break
        case 'AddTranscript': {
          const text = resultsToText(message)
          if (text) emit('speechmatics.final', { text })
          break
        }
        case 'ResponseStarted':
          emit('speech.reply', { text: message.content, final: false })
          break
        case 'ResponseCompleted':
          emit('speech.reply', { text: message.content, final: true })
          break
        case 'ResponseInterrupted':
          if (this.speaker) this.speaker.flush()
          break
        case 'ToolInvoke':
          this.handleToolInvoke(message)
          break
        case 'Error':
          emit('speech.error', { message: message.reason })
          break
        default:
          break
      }
    }

    async handleToolInvoke(message) {
      if (!this.onToolInvoke) {
        this.send({
          message: 'ToolResult',
          id: message.id,
          status: 'rejected',
          content: 'No tool handler is registered.',
        })
        return
      }

      try {
        const content = await this.onToolInvoke(
          message.function.name,
          message.function.arguments || {},
        )
        this.send({
          message: 'ToolResult',
          id: message.id,
          status: 'ok',
          content: typeof content === 'string' ? content : JSON.stringify(content),
        })
      } catch (error) {
        this.send({
          message: 'ToolResult',
          id: message.id,
          status: 'failed',
          content: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // -- Realtime: transcription only ---------------------------------------
    async startRealtime() {
      const token = await this.requestToken('rt')
      const url = new URL(RT_SERVER)
      url.searchParams.set('jwt', token.jwt)
      url.searchParams.set('sm-app', token.appId)

      const socket = await this.openSocket(url.toString())
      this.socket = socket

      socket.send(
        JSON.stringify({
          message: 'StartRecognition',
          audio_format: {
            type: 'raw',
            encoding: 'pcm_s16le',
            sample_rate: SAMPLE_RATE,
          },
          transcription_config: {
            language: this.language,
            enable_partials: true,
            max_delay: 1,
            operating_point: 'enhanced',
            conversation_config: { end_of_utterance_silence_trigger: 0.8 },
          },
        }),
      )

      await new Promise((resolve, reject) => {
        const onMessage = ({ data }) => {
          if (typeof data !== 'string') return
          const message = JSON.parse(data)

          if (message.message === 'RecognitionStarted') {
            socket.removeEventListener('message', onMessage)
            resolve()
          } else if (message.message === 'Error') {
            socket.removeEventListener('message', onMessage)
            reject(new Error(`Speechmatics rejected the session: ${message.reason}`))
          }
        }

        socket.addEventListener('message', onMessage)
        setTimeout(() => reject(new Error('Speechmatics did not start in time.')), 10000)
      })

      socket.addEventListener('message', ({ data }) => {
        if (typeof data !== 'string') return

        let message
        try {
          message = JSON.parse(data)
        } catch {
          return
        }

        if (message.message === 'AddPartialTranscript') {
          emit('speechmatics.partial', { text: resultsToText(message) })
        } else if (message.message === 'AddTranscript') {
          const text = resultsToText(message)
          if (text) emit('speechmatics.final', { text })
        } else if (message.message === 'Error') {
          emit('speech.error', { message: message.reason })
        }
      })

      socket.addEventListener('close', () => this.handleClose())

      await this.startMicrophone((chunk) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(chunk.buffer)
      })

      return 'rt'
    }

    // -- Browser fallback ----------------------------------------------------
    startBrowserSpeech() {
      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
      if (!Recognition) return false

      const engine = new Recognition()
      engine.continuous = true
      engine.interimResults = true
      engine.lang = this.language === 'en' ? 'en-US' : this.language

      engine.onresult = (event) => {
        let partial = ''

        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index]
          const text = result[0]?.transcript || ''

          if (result.isFinal) emit('speechmatics.final', { text: text.trim() })
          else partial += text
        }

        if (partial) emit('speechmatics.partial', { text: partial.trim() })
      }

      engine.onerror = (event) => {
        if (event.error !== 'aborted') emit('speech.error', { message: event.error })
      }

      engine.onend = () => {
        if (this.active) {
          try {
            engine.start()
          } catch {
            /* restart races are expected */
          }
        }
      }

      engine.start()
      this.recognition = engine
      return true
    }

    async startMicrophone(onChunk) {
      this.microphone = new Microphone(onChunk)
      await this.microphone.start()
    }

    /** Types text straight into the conversation without speaking it. */
    sendText(text, options) {
      if (this.transport !== 'flow') return false

      return this.send({
        message: 'AddInput',
        input: text,
        interrupt_response: Boolean(options && options.interrupt),
        immediate: Boolean(options && options.immediate),
      })
    }

    send(message) {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false
      this.socket.send(JSON.stringify(message))
      return true
    }

    handleClose() {
      if (!this.active) return
      this.active = false
      emit('speech.end', {})
    }

    teardownTransport() {
      if (this.microphone) {
        this.microphone.stop()
        this.microphone = null
      }
      if (this.speaker) {
        this.speaker.close()
        this.speaker = null
      }
      if (this.socket) {
        try {
          this.socket.close()
        } catch {
          /* already closing */
        }
        this.socket = null
      }
    }

    stop() {
      if (!this.active) return
      this.active = false

      if (this.transport === 'flow') this.send({ message: 'AudioEnded', last_seq_no: 0 })
      if (this.recognition) {
        this.recognition.onend = null
        this.recognition.stop()
        this.recognition = null
      }

      this.teardownTransport()
      this.transport = null
      emit('speech.end', {})
    }
  }

  window.OrbitSpeechBridge = SpeechBridge
})()
