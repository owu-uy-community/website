import { openapi } from "@orpc/openapi";
import * as z from "zod";

import { pub, staff } from "../base";
import {
  GetIssueSchema,
  IssueIdSchema,
  PublishedIssueSchema,
  SaveDraftSchema,
  SemanarioIssueSchema,
  SemanarioSummarySchema,
  UpdateIssueSchema,
} from "./schemas";
import * as Semanario from "./service";

const docs = (summary: string) => openapi({ tags: ["Semanario"], summary });

export const semanarioRouter = {
  list: pub
    .meta(docs("Published Semanario issues, newest first"))
    .output(z.array(SemanarioSummarySchema))
    .effect(function* () {
      return yield* Semanario.listPublished;
    }),

  get: pub
    .meta(docs("A published issue by its number, with the previous and next ones"))
    .input(GetIssueSchema)
    .output(PublishedIssueSchema)
    .effect(function* ({ input }) {
      return yield* Semanario.getPublished(input.number);
    }),

  listAll: staff
    .meta(docs("Every issue, drafts included (site staff)"))
    .output(z.array(SemanarioIssueSchema))
    .effect(function* () {
      return yield* Semanario.listAll;
    }),

  saveDraft: staff
    .meta(docs("Owy's weekly draft: create or rewrite the week's issue while it is still a draft"))
    .input(SaveDraftSchema)
    .output(SemanarioIssueSchema)
    .effect(function* ({ input }) {
      return yield* Semanario.saveDraft(input);
    }),

  update: staff
    .meta(docs("Edit an issue's title, intro or sections"))
    .input(UpdateIssueSchema)
    .output(SemanarioIssueSchema)
    .effect(function* ({ input }) {
      return yield* Semanario.updateIssue(input);
    }),

  publish: staff
    .meta(docs("Publish an issue (a person, never a bot); the first publish gives it its number"))
    .input(IssueIdSchema)
    .output(SemanarioIssueSchema)
    .effect(function* ({ input }) {
      return yield* Semanario.publish(input.id);
    }),

  unpublish: staff
    .meta(docs("Take an issue back to draft; it keeps its number"))
    .input(IssueIdSchema)
    .output(SemanarioIssueSchema)
    .effect(function* ({ input }) {
      return yield* Semanario.unpublish(input.id);
    }),
};
