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
  /** An editor marked them absent for this task. */
  noShow: z.boolean(),
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

/** One person on one task: an end of a swap. */
export const StaffSeatSchema = z.object({ taskId: z.string().min(1), userId: z.string().min(1) });
export type StaffSeat = z.infer<typeof StaffSeatSchema>;

/** `a` takes `b`'s task and `b` takes `a`'s. */
export const SwapAssigneesSchema = z.object({ eventId: z.string().min(1), a: StaffSeatSchema, b: StaffSeatSchema });

/** Someone leaves `taskId` for `toTaskId`. */
export const MoveAssigneeSchema = z.object({
  eventId: z.string().min(1),
  taskId: z.string().min(1),
  userId: z.string().min(1),
  toTaskId: z.string().min(1),
});

/** Two tasks trade their day, start and end. */
export const SwapTimesSchema = z.object({
  eventId: z.string().min(1),
  taskId: z.string().min(1),
  otherTaskId: z.string().min(1),
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

export const CreateStaffAnnouncementSchema = z
  .object({
    eventId: z.string().min(1),
    body: z.string().min(1, "El mensaje es requerido").max(2000),
    urgent: z.boolean().default(false),
    audience: AnnouncementAudienceSchema.default("all"),
    taskId: z.string().optional(),
  })
  .refine((input) => input.audience !== "task" || input.taskId, {
    message: "Un aviso para una tarea necesita la tarea",
    path: ["taskId"],
  });

/** Someone on an event's staff, as every staff member sees them (no contact details). */
export const StaffMemberSchema = z.object({
  id: z.string(),
  communityId: z.string(),
  userId: z.string(),
  role: z.enum(["owner", "admin", "editor", "member"]),
  name: z.string(),
  image: z.string().nullable(),
  createdAt: z.string(),
});
export type StaffMember = z.infer<typeof StaffMemberSchema>;

export const AckStaffAnnouncementSchema = z.object({
  eventId: z.string().min(1),
  announcementId: z.string().min(1),
});

/** What "Reenviar por Owy" did: who got the DM and who couldn't, and why. */
export const RemindResultSchema = z.object({
  sent: z.array(StaffPersonSchema),
  failed: z.array(StaffPersonSchema.extend({ reason: z.string() })),
});

// ---------------------------------------------------------------------------
// Arrivals and who is on shift
// ---------------------------------------------------------------------------

export const ListStaffArrivalsSchema = z.object({ eventId: z.string().min(1) });

/** Mark yourself (or, as an editor, someone else) at the venue, or gone home. */
export const StaffArrivalInputSchema = z.object({ eventId: z.string().min(1), userId: z.string().min(1).optional() });

export const StaffArrivalSchema = StaffPersonSchema.extend({
  arrivedAt: z.string(),
  /** They went home: no longer counted on shift. */
  leftAt: z.string().nullable(),
});
export type StaffArrival = z.infer<typeof StaffArrivalSchema>;

export const SetNoShowSchema = z.object({
  eventId: z.string().min(1),
  taskId: z.string().min(1),
  userId: z.string().min(1),
  noShow: z.boolean(),
});

export const OnShiftInputSchema = z.object({ eventId: z.string().min(1) });

export const ShiftStateSchema = z.enum([
  /** At the venue, on a task right now. */
  "busy",
  /** At the venue with nothing assigned right now. */
  "free",
  /** On a task that started a while ago, and not at the venue. */
  "late",
  /** Not at the venue, and nothing of theirs has started. */
  "away",
  /** Came and went home. */
  "left",
]);
export type ShiftState = z.infer<typeof ShiftStateSchema>;

/** Today's staff on the event's clock: "14 de 18 en turno · 2 atrasadas · 3 libres ahora". */
export const OnShiftSchema = z.object({
  /** "YYYY-MM-DD" and "HH:MM" on the event's wall clock. */
  day: z.string(),
  time: z.string(),
  /** People with a task today (not marked absent) or who came. */
  expected: z.number(),
  onSite: z.number(),
  late: z.number(),
  free: z.number(),
  people: z.array(
    StaffPersonSchema.extend({
      state: ShiftStateSchema,
      arrivedAt: z.string().nullable(),
      leftAt: z.string().nullable(),
      /** The tasks they are on now (busy) or late for (late). */
      taskIds: z.array(z.string()),
    })
  ),
});
export type OnShift = z.infer<typeof OnShiftSchema>;

// ---------------------------------------------------------------------------
// Importing a spreadsheet
// ---------------------------------------------------------------------------

export const ImportStaffTasksSchema = z.object({
  eventId: z.string().min(1),
  /** Rows pasted from a spreadsheet: tab-separated (a copy from Google Sheets) or comma-separated. */
  tsv: z.string().trim().min(1, "Pegá las filas de la planilla").max(200_000, "Es demasiado texto para una planilla"),
  /** Only read it and say what would be created. */
  dryRun: z.boolean().default(true),
});

export const ImportRowSchema = z.object({
  /** Line of the paste the row starts on (1-based), for "fila 4: …". */
  line: z.number(),
  title: z.string(),
  type: StaffTaskTypeSchema,
  dayDate: z.string().nullable(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  minPeople: z.number().nullable(),
  location: z.string().nullable(),
  notes: z.string().nullable(),
  people: z.array(StaffPersonSchema),
  /** Why the row can't be imported, in Spanish. */
  errors: z.array(z.string()),
  /** Already on the schedule (same day, start and title), or twice in the paste: skipped. */
  duplicate: z.boolean(),
});
export type ImportRow = z.infer<typeof ImportRowSchema>;

export const ImportResultSchema = z.object({
  rows: z.array(ImportRowSchema),
  /** Tasks created; 0 on a dry run. */
  created: z.number(),
});
