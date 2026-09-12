// Generated from the real bridge VoiceTurn/PacedSpeaker + fixture transport adapter. Do not hand-edit.

// owy/companion/bridge/src/clock.ts
var systemClock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (timer) => clearTimeout(timer),
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: (timer) => clearInterval(timer)
};

// owy/node_modules/.pnpm/esphome-client@2.0.0/node_modules/esphome-client/dist/api-constants.js
var LogLevel = {
  NONE: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4,
  VERBOSE: 5,
  VERY_VERBOSE: 6
};
var LOG_LEVEL_NAMES = new Map(Object.entries(LogLevel).map(([name, id]) => [id, name]));
var ClimateFeature = {
  SUPPORTS_CURRENT_TEMPERATURE: 1,
  SUPPORTS_TWO_POINT_TARGET_TEMPERATURE: 2,
  REQUIRES_TWO_POINT_TARGET_TEMPERATURE: 4,
  SUPPORTS_CURRENT_HUMIDITY: 8,
  SUPPORTS_TARGET_HUMIDITY: 16,
  SUPPORTS_ACTION: 32
};
var CLIMATE_FEATURE_BITS = {
  requiresTwoPointTargetTemperature: { bit: ClimateFeature.REQUIRES_TWO_POINT_TARGET_TEMPERATURE },
  supportsAction: { bit: ClimateFeature.SUPPORTS_ACTION },
  supportsCurrentHumidity: { bit: ClimateFeature.SUPPORTS_CURRENT_HUMIDITY },
  supportsCurrentTemperature: { bit: ClimateFeature.SUPPORTS_CURRENT_TEMPERATURE },
  supportsTargetHumidity: { bit: ClimateFeature.SUPPORTS_TARGET_HUMIDITY },
  supportsTwoPointTargetTemperature: { bit: ClimateFeature.SUPPORTS_TWO_POINT_TARGET_TEMPERATURE }
};
var WaterHeaterStateFlags = {
  AWAY: 1,
  ON: 2
};
var WaterHeaterCommandHasField = {
  MODE: 1,
  TARGET_TEMPERATURE: 2,
  TARGET_TEMPERATURE_LOW: 8,
  TARGET_TEMPERATURE_HIGH: 16,
  HAS_ON_STATE: 32,
  HAS_AWAY_STATE: 64
};
var WATER_HEATER_STATE_INBOUND_BITS = {
  awayState: { bit: WaterHeaterStateFlags.AWAY },
  onState: { bit: WaterHeaterStateFlags.ON }
};
var WATER_HEATER_STATE_COMMAND_BITS = {
  awayState: { bit: WaterHeaterStateFlags.AWAY, hasFieldBit: WaterHeaterCommandHasField.HAS_AWAY_STATE },
  onState: { bit: WaterHeaterStateFlags.ON, hasFieldBit: WaterHeaterCommandHasField.HAS_ON_STATE }
};
var VoiceAssistantEvent = {
  ERROR: 0,
  RUN_START: 1,
  RUN_END: 2,
  STT_START: 3,
  STT_END: 4,
  INTENT_START: 5,
  INTENT_END: 6,
  TTS_START: 7,
  TTS_END: 8,
  WAKE_WORD_START: 9,
  WAKE_WORD_END: 10,
  STT_VAD_START: 11,
  STT_VAD_END: 12,
  TTS_STREAM_START: 98,
  TTS_STREAM_END: 99,
  INTENT_PROGRESS: 100
};
var InfraredCapabilityFlags = {
  TRANSMITTER: 1 << 0,
  RECEIVER: 1 << 1
};
var RadioFrequencyCapabilityFlags = {
  TRANSMITTER: 1 << 0,
  RECEIVER: 1 << 1
};
var SerialProxyLineStateFlags = {
  RTS: 1 << 0,
  DTR: 1 << 1
};

// owy/companion/bridge/src/device/pipeline.ts
var DEFAULT_NO_SPEECH_MS = 8e3;
var DEFAULT_TTS_STALL_MS = 5e3;
var DEFAULT_THINKING_MS = 3e4;
var DEFAULT_PLAYBACK_READY_TIMEOUT_MS = 5e3;
var VoiceTurn = class {
  clock;
  link;
  log;
  conversationId;
  onNoSpeech;
  onFailure;
  onPhase;
  noSpeechMs;
  ttsStallMs;
  thinkingMs;
  playbackReadyTimeoutMs;
  _phase = "created";
  deferTimer = null;
  deferredText = null;
  deferredEnd = null;
  noSpeechTimer = null;
  stallTimer = null;
  thinkingTimer = null;
  continueConversation = false;
  speechStarted = false;
  streamOpen = false;
  _audioBytesSent = 0;
  constructor(options) {
    this.clock = options.clock ?? systemClock;
    this.link = options.link;
    this.log = options.logger;
    this.conversationId = options.conversationId;
    this.onNoSpeech = options.onNoSpeech;
    this.onFailure = options.onFailure;
    this.onPhase = options.onPhase;
    this.noSpeechMs = options.timers?.noSpeechMs ?? DEFAULT_NO_SPEECH_MS;
    this.ttsStallMs = options.timers?.ttsStallMs ?? DEFAULT_TTS_STALL_MS;
    this.thinkingMs = options.timers?.thinkingMs ?? DEFAULT_THINKING_MS;
    this.playbackReadyTimeoutMs = options.playbackReadyTimeoutMs ?? DEFAULT_PLAYBACK_READY_TIMEOUT_MS;
  }
  get phase() {
    return this._phase;
  }
  get finished() {
    return this._phase === "finished";
  }
  get audioBytesSent() {
    return this._audioBytesSent;
  }
  setPhase(phase) {
    if (this._phase === phase) return;
    this._phase = phase;
    this.onPhase?.(phase);
  }
  /** Opens the run: the device is now streaming mic audio to us. */
  start() {
    if (this._phase !== "created") return;
    this.link.sendEvent(VoiceAssistantEvent.RUN_START);
    this.link.sendEvent(VoiceAssistantEvent.STT_START);
    this.setPhase("listening");
    this.armNoSpeechTimer();
  }
  /** Speech/VAD or the first nonempty input transcript proves someone spoke. */
  markSpeechStarted() {
    if (this._phase !== "listening" || this.speechStarted) return;
    this.speechStarted = true;
    this.clearNoSpeechTimer();
    this.link.sendEvent(VoiceAssistantEvent.STT_VAD_START);
  }
  /** The user's turn ended: stop the mic on the device and hand over the transcript. */
  endListening(transcript) {
    if (this._phase !== "listening") return;
    this.clearNoSpeechTimer();
    this.link.sendEvent(VoiceAssistantEvent.STT_VAD_END);
    this.link.sendEvent(VoiceAssistantEvent.STT_END, [{ name: "text", value: transcript }]);
    this.setPhase("thinking");
    this.armThinkingTimer();
  }
  /**
   * First response audio is on its way: open the TTS stream on the device.
   * Wait for the firmware to acknowledge microphone shutdown. The caller
   * keeps audio in a paused PacedSpeaker until phase=speaking.
   */
  beginSpeaking(text = "") {
    if (this._phase === "listening") this.endListening("");
    if (this._phase !== "thinking" || this.deferTimer) return;
    this.clearThinkingTimer();
    if (this.link.isPlaybackReady()) return this.openStream(text);
    this.deferredText = text;
    const deadline = this.clock.now() + this.playbackReadyTimeoutMs;
    this.deferTimer = this.clock.setInterval(() => {
      if (this.link.isPlaybackReady()) {
        this.clock.clearInterval(this.deferTimer);
        this.deferTimer = null;
        this.openStream(this.deferredText ?? "");
      } else if (this.clock.now() >= deadline) {
        this.fail("audio-bus-timeout", "No pude preparar el audio. Prob\xE1 de nuevo.");
      }
    }, 20);
  }
  /** True while a deferred stream open is pending (frames are being held). */
  get deferred() {
    return this.deferTimer !== null;
  }
  openStream(text) {
    if (this._phase !== "thinking") return;
    this.deferredText = null;
    this.sendIntentEnd(text);
    this.link.sendEvent(VoiceAssistantEvent.TTS_START, [{ name: "text", value: text || "Respuesta de Owy" }]);
    this.link.sendEvent(VoiceAssistantEvent.TTS_END, [{ name: "url", value: "api://owy/response" }]);
    this.link.sendEvent(VoiceAssistantEvent.TTS_STREAM_START);
    this.streamOpen = true;
    this.setPhase("speaking");
    this.armStallTimer();
    if (this.deferredEnd) {
      const end = this.deferredEnd;
      this.deferredEnd = null;
      this.endSpeaking(end);
    }
  }
  /** Streams 16 kHz / 16-bit / mono PCM to the device speaker. */
  pushAudio(pcm16k) {
    if (pcm16k.length === 0) return;
    if (this._phase !== "speaking") return;
    this.link.sendAudio(pcm16k, false);
    this._audioBytesSent += pcm16k.length;
    this.armStallTimer();
  }
  /**
   * Closes the TTS stream and the run. `continueConversation` re-opens the mic
   * on the device after playback (hands-free follow-up); `speech` is the final
   * transcript, sent again in INTENT_END so the device has the definitive text.
   */
  endSpeaking(options = {}) {
    if (this.deferTimer) {
      this.deferredEnd = options;
      return;
    }
    if (this._phase !== "speaking") return;
    this.clearStallTimer();
    this.continueConversation = options.continueConversation ?? false;
    this.sendIntentEnd(options.speech ?? "");
    this.closeStream();
    this.finish();
  }
  /** Reports a pipeline error to the device and ends the run. */
  fail(code, message) {
    if (this._phase === "finished") return;
    this.log.info(`turn error ${code}: ${message}`);
    this.closeStream();
    this.link.sendEvent(VoiceAssistantEvent.ERROR, [
      { name: "code", value: code },
      { name: "message", value: message }
    ]);
    this.finish();
    this.onFailure?.();
  }
  /** Terminates the run unconditionally (tap interrupt, disconnect, late cleanup). Idempotent. */
  finish() {
    if (this._phase === "finished") return;
    if (this.deferTimer) this.clock.clearTimeout(this.deferTimer);
    this.deferTimer = null;
    this.deferredEnd = null;
    this.clearNoSpeechTimer();
    this.clearStallTimer();
    this.clearThinkingTimer();
    this.closeStream();
    this.link.sendEvent(VoiceAssistantEvent.RUN_END);
    this.setPhase("finished");
  }
  /** Sends TTS_STREAM_END exactly once per opened stream. */
  closeStream() {
    if (!this.streamOpen) return;
    this.streamOpen = false;
    this.link.sendEvent(VoiceAssistantEvent.TTS_STREAM_END);
  }
  sendIntentEnd(speech) {
    this.link.sendEvent(VoiceAssistantEvent.INTENT_END, [
      { name: "conversation_id", value: this.conversationId },
      { name: "continue_conversation", value: this.continueConversation ? "1" : "0" },
      { name: "speech", value: speech }
    ]);
  }
  armNoSpeechTimer() {
    this.clearNoSpeechTimer();
    if (this.noSpeechMs <= 0) return;
    this.noSpeechTimer = this.clock.setTimeout(() => {
      this.noSpeechTimer = null;
      if (this._phase !== "listening") return;
      this.finish();
      this.onNoSpeech?.();
    }, this.noSpeechMs);
  }
  clearNoSpeechTimer() {
    if (this.noSpeechTimer) this.clock.clearTimeout(this.noSpeechTimer);
    this.noSpeechTimer = null;
  }
  armStallTimer() {
    this.clearStallTimer();
    if (this.ttsStallMs <= 0) return;
    this.stallTimer = this.clock.setTimeout(() => {
      this.stallTimer = null;
      if (this._phase !== "speaking") return;
      this.log.warn("TTS stream stalled; closing the run");
      this.endSpeaking();
    }, this.ttsStallMs);
  }
  clearStallTimer() {
    if (this.stallTimer) this.clock.clearTimeout(this.stallTimer);
    this.stallTimer = null;
  }
  armThinkingTimer() {
    this.clearThinkingTimer();
    if (this.thinkingMs <= 0) return;
    this.thinkingTimer = this.clock.setTimeout(() => {
      this.thinkingTimer = null;
      if (this._phase !== "thinking") return;
      this.fail("server_error", "El modelo no respondi\xF3 a tiempo");
    }, this.thinkingMs);
  }
  clearThinkingTimer() {
    if (this.thinkingTimer) this.clock.clearTimeout(this.thinkingTimer);
    this.thinkingTimer = null;
  }
};

// owy/companion/bridge/src/audio/pcm.ts
var PacedSpeaker = class {
  constructor(send, opts) {
    this.send = send;
    this.opts = opts;
    this.clock = opts.clock ?? systemClock;
  }
  send;
  opts;
  clock;
  queue = [];
  sentBytes = 0;
  startTime = null;
  timer = null;
  ended = false;
  onDrained = null;
  stopped = false;
  push(frame) {
    if (this.stopped || frame.length === 0) return;
    this.queue.push(frame);
    if (this.timer === null) {
      this.timer = this.clock.setInterval(() => this.drain(), this.opts.tickMs ?? 20);
    }
    this.drain();
  }
  /** No more audio will be pushed; `done` fires once the queue has drained at pace. */
  finish(done) {
    if (this.stopped) return;
    this.ended = true;
    this.onDrained = done;
    if (this.timer === null) {
      done();
      this.onDrained = null;
      return;
    }
    this.drain();
  }
  /** Aborts playback (tap interrupt, disconnect): drops the queue, no callback. */
  stop() {
    this.stopped = true;
    if (this.timer) this.clock.clearInterval(this.timer);
    this.timer = null;
    this.queue = [];
    this.onDrained = null;
  }
  drain() {
    if (this.stopped) return;
    if (this.opts.isReady && !this.opts.isReady()) return;
    this.startTime ??= this.clock.now();
    const elapsed = this.clock.now() - this.startTime;
    let allowed = Math.floor(this.opts.bytesPerSecond * (elapsed + this.opts.leadMs) / 1e3);
    const leadBytes = this.opts.bytesPerSecond * this.opts.leadMs / 1e3;
    if (allowed - this.sentBytes > leadBytes) {
      this.startTime = this.clock.now() - this.sentBytes * 1e3 / this.opts.bytesPerSecond;
      allowed = this.sentBytes + leadBytes;
    }
    while (this.queue.length > 0 && this.sentBytes < allowed) {
      const frame = this.queue.shift();
      this.send(frame);
      this.sentBytes += frame.length;
    }
    if (this.ended && this.queue.length === 0) {
      if (this.timer) this.clock.clearInterval(this.timer);
      this.timer = null;
      const cb = this.onDrained;
      this.onDrained = null;
      cb?.();
    }
  }
};

// owy/companion/emulator/bridge-adapter.ts
var VirtualClock = class {
  time = 0;
  next = 1;
  timers = /* @__PURE__ */ new Map();
  now = () => this.time;
  setTimeout = (callback, ms) => this.add(callback, ms, 0);
  setInterval = (callback, ms) => this.add(callback, ms, Math.max(1, ms));
  clearTimeout = (id) => {
    this.timers.delete(id);
  };
  clearInterval = this.clearTimeout;
  add(callback, ms, period) {
    const id = this.next++;
    this.timers.set(id, { at: this.time + Math.max(0, ms), period, callback });
    return id;
  }
  advance(time) {
    let iterations = 0;
    while (true) {
      let selected = 0, deadline = Infinity;
      for (const [id, t] of this.timers)
        if (t.at < deadline) {
          selected = id;
          deadline = t.at;
        }
      if (deadline > time) break;
      if (++iterations > 1e4) throw Error("Virtual timer runaway");
      const timer = this.timers.get(selected);
      this.time = deadline;
      if (timer.period) timer.at += timer.period;
      else this.timers.delete(selected);
      timer.callback();
    }
    this.time = time;
  }
};
var FixtureBridge = class {
  constructor(input) {
    this.input = input;
  }
  input;
  clock = new VirtualClock();
  turn = null;
  pacer = null;
  replies = 0;
  replyMs = 1200;
  hung = false;
  readyFault = false;
  transportStall = 0;
  held = [];
  state = { phase: 0, voice: "wake_word", settings: {} };
  events = [];
  outputTimer = null;
  trace(event) {
    this.events.push({ t: this.clock.now(), event, page: "bridge", voice: this.turn?.phase ?? "idle" });
  }
  log = {
    debug: (m) => this.trace(m),
    info: (m) => this.trace(m),
    warn: (m) => this.trace(m),
    error: (m) => this.trace(m),
    child: () => this.log
  };
  stop() {
    this.pacer?.stop();
    this.pacer = null;
    if (this.outputTimer) this.clock.clearTimeout(this.outputTimer);
    this.outputTimer = null;
    this.held = [];
    const turn = this.turn;
    this.turn = null;
    turn?.finish();
  }
  reset() {
    this.stop();
    this.clock = new VirtualClock();
    this.replies = 0;
    this.events = [];
    this.hung = false;
    this.readyFault = false;
    this.transportStall = 0;
  }
  observe(state) {
    this.state = state;
    if (state.phase === 2 && (!this.turn || this.turn.finished)) {
      this.trace("bridge.RUN_REQUEST");
      this.turn = new VoiceTurn({
        clock: this.clock,
        logger: this.log,
        conversationId: "fixture",
        timers: { noSpeechMs: this.hung ? 0 : 8e3 },
        link: {
          isPlaybackReady: () => this.state.phase === 3 && !this.readyFault,
          sendEvent: (kind, data) => {
            this.trace(`bridge.${Object.entries(VoiceAssistantEvent).find(([, v]) => v === kind)?.[0] ?? kind}`);
            this.input(30, [kind], data?.find((x) => x.name === "code")?.value);
          },
          sendAudio: (bytes, end) => {
            if (!end) this.input(31, [bytes.length]);
          }
        },
        onNoSpeech: () => this.trace("bridge.silent_idle"),
        onFailure: () => this.trace("bridge.failure")
      });
      this.turn.start();
      if (this.replies > 0)
        this.outputTimer = this.clock.setTimeout(() => this.speech(this.replies, this.replyMs), 800);
    }
    if ((state.phase === 0 || state.phase === 6 || state.voice === "privacy" || state.voice === "offline" || state.voice === "off" || state.voice === "calibrating") && this.turn && !this.turn.finished) {
      this.stop();
      this.replies = 0;
    }
  }
  speech(count, ms) {
    if (this.turn?.phase !== "listening") return;
    this.replies = Math.max(0, count - 1);
    this.replyMs = Math.max(80, Math.min(2e4, ms));
    this.turn.markSpeechStarted();
    this.turn.endListening("Una frase de prueba");
    const turn = this.turn;
    this.outputTimer = this.clock.setTimeout(() => {
      if (turn !== this.turn || turn.finished) return;
      turn.beginSpeaking("Respuesta de prueba");
      let sent = 0, stalled = false;
      const held = [];
      this.pacer = new PacedSpeaker(
        (frame) => {
          if (this.outputTimer) {
            held.push(frame);
            return;
          }
          if (!stalled && this.transportStall > 0 && sent >= 32e3) {
            stalled = true;
            held.push(frame);
            this.trace("transport.stall");
            this.outputTimer = this.clock.setTimeout(() => {
              this.outputTimer = null;
              this.trace(`transport.burst.${held.reduce((n, f) => n + f.length, 0)}B`);
              for (const f of held) turn.pushAudio(f);
              held.length = 0;
            }, this.transportStall);
            return;
          }
          sent += frame.length;
          turn.pushAudio(frame);
        },
        { clock: this.clock, bytesPerSecond: 32e3, leadMs: 100, isReady: () => turn.phase === "speaking" }
      );
      this.outputTimer = null;
      for (let left = this.replyMs * 32; left > 0; left -= 1024)
        this.pacer.push(new Uint8Array(Math.min(1024, left)));
      this.pacer.finish(() => {
        if (this.outputTimer) {
          const wait = this.clock.setInterval(() => {
            if (!this.outputTimer) {
              this.clock.clearInterval(wait);
              if (turn === this.turn) turn.endSpeaking();
            }
          }, 10);
        } else turn.endSpeaking();
      });
    }, 450);
  }
  advance(time) {
    this.clock.advance(time);
  }
};
export {
  FixtureBridge
};
