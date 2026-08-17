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

/** A community member; the roster Owy assigns tasks from. */
export interface CommunityMember {
  id: string;
  communityId: string;
  userId: string;
  role: "member" | "editor" | "admin" | "owner";
  name: string;
  email: string;
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
  cast: {
    getState: (input?: { eventId?: string }) => Promise<CastState>;
    setHighlightedNote: (input: { eventId?: string; trackId: string | null }) => Promise<CastState>;
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
      "x-api-key": requireApiKey(),
    }),
  });

  cachedClient = createORPCClient(link) as unknown as OwuApi;
  return cachedClient;
}
