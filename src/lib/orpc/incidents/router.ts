import { openapi } from "@orpc/openapi";
import * as z from "zod";

import { authed, inCommunity } from "../base";
import {
  AddIncidentNoteSchema,
  CreateIncidentSchema,
  IncidentDetailSchema,
  IncidentNoteRefSchema,
  IncidentRefSchema,
  IncidentSchema,
  ListIncidentsSchema,
  RequestStaffSchema,
  UpdateIncidentNoteSchema,
  UpdateIncidentSchema,
} from "./schemas";
import * as Incidents from "./service";

const docs = (summary: string) => openapi({ tags: ["Incidents"], summary });

// Anyone on the event's staff reports, follows and takes incidents. Code-of-conduct reports are
// only visible to organizers and the people on them; editors manage the rest (service rules).
export const incidentsRouter = {
  create: authed
    .meta(docs("Report an incident; high and critical ones alert the whole staff"))
    .input(CreateIncidentSchema)
    .use(inCommunity("member"))
    .output(IncidentDetailSchema)
    .effect(function* ({ input }) {
      return yield* Incidents.createIncident(input);
    }),

  list: authed
    .meta(docs("The event's incidents, open and loudest first; confidential ones only for who may see them"))
    .input(ListIncidentsSchema)
    .use(inCommunity("member"))
    .output(z.array(IncidentSchema))
    .effect(function* ({ input }) {
      return yield* Incidents.listIncidents(input);
    }),

  get: authed
    .meta(docs("One incident with its photo and its log"))
    .input(IncidentRefSchema)
    .use(inCommunity("member"))
    .output(IncidentDetailSchema)
    .effect(function* ({ input }) {
      return yield* Incidents.getIncident(input);
    }),

  update: authed
    .meta(
      docs("Edit an incident: anything for editors (confidential off only for organizers); its assignee, the status")
    )
    .input(UpdateIncidentSchema)
    .use(inCommunity("member"))
    .output(IncidentDetailSchema)
    .effect(function* ({ input }) {
      return yield* Incidents.updateIncident(input);
    }),

  delete: authed
    .meta(docs("Delete an incident with its log: a duplicate, a mistake (editors)"))
    .input(IncidentRefSchema)
    .use(inCommunity("editor"))
    .output(z.object({ ok: z.literal(true) }))
    .effect(function* ({ input }) {
      return yield* Incidents.deleteIncident(input);
    }),

  updateNote: authed
    .meta(docs("Fix a typed note in an incident's log (its author or an editor)"))
    .input(UpdateIncidentNoteSchema)
    .use(inCommunity("member"))
    .output(IncidentDetailSchema)
    .effect(function* ({ input }) {
      return yield* Incidents.updateNote(input);
    }),

  deleteNote: authed
    .meta(docs("Take a typed note out of an incident's log (its author or an editor)"))
    .input(IncidentNoteRefSchema)
    .use(inCommunity("member"))
    .output(IncidentDetailSchema)
    .effect(function* ({ input }) {
      return yield* Incidents.deleteNote(input);
    }),

  addNote: authed
    .meta(docs("Append a note to an incident's log"))
    .input(AddIncidentNoteSchema)
    .use(inCommunity("member"))
    .output(IncidentDetailSchema)
    .effect(function* ({ input }) {
      return yield* Incidents.addNote(input);
    }),

  assignToMe: authed
    .meta(docs("Take an incident: it's yours, and in progress if it was open"))
    .input(IncidentRefSchema)
    .use(inCommunity("member"))
    .output(IncidentDetailSchema)
    .effect(function* ({ input }) {
      return yield* Incidents.assignToMe(input);
    }),

  requestStaff: authed
    .meta(docs("A room's host asks the staff for a hand"))
    .input(RequestStaffSchema)
    .use(inCommunity("member"))
    .output(z.object({ id: z.string() }))
    .effect(function* ({ input }) {
      return yield* Incidents.requestStaff(input);
    }),
};
