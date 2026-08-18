/**
 * Staff allowlist checks.
 *
 * Sensitive tools call `requireStaff(ctx)` themselves (authorization lives in
 * the tool, not only in the channel — someone who can start a turn must not
 * automatically get write access).
 *
 * - Slack principals carry `authenticator: "slack-webhook"` and the Slack user
 *   id in `attributes.user_id` → matched against OWY_STAFF_SLACK_IDS.
 * - Telegram principals carry `authenticator: "telegram-webhook"` and the
 *   numeric user id in `attributes.user_id` → matched against OWY_STAFF_TELEGRAM_IDS.
 * - The eve HTTP channel in local dev (`local-dev`) or behind the operator's
 *   basic-auth credential (`http-basic`) counts as staff: only the deployer
 *   holds those credentials.
 */

interface SessionAuthCurrent {
  principalId?: string;
  principalType?: string;
  authenticator?: string;
  issuer?: string;
  attributes?: Record<string, unknown>;
}

export interface ToolSessionCtx {
  session: {
    auth: {
      current?: SessionAuthCurrent | null;
    };
  };
}

function parseIdList(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0)
  );
}

export function isStaff(ctx: ToolSessionCtx): boolean {
  const auth = ctx.session?.auth?.current;
  if (!auth) return false;

  const userId = auth.attributes?.user_id;

  switch (auth.authenticator) {
    case "slack-webhook":
      return userId !== undefined && parseIdList(process.env.OWY_STAFF_SLACK_IDS).has(String(userId));
    case "telegram-webhook":
      return userId !== undefined && parseIdList(process.env.OWY_STAFF_TELEGRAM_IDS).has(String(userId));
    case "local-dev":
    case "http-basic":
      return true;
    default:
      return false;
  }
}

/** Throws a friendly (Spanish) error when the caller is not staff. */
export function requireStaff(ctx: ToolSessionCtx): void {
  if (!isStaff(ctx)) {
    throw new Error(
      "Esta acción es solo para el staff de la organización 🧉. Si necesitás un cambio, pedilo en el canal del staff o en la mesa de acreditación."
    );
  }
}

interface ApprovalPolicyCtx extends ToolSessionCtx {
  toolName: string;
  approvedTools: ReadonlySet<string>;
  toolInput?: unknown;
}

/**
 * Gate for staff-only tools, used as a tool's `approval` policy.
 *
 * Non-staff callers are denied outright — the model gets the reason and the
 * tool never runs. Staff execute immediately: no human-in-the-loop button.
 * The safety net is conversational (the instructions and skills tell Owy to
 * confirm before mutating) plus `requireStaff` inside every `execute`.
 *
 * To bring the buttons back, return "user-approval" here for the calls that
 * should pause — Slack needs Interactivity enabled for them to resolve.
 */
export function staffOnly() {
  return (ctx: ApprovalPolicyCtx) => {
    if (!isStaff(ctx)) {
      return {
        type: "denied" as const,
        reason:
          "Acción denegada: la gestión del evento es solo para el staff. Explicale a la persona que lo pida en el canal del staff.",
      };
    }

    return "not-applicable" as const;
  };
}
