import type { VoiceLink } from "./pipeline";
import type { FaceState, ScreenCard } from "../realtime/tools";

/** The gadget and web virtual device implement this same bridge-side contract. */
export interface DeviceTransport extends VoiceLink {
  acceptRequest(): void;
  declineRequest(): void;
  setFace(state: FaceState): void;
  setSpeakLevel(level: number): void;
  showCard(card: ScreenCard): void;
  showQr(url: string, caption?: string): void;
  showText(text: string): void;
  isStaffMode(): boolean;
  isMarketplaceOpen(): boolean;
  getVolume(): number | null;
  setVolume(pct: number): void;
  close(): void;
}
