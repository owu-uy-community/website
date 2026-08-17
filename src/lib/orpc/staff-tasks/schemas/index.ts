import * as z from "zod";

// "HH:MM" 24h
const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Formato inválido (HH:MM)");
// Date-only, timezone-proof: stored as UTC midnight, transported as "YYYY-MM-DD".
const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato inválido (YYYY-MM-DD)");

export const StaffTaskTypeSchema = z.enum(["task", "ongoing", "milestone"]);
export const StaffTaskStatusSchema = z.enum(["pending", "in_progress", "done", "blocked"]);
export const AnnouncementAudienceSchema = z.enum(["all", "task"]);

export const StaffTaskAssigneeSchema = z.object({
  userId: z.string(),
  name: z.string(),
  image: z.string().nullable(),
});

export const StaffTaskSchema = z.object({
  id: z.string(),
  openSpaceId: z.string(),
  title: z.string(),
  notes: z.string().nullable(),
  type: StaffTaskTypeSchema,
  /** "YYYY-MM-DD" */
  dayDate: z.string(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  minPeople: z.number().nullable(),
  location: z.string().nullable(),
  status: StaffTaskStatusSchema,
  statusUpdatedById: z.string().nullable(),
  sortOrder: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  assignees: z.array(StaffTaskAssigneeSchema),
});

export type StaffTask = z.infer<typeof StaffTaskSchema>;

export const ListStaffTasksSchema = z.object({ eventId: z.string().min(1) });

export const CreateStaffTaskSchema = z.object({
  eventId: z.string().min(1),
  title: z.string().min(1, "El título es requerido").max(200),
  notes: z.string().max(4000).optional(),
  type: StaffTaskTypeSchema.default("task"),
  dayDate: dayString,
  startTime: timeString.nullish(),
  endTime: timeString.nullish(),
  minPeople: z.number().int().min(1).max(99).nullish(),
  location: z.string().max(120).nullish(),
  sortOrder: z.number().int().optional(),
  assigneeIds: z.array(z.string()).max(30).optional(),
});

export const UpdateStaffTaskSchema = z.object({
  eventId: z.string().min(1),
  taskId: z.string().min(1),
  data: z.object({
    title: z.string().min(1).max(200).optional(),
    notes: z.string().max(4000).nullish(),
    type: StaffTaskTypeSchema.optional(),
    dayDate: dayString.optional(),
    startTime: timeString.nullish(),
    endTime: timeString.nullish(),
    minPeople: z.number().int().min(1).max(99).nullish(),
    location: z.string().max(120).nullish(),
    sortOrder: z.number().int().optional(),
    /** Full replacement of the assignee set when present. */
    assigneeIds: z.array(z.string()).max(30).optional(),
  }),
});

export const DeleteStaffTaskSchema = z.object({ eventId: z.string().min(1), taskId: z.string().min(1) });

export const SetStaffTaskStatusSchema = z.object({
  eventId: z.string().min(1),
  taskId: z.string().min(1),
  status: StaffTaskStatusSchema,
});

export const JoinStaffTaskSchema = z.object({ eventId: z.string().min(1), taskId: z.string().min(1) });

export const AssignStaffTaskSchema = z.object({
  eventId: z.string().min(1),
  taskId: z.string().min(1),
  userId: z.string().min(1),
});

export const ShiftStaffTasksSchema = z.object({
  eventId: z.string().min(1),
  dayDate: dayString,
  fromTime: timeString,
  deltaMinutes: z
    .number()
    .int()
    .min(-180)
    .max(180)
    .refine((v) => v !== 0, "El corrimiento no puede ser 0"),
});

export const StaffRosterSchema = z.object({ eventId: z.string().min(1) });

export const StaffPersonSchema = z.object({
  userId: z.string(),
  name: z.string(),
  image: z.string().nullable(),
});

export const StaffAckSchema = StaffPersonSchema.extend({ ackedAt: z.string() });

export const StaffAnnouncementSchema = z.object({
  id: z.string(),
  openSpaceId: z.string(),
  body: z.string(),
  urgent: z.boolean(),
  audience: AnnouncementAudienceSchema,
  taskId: z.string().nullable(),
  taskTitle: z.string().nullable(),
  author: z.object({ id: z.string(), name: z.string(), image: z.string().nullable() }).nullable(),
  createdAt: z.string(),
  ackCount: z.number(),
  ackedByMe: z.boolean(),
  /** Who marked it as received, most recent first. */
  acks: z.array(StaffAckSchema),
  /** Expected recipients who have NOT acked yet — the useful half on event day. */
  pending: z.array(StaffPersonSchema),
});

export type StaffAnnouncement = z.infer<typeof StaffAnnouncementSchema>;

export const ListStaffAnnouncementsSchema = z.object({ eventId: z.string().min(1) });

export const CreateStaffAnnouncementSchema = z.object({
  eventId: z.string().min(1),
  body: z.string().min(1, "El mensaje es requerido").max(2000),
  urgent: z.boolean().default(false),
  audience: AnnouncementAudienceSchema.default("all"),
  taskId: z.string().optional(),
});

export const AckStaffAnnouncementSchema = z.object({
  eventId: z.string().min(1),
  announcementId: z.string().min(1),
});
