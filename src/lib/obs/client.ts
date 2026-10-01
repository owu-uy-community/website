"use client";

import { useSyncExternalStore } from "react";
import OBSWebSocket, { EventSubscription, type RequestBatchRequest } from "obs-websocket-js";

import { OBS_CONFIG } from "app/lib/constants";
import { toast } from "components/shared/ui/toast-utils";
import type { Command } from "lib/orpc/obs-control/schemas";

/**
 * The tab's one connection to OBS (obs-websocket v5) as an external store:
 * `useObs()` renders confirmed state (what OBS said in an event), actions mark
 * a "pending" key that the matching event clears — a button only turns red or
 * green when OBS confirms. Reconnects with backoff while wanted; the volume
 * meters live in a separate store so 20 updates/s only re-render the strip.
 */
export type ObsConnection = "disconnected" | "connecting" | "connected" | "reconnecting";

export interface ObsInput {
  name: string;
  kind: string;
  muted: boolean;
  volumeDb: number;
}

export interface ObsState {
  connection: ObsConnection;
  error: string | null;
  /** host:port shown in the header. */
  address: string;
  scenes: string[];
  program: string;
  preview: string;
  studioMode: boolean;
  transitions: string[];
  transition: string;
  transitionMs: number;
  transitioning: boolean;
  inputs: ObsInput[];
  streaming: boolean;
  recording: boolean;
  streamMs: number;
  recordMs: number;
  skippedFrames: number;
  totalFrames: number;
  fps: number;
  cpu: number;
  /** pending key → issued at (ms). Keys: program:<scene> preview:<scene> studio mute:<input> stream record. */
  pending: Record<string, number>;
}

export interface ObsSettings {
  address: string;
  port: number;
  password: string;
}

export interface TransitionOptions {
  transition?: string;
  transitionMs?: number;
}

const INITIAL: ObsState = {
  connection: "disconnected",
  error: null,
  address: "",
  scenes: [],
  program: "",
  preview: "",
  studioMode: false,
  transitions: [],
  transition: "",
  transitionMs: 300,
  transitioning: false,
  inputs: [],
  streaming: false,
  recording: false,
  streamMs: 0,
  recordMs: 0,
  skippedFrames: 0,
  totalFrames: 0,
  fps: 0,
  cpu: 0,
  pending: {},
};

const SETTINGS_KEY = "obs-connection";
/** Same key the previous page used, so already-captured previews show up. */
const THUMBS_KEY = "obs-scene-previews";
const STATS_INTERVAL_MS = 5_000;
const THUMBS_INTERVAL_MS = 5_000;
const THUMB_WIDTH = 320;
const RECONNECT_MAX_MS = 30_000;
/** Scenes named like obs-web's convention stay out of the bus. */
const HIDDEN_PREFIX = "(hidden)";

export function loadSettings(): ObsSettings {
  const defaults = { address: OBS_CONFIG.defaults.address, port: Number(OBS_CONFIG.defaults.port), password: "" };
  if (typeof window === "undefined") return defaults;
  try {
    const stored = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<ObsSettings> | null;

    return stored ? { ...defaults, ...stored } : defaults;
  } catch {
    return defaults;
  }
}

export function saveSettings(settings: ObsSettings) {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function loadThumbs(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const stored = JSON.parse(window.localStorage.getItem(THUMBS_KEY) ?? "{}") as unknown;

    return stored && typeof stored === "object" ? (stored as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function isPrivateHost(host: string): boolean {
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local")) return true;
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const [, a, b] = match.map(Number);

  return a === 10 || (a === 172 && (b ?? 0) >= 16 && (b ?? 0) <= 31) || (a === 192 && b === 168);
}

/** `ws://` for LAN hosts, `wss://` for a tunnel/reverse proxy; an explicit scheme in the address wins. */
export function obsUrl({ address, port }: ObsSettings): string {
  const host = address.trim();
  if (/^wss?:\/\//.test(host)) return host;

  return `${isPrivateHost(host) ? "ws" : "wss"}://${host}:${port}`;
}

function peakToLevel(peak: number): number {
  if (!(peak > 0)) return 0;
  const db = 20 * Math.log10(peak);

  return Math.max(0, Math.min(1, 1 + db / 60));
}

function sceneNames(scenes: unknown): string[] {
  const list = (scenes as { sceneName: string; sceneIndex: number }[]) ?? [];

  // OBS lists scenes bottom-up (index 0 at the bottom); show them like the OBS UI does.
  return [...list]
    .sort((a, b) => b.sceneIndex - a.sceneIndex)
    .map((scene) => scene.sceneName)
    .filter((name) => !name.startsWith(HIDDEN_PREFIX));
}

class ObsClient {
  private obs = new OBSWebSocket();
  private state: ObsState = INITIAL;
  private listeners = new Set<() => void>();
  private meterListeners = new Set<() => void>();
  private levels: Record<string, number> = {};
  private nextLevels: Record<string, number> | null = null;
  private wanted = false;
  private settings: ObsSettings | null = null;
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private thumbsTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private thumbListeners = new Set<() => void>();
  private thumbs: Record<string, string> = loadThumbs();
  private walking = false;

  constructor() {
    this.bind();
  }

  // -- store -----------------------------------------------------------------

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.state;

  subscribeMeters = (listener: () => void) => {
    this.meterListeners.add(listener);

    return () => {
      this.meterListeners.delete(listener);
    };
  };

  getLevels = () => this.levels;

  subscribeThumbs = (listener: () => void) => {
    this.thumbListeners.add(listener);

    return () => {
      this.thumbListeners.delete(listener);
    };
  };

  getThumbs = () => this.thumbs;

  private setThumbs(next: Record<string, string>) {
    this.thumbs = next;
    try {
      window.localStorage.setItem(THUMBS_KEY, JSON.stringify(next));
    } catch {
      // quota — keep them in memory only
    }
    for (const listener of this.thumbListeners) listener();
  }

  private set(patch: Partial<ObsState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  private markPending(key: string) {
    this.clearPending(key);
    this.set({ pending: { ...this.state.pending, [key]: Date.now() } });
    this.pendingTimers.set(
      key,
      setTimeout(() => {
        this.clearPending(key);
        toast.error("OBS no confirmó el cambio", key.replace(/^[a-z]+:/, ""));
      }, OBS_CONFIG.timeouts.sceneSwitch)
    );
  }

  /** Clear one key or, with a trailing colon, every key under a prefix. */
  private clearPending(key: string) {
    const prefix = key.endsWith(":") ? key : null;
    const keys = Object.keys(this.state.pending).filter((k) => (prefix ? k.startsWith(prefix) : k === key));
    if (keys.length === 0) return;
    const pending = { ...this.state.pending };
    for (const k of keys) {
      delete pending[k];
      const timer = this.pendingTimers.get(k);
      if (timer) clearTimeout(timer);
      this.pendingTimers.delete(k);
    }
    this.set({ pending });
  }

  // -- connection ------------------------------------------------------------

  async connect(settings: ObsSettings): Promise<void> {
    this.settings = settings;
    this.wanted = true;
    this.retries = 0;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    await this.open();
  }

  async disconnect(): Promise<void> {
    this.wanted = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.stopStats();
    try {
      await this.obs.disconnect();
    } catch {
      // already closed
    }
    this.set({ ...INITIAL, address: this.state.address });
  }

  private async open(): Promise<void> {
    if (!this.settings) return;
    const address = `${this.settings.address}:${this.settings.port}`;
    this.set({ connection: this.retries ? "reconnecting" : "connecting", error: null, address });
    try {
      await this.obs.connect(obsUrl(this.settings), this.settings.password || undefined, {
        eventSubscriptions: EventSubscription.All | EventSubscription.InputVolumeMeters,
        rpcVersion: 1,
      });
      this.retries = 0;
      await this.load();
      this.set({ connection: "connected", error: null });
      this.startStats();
      this.startThumbs();
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo conectar a OBS";
      this.set({ connection: "disconnected", error: message });
      this.scheduleRetry();
      throw error;
    }
  }

  private scheduleRetry() {
    if (!this.wanted || this.retryTimer) return;
    const delay = Math.min(1_000 * 2 ** this.retries, RECONNECT_MAX_MS);
    this.retries += 1;
    this.set({ connection: "reconnecting" });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.open().catch(() => {
        // scheduleRetry already queued the next attempt
      });
    }, delay);
  }

  private async load(): Promise<void> {
    const [sceneList, studio, transitionList, currentTransition, inputList, stream, record] = await Promise.all([
      this.obs.call("GetSceneList"),
      this.obs.call("GetStudioModeEnabled"),
      this.obs.call("GetSceneTransitionList"),
      this.obs.call("GetCurrentSceneTransition").catch(() => null),
      this.obs.call("GetInputList"),
      this.obs.call("GetStreamStatus"),
      this.obs.call("GetRecordStatus"),
    ]);

    const inputs = await this.loadInputs(inputList.inputs as { inputName: string; inputKind: string }[]);

    this.set({
      scenes: sceneNames(sceneList.scenes),
      program: sceneList.currentProgramSceneName ?? "",
      preview: studio.studioModeEnabled ? (sceneList.currentPreviewSceneName ?? "") : "",
      studioMode: studio.studioModeEnabled,
      transitions: (transitionList.transitions as { transitionName: string }[]).map((t) => t.transitionName),
      transition: transitionList.currentSceneTransitionName ?? "",
      transitionMs: currentTransition?.transitionDuration ?? this.state.transitionMs,
      inputs,
      streaming: stream.outputActive,
      streamMs: stream.outputDuration,
      skippedFrames: stream.outputSkippedFrames,
      totalFrames: stream.outputTotalFrames,
      recording: record.outputActive,
      recordMs: record.outputDuration,
      pending: {},
    });
  }

  /** Inputs that answer GetInputMute are the ones with audio — that is the whole filter. */
  private async loadInputs(list: { inputName: string; inputKind: string }[]): Promise<ObsInput[]> {
    if (list.length === 0) return [];
    const requests: RequestBatchRequest[] = list.flatMap((input) => [
      { requestType: "GetInputMute", requestData: { inputName: input.inputName } },
      { requestType: "GetInputVolume", requestData: { inputName: input.inputName } },
    ]);
    const results = await this.obs.callBatch(requests, { haltOnFailure: false });
    const inputs: ObsInput[] = [];
    list.forEach((input, index) => {
      const mute = results[index * 2];
      const volume = results[index * 2 + 1];
      if (!mute?.requestStatus.result) return;
      const muteData = mute.responseData as { inputMuted: boolean } | undefined;
      const volumeData = volume?.responseData as { inputVolumeDb: number } | undefined;
      inputs.push({
        name: input.inputName,
        kind: input.inputKind,
        muted: muteData?.inputMuted ?? false,
        volumeDb: volumeData?.inputVolumeDb ?? 0,
      });
    });

    return inputs;
  }

  private startStats() {
    this.stopStats();
    this.statsTimer = setInterval(() => {
      if (this.state.connection !== "connected") return;
      Promise.all([this.obs.call("GetStreamStatus"), this.obs.call("GetRecordStatus"), this.obs.call("GetStats")])
        .then(([stream, record, stats]) =>
          this.set({
            streaming: stream.outputActive,
            streamMs: stream.outputDuration,
            skippedFrames: stream.outputSkippedFrames,
            totalFrames: stream.outputTotalFrames,
            recording: record.outputActive,
            recordMs: record.outputDuration,
            fps: stats.activeFps,
            cpu: stats.cpuUsage,
          })
        )
        .catch(() => {
          // connection is going away; ConnectionClosed handles it
        });
    }, STATS_INTERVAL_MS);
  }

  private stopStats() {
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.statsTimer = null;
    if (this.thumbsTimer) clearTimeout(this.thumbsTimer);
    this.thumbsTimer = null;
  }

  /**
   * Thumbnails of every scene, one batch every few seconds while the tab is
   * visible. OBS renders inactive scenes off-screen, so this never touches
   * program; sources that only run while active (browser sources with
   * "shutdown when not visible", capture devices) may look stale or black —
   * that is what `captureByWalking` is for.
   */
  private startThumbs() {
    const tick = async () => {
      this.thumbsTimer = null;
      if (this.state.connection !== "connected") return;
      if (document.visibilityState === "visible" && !this.walking) {
        await this.refreshThumbnails().catch(() => undefined);
      }
      if (this.state.connection === "connected") this.thumbsTimer = setTimeout(tick, THUMBS_INTERVAL_MS);
    };
    if (this.thumbsTimer) clearTimeout(this.thumbsTimer);
    this.thumbsTimer = setTimeout(tick, 250);
  }

  async refreshThumbnails(scenes = this.state.scenes): Promise<void> {
    if (scenes.length === 0) return;
    const shots = await this.screenshots(scenes, THUMB_WIDTH, 50);
    const next = { ...this.thumbs };
    scenes.forEach((name, index) => {
      const shot = shots[index];
      if (shot) next[name] = shot;
    });
    this.setThumbs(next);
  }

  /**
   * The old page's capture: put each scene on program for a moment and grab
   * it, so every source is really running. Disruptive — only before the show.
   */
  async captureByWalking(settleMs = 1_000): Promise<void> {
    this.ensureConnected();
    if (this.walking) return;
    this.walking = true;
    const original = this.state.program;
    const studio = this.state.studioMode;
    try {
      for (const name of this.state.scenes) {
        await this.obs.call("SetCurrentProgramScene", { sceneName: name });
        await new Promise((resolve) => setTimeout(resolve, settleMs));
        const [shot] = await this.screenshots([name], THUMB_WIDTH, 60);
        if (shot) this.setThumbs({ ...this.thumbs, [name]: shot });
      }
    } finally {
      this.walking = false;
      if (original) await this.obs.call("SetCurrentProgramScene", { sceneName: original }).catch(() => undefined);
      if (studio && this.state.preview)
        await this.obs.call("SetCurrentPreviewScene", { sceneName: this.state.preview }).catch(() => undefined);
    }
  }

  clearThumbnails() {
    this.setThumbs({});
  }

  private bind() {
    const obs = this.obs;
    obs.on("ConnectionClosed", () => {
      this.stopStats();
      if (this.state.connection === "disconnected") return;
      this.set({ connection: "disconnected", transitioning: false, pending: {} });
      for (const timer of this.pendingTimers.values()) clearTimeout(timer);
      this.pendingTimers.clear();
      this.scheduleRetry();
    });
    obs.on("ExitStarted", () => {
      this.set({ error: "OBS se está cerrando" });
    });
    obs.on("CurrentProgramSceneChanged", ({ sceneName }) => {
      this.clearPending("program:");
      this.set({ program: sceneName });
    });
    obs.on("CurrentPreviewSceneChanged", ({ sceneName }) => {
      this.clearPending("preview:");
      this.set({ preview: sceneName });
    });
    obs.on("SceneListChanged", ({ scenes }) => this.set({ scenes: sceneNames(scenes) }));
    obs.on("SceneNameChanged", () => {
      obs
        .call("GetSceneList")
        .then((list) => this.set({ scenes: sceneNames(list.scenes) }))
        .catch(() => undefined);
    });
    obs.on("StudioModeStateChanged", ({ studioModeEnabled }) => {
      this.clearPending("studio");
      this.set({ studioMode: studioModeEnabled, preview: studioModeEnabled ? this.state.preview : "" });
      if (studioModeEnabled) {
        obs
          .call("GetCurrentPreviewScene")
          .then((res) => this.set({ preview: res.sceneName ?? "" }))
          .catch(() => undefined);
      }
    });
    obs.on("SceneTransitionStarted", () => this.set({ transitioning: true }));
    obs.on("SceneTransitionEnded", () => this.set({ transitioning: false }));
    obs.on("SceneTransitionVideoEnded", () => this.set({ transitioning: false }));
    obs.on("CurrentSceneTransitionChanged", ({ transitionName }) => this.set({ transition: transitionName }));
    obs.on("CurrentSceneTransitionDurationChanged", ({ transitionDuration }) =>
      this.set({ transitionMs: transitionDuration })
    );
    obs.on("InputMuteStateChanged", ({ inputName, inputMuted }) => {
      this.clearPending(`mute:${inputName}`);
      this.set({
        inputs: this.state.inputs.map((input) => (input.name === inputName ? { ...input, muted: inputMuted } : input)),
      });
    });
    obs.on("InputVolumeChanged", ({ inputName, inputVolumeDb }) => {
      this.set({
        inputs: this.state.inputs.map((input) =>
          input.name === inputName ? { ...input, volumeDb: inputVolumeDb } : input
        ),
      });
    });
    const reloadInputs = () => {
      obs
        .call("GetInputList")
        .then((list) => this.loadInputs(list.inputs as { inputName: string; inputKind: string }[]))
        .then((inputs) => this.set({ inputs }))
        .catch(() => undefined);
    };
    obs.on("InputCreated", reloadInputs);
    obs.on("InputRemoved", reloadInputs);
    obs.on("InputNameChanged", reloadInputs);
    obs.on("InputVolumeMeters", ({ inputs }) => {
      const next: Record<string, number> = {};
      for (const input of inputs as { inputName: string; inputLevelsMul: number[][] }[]) {
        let peak = 0;
        for (const channel of input.inputLevelsMul ?? []) peak = Math.max(peak, channel[1] ?? 0);
        next[input.inputName] = peakToLevel(peak);
      }
      // Coalesce OBS's 20 Hz bursts to one paint.
      const first = this.nextLevels === null;
      this.nextLevels = next;
      if (first) {
        requestAnimationFrame(() => {
          this.levels = this.nextLevels ?? {};
          this.nextLevels = null;
          for (const listener of this.meterListeners) listener();
        });
      }
    });
    obs.on("StreamStateChanged", ({ outputActive, outputState }) => {
      if (outputState.endsWith("_STARTED") || outputState.endsWith("_STOPPED")) this.clearPending("stream");
      this.set({ streaming: outputActive, streamMs: outputActive ? this.state.streamMs : 0 });
    });
    obs.on("RecordStateChanged", ({ outputActive, outputState }) => {
      if (outputState.endsWith("_STARTED") || outputState.endsWith("_STOPPED")) this.clearPending("record");
      this.set({ recording: outputActive, recordMs: outputActive ? this.state.recordMs : 0 });
    });
  }

  // -- actions (all confirmed by events, see bind) ---------------------------

  private ensureConnected() {
    if (this.state.connection !== "connected") throw new Error("Sin conexión a OBS");
  }

  private async applyTransition(options: TransitionOptions = {}) {
    if (options.transition) await this.obs.call("SetCurrentSceneTransition", { transitionName: options.transition });
    if (options.transitionMs != null)
      await this.obs.call("SetCurrentSceneTransitionDuration", { transitionDuration: options.transitionMs });
  }

  async setProgram(sceneName: string, options: TransitionOptions = {}): Promise<void> {
    this.ensureConnected();
    if (this.state.program === sceneName && !this.state.transitioning) return;
    await this.applyTransition(options);
    this.markPending(`program:${sceneName}`);
    await this.obs.call("SetCurrentProgramScene", { sceneName });
  }

  async setPreview(sceneName: string): Promise<void> {
    this.ensureConnected();
    if (!this.state.studioMode) throw new Error("Activá el modo estudio para usar preview");
    if (this.state.preview === sceneName) return;
    this.markPending(`preview:${sceneName}`);
    await this.obs.call("SetCurrentPreviewScene", { sceneName });
  }

  /** TAKE: preview → program with the current (or given) transition. */
  async take(options: TransitionOptions = {}): Promise<void> {
    this.ensureConnected();
    if (!this.state.studioMode) throw new Error("Activá el modo estudio para usar TAKE");
    await this.applyTransition(options);
    if (this.state.preview) this.markPending(`program:${this.state.preview}`);
    await this.obs.call("TriggerStudioModeTransition");
  }

  /** CUT: preview → program instantly, leaving the selected transition as it was. */
  async cut(): Promise<void> {
    this.ensureConnected();
    if (!this.state.studioMode) throw new Error("Activá el modo estudio para usar CUT");
    const previous = this.state.transition;
    if (this.state.preview) this.markPending(`program:${this.state.preview}`);
    await this.obs.call("SetCurrentSceneTransition", { transitionName: "Cut" });
    try {
      await this.obs.call("TriggerStudioModeTransition");
    } finally {
      if (previous && previous !== "Cut")
        await this.obs.call("SetCurrentSceneTransition", { transitionName: previous }).catch(() => undefined);
    }
  }

  async setStudioMode(enabled: boolean): Promise<void> {
    this.ensureConnected();
    if (this.state.studioMode === enabled) return;
    this.markPending("studio");
    await this.obs.call("SetStudioModeEnabled", { studioModeEnabled: enabled });
  }

  async setTransition(name?: string, durationMs?: number): Promise<void> {
    this.ensureConnected();
    await this.applyTransition({ transition: name, transitionMs: durationMs });
  }

  async setMute(inputName: string, muted?: boolean): Promise<void> {
    this.ensureConnected();
    this.markPending(`mute:${inputName}`);
    if (muted === undefined) await this.obs.call("ToggleInputMute", { inputName });
    else await this.obs.call("SetInputMute", { inputName, inputMuted: muted });
  }

  async setVolume(inputName: string, db: number): Promise<void> {
    this.ensureConnected();
    await this.obs.call("SetInputVolume", { inputName, inputVolumeDb: db });
  }

  async setStream(action: "start" | "stop" | "toggle"): Promise<void> {
    this.ensureConnected();
    this.markPending("stream");
    if (action === "start") await this.obs.call("StartStream");
    else if (action === "stop") await this.obs.call("StopStream");
    else await this.obs.call("ToggleStream");
  }

  async setRecord(action: "start" | "stop" | "toggle"): Promise<void> {
    this.ensureConnected();
    this.markPending("record");
    if (action === "start") await this.obs.call("StartRecord");
    else if (action === "stop") await this.obs.call("StopRecord");
    else await this.obs.call("ToggleRecord");
  }

  async refresh(): Promise<void> {
    this.ensureConnected();
    await this.load();
  }

  /** JPEG data URLs of sources (scenes render even when not on air), one round trip for all. */
  async screenshots(sources: string[], width = 640, quality = 60): Promise<(string | null)[]> {
    if (this.state.connection !== "connected") return sources.map(() => null);
    const results = await this.obs.callBatch(
      sources.map((sourceName) => ({
        requestType: "GetSourceScreenshot",
        requestData: {
          sourceName,
          imageFormat: "jpg",
          imageWidth: width,
          imageHeight: Math.round((width * 9) / 16),
          imageCompressionQuality: quality,
        },
      })),
      { haltOnFailure: false }
    );

    return results.map((result) =>
      result.requestStatus.result ? ((result.responseData as { imageData: string }).imageData ?? null) : null
    );
  }

  /** Run a command from the bus (see src/lib/orpc/obs-control). */
  async execute(command: Command): Promise<void> {
    switch (command.type) {
      case "scene":
        return this.setProgram(command.payload.sceneName, command.payload);
      case "preview":
        return this.setPreview(command.payload.sceneName);
      case "take":
        return this.take(command.payload);
      case "cut":
        return this.cut();
      case "studio":
        return this.setStudioMode(command.payload.enabled);
      case "transition":
        return this.setTransition(command.payload.name, command.payload.durationMs);
      case "mute":
        return this.setMute(command.payload.inputName, command.payload.muted);
      case "volume":
        return this.setVolume(command.payload.inputName, command.payload.db);
      case "stream":
        return this.setStream(command.payload.action);
      case "record":
        return this.setRecord(command.payload.action);
    }
  }
}

// On window so a dev hot reload of this module keeps the live connection.
const globalClient = globalThis as unknown as { __owuObsClient?: ObsClient };

export function getObsClient(): ObsClient {
  globalClient.__owuObsClient ??= new ObsClient();

  return globalClient.__owuObsClient;
}

const serverSnapshot = () => INITIAL;
const noLevels: Record<string, number> = {};
const serverLevels = () => noLevels;
const noThumbs: Record<string, string> = {};
const serverThumbs = () => noThumbs;

export function useObs(): ObsState {
  const obs = getObsClient();

  return useSyncExternalStore(obs.subscribe, obs.getSnapshot, serverSnapshot);
}

export function useObsLevels(): Record<string, number> {
  const obs = getObsClient();

  return useSyncExternalStore(obs.subscribeMeters, obs.getLevels, serverLevels);
}

/** Scene name → JPEG data URL (from OBS while connected, cached across reloads). */
export function useObsThumbnails(): Record<string, string> {
  const obs = getObsClient();

  return useSyncExternalStore(obs.subscribeThumbs, obs.getThumbs, serverThumbs);
}
