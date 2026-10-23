"use client";

import { SOUNDS } from "./sounds";

export type PlayerSnapshot = {
  /** The browser lets this tab make sound: it took a tap or a key since it loaded (or never needed one). */
  unlocked: boolean;
  /** Bank sounds decoded and ready to start at once. */
  ready: number;
  failed: number;
  playing: { id: string; startedAt: number; seconds: number } | null;
};

/** A stop fades out instead of clicking; a sound cut by the next one fades faster. */
const STOP_FADE_S = 0.08;
const CHOKE_FADE_S = 0.03;

/**
 * The output's speaker. The whole bank is fetched and decoded when a tab becomes an output, and
 * plays through Web Audio: a press starts within one audio block. The <audio> element it replaces
 * downloaded each file on its first play (~200 ms on the venue Wi-Fi) and then waited on its own
 * media pipeline. One sound at a time, as before.
 */
class Player {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private volume = 1;
  private decoded = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private failed = new Set<string>();
  private voice: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  /** The press waiting on a sound still loading; a later press or a stop replaces it. */
  private waiting: symbol | null = null;
  private listeners = new Set<() => void>();
  private snapshot: PlayerSnapshot = { unlocked: false, ready: 0, failed: 0, playing: null };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  private update(patch: Partial<PlayerSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  private context() {
    if (!this.ctx) {
      const ctx = new AudioContext({ latencyHint: "interactive" });
      this.master = ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(ctx.destination);
      ctx.onstatechange = () => this.update({ unlocked: ctx.state === "running" });
      this.ctx = ctx;
      this.update({ unlocked: ctx.state === "running" });
    }
    return this.ctx;
  }

  /** Fetches and decodes the whole bank; what failed is tried again. */
  preload() {
    for (const sound of SOUNDS) void this.load(sound.id, sound.audioFile);
  }

  private load(id: string, file: string) {
    let pending = this.loading.get(id);
    if (!pending) {
      const ctx = this.context();
      pending = fetch(file)
        .then((response) => {
          if (!response.ok) throw new Error(`${file}: ${response.status}`);
          return response.arrayBuffer();
        })
        .then((data) => ctx.decodeAudioData(data))
        .then((buffer) => {
          this.decoded.set(id, buffer);
          this.failed.delete(id);
          return buffer;
        })
        .catch(() => {
          this.loading.delete(id);
          this.failed.add(id);
          return null;
        })
        .finally(() => this.update({ ready: this.decoded.size, failed: this.failed.size }));
      this.loading.set(id, pending);
    }
    return pending;
  }

  /** Call from a tap or a key: the browser only lets a page start sound after one. */
  unlock() {
    const ctx = this.context();
    if (ctx.state !== "running") void ctx.resume().catch(() => undefined);
  }

  /**
   * Starts `id`, cutting whatever was playing. False when the browser still blocks sound here.
   */
  play(id: string, file: string): boolean {
    const ctx = this.context();
    if (ctx.state !== "running") {
      // Inside a tap or a key the browser lets it start: the press that unlocks the tab plays too.
      // Without one (a controller's press reaching a tab nobody has touched) it can't, and a sound
      // queued now would come out whenever someone next touched the page.
      if (!navigator.userActivation?.isActive) return false;
      const press = Symbol(id);
      this.waiting = press;
      void ctx.resume().then(() => {
        if (this.waiting === press) this.play(id, file);
      });
      return true;
    }
    this.stop(CHOKE_FADE_S);

    const buffer = this.decoded.get(id);
    if (buffer) {
      this.start(id, buffer);
    } else {
      // Not decoded yet (a press in the first seconds, or a sound this tab's bank doesn't know):
      // it plays once it arrives, unless something else was pressed meanwhile.
      const press = Symbol(id);
      this.waiting = press;
      void this.load(id, file).then((loaded) => {
        if (loaded && this.waiting === press) this.start(id, loaded);
      });
    }
    return true;
  }

  private start(id: string, buffer: AudioBuffer) {
    const ctx = this.context();
    const gain = ctx.createGain();
    gain.connect(this.master!);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.onended = () => {
      gain.disconnect();
      if (this.voice?.source !== source) return;
      this.voice = null;
      this.update({ playing: null });
    };
    source.start();
    this.waiting = null;
    this.voice = { source, gain };
    this.update({ playing: { id, startedAt: Date.now(), seconds: buffer.duration } });
  }

  stop(fade = STOP_FADE_S) {
    this.waiting = null;
    const voice = this.voice;
    if (!voice || !this.ctx) return;
    this.voice = null;
    const now = this.ctx.currentTime;
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + fade);
    voice.source.stop(now + fade);
    this.update({ playing: null });
  }

  /** 0–1, for what is playing too. */
  setVolume(volume: number) {
    this.volume = volume;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.015);
  }
}

export const player = new Player();
