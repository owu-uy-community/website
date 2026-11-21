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
  /** Edited after it went out. */
  editedAt: z.string().nullable(),
  /**
   * How many copies Owy can still edit or delete where they landed (one per staff DM). 0 for what
   * went out before the site kept track, and for emails: those only leave this list.
   */
  remote: z.number(),
});
export type OutboundMessage = z.infer<typeof OutboundMessageSchema>;

export const EventIdSchema = z.object({ eventId: z.string().min(1) });

/**
 * A message Owy posted for attendees, as the public live board shows it: the words and when, and
 * nothing about who wrote it or where it landed.
 */
export const PostedMessageSchema = z.object({
  id: z.string(),
  body: z.string(),
  sentAt: z.string(),
  /** Edited after it went out (Owy edited it where it landed too). */
  editedAt: z.string().nullable(),
});
export type PostedMessage = z.infer<typeof PostedMessageSchema>;

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

/** Delete a message: also where it landed, unless `onlyHere` (Telegram said no, or it was deleted there by hand). */
export const RemoveMessageSchema = MessageRefSchema.extend({ onlyHere: z.boolean().default(false) });

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
