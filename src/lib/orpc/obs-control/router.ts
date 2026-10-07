import { openapi } from "@orpc/openapi";
import * as z from "zod";

import { staff } from "../base";
import type { Actor } from "../services";
import {
  AckCommandSchema,
  ClaimExecutorSchema,
  CreateCueSchema,
  CueIdSchema,
  CueSchema,
  FiredCueSchema,
  InstanceSchema,
  ListCommandsSchema,
  ObsStatusSchema,
  ReleaseExecutorSchema,
  ReorderCuesSchema,
  ReportStatusSchema,
  SendCommandSchema,
  SerializedCommandSchema,
  StepCueSchema,
  UpdateCueSchema,
} from "./schemas";
import * as Obs from "./service";

const docs = (summary: string) => openapi({ tags: ["OBS"], summary });

/** Who queued a command, for the history tab. */
const commandSource = (user: Actor) =>
  user.id === "owy-bot" ? "bot" : `${user.via === "api-key" ? "api-key" : "admin"}:${user.name || user.id}`;

// The OBS desk's command bus: other devices queue commands, the one executor tab runs them in OBS.
export const obsControlRouter = {
  send: staff
    .meta(docs("Queue a command for the executor tab; CUT/TAKE right after another is the same press"))
    .input(SendCommandSchema)
    .output(z.object({ id: z.string(), executorOnline: z.boolean() }))
    .effect(function* ({ input, context }) {
      return yield* Obs.sendCommand(input, commandSource(context.user));
    }),

  pending: staff
    .meta(docs("Commands still waiting for the executor, oldest first"))
    .input(InstanceSchema)
    .output(z.array(SerializedCommandSchema))
    .effect(function* ({ input }) {
      return yield* Obs.pendingCommands(input.instanceId);
    }),

  ack: staff
    .meta(docs("The executor reports a command done or failed"))
    .input(AckCommandSchema)
    .output(z.object({ ok: z.literal(true) }))
    .effect(function* ({ input }) {
      return yield* Obs.ackCommand(input);
    }),

  claim: staff
    .meta(docs("Take the executor seat if it is free, stale, yours, or forced"))
    .input(ClaimExecutorSchema)
    .output(ObsStatusSchema)
    .effect(function* ({ input }) {
      return yield* Obs.claimExecutor(input);
    }),

  release: staff
    .meta(docs("Give the executor seat up"))
    .input(ReleaseExecutorSchema)
    .output(ObsStatusSchema)
    .effect(function* ({ input }) {
      return yield* Obs.releaseExecutor(input);
    }),

  report: staff
    .meta(docs("The executor's heartbeat and its view of OBS"))
    .input(ReportStatusSchema)
    .output(ObsStatusSchema)
    .effect(function* ({ input }) {
      return yield* Obs.reportStatus(input);
    }),

  status: staff
    .meta(docs("What OBS is doing, as the executor last reported it"))
    .input(InstanceSchema)
    .output(ObsStatusSchema)
    .effect(function* ({ input }) {
      return yield* Obs.getStatus(input.instanceId);
    }),

  history: staff
    .meta(docs("Recent commands, newest first"))
    .input(ListCommandsSchema)
    .output(z.array(SerializedCommandSchema))
    .effect(function* ({ input }) {
      return yield* Obs.listCommands(input);
    }),
};

// The rundown: one press = OBS scene + wall scene + launchpad sound.
export const obsCueRouter = {
  list: staff
    .meta(docs("A rig's rundown in order"))
    .input(InstanceSchema)
    .output(z.array(CueSchema))
    .effect(function* ({ input }) {
      return yield* Obs.listCues(input.instanceId);
    }),

  create: staff
    .meta(docs("Add a cue at the end of the rundown"))
    .input(CreateCueSchema)
    .output(CueSchema)
    .effect(function* ({ input }) {
      return yield* Obs.createCue(input);
    }),

  update: staff
    .meta(docs("Edit a cue"))
    .input(UpdateCueSchema)
    .output(CueSchema)
    .effect(function* ({ input }) {
      return yield* Obs.updateCue(input);
    }),

  remove: staff
    .meta(docs("Delete a cue"))
    .input(CueIdSchema)
    .output(z.object({ ok: z.literal(true) }))
    .effect(function* ({ input }) {
      return yield* Obs.removeCue(input.id);
    }),

  reorder: staff
    .meta(docs("Rewrite the rundown order"))
    .input(ReorderCuesSchema)
    .output(z.array(CueSchema))
    .effect(function* ({ input }) {
      return yield* Obs.reorderCues(input);
    }),

  fire: staff
    .meta(docs("Fire a cue"))
    .input(CueIdSchema)
    .output(FiredCueSchema)
    .effect(function* ({ input, context }) {
      return yield* Obs.fireCue(input.id, commandSource(context.user));
    }),

  step: staff
    .meta(docs("Fire the next or previous cue, wrapping around; null on an empty rundown"))
    .input(StepCueSchema)
    .output(FiredCueSchema.nullable())
    .effect(function* ({ input, context }) {
      return yield* Obs.stepCue(input, commandSource(context.user));
    }),
};
