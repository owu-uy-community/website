import { VoiceAssistantEvent as E, type VoiceAssistantEventData, type VoiceAssistantRequest } from "esphome-client";
import type { AudioPeer, DeviceTransport } from "../device/transport";
import type { DeviceHandlers } from "../device/esphome";
import type { FaceState, ScreenCard } from "../realtime/tools";
import type { WebGrant } from "./tickets";

/** Same 16 kHz frames and pipeline events as ESPHome; only the wire changes. */
export class BrowserDevice implements DeviceTransport, AudioPeer {
  run = 0;
  private ready = false;
  private active = false;
  private accepted = false;
  private closed = false;
  private volume = 65;
  /** Attached as another device's laptop audio: mic frames go to that device's turn. */
  attachedTo: string | null = null;
  private peerSink: ((pcm16k: Buffer) => void) | null = null;
  constructor(
    private handlers: DeviceHandlers,
    readonly grant: WebGrant,
    private send: (message: object | Buffer) => void,
    private disconnect: () => void
  ) {}
  async request() {
    if (this.closed || this.active) return;
    ++this.run;
    this.active = true;
    this.accepted = false;
    this.ready = false;
    await this.handlers.onRequestStart({ start: true } as VoiceAssistantRequest);
  }
  async cancel() {
    this.active = false;
    this.accepted = false;
    this.ready = false;
    await this.handlers.onRequestStop();
  }
  microphone(frame: Buffer) {
    if (frame.length !== 644) throw Error("Expected 20 ms PCM16 frame");
    if (frame.readUInt32LE(0) !== this.run || !this.active || !this.accepted) return;
    if (this.peerSink) this.peerSink(frame.subarray(4));
    else this.handlers.onAudio({ data: frame.subarray(4), end: false });
  }
  commit(run: number) {
    // Mirrored turns are closed by the physical device's pipeline, not the browser.
    if (this.peerSink) return;
    if (run === this.run && this.active && this.accepted) this.handlers.onAudio({ data: Buffer.alloc(0), end: true });
  }

  // ── AudioPeer: mirror a physical device's turn ─────────────────────────
  attach(deviceId: string, sink: (pcm16k: Buffer) => void) {
    this.attachedTo = deviceId;
    this.peerSink = sink;
    this.active = false;
    this.accepted = false;
    this.emit({ type: "attached", deviceId });
  }
  detach() {
    const was = this.attachedTo;
    this.attachedTo = null;
    this.peerSink = null;
    this.active = false;
    this.accepted = false;
    if (was) this.emit({ type: "detached", deviceId: was });
  }
  mirrorAccept() {
    if (this.closed) return;
    ++this.run;
    this.active = true;
    this.accepted = true;
    this.ready = true;
    this.emit({ type: "accepted" });
  }
  mirrorDecline() {
    this.active = false;
    this.accepted = false;
    this.emit({ type: "declined" });
  }
  playbackReady(run: number) {
    if (run === this.run && this.active) this.ready = true;
  }
  clientVolume(value: number) {
    this.volume = Math.round(Math.max(0, Math.min(80, value)));
  }
  acceptRequest() {
    this.accepted = true;
    this.emit({ type: "accepted" });
  }
  declineRequest() {
    this.active = false;
    this.emit({ type: "declined" });
  }
  sendEvent(event: E, data?: VoiceAssistantEventData[]) {
    this.emit({ type: "event", event: Object.entries(E).find(([, value]) => value === event)?.[0], data });
    if (event === E.RUN_END) {
      this.active = false;
      this.accepted = false;
    }
  }
  sendAudio(audio: Buffer, end = false) {
    if (this.closed || end || !this.active) return;
    const packet = Buffer.allocUnsafe(audio.length + 4);
    packet.writeUInt32LE(this.run, 0);
    audio.copy(packet, 4);
    this.send(packet);
  }
  emit(message: object) {
    if (!this.closed) this.send({ ...message, run: this.run });
  }
  isPlaybackReady() {
    return this.ready;
  }
  setFace(state: FaceState) {
    this.emit({ type: "screen", command: { kind: "face", state } });
  }
  setSpeakLevel(_level: number) {
    /* Browser meters actual drained playback, not queued audio. */
  }
  showCard(card: ScreenCard) {
    this.emit({ type: "screen", command: { kind: "card", card } });
  }
  showQr(url: string, caption = "") {
    this.emit({ type: "screen", command: { kind: "qr", url, caption } });
  }
  showText(text: string) {
    this.emit({ type: "screen", command: { kind: "text", text } });
  }
  isStaffMode() {
    return this.grant.staff;
  }
  isMarketplaceOpen() {
    return this.grant.marketplace;
  }
  getVolume() {
    return this.volume;
  }
  setVolume(pct: number) {
    this.clientVolume(pct);
    this.emit({ type: "volume", value: this.volume });
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.disconnect();
  }
}
