import type { VoiceAssistantEvent, VoiceAssistantEventData } from "esphome-client";
import type { HostSpeaker } from "../audio/host-speaker";
import type { AudioRoute } from "../audio/route";
import type { VoiceLink } from "./pipeline";
import type { AudioPeer, DeviceTransport } from "./transport";

/**
 * Where a turn's events and audio go. Events: the board (when it ran this turn)
 * and an attached browser. Audio: the turn's output — the Mac's speaker, the
 * browser, or the board — falling back frame by frame when that one is gone (an
 * unplugged PA, a closed tab): the browser, then the board (its speaker, or on
 * the knob its captions). Readiness is the board's only when the board plays.
 */
export class RouteLink implements VoiceLink {
  constructor(
    private readonly route: {
      /** Null for a turn Owy starts himself: the board runs no pipeline for it. */
      device: DeviceTransport | null;
      peer: () => AudioPeer | null;
      host: () => HostSpeaker | null | undefined;
      output: () => AudioRoute;
    }
  ) {}

  sendEvent(event: VoiceAssistantEvent, data?: VoiceAssistantEventData[]): void {
    this.route.device?.sendEvent(event, data);
    this.route.peer()?.sendEvent(event, data);
  }

  sendAudio(audio: Buffer, end = false): void {
    const output = this.route.output();
    const host = output === "host" ? this.route.host() : null;
    if (host?.ready) {
      if (audio.length) host.write(audio);
      return;
    }
    const peer = output === "device" ? null : this.route.peer();
    if (peer) peer.sendAudio(audio, end);
    else this.route.device?.sendAudio(audio, end);
  }

  /**
   * The board's readiness matters only when the board plays the answer (its mic must release the
   * shared bus first). The Mac or a browser start at once: waiting on the board over a slow wifi
   * timed out (audio-bus-timeout) and lost answers that never needed it.
   */
  isPlaybackReady(): boolean {
    const output = this.route.output();
    if (output === "host" && this.route.host()?.ready) return true;
    if (output !== "device" && this.route.peer()) return true;
    return this.route.device?.isPlaybackReady() ?? true;
  }
}
