import { createId } from "@paralleldrive/cuid2";
import { and, eq, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { Effect } from "effect";

import {
  BRIDGE_TARGET,
  checkSetting,
  settingSpec,
  targetScope,
  type SettingCheck,
  type SettingKey,
} from "../../../../owy/companion/bridge/src/web/registry";
import { audit } from "../../authz/audit";
import { companionSettings } from "../../db/schema";
import { COMPANION_CHANNEL } from "../../realtime/channels";
import { query, transaction } from "../db";
import { Invalid } from "../errors";
import { CurrentUser, Realtime } from "../services";
import {
  BridgeStatusSchema,
  SettingTargetSchema,
  type CompanionCommand,
  type CompanionEvent,
  type CompanionState,
  type ReportInput,
  type SettingChange,
  type SettingRow,
} from "./schemas";

/**
 * The companion's control plane. /admin/companion → Control writes the settings, the bridge on the
 * venue Mac reports every 15 s (what is in effect, changes made on a device, command results) and
 * gets every row back, so each heartbeat is a full sync. Both hear the changes on
 * COMPANION_CHANNEL as they happen; commands only ever go out live.
 */

type Row = typeof companionSettings.$inferSelect;

/** The bridge's last report: the "status" row of the bridge. */
const STATUS_KEY = "status";
const isStatus = (row: Pick<Row, "target" | "key">) => row.target === BRIDGE_TARGET && row.key === STATUS_KEY;
/** A bridge that hasn't reported for this long doesn't get commands (it reports every 15 s). */
const COMMAND_FRESH_MS = 30_000;
/** Who a report may say made a change: the device itself, Owy asked out loud, the bridge's own page. */
const DEVICE_WRITERS = new Set(["dispositivo", "voz", "local"]);

const toWire = (row: Row): SettingRow => ({
  target: row.target,
  key: row.key,
  value: row.value as SettingRow["value"],
  setBy: row.setBy,
  setAt: row.setAt.toISOString(),
});

const excluded = (column: AnyPgColumn) => sql.raw(`excluded."${column.name}"`);

/** The last writer wins (by `setAt`), and a row whose value stays the same is left alone. */
const LAST_WRITER_WINS = sql`${companionSettings.setAt} < ${excluded(companionSettings.setAt)}
  and ${companionSettings.value} is distinct from ${excluded(companionSettings.value)}`;

/**
 * Write rows; `setWhere` picks the existing ones that give way (all of them when absent). What comes
 * back is what was written. JSON `null` is a value (a setting cleared on purpose): Drizzle would
 * send it as SQL NULL.
 */
const upsert = (rows: Row[], setWhere: SQL | undefined) =>
  rows.length === 0
    ? Effect.succeed<Row[]>([])
    : query((db) =>
        db
          .insert(companionSettings)
          .values(rows.map((row) => ({ ...row, value: row.value === null ? sql`'null'::jsonb` : row.value })))
          .onConflictDoUpdate({
            target: [companionSettings.target, companionSettings.key],
            set: {
              value: excluded(companionSettings.value),
              setBy: excluded(companionSettings.setBy),
              setAt: excluded(companionSettings.setAt),
            },
            setWhere,
          })
          .returning()
      );

/** One row per setting, the latest (the later one on a tie): a statement can't write a row twice. */
function latest(rows: Row[]): Row[] {
  const bySetting = new Map<string, Row>();
  for (const row of rows) {
    const id = `${row.target}\n${row.key}`;
    const seen = bySetting.get(id);
    if (!seen || seen.setAt <= row.setAt) bySetting.set(id, row);
  }

  return [...bySetting.values()];
}

/** What the registry makes of a change: its value as stored (trimmed, "" → null), or why not. */
function checkChange({ target, key, value }: Pick<SettingRow, "target" | "key" | "value">): SettingCheck {
  if (!SettingTargetSchema.safeParse(target).success) return { ok: false, error: `«${target}»: dispositivo inválido` };
  const checked = checkSetting(key, value);
  if (!checked.ok) return checked;
  const setting = settingSpec(key as SettingKey);
  if (targetScope(target) !== setting.scope)
    return {
      ok: false,
      error: `${setting.label} es un ajuste ${setting.scope === "bridge" ? "del bridge" : "de cada dispositivo"}`,
    };

  return checked;
}

const broadcast = (event: CompanionEvent) =>
  Effect.gen(function* () {
    const realtime = yield* Realtime;
    yield* realtime.publish(COMPANION_CHANNEL, event.ev, event.pl);
  });

const broadcastRows = (rows: Row[]) =>
  rows.length > 0 ? broadcast({ ev: "rows", pl: { rows: rows.map(toWire) } }) : Effect.void;

const allRows = () =>
  query((db) => db.select().from(companionSettings).orderBy(companionSettings.target, companionSettings.key));

/** Every stored setting and the bridge's last report. */
export const state = () =>
  allRows().pipe(
    Effect.map((rows): CompanionState => {
      const stored = rows.find(isStatus);
      const status = stored ? (BridgeStatusSchema.safeParse(stored.value).data ?? null) : null;

      return {
        rows: rows.filter((row) => !isStatus(row)).map(toWire),
        status,
        seenAt: stored && status ? stored.setAt.toISOString() : null,
      };
    })
  );

/**
 * Settings from the panel, all or none: each must be a registry key aimed at its scope (the bridge,
 * or a device) with a value it accepts. Stamped with the server's clock and audited; the bridge and
 * other panels hear the ones that changed. Returns the requested settings as stored.
 */
export const set = (changes: SettingChange[]) =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;
    const setAt = new Date();
    const setBy = `admin:${me.name}`.slice(0, 120);
    const rows: Row[] = [];
    for (const change of changes) {
      const checked = checkChange(change);
      if (!checked.ok) return yield* new Invalid({ message: checked.error });
      rows.push({ target: change.target, key: change.key, value: checked.value, setBy, setAt });
    }
    const wanted = latest(rows);
    const same = (row: Pick<Row, "target" | "key">) => (other: Pick<Row, "target" | "key">) =>
      other.target === row.target && other.key === row.key;

    const { written, stored } = yield* transaction(
      Effect.gen(function* () {
        const before = yield* query((db) =>
          db
            .select()
            .from(companionSettings)
            .where(
              or(
                ...wanted.map((row) =>
                  and(eq(companionSettings.target, row.target), eq(companionSettings.key, row.key))
                )
              )
            )
        );
        const written = yield* upsert(wanted, LAST_WRITER_WINS);
        if (written.length > 0) {
          // `setting`, not `key`: the audit log redacts anything named like a credential.
          const data = {
            changes: written.map((row) => ({
              target: row.target,
              setting: row.key,
              before: before.find(same(row))?.value ?? null,
              after: row.value,
            })),
          };
          yield* query((db) =>
            audit(db, {
              actorId: me.id,
              via: me.via,
              byId: me.principal.byId,
              action: "companion.settings",
              targetType: "companion",
              targetId: null,
              data,
            })
          );
        }

        return {
          written,
          stored: wanted.flatMap((row) => written.find(same(row)) ?? before.find(same(row)) ?? []),
        };
      })
    );
    yield* broadcastRows(written);

    return { rows: stored.map(toWire) };
  });

/**
 * Ask the bridge to do something now, if it is there to hear it: one that hasn't reported for 30 s
 * gets nothing (`delivered: false`). Its result comes back with its next report, as a `result`.
 */
export const command = (command: CompanionCommand) =>
  Effect.gen(function* () {
    const id = createId();
    const [status] = yield* query((db) =>
      db
        .select({ setAt: companionSettings.setAt })
        .from(companionSettings)
        .where(and(eq(companionSettings.target, BRIDGE_TARGET), eq(companionSettings.key, STATUS_KEY)))
    );
    if (!status || Date.now() - status.setAt.getTime() > COMMAND_FRESH_MS) return { id, delivered: false };
    yield* broadcast({ ev: "command", pl: { id, command } });

    return { id, delivered: true };
  });

/**
 * The bridge's heartbeat. Its status is kept (stamped on arrival); changes made on a device, by
 * voice or on the bridge's page count only from those writers, with valid values and a time no later
 * than now, and win over older rows. The others are dropped: the reply puts the bridge back on the
 * stored value. Panels hear the status, the rows that changed and each command's result.
 */
export const report = (input: ReportInput) =>
  Effect.gen(function* () {
    const now = new Date();
    const changes = latest(
      input.changes.flatMap((change): Row[] => {
        const checked = DEVICE_WRITERS.has(change.setBy) ? checkChange(change) : null;
        if (!checked?.ok) return [];
        const setAt = new Date(Math.min(Date.parse(change.setAt), now.getTime()));

        return [{ target: change.target, key: change.key, value: checked.value, setBy: change.setBy, setAt }];
      })
    );
    const written = yield* upsert(changes, LAST_WRITER_WINS);
    // Always stamped, even when nothing in it changed: `setAt` is when the bridge was last seen.
    yield* upsert(
      [{ target: BRIDGE_TARGET, key: STATUS_KEY, value: input.status, setBy: "bridge", setAt: now }],
      undefined
    );
    const rows = yield* allRows();

    yield* broadcastRows(written);
    yield* broadcast({ ev: "status", pl: { status: input.status, seenAt: now.toISOString() } });
    for (const result of input.results) yield* broadcast({ ev: "result", pl: result });

    return { rows: rows.filter((row) => !isStatus(row)).map(toWire) };
  });
