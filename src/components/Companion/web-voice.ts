import { pcmLevel } from "../../../public/companion-audio/pcm.mjs";

export type VoiceStage =
  | "off"
  | "requesting"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "idle"
  | "muted"
  | "error"
  /** Attached as a physical device's laptop audio: mic + speakers follow that device's turns. */
  | "standby";
export type BridgeInfo = {
  model: string;
  voice: string;
  promptHash: string;
  tools: string[];
  siteConfigured: boolean;
  permissions: { writes: boolean; staff: boolean; marketplace: boolean };
};
export type ToolActivity = { name: string; status: string; ms?: number; detail?: string };
export type VoiceStatus = {
  stage: VoiceStage;
  message: string;
  input: string;
  output: string;
  bridge?: BridgeInfo;
  tools?: ToolActivity[];
  blocked?: boolean;
  /** Device id this browser is attached to as laptop audio (mic + speakers). */
  attached?: string;
  /** The current turn records a pitch (modo pitch): no auto-commit, the person ends it. */
  pitch?: boolean;
};
export type VoiceVisual = { phase: number; mic: number; speaker: number };
export type VoiceScopes = { writes: boolean; staff: boolean; marketplace: boolean };
export type DeviceCommand =
  | { kind: "card"; card: { title: string; speaker?: string; room?: string; timeSlot?: string } }
  | { kind: "text"; text: string }
  | { kind: "qr"; url: string; caption?: string }
  | { kind: "face"; state: string }
  /** What Owy's face feels while a sentence plays (bridge expression.ts). */
  | { kind: "expression"; expression: string; leadMs: number; strength: number }
  | { kind: "volume"; value: number }
  | { kind: "bridgeEvent"; event: string; run: number }
  /** A pre-rendered cue to play (public/companion-audio/clips/<id>.wav); the browser plays it itself. */
  | { kind: "clip"; id: string }
  /** Modo pitch: "name" invites a tap to say one's name, "idle" clears it. */
  | { kind: "pitchPrompt"; prompt: string };
type Ticket = { token: string; url: string; model: string; expiresAt: number; protocol: number };
type Dependencies = {
  media: () => Promise<MediaStream>;
  context: () => AudioContext;
  socket: (url: string) => WebSocket;
  ticket: (signal: AbortSignal, scopes: VoiceScopes) => Promise<Ticket>;
};
const defaults: Dependencies = {
  media: () =>
    navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    }),
  context: () => new AudioContext({ latencyHint: "interactive" }),
  socket: (url) => new WebSocket(url),
  ticket: async (signal, scopes) => {
    const r = await fetch("/api/companion/voice-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scopes),
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
    const data = await r.json();
    if (!r.ok) throw Error(data.error || "No se pudo iniciar la voz.");
    return data;
  },
};
const phase = (stage: VoiceStage) =>
  stage === "listening" ? 2 : stage === "thinking" ? 3 : stage === "speaking" ? 4 : 0;

/** Virtual gadget transport. Every live turn runs in the real Node DeviceSession.
 * The browser owns microphone/playback only; no provider prompts/tools/protocol here.
 */
export class WebVoice {
  status: VoiceStatus = { stage: "off", message: "Cuando quieras.", input: "", output: "" };
  private epoch = 0;
  private captureEpoch = 0;
  private resuming = false;
  private ctx?: AudioContext;
  private stream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private capture?: AudioWorkletNode;
  private silent?: GainNode;
  private gain?: GainNode;
  private analyser?: AnalyserNode;
  private socket?: WebSocket;
  private abort?: AbortController;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private watchdog?: ReturnType<typeof setTimeout>;
  private idleTimer?: ReturnType<typeof setTimeout>;
  private meter?: ReturnType<typeof setInterval>;
  private queue = new Set<AudioBufferSourceNode>();
  private nextAudio = 0;
  private complete = false;
  private discard = false;
  private stopped = true;
  private speechAt = 0;
  private speechFrames = 0;
  private speech = false;
  private micLevel = 0;
  private volume = 0.65;
  private quiet = false;
  private continuous = true;
  private run = 0;
  private bridgeReady = false;
  private deviceBlocked = false;
  private attachTo: string | null = null;
  private pitch = false;
  private sessionTimer?: ReturnType<typeof setTimeout>;
  private messageChain: Promise<void> = Promise.resolve();
  constructor(
    private changed: (state: VoiceStatus) => void,
    private visual: (state: VoiceVisual) => void,
    private cue: () => void,
    private deps: Dependencies = defaults,
    private deviceCommand: (command: DeviceCommand) => void = () => {}
  ) {}
  private update(stage: VoiceStage, message: string) {
    this.status = { ...this.status, stage, message };
    this.changed(this.status);
    this.visual({ phase: phase(stage), mic: 0, speaker: 0 });
  }
  private later(fn: () => void, ms: number) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
    return id;
  }
  private clear(id?: ReturnType<typeof setTimeout>) {
    if (id) {
      clearTimeout(id);
      this.timers.delete(id);
    }
  }
  setVolume(value: number) {
    this.volume = Math.max(0, Math.min(0.8, value / 100));
    if (this.gain && this.ctx)
      this.gain.gain.setTargetAtTime(this.quiet ? 0 : this.volume, this.ctx.currentTime, 0.015);
    if (this.bridgeReady) this.send({ type: "volume", value: Math.round(this.volume * 100) });
  }
  setContinuous(value: boolean) {
    this.continuous = value;
  }
  /**
   * `attachTo`: instead of running its own conversation, this browser becomes
   * that physical device's microphone and speakers (laptop mode). The device
   * keeps the trigger, the face and the captions; turns arrive as `accepted`.
   */
  async start(scopes: VoiceScopes = { writes: false, staff: false, marketplace: false }, attachTo?: string) {
    this.stop();
    this.stopped = false;
    this.attachTo = attachTo ?? null;
    const epoch = ++this.epoch;
    this.status = { stage: "requesting", message: "Permití el micrófono para hablar con Owy.", input: "", output: "" };
    this.changed(this.status);
    this.abort = new AbortController();
    try {
      // Resume during the click gesture, before requesting permission/network.
      const ctx = (this.ctx = this.deps.context());
      await ctx.resume();
      if (epoch !== this.epoch) return;
      this.gain = ctx.createGain();
      this.gain.gain.value = this.quiet ? 0 : this.volume;
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.gain.connect(this.analyser).connect(ctx.destination);
      await ctx.audioWorklet.addModule("/companion-audio/capture.worklet.js");
      if (epoch !== this.epoch) return;
      // As a device's laptop audio the browser may only be its speakers (the
      // device keeps its own mic): never block attaching on the mic prompt.
      if (!this.attachTo) await this.acquire(epoch);
      if (epoch !== this.epoch) return;
      this.update("connecting", "Conectando con Owy…");
      const ticket = await this.deps.ticket(this.abort.signal, scopes);
      if (epoch !== this.epoch) return;
      if (
        typeof ticket.token !== "string" ||
        typeof ticket.url !== "string" ||
        !/^[\w-]{43}$/.test(ticket.token) ||
        ticket.protocol !== 1 ||
        !Number.isFinite(ticket.expiresAt)
      )
        throw Error("Invalid voice session.");
      const url = new URL(ticket.url);
      if (
        url.search ||
        url.username ||
        url.password ||
        url.hash ||
        (url.protocol !== "wss:" && !(url.protocol === "ws:" && ["127.0.0.1", "localhost"].includes(url.hostname)))
      )
        throw Error("Invalid bridge address.");
      const socket = (this.socket = this.deps.socket(url.href));
      socket.binaryType = "arraybuffer";
      this.watchdog = this.later(() => this.fail("El bridge no respondió a tiempo. Probá de nuevo."), 20000);
      this.sessionTimer = this.later(
        () => this.stop("Terminaron los cinco minutos de sesión. Empezá otra cuando quieras."),
        Math.max(0, Math.min(300000, ticket.expiresAt - Date.now()))
      );
      socket.onopen = () => {
        if (epoch === this.epoch) this.send({ type: "auth", token: ticket.token, protocol: 1 });
      };
      socket.onmessage = ({ data }) => {
        this.messageChain = this.messageChain
          .then(async () => {
            if (epoch !== this.epoch) return;
            if ((typeof data === "string" ? data.length : data.byteLength) > 64 * 1024)
              throw Error("Voice message exceeded its limit.");
            if (typeof data === "string") await this.receive(JSON.parse(data));
            else if (data instanceof ArrayBuffer) this.play(data);
            else throw Error("Invalid bridge audio");
          })
          .catch(() => {
            if (epoch === this.epoch) this.fail("No se pudo leer el stream de voz. Reconectá.");
          });
      };
      socket.onerror = () => {
        if (epoch === this.epoch) this.fail("Falló la conexión de voz. Revisá la red y probá de nuevo.");
      };
      socket.onclose = (event) => {
        if (epoch === this.epoch)
          this.stop(
            event.code === 1000
              ? "La sesión del bridge terminó. Empezá otra cuando quieras."
              : `El bridge se desconectó${event.reason ? ` (${event.reason})` : ""}. Micrófono apagado; empezá de nuevo para reconectar.`
          );
      };
      const samples = new Float32Array(256);
      this.meter = setInterval(() => {
        if (!this.analyser || this.stopped) return;
        this.analyser.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((a, v) => a + v * v, 0) / samples.length);
        this.visual({ phase: phase(this.status.stage), mic: this.micLevel, speaker: Math.min(100, rms * 500) });
      }, 40);
    } catch (error) {
      if (epoch !== this.epoch) return;
      const name = error instanceof Error ? error.name : "";
      this.fail(
        name === "NotAllowedError"
          ? "Sin permiso de micrófono. Permitilo en el navegador y probá de nuevo."
          : name === "NotFoundError"
            ? "No se encontró un micrófono. Conectá uno y probá de nuevo."
            : error instanceof Error
              ? error.message
              : "La voz no pudo arrancar."
      );
    }
  }
  private async acquire(epoch: number, captureEpoch = this.captureEpoch) {
    if (this.stream?.getAudioTracks().some((t) => t.readyState === "live")) return;
    const stream = await this.deps.media();
    if (epoch !== this.epoch || captureEpoch !== this.captureEpoch || !this.ctx) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.stream = stream;
    for (const track of stream.getAudioTracks()) {
      track.enabled = false;
      track.onended = () => {
        if (!this.stopped) this.stop("Micrófono desconectado.");
      };
    }
    this.source = this.ctx.createMediaStreamSource(stream);
    this.capture = new AudioWorkletNode(this.ctx, "owy-capture");
    this.capture.onprocessorerror = () => this.fail("Se detuvo el procesamiento del micrófono. Reconectá.");
    this.silent = this.ctx.createGain();
    this.silent.gain.value = 0;
    this.source.connect(this.capture).connect(this.silent).connect(this.ctx.destination);
    this.capture.port.onmessage = ({ data }) => {
      if (epoch === this.epoch) this.microphone(data);
    };
  }
  private send(message: unknown) {
    if (this.socket?.readyState !== 1) return;
    if (this.socket.bufferedAmount > 128 * 1024) {
      this.fail("La conexión es muy lenta para audio en vivo. Reconectá.");
      return;
    }
    this.socket.send(JSON.stringify(message));
  }
  private microphone(bytes: ArrayBuffer) {
    if (this.status.stage !== "listening" || !this.stream?.getAudioTracks().some((t) => t.enabled)) return;
    const rms = pcmLevel(bytes);
    this.micLevel = Math.min(1, rms * 10);
    const now = performance.now();
    this.speechFrames = rms > 0.012 ? this.speechFrames + 1 : 0;
    if (this.speechFrames >= 3) {
      this.speechAt = now;
      this.speech = true;
      this.clear(this.idleTimer);
    }
    if (bytes.byteLength !== 640) return;
    const packet = new Uint8Array(bytes.byteLength + 4);
    new DataView(packet.buffer).setUint32(0, this.run, true);
    packet.set(new Uint8Array(bytes), 4);
    if ((this.socket?.bufferedAmount ?? 0) > 128 * 1024) {
      this.fail("La subida de audio es muy lenta. Reconectá.");
      return;
    }
    if (this.socket?.readyState === 1) this.socket.send(packet);
    // Attached: the device's pipeline (server VAD) ends the capture, so keep
    // streaming the trailing silence it needs instead of committing locally.
    // A pitch has pauses in it: the person ends it (or the bridge, after a long silence).
    if (!this.attachTo && !this.pitch && this.speech && now - this.speechAt > 700) this.finishTurn();
  }
  finishTurn() {
    if (this.status.stage !== "listening" || this.attachTo) return;
    this.clear(this.idleTimer);
    this.gate(false);
    this.send({ type: "commit", run: this.run });
    this.update("thinking", "Owy está pensando…");
    this.clear(this.watchdog);
    this.watchdog = this.later(() => this.fail("Owy tardó demasiado en responder. Empezá de nuevo."), 30000);
  }
  private gate(enabled: boolean) {
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = enabled));
    if (!enabled) this.micLevel = 0;
  }
  private releaseInput() {
    this.source?.disconnect();
    this.capture?.disconnect();
    this.silent?.disconnect();
    if (this.capture) {
      this.capture.port.onmessage = null;
      this.capture.port.close();
    }
    this.stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    this.source = undefined;
    this.capture = undefined;
    this.silent = undefined;
    this.stream = undefined;
    this.micLevel = 0;
  }
  /** `mode: "pitch"`: the turn records a talk proposal (modo pitch) instead of a conversation. */
  async resume(mode?: "pitch") {
    // Attached, the physical device starts the turns (`accepted`): a `start` from here (the
    // virtual Owy's tap or follow-up) makes the bridge close the socket.
    if (this.attachTo || this.resuming || this.deviceBlocked || this.stopped || this.socket?.readyState !== 1) return;
    this.resuming = true;
    const epoch = this.epoch;
    const captureEpoch = ++this.captureEpoch;
    try {
      await this.ctx?.resume();
      await this.acquire(epoch, captureEpoch);
      if (epoch !== this.epoch || captureEpoch !== this.captureEpoch) return;
      this.clear(this.idleTimer);
      this.clear(this.watchdog);
      this.speech = false;
      this.speechAt = 0;
      this.speechFrames = 0;
      this.discard = false;
      this.pitch = mode === "pitch";
      this.status.pitch = this.pitch;
      this.update("connecting", this.pitch ? "Preparando el pitch…" : "Preparando el turno en el bridge…");
      this.send({ type: "start", ...(this.pitch ? { mode: "pitch" } : {}) });
      this.watchdog = this.later(() => this.fail("El bridge no aceptó el turno. Reconectá."), 20000);
    } catch {
      if (epoch === this.epoch && captureEpoch === this.captureEpoch)
        this.fail("El micrófono no pudo reiniciarse. Reconectá.");
    } finally {
      if (captureEpoch === this.captureEpoch) this.resuming = false;
    }
  }
  mute() {
    // Attached: the virtual Owy's privacy, power and cancel are not the physical device's.
    if (this.attachTo) return;
    this.pitch = false;
    this.status.pitch = false;
    ++this.captureEpoch;
    this.resuming = false;
    this.discard = true;
    this.stopPlayback();
    this.clear(this.idleTimer);
    this.clear(this.watchdog);
    this.send({ type: "stop" });
    this.releaseInput();
    this.update("muted", "Micrófono apagado. Seguí cuando quieras.");
  }
  interrupt() {
    this.send({ type: "stop" });
    this.discard = true;
    this.stopPlayback();
    void this.resume();
  }
  syncDevice(settings: Record<string, number>, powered: boolean, calibrating: boolean) {
    const wasBlocked = this.deviceBlocked;
    this.deviceBlocked = !powered || !!settings.privacy || calibrating;
    this.status.blocked = this.deviceBlocked;
    if (this.quiet !== !!settings.quiet) {
      this.quiet = !!settings.quiet;
      if (this.gain && this.ctx)
        this.gain.gain.setTargetAtTime(this.quiet ? 0 : this.volume, this.ctx.currentTime, 0.015);
    }
    const volume = settings.volume;
    if (Math.round(this.volume * 100) !== volume) this.setVolume(volume);
    this.setContinuous(!!settings.continuous);
    if (this.deviceBlocked && !["off", "error", "idle", "muted"].includes(this.status.stage)) this.mute();
    if (this.deviceBlocked && ["idle", "muted"].includes(this.status.stage)) {
      const message = !powered
        ? "Microphone off: power the virtual device on to resume."
        : calibrating
          ? "Microphone off while calibrating. Resume after calibration finishes."
          : "Microphone off: turn off privacy in device settings to resume.";
      if (this.status.message !== message) this.update("muted", message);
    } else if (wasBlocked && !this.deviceBlocked && this.status.stage === "muted") {
      this.update("muted", "Micrófono apagado. El dispositivo está listo; seguí cuando quieras.");
    }
  }
  private async receive(message: any) {
    if (!message || typeof message.type !== "string") throw Error("Invalid bridge message");
    if (message.type === "ready") {
      if (message.protocol !== 1 || message.sampleRate !== 16000 || !Array.isArray(message.tools))
        throw Error("Unsupported bridge protocol");
      this.bridgeReady = true;
      this.status.bridge = message;
      this.setVolume(this.volume * 100);
      this.clear(this.watchdog);
      if (this.attachTo) {
        this.update("connecting", `Conectando este navegador como el audio de ${this.attachTo}…`);
        this.send({ type: "attach", deviceId: this.attachTo });
        this.watchdog = this.later(() => this.fail("El bridge no aceptó la conexión."), 10000);
      } else void this.resume();
      return;
    }
    if (message.type === "attached") {
      this.clear(this.watchdog);
      this.clear(this.sessionTimer); // the bridge keeps attached peers for the whole open space
      this.status.attached = String(message.deviceId);
      this.update("standby", `Este navegador es los parlantes de ${message.deviceId}. Esperando un turno…`);
      // Ask for the microphone now (not on the first turn), but in the background:
      // it is only needed when the device's Mic is set to "laptop".
      const epoch = this.epoch;
      this.acquire(epoch)
        .then(() => {
          if (epoch === this.epoch && this.status.stage === "standby" && this.stream)
            this.update(
              "standby",
              `Este navegador es el micrófono y los parlantes de ${message.deviceId}. Esperando un turno…`
            );
        })
        .catch(() => {});
      return;
    }
    if (message.type === "detached") {
      this.status.attached = undefined;
      this.gate(false);
      this.update("idle", "Desconectado. El dispositivo vuelve a su propio audio.");
      return;
    }
    if (message.type === "accepted") {
      // Attached, the device owns the turns: its follow-up can open while the
      // last words of the previous reply are still playing here.
      const idle = ["connecting", "standby"].includes(this.status.stage);
      const live = this.attachTo && ["listening", "thinking", "speaking"].includes(this.status.stage);
      if ((!idle && !live) || !Number.isSafeInteger(message.run) || message.run <= this.run) return;
      this.run = message.run;
      this.discard = false;
      this.clear(this.watchdog);
      this.update(
        "listening",
        this.attachTo
          ? `Te escucho para ${this.attachTo} con este micrófono.`
          : this.pitch
            ? "Grabando tu pitch. Tocá de nuevo (o Terminé el pitch) para mandarlo."
            : "Te escucho a través del bridge del gadget."
      );
      this.cue();
      this.later(() => {
        if (this.status.stage === "listening" && this.run === message.run) this.gate(true);
      }, 180);
      // The real VoiceTurn owns the 8-second silence deadline. This is only a
      // transport/liveness fallback and a maximum continuous input bound (a pitch may run two minutes).
      this.watchdog = this.later(
        () => {
          if (this.status.stage === "listening") this.finishTurn();
        },
        this.pitch ? 125_000 : 60_000
      );
      return;
    }
    if (message.type === "declined") {
      this.fail("El bridge no pudo conectar con el modelo. Probá de nuevo.");
      return;
    }
    if (message.run !== this.run || this.discard) return;
    if (message.type === "transcript" && typeof message.text === "string") {
      if (message.who === "input") this.status.input = (this.status.input + message.text).slice(-1500);
      if (message.who === "output") this.status.output = (this.status.output + message.text).slice(-2000);
      this.changed({ ...this.status });
    } else if (message.type === "tool") {
      this.status.tools = [
        ...(this.status.tools ?? []),
        { name: String(message.name).slice(0, 80), status: message.status, ms: message.ms, detail: message.detail },
      ].slice(-40);
      this.changed({ ...this.status });
    } else if (message.type === "screen") {
      if (message.command?.kind === "clip") void this.playClip(String(message.command.id));
      this.deviceCommand(message.command);
    } else if (message.type === "volume") {
      this.setVolume(message.value);
      this.deviceCommand({ kind: "volume", value: message.value });
    } else if (message.type === "event") {
      this.deviceCommand({ kind: "bridgeEvent", event: message.event, run: this.run });
      switch (message.event) {
        case "STT_END":
          this.gate(false);
          this.update("thinking", "Owy está pensando…");
          this.send({ type: "playbackReady", run: this.run });
          this.clear(this.watchdog);
          this.watchdog = this.later(() => this.fail("La respuesta del bridge tardó demasiado. Reconectá."), 35000);
          break;
        case "ERROR":
          if (this.attachTo) {
            // The device recovers on its own; this browser just goes back to standby.
            this.clear(this.watchdog);
            this.gate(false);
            this.stopPlayback();
            this.update("standby", `El turno terminó con un error en ${this.attachTo}. Esperando el próximo…`);
          } else this.fail("El bridge reportó un error en el turno de voz. Reconectá.");
          break;
        case "RUN_END":
          this.clear(this.watchdog);
          if (this.status.stage === "speaking") {
            this.complete = true;
            this.afterPlayback();
          } else if (this.attachTo && ["listening", "thinking"].includes(this.status.stage)) {
            this.gate(false);
            this.update("standby", `Esperando el próximo turno en ${this.attachTo}…`);
          } else if (["listening", "thinking"].includes(this.status.stage)) {
            const pitched = this.pitch;
            this.pitch = false;
            this.status.pitch = false;
            this.releaseInput();
            this.update(
              "idle",
              pitched
                ? "El pitch terminó sin una charla. Tocá Seguir para probar de nuevo."
                : "El bridge cerró la ventana de escucha. Tocá Seguir para una conversación nueva."
            );
          }
          break;
      }
    }
  }
  private play(packet: ArrayBuffer) {
    if (packet.byteLength < 6 || packet.byteLength > 4100 || packet.byteLength % 2) throw Error("Invalid bridge PCM");
    const data = new DataView(packet);
    if (data.getUint32(0, true) !== this.run || this.discard || !["thinking", "speaking"].includes(this.status.stage))
      return;
    if (!this.ctx || !this.gain) return;
    this.gate(false);
    this.clear(this.idleTimer);
    this.clear(this.watchdog);
    this.complete = false;
    this.watchdog = this.later(() => this.fail("La respuesta se trabó. Reconectá."), 30000);
    if (this.status.stage !== "speaking") this.update("speaking", "Owy está hablando. Podés interrumpir.");
    const buffer = this.ctx.createBuffer(1, (packet.byteLength - 4) / 2, 16000),
      channel = buffer.getChannelData(0);
    for (let i = 0; i < channel.length; i++) {
      channel[i] = data.getInt16(4 + i * 2, true) / 32768;
    }
    const start = Math.max(this.ctx.currentTime + 0.02, this.nextAudio);
    if (start - this.ctx.currentTime + buffer.duration > 15) throw Error("Voice playback queue exceeded 15 seconds.");
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain);
    this.queue.add(source);
    source.onended = () => {
      source.disconnect();
      this.queue.delete(source);
      this.afterPlayback();
    };
    this.nextAudio = start + buffer.duration;
    source.start(start);
  }
  private afterPlayback() {
    if (!this.complete || this.queue.size || this.stopped || this.discard || this.status.stage !== "speaking") return;
    this.complete = false;
    this.nextAudio = 0;
    const pitched = this.pitch;
    this.pitch = false;
    this.status.pitch = false;
    if (this.attachTo) {
      // The device decides whether a follow-up window opens; it will send `accepted` again.
      this.gate(false);
      this.update("standby", `Respuesta reproducida. Esperando el próximo turno en ${this.attachTo}…`);
    } else if (this.continuous && !pitched) void this.resume();
    else {
      this.releaseInput();
      this.update(
        "idle",
        pitched
          ? "Pitch cargado. Tocá el dispositivo para otro."
          : "Respuesta terminada. Tocá Seguir para hablar otra vez."
      );
    }
  }

  /** A pre-rendered cue (public/companion-audio/clips/<id>.wav) through the same gain, whatever the stage. */
  private async playClip(id: string) {
    const ctx = this.ctx;
    const gain = this.gain;
    if (!ctx || !gain || !/^[\w-]{1,40}$/.test(id)) return;
    try {
      const bytes = await (await fetch(`/companion-audio/clips/${id}.wav`, { cache: "force-cache" })).arrayBuffer();
      if (ctx !== this.ctx) return;
      const source = ctx.createBufferSource();
      source.buffer = await ctx.decodeAudioData(bytes);
      source.connect(gain);
      source.onended = () => source.disconnect();
      source.start();
    } catch {
      // No clip on this build: the bridge speaks the line instead.
    }
  }
  private stopPlayback() {
    for (const node of this.queue) {
      node.onended = null;
      try {
        node.stop();
      } catch {}
      node.disconnect();
    }
    this.queue.clear();
    this.nextAudio = 0;
    this.complete = false;
  }
  stop(message = "Conversación terminada. Micrófono apagado.") {
    this.stopped = true;
    this.bridgeReady = false;
    this.run = 0;
    this.attachTo = null;
    this.pitch = false;
    this.status.attached = undefined;
    this.status.pitch = false;
    ++this.captureEpoch;
    this.resuming = false;
    ++this.epoch;
    this.abort?.abort();
    this.abort = undefined;
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
    clearInterval(this.meter);
    this.releaseInput();
    this.stopPlayback();
    const socket = this.socket;
    this.socket = undefined;
    if (socket) {
      socket.onclose = null;
      socket.onerror = null;
      socket.onmessage = null;
      socket.onopen = null;
      // Tell the bridge why this browser leaves: its log is where a drop at the venue gets debugged.
      if (socket.readyState === 1) socket.send(JSON.stringify({ type: "detach", reason: message.slice(0, 200) }));
      socket.close();
    }
    void this.ctx?.close().catch(() => {});
    this.ctx = undefined;
    this.analyser = undefined;
    this.gain = undefined;
    this.discard = false;
    this.messageChain = Promise.resolve();
    this.update("off", message);
  }
  private fail(message: string) {
    this.stop(message);
    this.update("error", message);
  }
}
