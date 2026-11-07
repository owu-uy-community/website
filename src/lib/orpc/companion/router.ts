import { openapi } from "@orpc/openapi";

import { platform } from "../base";
import * as Control from "./control";
import {
  CommandSentSchema,
  CompanionStateSchema,
  ReportReplySchema,
  ReportSchema,
  SendCommandSchema,
  SetSettingsSchema,
  SettingRowsSchema,
} from "./schemas";

const docs = (summary: string) => openapi({ tags: ["Companion"], summary });

/**
 * Physical Owy companions. The site keeps every setting of the bridge and of each device, and the
 * bridge's last report (state, set, report); the bridge on the venue Mac follows them and runs
 * commands (command).
 */
export const companionRouter = {
  state: platform("stage:read")
    .meta(docs("Every companion setting as stored, and the bridge's last report"))
    .output(CompanionStateSchema)
    .effect(function* () {
      return yield* Control.state();
    }),

  set: platform("stage:operate")
    .meta(docs("Change settings of the bridge or of a device; the bridge follows"))
    .input(SetSettingsSchema)
    .output(SettingRowsSchema)
    .effect(function* ({ input }) {
      return yield* Control.set(input.changes);
    }),

  command: platform("stage:operate")
    .meta(docs("Ask the bridge to do something now (a tone, a line, a restart…); never queued"))
    .input(SendCommandSchema)
    .output(CommandSentSchema)
    .effect(function* ({ input }) {
      return yield* Control.command(input.command);
    }),

  report: platform("stage:operate")
    .meta(docs("The bridge's heartbeat: what is in effect, changes made on a device, command results"))
    .input(ReportSchema)
    .output(ReportReplySchema)
    .effect(function* ({ input }) {
      return yield* Control.report(input);
    }),
};
