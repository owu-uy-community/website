import { openapi } from "@orpc/openapi";
import * as z from "zod";

import { authed, inCommunity } from "../base";
import {
  AckStaffAnnouncementSchema,
  AssignStaffTaskSchema,
  CreateStaffAnnouncementSchema,
  CreateStaffTaskSchema,
  DeleteStaffTaskSchema,
  ImportResultSchema,
  ImportStaffTasksSchema,
  JoinStaffTaskSchema,
  ListStaffAnnouncementsSchema,
  ListStaffArrivalsSchema,
  ListStaffTasksSchema,
  MoveAssigneeSchema,
  OnShiftInputSchema,
  OnShiftSchema,
  RemindResultSchema,
  SetNoShowSchema,
  SetStaffTaskStatusSchema,
  ShiftStaffTasksSchema,
  StaffAnnouncementSchema,
  StaffArrivalInputSchema,
  StaffArrivalSchema,
  StaffMemberSchema,
  StaffRosterSchema,
  StaffTaskSchema,
  SwapAssigneesSchema,
  SwapTimesSchema,
  UpdateStaffAnnouncementSchema,
  UpdateStaffTaskSchema,
} from "./schemas";
import * as StaffTasks from "./service";

const docs = (summary: string) => openapi({ tags: ["Staff"], summary });

// Event-day coordination. Reads and self-service: any community member. Planning: editor+.
export const staffTasksRouter = {
  list: authed
    .meta(docs("The event's staff tasks by day and time, untimed last"))
    .input(ListStaffTasksSchema)
    .use(inCommunity("member"))
    .output(z.array(StaffTaskSchema))
    .effect(function* ({ input }) {
      return yield* StaffTasks.listTasks(input.eventId);
    }),

  create: authed
    .meta(docs("Add a task; assignees must be on the community's staff"))
    .input(CreateStaffTaskSchema)
    .use(inCommunity("editor"))
    .output(StaffTaskSchema)
    .effect(function* ({ input }) {
      return yield* StaffTasks.createTask(input);
    }),

  update: authed
    .meta(docs("Edit a task; `assigneeIds` replaces the whole set"))
    .input(UpdateStaffTaskSchema)
    .use(inCommunity("editor"))
    .output(StaffTaskSchema)
    .effect(function* ({ input }) {
      return yield* StaffTasks.updateTask(input);
    }),

  delete: authed
    .meta(docs("Delete a task"))
    .input(DeleteStaffTaskSchema)
    .use(inCommunity("editor"))
    .output(StaffTaskSchema)
    .effect(function* ({ input }) {
      return yield* StaffTasks.deleteTask(input);
    }),

  setStatus: authed
    .meta(docs("Mark a task pending, in progress, done or blocked"))
    .input(SetStaffTaskStatusSchema)
    .use(inCommunity("member"))
    .output(StaffTaskSchema)
    .effect(function* ({ input }) {
      return yield* StaffTasks.setStatus(input);
    }),

  join: authed
    .meta(docs("Sign yourself up for a task"))
    .input(JoinStaffTaskSchema)
    .use(inCommunity("member"))
    .output(StaffTaskSchema)
    .effect(function* ({ input }) {
      return yield* StaffTasks.join(input);
    }),

  leave: authed
    .meta(docs("Take yourself off a task"))
    .input(JoinStaffTaskSchema)
    .use(inCommunity("member"))
    .output(StaffTaskSchema)
    .effect(function* ({ input }) {
      return yield* StaffTasks.leave(input);
    }),

  assign: authed
    .meta(docs("Put a staff member on a task"))
    .input(AssignStaffTaskSchema)
    .use(inCommunity("editor"))
    .output(StaffTaskSchema)
    .effect(function* ({ input }) {
      return yield* StaffTasks.assignTo(input);
    }),

  unassign: authed
    .meta(docs("Take someone off a task"))
    .input(AssignStaffTaskSchema)
    .use(inCommunity("editor"))
    .output(StaffTaskSchema)
    .effect(function* ({ input }) {
      return yield* StaffTasks.unassign(input);
    }),

  swapAssignees: authed
    .meta(docs("Two people trade places: each takes the other's task (both tasks come back)"))
    .input(SwapAssigneesSchema)
    .use(inCommunity("editor"))
    .output(z.array(StaffTaskSchema))
    .effect(function* ({ input }) {
      return yield* StaffTasks.swapAssignees(input);
    }),

  moveAssignee: authed
    .meta(docs("Move someone from one task to another (both tasks come back)"))
    .input(MoveAssigneeSchema)
    .use(inCommunity("editor"))
    .output(z.array(StaffTaskSchema))
    .effect(function* ({ input }) {
      return yield* StaffTasks.moveAssignee(input);
    }),

  swapTimes: authed
    .meta(docs("Two tasks trade their day, start and end (both tasks come back)"))
    .input(SwapTimesSchema)
    .use(inCommunity("editor"))
    .output(z.array(StaffTaskSchema))
    .effect(function* ({ input }) {
      return yield* StaffTasks.swapTimes(input);
    }),

  shiftFrom: authed
    .meta(docs('Move every timed task of a day from a time on ("we\'re running 15 late")'))
    .input(ShiftStaffTasksSchema)
    .use(inCommunity("editor"))
    .output(z.object({ count: z.number() }))
    .effect(function* ({ input }) {
      return yield* StaffTasks.shiftFrom(input);
    }),

  roster: authed
    .meta(docs("The community's staff, to assign tasks from"))
    .input(StaffRosterSchema)
    .use(inCommunity("member"))
    .output(z.array(StaffMemberSchema))
    .effect(function* () {
      return yield* StaffTasks.roster();
    }),

  setNoShow: authed
    .meta(docs("Mark someone absent for one task (or take the mark back)"))
    .input(SetNoShowSchema)
    .use(inCommunity("editor"))
    .output(StaffTaskSchema)
    .effect(function* ({ input }) {
      return yield* StaffTasks.setNoShow(input);
    }),

  onShift: authed
    .meta(docs("Today's staff on the event's clock: on a task, free, late, not here yet or gone"))
    .input(OnShiftInputSchema)
    .use(inCommunity("member"))
    .output(OnShiftSchema)
    .effect(function* ({ input }) {
      return yield* StaffTasks.onShift(input.eventId);
    }),

  import: authed
    .meta(docs("Tasks from rows pasted from a spreadsheet; a dry run only previews them"))
    .input(ImportStaffTasksSchema)
    .use(inCommunity("editor"))
    .output(ImportResultSchema)
    .effect(function* ({ input }) {
      return yield* StaffTasks.importTasks(input);
    }),

  arrivals: {
    list: authed
      .meta(docs("Who has arrived at the venue, and who went home"))
      .input(ListStaffArrivalsSchema)
      .use(inCommunity("member"))
      .output(z.array(StaffArrivalSchema))
      .effect(function* ({ input }) {
        return yield* StaffTasks.listArrivals(input.eventId);
      }),

    arrive: authed
      .meta(docs('"Llegué": at the venue; editors may mark someone else'))
      .input(StaffArrivalInputSchema)
      .use(inCommunity("member"))
      .output(StaffArrivalSchema)
      .effect(function* ({ input }) {
        return yield* StaffTasks.arrive(input);
      }),

    leave: authed
      .meta(docs("Gone home: no longer on shift; editors may mark someone else"))
      .input(StaffArrivalInputSchema)
      .use(inCommunity("member"))
      .output(StaffArrivalSchema)
      .effect(function* ({ input }) {
        return yield* StaffTasks.leaveShift(input);
      }),
  },

  announcements: {
    list: authed
      .meta(docs("Announcements to the staff, newest first, with who still has to read each"))
      .input(ListStaffAnnouncementsSchema)
      .use(inCommunity("member"))
      .output(z.array(StaffAnnouncementSchema))
      .effect(function* ({ input }) {
        return yield* StaffTasks.listAnnouncements(input.eventId);
      }),

    create: authed
      .meta(docs("Announce something to the whole staff or to one task's people"))
      .input(CreateStaffAnnouncementSchema)
      .use(inCommunity("editor"))
      .output(z.object({ id: z.string() }))
      .effect(function* ({ input }) {
        return yield* StaffTasks.createAnnouncement(input);
      }),

    update: authed
      .meta(docs("Rewrite an announcement; it can ask everyone to read it again"))
      .input(UpdateStaffAnnouncementSchema)
      .use(inCommunity("editor"))
      .output(z.object({ ok: z.literal(true) }))
      .effect(function* ({ input }) {
        return yield* StaffTasks.updateAnnouncement(input);
      }),

    delete: authed
      .meta(docs("Delete an announcement for everyone, with who read it"))
      .input(AckStaffAnnouncementSchema)
      .use(inCommunity("editor"))
      .output(z.object({ ok: z.literal(true) }))
      .effect(function* ({ input }) {
        return yield* StaffTasks.deleteAnnouncement(input);
      }),

    ack: authed
      .meta(docs("Mark an announcement as read"))
      .input(AckStaffAnnouncementSchema)
      .use(inCommunity("member"))
      .output(z.object({ ok: z.literal(true) }))
      .effect(function* ({ input }) {
        return yield* StaffTasks.ackAnnouncement(input);
      }),

    remind: authed
      .meta(docs("Slack DM from Owy to everyone who hasn't read an announcement; says who couldn't get it"))
      .input(AckStaffAnnouncementSchema)
      .use(inCommunity("editor"))
      .output(RemindResultSchema)
      .effect(function* ({ input }) {
        return yield* StaffTasks.remind(input);
      }),
  },
};
