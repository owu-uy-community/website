import type { Db } from "../db";
import { auditLog } from "../db/schema";

export type AuditEntry = Omit<typeof auditLog.$inferInsert, "id" | "createdAt" | "data"> & {
  data?: Record<string, unknown>;
};

const MAX_STRING = 300;
const SECRET_KEY = /secret|token|password|key|otp|code/i;

/**
 * What an audit row keeps of a payload: long strings cut (photos arrive as data URLs) and anything
 * that looks like a credential replaced, at any depth.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, depth + 1));

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SECRET_KEY.test(key) ? "[redactado]" : redact(item, depth + 1),
    ])
  );
}

/** Append one row to the audit log, inside the caller's transaction when given one. */
export async function audit(db: Db, entry: AuditEntry) {
  await db.insert(auditLog).values({ ...entry, data: redact(entry.data ?? {}) as Record<string, unknown> });
}
