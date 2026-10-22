import * as z from "zod";

import { CADENCE_STEPS } from "./cadence";

/** Where Owy can post from the site. */
export const OwyChannelSchema = z.enum(["telegram", "slack"]);
export const MessageChannelSchema = z.enum(["telegram", "slack", "staff_dm", "email"]);
export const MessageStatusSchema = z.enum(["scheduled", "sending", "sent", "failed"]);
export const CadenceStepKeySchema = z.enum(CADENCE_STEPS);

/** Telegram's limit is 4096; Slack takes more, but one limit keeps the composer honest for both. */
export const MESSAGE_MAX = 4000;
const Body = z.string().trim().min(1, "Escribí el mensaje").max(MESSAGE_MAX, `Hasta ${MESSAGE_MAX} caracteres`);
const When = z.iso.datetime({ offset: true, error: "Fecha y hora inválidas" });

export const OutboundMessageSchema = z.object({
  id: z.string(),
  channel: MessageChannelSchema,
  body: z.string(),
  status: MessageStatusSchema,
  scheduledAt: z.string().nullable(),
  sentAt: z.string().nullable(),
  error: z.string().nullable(),
  step: z.string().nullable(),
  /** Staff DMs: how many people it went to. */
  recipients: z.number(),
  createdBy: z.object({ id: z.string(), name: z.string(), image: z.string().nullable() }).nullable(),
  createdAt: z.string(),
});
export type OutboundMessage = z.infer<typeof OutboundMessageSchema>;

export const EventIdSchema = z.object({ eventId: z.string().min(1) });

export const SendMessageSchema = z.object({
  eventId: z.string().min(1),
  channel: OwyChannelSchema,
  body: Body,
  step: CadenceStepKeySchema.optional(),
});

export const ScheduleMessageSchema = SendMessageSchema.extend({ scheduledAt: When });

export const UpdateMessageSchema = z.object({
  eventId: z.string().min(1),
  messageId: z.string().min(1),
  channel: OwyChannelSchema.optional(),
  body: Body.optional(),
  scheduledAt: When.optional(),
});

export const MessageRefSchema = z.object({ eventId: z.string().min(1), messageId: z.string().min(1) });

export const MarkSentSchema = z.object({ eventId: z.string().min(1), step: CadenceStepKeySchema, body: Body });

export const RemindSchema = z.object({ eventId: z.string().min(1), announcementId: z.string().min(1) });

export const ChannelsSchema = z.object({
  telegram: z.boolean(),
  slack: z.boolean(),
  staffDm: z.boolean(),
  /** Owy's Telegram username (without @), for links in the copy. */
  telegramHandle: z.string().nullable(),
});
export type Channels = z.infer<typeof ChannelsSchema>;

export const DispatchResultSchema = z.object({ sent: z.number(), failed: z.number() });

export const CadenceStepSchema = z.object({
  key: CadenceStepKeySchema,
  title: z.string(),
  description: z.string(),
  channel: z.enum(["email", "telegram"]),
  /** The suggested time, on the event's clock. */
  at: z.string(),
  subject: z.string().nullable(),
  /** The copy prefilled from the event. */
  body: z.string(),
  /** What fulfils the step: the sent message over a scheduled one over a failed one. */
  message: OutboundMessageSchema.nullable(),
  status: z.enum(["missing", "scheduled", "sending", "sent", "failed"]),
});
export type CadenceStep = z.infer<typeof CadenceStepSchema>;

export const CadenceSchema = z.object({
  timezone: z.string(),
  eventStart: z.string(),
  eventEnd: z.string(),
  steps: z.array(CadenceStepSchema),
  links: z.object({ agenda: z.string(), survey: z.string(), map: z.string().nullable(), owy: z.string().nullable() }),
  /** The T+1 message links to the survey: it should be open by then. */
  surveyOpen: z.boolean(),
});
export type Cadence = z.infer<typeof CadenceSchema>;

export const RemindResultSchema = z.object({ sent: z.number(), withoutSlack: z.number() });
