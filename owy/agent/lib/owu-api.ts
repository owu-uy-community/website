import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

/**
 * Typed client for the OWU website oRPC API (`/api/orpc`).
 *
 * The contract below is a hand-maintained mirror of the slice of
 * `src/lib/orpc/router.ts` that Owy uses. It stays a plain interface (instead
 * of importing the website's `AppRouter` type) so owy's typecheck doesn't drag
 * in the whole website graph. If the website API changes, update this file.
 *
 * Auth: the website accepts the `x-owy-api-key` header as a service-account
 * credential and runs the request with an admin context (see
 * `src/app/api/orpc/[[...rest]]/route.ts`).
 */

// ---------------------------------------------------------------------------
// API shapes (pragmatic mirrors of the website schemas)
// ---------------------------------------------------------------------------

/**
 * An event as returned by `openSpaces.listForAdmin` (the site's multi-tenant
 * event switcher shape): every event of every community for a site-admin
 * caller like Owy, newest first.
 */
export interface AdminEventOption {
  id: string;
  name: string;
  slug: string;
  startDate: string;
  communityId: string;
  communityName: string;
  communitySlug: string;
}

export interface Room {
  id: string;
  name: string;
  description?: string | null;
  capacity?: number | null;
  hasTV?: boolean;
  hasWhiteboard?: boolean;
  isActive?: boolean;
  openSpaceId: string;
  color?: string | null;
  position?: number;
}

export interface Schedule {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  date?: string | Date;
  isActive?: boolean;
  highlightInKiosk?: boolean;
  openSpaceId: string;
}

/** Track in UI/"sticky note" shape: room and timeSlot are readable strings. */
export interface StickyNote {
  id: string;
  title: string;
  speaker?: string;
  description?: string;
  needsTV: boolean;
  needsWhiteboard: boolean;
  openSpaceId: string;
  scheduleId: string;
  roomId: string;
  room?: string;
  timeSlot?: string;
  /** Explicit room color (rooms.color); the UI falls back to a palette. */
  roomColor?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateTrackInput {
  title: string;
  speaker?: string;
  description?: string;
  needsTV?: boolean;
  needsWhiteboard?: boolean;
  openSpaceId: string;
  scheduleId: string;
  roomId: string;
  skipResourceValidation?: boolean;
}

export interface UpdateTrackData {
  title?: string;
  speaker?: string;
  description?: string;
  needsTV?: boolean;
  needsWhiteboard?: boolean;
  scheduleId?: string;
  roomId?: string;
  skipResourceValidation?: boolean;
}

export interface OBSQueueItem {
  id: string;
  sceneName: string;
  delay: number;
  position: number;
}

export interface OBSPreset {
  id: string;
  name: string;
  items: OBSQueueItem[];
}

export interface OBSQueueState {
  queueItems: OBSQueueItem[];
  isPlaying: boolean;
  currentItemIndex: number;
  directMode: boolean;
  presets: OBSPreset[];
  currentPreset: string;
  version: number;
}

export interface OBSUpdateData {
  queueItems?: OBSQueueItem[];
  isPlaying?: boolean;
  currentItemIndex?: number;
  directMode?: boolean;
  presets?: OBSPreset[];
  currentPreset?: string;
}

export interface CountdownState {
  isRunning: boolean;
  remainingSeconds: number;
  totalSeconds: number;
  lastUpdated: string;
  soundEnabled: boolean;
  targetTime?: string;
}

export interface CountdownUpdateInput {
  action: "start" | "pause" | "reset" | "setDuration" | "toggleSound" | "setTargetTime";
  durationSeconds?: number;
  targetTime?: string;
  /** Event whose countdown to drive; the API falls back to the legacy event. */
  eventId?: string;
}

/** Input for the website's OCR + AI spot suggestion (mirrors ProcessImageWithSuggestionSchema). */
export interface OcrSuggestionInput {
  imageData: string;
  existingNotes: {
    id?: string;
    title: string;
    speaker?: string;
    room: string;
    timeSlot: string;
    needsTV?: boolean;
    needsWhiteboard?: boolean;
  }[];
  roomsWithResources: { name: string; hasTV: boolean; hasWhiteboard: boolean }[];
  availableRooms: string[];
  availableTimeSlots: string[];
  additionalContext?: string;
}

export interface OcrSuggestionResponse {
  title: string;
  speaker: string;
  needsTV: boolean;
  needsWhiteboard: boolean;
  suggestedRoom: string;
  suggestedTimeSlot: string;
  reasoning: string;
  swapSuggestion?: { shouldSwap: boolean; talkToSwap?: string; swapReasoning?: string };
  alternatives?: { room: string; timeSlot: string; reasoning: string }[];
}

export interface OwuApi {
  openSpaces: {
    /** Every event the caller may operate; site-admin (Owy) sees all, newest first. */
    listForAdmin: () => Promise<AdminEventOption[]>;
    listByCommunity: (input: { communityId: string }) => Promise<AdminEventOption[]>;
  };
  schedules: {
    getByOpenSpace: (input: { openSpaceId: string }) => Promise<Schedule[]>;
  };
  rooms: {
    getByOpenSpace: (input: { openSpaceId: string }) => Promise<Room[]>;
  };
  tracks: {
    list: (input: { openSpaceId: string }) => Promise<StickyNote[]>;
    create: (input: CreateTrackInput) => Promise<StickyNote>;
    update: (input: { id: string; data: UpdateTrackData }) => Promise<StickyNote>;
    delete: (input: { id: string }) => Promise<unknown>;
    swap: (input: { trackAId: string; trackBId: string }) => Promise<unknown>;
  };
  obsQueue: {
    getState: (input: { instanceId: number }) => Promise<OBSQueueState>;
    updateState: (input: { instanceId: number; data: OBSUpdateData }) => Promise<OBSQueueState>;
  };
  countdown: {
    getState: (input?: { eventId?: string }) => Promise<CountdownState>;
    updateState: (input: CountdownUpdateInput) => Promise<CountdownState>;
  };
  ocr: {
    processImageWithSuggestion: (input: OcrSuggestionInput) => Promise<OcrSuggestionResponse>;
  };
  dashboard: {
    getStats: (input?: { eventId?: string }) => Promise<unknown>;
  };
  eventbrite: {
    getSummary: () => Promise<unknown>;
  };
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export function owuApiUrl(): string {
  return (process.env.OWU_API_URL ?? "https://owu.uy").replace(/\/$/, "");
}

function requireApiKey(): string {
  const key = process.env.OWY_API_KEY;
  if (!key) {
    throw new Error("OWY_API_KEY no está configurada: Owy no puede hablar con la API de OWU.");
  }
  return key;
}

let cachedClient: OwuApi | null = null;

export function owuApi(): OwuApi {
  if (cachedClient) return cachedClient;

  const link = new RPCLink({
    url: `${owuApiUrl()}/api/orpc`,
    headers: () => ({
      "x-owy-api-key": requireApiKey(),
    }),
  });

  cachedClient = createORPCClient(link) as unknown as OwuApi;
  return cachedClient;
}
