import * as z from "zod";

export const IncidentSeveritySchema = z.enum(["low", "medium", "high", "critical"]);
export const IncidentCategorySchema = z.enum(["medical", "conduct", "technical", "venue", "lost", "other"]);
export const IncidentStatusSchema = z.enum(["open", "in_progress", "resolved"]);

const PHOTO_PREFIX = "data:image/jpeg;base64,";
/** The phone compresses the photo before sending it; this is the ceiling, not the target. */
export const MAX_PHOTO_BYTES = 400 * 1024;

/** A JPEG data URL of at most 400 KB (its base64 is a third longer than the bytes). */
const PhotoSchema = z
  .string()
  .max(PHOTO_PREFIX.length + Math.ceil(MAX_PHOTO_BYTES / 3) * 4, "La foto pesa más de 400 KB")
  .refine(
    (value) => value.startsWith(PHOTO_PREFIX) && /^[A-Za-z0-9+/]+={0,2}$/.test(value.slice(PHOTO_PREFIX.length)),
    "La foto tiene que ser un JPEG"
  );

const PersonSchema = z.object({ id: z.string(), name: z.string(), image: z.string().nullable() });

/** An incident as lists show it: no photo (it can weigh 400 KB), just whether there is one. */
export const IncidentSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  severity: IncidentSeveritySchema,
  category: IncidentCategorySchema,
  status: IncidentStatusSchema,
  room: z.object({ id: z.string(), name: z.string(), color: z.string().nullable() }).nullable(),
  location: z.string().nullable(),
  assignee: PersonSchema.nullable(),
  reporter: PersonSchema.nullable(),
  source: z.enum(["admin", "phone", "owy"]),
  sensitive: z.boolean(),
  hasPhoto: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  resolvedAt: z.string().nullable(),
});

export const IncidentNoteSchema = z.object({
  id: z.string(),
  body: z.string(),
  /** `note`: typed by someone, and fixable; `change`: the log line of an edit. */
  kind: z.enum(["note", "change"]),
  author: PersonSchema.nullable(),
  createdAt: z.string(),
  editedAt: z.string().nullable(),
});

/** One incident with its photo and its log, oldest line first. */
export const IncidentDetailSchema = IncidentSchema.extend({
  photo: z.string().nullable(),
  notes: z.array(IncidentNoteSchema),
});

export const CreateIncidentSchema = z.object({
  eventId: z.string().min(1),
  title: z.string().trim().min(1, "Contá qué pasa").max(140),
  description: z.string().trim().max(4000).optional(),
  severity: IncidentSeveritySchema,
  category: IncidentCategorySchema,
  roomId: z.string().min(1).optional(),
  /** Free text when it isn't a room: "baños PB", "entrada". */
  location: z.string().trim().max(120).optional(),
  sensitive: z.boolean().default(false),
  photo: PhotoSchema.optional(),
  /** The staff phone views say "phone"; API-key callers are Owy whatever they send. */
  source: z.enum(["admin", "phone"]).optional(),
});

export const ListIncidentsSchema = z.object({
  eventId: z.string().min(1),
  status: IncidentStatusSchema.optional(),
});

export const IncidentRefSchema = z.object({ eventId: z.string().min(1), id: z.string().min(1) });

export const UpdateIncidentSchema = IncidentRefSchema.extend({
  status: IncidentStatusSchema.optional(),
  /** Null leaves it unassigned. */
  assigneeId: z.string().min(1).nullable().optional(),
  severity: IncidentSeveritySchema.optional(),
  /** Null takes it out of any room. */
  roomId: z.string().min(1).nullable().optional(),
  title: z.string().trim().min(1, "Contá qué pasa").max(140).optional(),
  /** Null (or empty) clears it. */
  description: z.string().trim().max(4000).nullable().optional(),
  category: IncidentCategorySchema.optional(),
  location: z.string().trim().max(120).nullable().optional(),
  /** Anyone who may edit it marks it confidential; only organizers take that back. */
  sensitive: z.boolean().optional(),
  /** Null takes the photo off. */
  photo: PhotoSchema.nullable().optional(),
});

/** One typed note in an incident's log. */
export const IncidentNoteRefSchema = IncidentRefSchema.extend({ noteId: z.string().min(1) });
export const UpdateIncidentNoteSchema = IncidentNoteRefSchema.extend({
  body: z.string().trim().min(1, "Escribí la nota").max(2000),
});

export const AddIncidentNoteSchema = IncidentRefSchema.extend({
  body: z.string().trim().min(1, "Escribí la nota").max(2000),
});

export const RequestStaffSchema = z.object({ eventId: z.string().min(1), roomId: z.string().min(1) });

export type Incident = z.infer<typeof IncidentSchema>;
export type IncidentDetail = z.infer<typeof IncidentDetailSchema>;
export type IncidentNote = z.infer<typeof IncidentNoteSchema>;
export type IncidentSeverity = z.infer<typeof IncidentSeveritySchema>;
export type IncidentCategory = z.infer<typeof IncidentCategorySchema>;
export type IncidentStatus = z.infer<typeof IncidentStatusSchema>;
export type CreateIncidentInput = z.infer<typeof CreateIncidentSchema>;
export type UpdateIncidentInput = z.infer<typeof UpdateIncidentSchema>;
