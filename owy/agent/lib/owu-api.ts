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
 * Auth: the key travels as `x-api-key`. Better Auth's apiKey plugin turns it
 * into a session for the bot's own user account, so the API authorizes Owy
 * like any other admin user. Mint keys on the site with `pnpm owy:key`.
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

/** Live OBS status as reported by the executor tab (obsControl.status). */
export interface OBSStatus {
  instanceId: number;
  connected: boolean;
  programScene: string | null;
  previewScene: string | null;
  studioMode: boolean;
  transitionName: string | null;
  transitionMs: number | null;
  streaming: boolean;
  recording: boolean;
  lastError: string | null;
  scenes: string[];
  audioInputs: { name: string; muted: boolean }[];
  executorId: string | null;
  executorOnline: boolean;
  statusAt: string | null;
  currentCueId: string | null;
}

/** A command for the executor tab (obsControl.send); see the site's obs-control schemas. */
export type OBSCommand =
  | { type: "scene"; payload: { sceneName: string; transition?: string; transitionMs?: number } }
  | { type: "preview"; payload: { sceneName: string } }
  | { type: "take"; payload: Record<string, never> }
  | { type: "cut"; payload: Record<string, never> }
  | { type: "studio"; payload: { enabled: boolean } }
  | { type: "mute"; payload: { inputName: string; muted?: boolean } }
  | { type: "stream"; payload: { action: "start" | "stop" | "toggle" } }
  | { type: "record"; payload: { action: "start" | "stop" | "toggle" } };

export interface OBSCue {
  id: string;
  instanceId: number;
  name: string;
  color: string | null;
  obsScene: string | null;
  stageScene: string | null;
  sound: string | null;
  notes: string | null;
  hotkey: string | null;
  position: number;
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
  /** Event whose countdown to drive. */
  eventId: string;
}

/** Input for the website's OCR + AI spot suggestion (mirrors ProcessImageWithSuggestionSchema). */
export interface OcrSuggestionInput {
  /** The event whose board the suggestion is for; the site loads the board. */
  eventId: string;
  /** The photo as a data URL, at most ~4 MB. */
  imageData: string;
  additionalContext?: string;
}

// ---------------------------------------------------------------------------
// Staff coordination (event-day task board + announcements)
// ---------------------------------------------------------------------------

export type StaffTaskType = "task" | "ongoing" | "milestone";
export type StaffTaskStatus = "pending" | "in_progress" | "done" | "blocked";

export interface StaffTaskAssignee {
  userId: string;
  name: string;
  image: string | null;
}

export interface StaffTask {
  id: string;
  openSpaceId: string;
  title: string;
  notes: string | null;
  type: StaffTaskType;
  /** "YYYY-MM-DD" */
  dayDate: string;
  /** "HH:MM" */
  startTime: string | null;
  endTime: string | null;
  minPeople: number | null;
  location: string | null;
  status: StaffTaskStatus;
  statusUpdatedById: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  assignees: StaffTaskAssignee[];
}

export interface CreateStaffTaskInput {
  eventId: string;
  title: string;
  notes?: string;
  type?: StaffTaskType;
  /** "YYYY-MM-DD" */
  dayDate: string;
  startTime?: string | null;
  endTime?: string | null;
  minPeople?: number | null;
  location?: string | null;
  assigneeIds?: string[];
}

export interface UpdateStaffTaskData {
  title?: string;
  notes?: string | null;
  type?: StaffTaskType;
  dayDate?: string;
  startTime?: string | null;
  endTime?: string | null;
  minPeople?: number | null;
  location?: string | null;
  /** Replaces the whole assignee set when present. */
  assigneeIds?: string[];
}

/** A community member; the roster Owy assigns tasks from (no contact details). */
export interface CommunityMember {
  id: string;
  communityId: string;
  userId: string;
  role: "member" | "editor" | "admin" | "owner";
  name: string;
  image: string | null;
  createdAt: string;
}

export interface StaffAnnouncement {
  id: string;
  openSpaceId: string;
  body: string;
  urgent: boolean;
  audience: "all" | "task";
  taskId: string | null;
  taskTitle: string | null;
  author: { id: string; name: string; image: string | null } | null;
  createdAt: string;
  ackCount: number;
  ackedByMe: boolean;
  acks: { userId: string; name: string; image: string | null; ackedAt: string }[];
  /** Expected recipients who have NOT acked yet — the useful half on event day. */
  pending: { userId: string; name: string; image: string | null }[];
}

// ---------------------------------------------------------------------------
// Cast to screen
// ---------------------------------------------------------------------------

export interface CastState {
  trackId: string | null;
  note: StickyNote | null;
}

export interface OcrSuggestionResponse {
  title: string;
  speaker: string;
  needsTV: boolean;
  needsWhiteboard: boolean;
  /** Raw REQUISITOS answer, including the "NO" checkbox and an unreadable strip. */
  requisito?: "tv" | "pizarra" | "ambos" | "ninguno" | "ilegible";
  /** Fields whose handwriting was unclear — confirm these with the staffer first. */
  revisar?: ("speaker" | "title" | "requisito")[];
  suggestedRoom: string;
  suggestedTimeSlot: string;
  reasoning: string;
  /** True when the AI call failed: the "suggestion" is just the first free cell. */
  degraded?: boolean;
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
  obsControl: {
    status: (input: { instanceId: number }) => Promise<OBSStatus>;
    send: (input: { instanceId: number } & OBSCommand) => Promise<{ id: string; executorOnline: boolean }>;
  };
  obsCue: {
    list: (input: { instanceId: number }) => Promise<OBSCue[]>;
    fire: (input: { id: string }) => Promise<{ cue: OBSCue; commandId: string | null }>;
    step: (input: {
      instanceId: number;
      direction: "next" | "prev";
    }) => Promise<{ cue: OBSCue; commandId: string | null } | null>;
  };
  countdown: {
    getState: (input: { eventId: string }) => Promise<CountdownState>;
    updateState: (input: CountdownUpdateInput) => Promise<CountdownState>;
  };
  ocr: {
    processImageWithSuggestion: (input: OcrSuggestionInput) => Promise<OcrSuggestionResponse>;
  };
  cast: {
    getState: (input: { eventId: string }) => Promise<CastState>;
    setHighlightedNote: (input: { eventId: string; trackId: string | null }) => Promise<CastState>;
  };
  staffTasks: {
    list: (input: { eventId: string }) => Promise<StaffTask[]>;
    create: (input: CreateStaffTaskInput) => Promise<StaffTask>;
    update: (input: { eventId: string; taskId: string; data: UpdateStaffTaskData }) => Promise<StaffTask>;
    delete: (input: { eventId: string; taskId: string }) => Promise<unknown>;
    setStatus: (input: { eventId: string; taskId: string; status: StaffTaskStatus }) => Promise<StaffTask>;
    assign: (input: { eventId: string; taskId: string; userId: string }) => Promise<StaffTask>;
    unassign: (input: { eventId: string; taskId: string; userId: string }) => Promise<StaffTask>;
    /** Moves every task of a day starting at/after `fromTime` by ±minutes. */
    shiftFrom: (input: {
      eventId: string;
      dayDate: string;
      fromTime: string;
      deltaMinutes: number;
    }) => Promise<unknown>;
    roster: (input: { eventId: string }) => Promise<CommunityMember[]>;
    announcements: {
      list: (input: { eventId: string }) => Promise<StaffAnnouncement[]>;
      /** Returns only the new id; read it back with `list` for author/acks. */
      create: (input: {
        eventId: string;
        body: string;
        urgent?: boolean;
        audience?: "all" | "task";
        taskId?: string;
      }) => Promise<{ id: string }>;
    };
  };
  dashboard: {
    getStats: (input: { eventId: string }) => Promise<unknown>;
  };
  eventbrite: {
    getSummary: () => Promise<unknown>;
  };
  /** Owy Stage: the video wall (site: src/lib/owy-stage/scenes.ts). */
  owyStage: {
    /** Mirrors a companion's face + running transcript onto the wall's Owy. */
    setFace: (input: StageFaceInput) => Promise<unknown>;
  };
}

export type StageFaceState = "idle" | "listening" | "thinking" | "speaking" | "happy" | "error" | "offline";

export interface StageFaceInput {
  state: StageFaceState;
  transcript?: { who: "input" | "output"; text: string };
  source?: string;
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

  // oRPC v2: `origin` is the site, `url` the path (the site must be on v2 too —
  // v1 and v2 clients and servers cannot talk to each other).
  const link = new RPCLink({
    origin: owuApiUrl(),
    url: "/api/orpc",
    headers: () => ({
      "x-api-key": requireApiKey(),
    }),
  });

  cachedClient = createORPCClient(link) as unknown as OwuApi;
  return cachedClient;
}
