import { z } from "zod";
import {
  BridgeStatusSchema,
  CompanionCommandSchema,
  ReportReplySchema,
  ReportSchema,
  SettingRowSchema,
  type BridgeStatus,
  type CommandEnvelope,
  type CommandResult,
  type CompanionCommand,
  type CompanionEvent,
  type SettingRow,
} from "../../../../owy/companion/bridge/src/web/contract";

// ---------------------------------------------------------------------------
// Control plane: the site keeps the settings (owy/companion/bridge/src/web/registry.ts) and the
// bridge's last report; the bridge follows the rows and runs commands (see ./control.ts).
// ---------------------------------------------------------------------------
export { BridgeStatusSchema, CompanionCommandSchema, ReportReplySchema, ReportSchema, SettingRowSchema };
export type { BridgeStatus, CommandEnvelope, CommandResult, CompanionCommand, CompanionEvent, SettingRow };
export type ReportInput = z.infer<typeof ReportSchema>;

/** "bridge", or a device's id (`owy-knob`). */
export const SettingTargetSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/, "Dispositivo inválido");

export const SetSettingsSchema = z.object({
  changes: z
    .array(z.object({ target: SettingTargetSchema, key: z.string().min(1).max(64), value: z.json() }))
    .min(1)
    .max(50),
});
export type SettingChange = z.infer<typeof SetSettingsSchema>["changes"][number];

export const SettingRowsSchema = z.object({ rows: z.array(SettingRowSchema) });

export const CompanionStateSchema = z.object({
  /** Every stored setting. */
  rows: z.array(SettingRowSchema),
  /** The bridge's last report; null before the first one. */
  status: BridgeStatusSchema.nullable(),
  /** When it arrived (the site's clock). */
  seenAt: z.iso.datetime().nullable(),
});
export type CompanionState = z.infer<typeof CompanionStateSchema>;

export const SendCommandSchema = z.object({ command: CompanionCommandSchema });
/** `delivered: false` — the bridge hasn't reported for 30 s: nothing was sent (commands never wait). */
export const CommandSentSchema = z.object({ id: z.string(), delivered: z.boolean() });
