import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { getBoard, resolveActiveEvent } from "../../../../agent/lib/board";
import type { Logger } from "../log";

/**
 * Owy's tools, mounted in the voice session.
 *
 * The agent's `defineTool` modules under `agent/tools/*.ts` are imported as
 * they are and executed outside eve with a small context shim. The only
 * thing the shim really has to get right is `ctx.session.auth.current`,
 * because that is what `agent/lib/staff.ts` inspects: the companion runs as
 * authenticator `companion` (never staff) or `companion-staff` (staff mode
 * unlocked from the PIN page on the device).
 */

export const TOOLS_DIR = path.resolve(import.meta.dirname, "../../../../agent/tools");

/** Tools that need eve runtime features the bridge cannot provide. */
export const SKIPPED_TOOLS = new Set<string>(["digitize_board_photo"]);

/** Structural view of an eve `defineTool` module (kept local so the bridge does not depend on eve's type exports). */
export interface OwyToolDefinition {
  description: string;
  inputSchema: unknown;
  execute(input: unknown, ctx: unknown): unknown;
  approval?: ApprovalPolicyLike | { request: ApprovalPolicyLike };
}

type ApprovalStatusLike =
  | undefined
  | boolean
  | "not-applicable"
  | "approved"
  | "denied"
  | "user-approval"
  | { type: "not-applicable" | "approved" | "denied" | "user-approval"; reason?: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- policies are typed against eve's own context; we only feed them the shim
type ApprovalPolicyLike = (ctx: any) => ApprovalStatusLike | Promise<ApprovalStatusLike>;

export interface ScreenCard {
  title: string;
  speaker?: string | null;
  room?: string | null;
  timeSlot?: string | null;
}

export type ScreenCommand =
  | { kind: "card"; card: ScreenCard }
  | { kind: "qr"; url?: string; caption?: string }
  | { kind: "text"; text: string }
  | { kind: "face"; state: FaceState };

export type FaceState = "idle" | "listening" | "thinking" | "speaking" | "happy" | "error" | "offline";

export interface ToolRuntime {
  deviceId: string;
  isStaff(): boolean;
  isMarketplaceOpen(): boolean;
  /** Milliseconds between proposals from the same device (staff exempt). */
  proposalCooldownMs: number;
  /** Optional host-owned history, retained when a web transport reconnects. */
  proposalHistory?: Map<string, number>;
  /** Public grid URL for QR codes; resolved at boot from the active event. */
  gridUrl?: string;
  onScreen?(command: ScreenCommand): void | Promise<void>;
  /** Reads the device speaker volume (0..100), or null when unknown. */
  getVolume?(): number | null;
  /** Sets the device speaker volume (0..100). */
  setVolume?(pct: number): void;
  logger: Logger;
  now?: () => Date;
}

export const DEFAULT_TOOL_TIMEOUT_MS = 20_000;

// ── Loading ───────────────────────────────────────────────────────────────

function isToolDefinition(value: unknown): value is OwyToolDefinition {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as OwyToolDefinition).description === "string" &&
    "inputSchema" in value &&
    typeof (value as OwyToolDefinition).execute === "function"
  );
}

export async function loadOwyToolDefinitions(dir = TOOLS_DIR): Promise<Map<string, OwyToolDefinition>> {
  const files = (await readdir(dir)).filter((file) => file.endsWith(".ts") && !file.endsWith(".d.ts"));
  const definitions = new Map<string, OwyToolDefinition>();

  for (const file of files.sort()) {
    const name = file.slice(0, -3);
    if (SKIPPED_TOOLS.has(name)) continue;
    const module = (await import(pathToFileURL(path.join(dir, file)).href)) as { default?: unknown };
    if (!isToolDefinition(module.default)) {
      throw new Error(`agent/tools/${file} no exporta un defineTool por defecto`);
    }
    definitions.set(name, module.default);
  }

  return definitions;
}

// ── Context shim ──────────────────────────────────────────────────────────

export interface ShimOptions {
  staff: boolean;
  deviceId: string;
  toolName: string;
  input: unknown;
  timeoutMs?: number;
}

/** Builds the `ToolContext` (+ `ApprovalContext`) that Owy's tools expect from eve. */
export function makeToolContext(options: ShimOptions): Record<string, unknown> {
  const auth = {
    authenticator: options.staff ? "companion-staff" : "companion",
    principalId: options.deviceId,
    principalType: "device",
    attributes: {} as Record<string, string>,
  };
  const unavailable = (what: string) => () => {
    throw new Error(`${what} no está disponible en el companion`);
  };

  return {
    session: {
      id: `device:${options.deviceId}`,
      auth: { current: auth, initiator: auth },
      turn: { id: `turn-${Date.now()}`, sequence: 0 },
    },
    approvedTools: new Set<string>(),
    callId: randomUUID(),
    toolName: options.toolName,
    toolInput: options.input,
    abortSignal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS),
    getSandbox: async () => unavailable("El sandbox")(),
    getSkill: unavailable("getSkill"),
    getToken: async () => unavailable("getToken")(),
    requireAuth: unavailable("requireAuth"),
  };
}

const USER_APPROVAL_MESSAGE =
  "Esta acción necesita una confirmación del staff que el companion no puede pedir. Pedila por Slack.";

/** Returns a denial message when the tool's approval policy blocks the call, otherwise null. */
export async function evaluateApproval(
  definition: OwyToolDefinition,
  ctx: Record<string, unknown>
): Promise<string | null> {
  const policy = typeof definition.approval === "function" ? definition.approval : definition.approval?.request;
  if (!policy) return null;

  const status = await policy(ctx);
  if (status === "denied") return "Acción denegada.";
  if (status === "user-approval" || status === true) return USER_APPROVAL_MESSAGE;
  if (typeof status === "object" && status !== null) {
    if (status.type === "denied") return status.reason ?? "Acción denegada.";
    if (status.type === "user-approval") return USER_APPROVAL_MESSAGE;
  }
  return null;
}

export async function runOwyTool(
  name: string,
  definition: OwyToolDefinition,
  input: unknown,
  runtime: ToolRuntime,
  overrides: { staff?: boolean } = {}
): Promise<unknown> {
  const staff = overrides.staff ?? runtime.isStaff();
  const ctx = makeToolContext({ staff, deviceId: runtime.deviceId, toolName: name, input });

  const denial = await evaluateApproval(definition, ctx);
  if (denial) {
    runtime.logger.info(`tool ${name} denied (staff=${staff})`);
    return { ok: false, denied: true, error: denial };
  }

  try {
    const output = await definition.execute(input, ctx);
    return trimForVoice(name, output);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    runtime.logger.warn(`tool ${name} failed: ${message}`);
    return { ok: false, error: message };
  }
}

// ── Voice-friendly output trimming ────────────────────────────────────────

const ID_KEYS = new Set(["id", "roomId", "scheduleId", "openSpaceId", "communityId", "trackId", "cardId"]);

/** Recursively drops database ids; the voice model addresses rooms, slots and cards by name anyway. */
export function dropIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropIds);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (ID_KEYS.has(key)) continue;
      out[key] = dropIds(entry);
    }
    return out;
  }
  return value;
}

export const MAX_FREE_SLOTS_SPOKEN = 3;

export function trimForVoice(name: string, output: unknown): unknown {
  if (!output || typeof output !== "object") return output;

  if (name === "get_openspace_board") {
    const board = output as {
      openSpace?: { name?: string };
      rooms?: { name: string; hasTV?: boolean; hasWhiteboard?: boolean }[];
      timeSlots?: { name: string; slot: string }[];
      cards?: { title: string; speaker?: string | null; room?: string; timeSlot?: string }[];
      freeCells?: { room: string; timeSlot: string }[];
    };
    const bySlot = new Map<string, string[]>();
    for (const card of board.cards ?? []) {
      const key = card.timeSlot ?? "sin horario";
      const line = `«${card.title}»${card.speaker ? ` de ${card.speaker}` : ""} en ${card.room ?? "sala sin definir"}`;
      bySlot.set(key, [...(bySlot.get(key) ?? []), line]);
    }
    const free = board.freeCells ?? [];
    return {
      openSpace: board.openSpace?.name,
      rooms: (board.rooms ?? []).map(
        (room) =>
          `${room.name}${room.hasTV ? " (tele)" : ""}${room.hasWhiteboard ? " (pizarra)" : ""}`
      ),
      timeSlots: (board.timeSlots ?? []).map((slot) => `${slot.name}: ${slot.slot}`),
      cardsBySlot: [...bySlot.entries()].map(([timeSlot, talks]) => ({ timeSlot, talks })),
      freeCellCount: free.length,
      freeCells: free.slice(0, 8).map((cell) => `${cell.room} ${cell.timeSlot}`),
    };
  }

  if (name === "find_free_slot") {
    const result = output as { freeCells?: { room: string; timeSlot: string }[]; note?: string; openSpace?: string };
    const cells = result.freeCells ?? [];
    return {
      openSpace: result.openSpace,
      options: cells.slice(0, MAX_FREE_SLOTS_SPOKEN).map((cell) => ({ room: cell.room, timeSlot: cell.timeSlot })),
      moreAvailable: Math.max(0, cells.length - MAX_FREE_SLOTS_SPOKEN),
      note: result.note,
    };
  }

  if (name === "find_track" || name === "move_track" || name === "swap_tracks" || name === "update_track_info") {
    return dropIds(output);
  }

  return output;
}

// ── Bridge-only tools ─────────────────────────────────────────────────────

const proposeTalkSchema = z.object({
  title: z.string().min(2).describe("Título de la charla, como lo dijo la persona"),
  speaker: z.string().min(1).describe("Nombre de quien la da"),
  room: z.string().min(1).describe("Sala elegida (nombre)"),
  timeSlot: z.string().min(1).describe("Horario elegido (nombre del bloque o hora, ej: '15:30')"),
  needsTV: z.boolean().optional().describe("Necesita tele/proyector"),
  needsWhiteboard: z.boolean().optional().describe("Necesita pizarra"),
  description: z.string().optional().describe("Una línea opcional sobre el tema"),
});

const showOnScreenSchema = z.object({
  kind: z.enum(["qr", "text", "card", "face"]).describe("qr = QR de la grilla; text = un texto corto; card = una card; face = expresión"),
  text: z.string().max(120).optional().describe("Texto corto para kind=text o caption del QR"),
  title: z.string().optional(),
  speaker: z.string().optional(),
  room: z.string().optional(),
  timeSlot: z.string().optional(),
  face: z.enum(["idle", "listening", "thinking", "speaking", "happy", "error", "offline"]).optional(),
});

function nowInMontevideo(now: Date): { hhmm: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("es-UY", {
    timeZone: "America/Montevideo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return { hhmm: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, minutes: hour * 60 + minute };
}

function toMinutes(hhmm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function buildCompanionToolSet(definitions: Map<string, OwyToolDefinition>, runtime: ToolRuntime): ToolSet {
  const set: ToolSet = {};

  for (const [name, definition] of definitions) {
    set[name] = tool({
      description: definition.description,
      inputSchema: definition.inputSchema as z.ZodType<Record<string, unknown>>,
      execute: async (input: unknown) => runOwyTool(name, definition, input, runtime),
    });
  }

  const lastProposalAt = runtime.proposalHistory ?? new Map<string, number>();
  const createTrack = definitions.get("create_track");

  set.propose_talk = tool({
    description:
      "Carga en la grilla del open space una charla propuesta en el mercado de ideas. Usala SOLO después de confirmar en voz alta título, speaker, sala y horario con la persona. Funciona mientras el mercado de ideas está abierto (o en modo staff).",
    inputSchema: proposeTalkSchema,
    execute: async (input) => {
      const staff = runtime.isStaff();
      if (!staff && !runtime.isMarketplaceOpen()) {
        return {
          ok: false,
          error:
            "El mercado de ideas está cerrado en este momento: las propuestas se toman solo durante el mercado. Que hablen con el staff.",
        };
      }
      const now = (runtime.now ?? (() => new Date()))().getTime();
      const last = lastProposalAt.get(runtime.deviceId) ?? 0;
      if (!staff && now - last < runtime.proposalCooldownMs) {
        const wait = Math.ceil((runtime.proposalCooldownMs - (now - last)) / 1000);
        return { ok: false, error: `Acabo de cargar una propuesta; esperá ${wait} segundos para la siguiente.` };
      }
      if (!createTrack) {
        return { ok: false, error: "La herramienta create_track no está disponible." };
      }

      // The marketplace policy is enforced right here, so the underlying tool
      // runs with a staff context on purpose.
      const result = (await runOwyTool("create_track", createTrack, input, runtime, { staff: true })) as {
        ok?: boolean;
        error?: string;
        card?: ScreenCard;
      };
      if (result?.ok === false || result?.error) return result;

      lastProposalAt.set(runtime.deviceId, now);
      const card: ScreenCard = {
        title: result.card?.title ?? input.title,
        speaker: result.card?.speaker ?? input.speaker,
        room: result.card?.room ?? input.room,
        timeSlot: result.card?.timeSlot ?? input.timeSlot,
      };
      await runtime.onScreen?.({ kind: "card", card });
      return { ok: true, card };
    },
  });

  set.show_on_screen = tool({
    description:
      "Muestra algo en la pantalla del companion: el QR de la grilla (kind=qr), un texto corto (kind=text), una card (kind=card) o una expresión de la cara (kind=face).",
    inputSchema: showOnScreenSchema,
    execute: async (input) => {
      let command: ScreenCommand;
      switch (input.kind) {
        case "qr":
          command = { kind: "qr", url: runtime.gridUrl, caption: input.text };
          break;
        case "text":
          command = { kind: "text", text: input.text ?? "" };
          break;
        case "card":
          command = {
            kind: "card",
            card: { title: input.title ?? "", speaker: input.speaker, room: input.room, timeSlot: input.timeSlot },
          };
          break;
        case "face":
          command = { kind: "face", state: input.face ?? "happy" };
          break;
      }
      await runtime.onScreen?.(command);
      return { ok: true, shown: command.kind };
    },
  });

  set.event_now = tool({
    description:
      "Qué hora es en Montevideo y qué bloque del open space está pasando ahora y cuál viene después, con las charlas del bloque actual. Usala para 'qué hay ahora', 'cuándo empieza el próximo bloque'.",
    inputSchema: z.object({}),
    execute: async () => {
      const board = await getBoard();
      const { hhmm, minutes } = nowInMontevideo((runtime.now ?? (() => new Date()))());
      const slots = board.schedules
        .map((schedule) => ({
          name: schedule.name,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          start: toMinutes(schedule.startTime),
          end: toMinutes(schedule.endTime),
        }))
        .filter((slot) => slot.start !== null)
        .sort((a, b) => (a.start as number) - (b.start as number));

      const current = slots.find((slot) => (slot.start as number) <= minutes && (slot.end ?? Infinity) > minutes) ?? null;
      const next = slots.find((slot) => (slot.start as number) > minutes) ?? null;
      const talksNow = current
        ? board.cards
            .filter((card) => card.timeSlot === `${current.startTime} - ${current.endTime}` || card.timeSlot === current.name)
            .map((card) => `«${card.title}» en ${card.room ?? "sala sin definir"}`)
        : [];

      return {
        now: hhmm,
        openSpace: board.openSpace.name,
        currentBlock: current ? { name: current.name, from: current.startTime, to: current.endTime, talks: talksNow } : null,
        nextBlock: next ? { name: next.name, from: next.startTime, to: next.endTime } : null,
      };
    },
  });

  set.set_volume = tool({
    description:
      "Ajusta el volumen del parlante del companion. Usá `level` (0 a 100) para un valor exacto, o `direction` para subir/bajar/máximo/mínimo. Ejemplos: 'subí el volumen' → direction up; 'ponelo al máximo' → direction max; 'bajá un poco' → direction down.",
    inputSchema: z.object({
      level: z.number().min(0).max(80).optional().describe("Volumen exacto 0-80 (80 es el máximo limpio)"),
      direction: z.enum(["up", "down", "max", "min"]).optional().describe("Cambio relativo"),
      step: z.number().min(1).max(100).optional().describe("Cuánto sube/baja con up/down (por defecto 15)"),
    }),
    execute: async (input) => {
      if (!runtime.setVolume) return { ok: false, error: "No hay dispositivo para ajustar el volumen." };
      const MAX = 80; // amp saturates above this
      const current = runtime.getVolume?.() ?? MAX;
      const delta = input.step ?? 15;
      let target: number;
      if (typeof input.level === "number") target = input.level;
      else if (input.direction === "max") target = MAX;
      else if (input.direction === "min") target = 0;
      else if (input.direction === "down") target = current - delta;
      else target = current + delta; // up / default
      target = Math.max(0, Math.min(MAX, Math.round(target)));
      runtime.setVolume(target);
      return { ok: true, volume: target, atMax: target >= MAX };
    },
  });

  return set;
}

/** Resolves the public grid URL for the active event (used by the QR page). */
export async function resolveGridUrl(publicSiteUrl: string): Promise<string> {
  const event = await resolveActiveEvent();
  const base = publicSiteUrl.replace(/\/$/, "");
  return `${base}/comunidad/${event.communitySlug}/events/${event.slug}/openspace`;
}

/** Executes a tool from the mounted ToolSet the way the realtime session hands calls over. */
export async function executeToolByName(tools: ToolSet, name: string, args: unknown, callId: string): Promise<unknown> {
  const entry = tools[name];
  if (!entry?.execute) return { ok: false, error: `Herramienta desconocida: ${name}` };
  return entry.execute(args as never, { toolCallId: callId, messages: [], context: undefined });
}
