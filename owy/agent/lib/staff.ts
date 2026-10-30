/**
 * Who may do what through Owy. The OWU site decides: roles and permissions live there
 * (src/lib/authz/catalog.ts), managed from /admin/acceso, not in env vars.
 *
 * Every call made for someone carries who they are (`owuApi(ctx)`: their Slack or Telegram id, or
 * "anonymous" at the companion's kiosk), and the API authorizes that person, never beyond Owy's
 * key. Sensitive tools also ask first (`may`), so the model gets a clear "no" instead of an API
 * error, and the approval policy denies before the tool runs.
 *
 * Owy acting as itself (its operator over the eve channel, the companion unlocked with its PIN, the
 * weekly schedule) has no person behind it: its key's permissions decide.
 */
import { resolveActiveEvent } from "./board";
import { actorOf, owuApi, type ActorCtx } from "./owu-api";

export type ToolSessionCtx = ActorCtx & {
  session: {
    auth: {
      current?: {
        principalId?: string;
        principalType?: string;
        authenticator?: string;
        issuer?: string;
        attributes?: Record<string, unknown>;
      } | null;
    };
  };
};

/** Permissions as the site names them ("program:manage", "task:manage"…). */
export type Permission = string;

const TTL = 60_000;
const decided = new Map<string, { at: number; allowed: Promise<boolean> }>();

/**
 * Does the person behind `ctx` (or Owy itself) hold `permission`? Asked once a minute per person,
 * permission and event. `eventId` scopes community permissions (staff tasks, rooms) to the event's
 * community.
 */
export function may(ctx: ToolSessionCtx, permission: Permission, eventId?: string): Promise<boolean> {
  const authenticator = ctx.session?.auth?.current?.authenticator;
  // The companion's kiosk is anyone in front of it: never staff. Unlocked with its PIN it's the
  // device's staff mode, and the device's own key (scoped to its tools) caps every call it makes.
  if (authenticator === "companion") return Promise.resolve(false);
  if (authenticator === "companion-staff") return Promise.resolve(true);
  const actor = actorOf(ctx);
  const key = `${actor ?? "owy"}|${permission}|${eventId ?? ""}`;
  const hit = decided.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.allowed;

  const allowed = owuApi(ctx)
    .access.check({ permissions: [permission], ...(eventId ? { eventId } : {}) })
    .then((result) => result.allowed[permission] === true)
    .catch(() => false);
  // ponytail: a process-wide map; it holds one entry per person and permission asked in a minute
  decided.set(key, { at: Date.now(), allowed });
  if (decided.size > 2000) decided.clear();

  return allowed;
}

/** The app principal eve uses for scheduled runs (no person behind the turn). */
export function isScheduledRun(ctx: ToolSessionCtx): boolean {
  return ctx.session?.auth?.current?.authenticator === "app";
}

/** The companion unlocked with its on-device PIN (staff mode of the device). */
export function isCompanionStaff(ctx: ToolSessionCtx): boolean {
  return ctx.session?.auth?.current?.authenticator === "companion-staff";
}

const NOT_ALLOWED =
  "Esta acción es solo para el staff de la organización 🧉. Si necesitás un cambio, pedilo en el canal del staff o en la mesa de acreditación.";

/** Throws a friendly (Spanish) error when the person can't do this. */
export async function requireStaff(ctx: ToolSessionCtx, permission: Permission, eventId?: string): Promise<void> {
  if (!(await may(ctx, permission, eventId))) throw new Error(NOT_ALLOWED);
}

export async function requireStaffOrSchedule(ctx: ToolSessionCtx, permission: Permission): Promise<void> {
  if (!isScheduledRun(ctx)) await requireStaff(ctx, permission);
}

interface ApprovalPolicyCtx extends ToolSessionCtx {
  toolName: string;
  approvedTools: ReadonlySet<string>;
  toolInput?: unknown;
}

const DENIED = {
  type: "denied" as const,
  reason:
    "Acción denegada: la gestión del evento es solo para el staff. Explicale a la persona que lo pida en el canal del staff.",
};

/**
 * Gate for staff-only tools, used as a tool's `approval` policy: whoever can't do `permission`
 * is denied outright (the model gets the reason and the tool never runs). Staff execute
 * immediately; the API checks the same permission again on every call.
 *
 * To bring the buttons back, return "user-approval" here for the calls that should pause — Slack
 * needs Interactivity enabled for them to resolve.
 */
export function staffOnly(permission: Permission, options: { inEvent?: boolean } = {}) {
  return async (ctx: ApprovalPolicyCtx) => {
    // Community permissions (staff tasks, rooms) count in the active event's community
    const eventId = options.inEvent ? await resolveActiveEvent().then((event) => event.id, () => undefined) : undefined;

    return (await may(ctx, permission, eventId)) ? ("not-applicable" as const) : DENIED;
  };
}

/** Like `staffOnly`, but the weekly schedule (the app principal) may also run the tool. */
export function staffOrSchedule(permission: Permission) {
  const staffPolicy = staffOnly(permission);

  return (ctx: ApprovalPolicyCtx) => (isScheduledRun(ctx) ? ("not-applicable" as const) : staffPolicy(ctx));
}
