import { and, asc, desc, eq, gt, isNotNull, lt, max } from "drizzle-orm";
import { Effect } from "effect";
import { revalidatePath } from "next/cache";

import { semanarioIssues, user, type SemanarioIssueRow } from "../../db/schema";
import { query, transaction } from "../db";
import { Conflict, Forbidden, NotFound } from "../errors";
import { CurrentUser } from "../services";
import type { PublishedIssue, SemanarioIssue, SemanarioSections, SemanarioSummary } from "./schemas";

const issueNotFound = new NotFound({ entity: "semanario", message: "Ese número del Semanario no existe" });

const toIssue = (row: SemanarioIssueRow, reviewedBy: string | null): SemanarioIssue => ({
  id: row.id,
  number: row.number,
  weekStart: row.weekStart,
  title: row.title,
  intro: row.intro,
  sections: row.sections,
  status: row.status,
  publishedAt: row.publishedAt?.toISOString() ?? null,
  reviewedBy,
  updatedAt: row.updatedAt.toISOString(),
});

const withReviewer = query((db) =>
  db
    .select({ issue: semanarioIssues, reviewer: user.name })
    .from(semanarioIssues)
    .leftJoin(user, eq(user.id, semanarioIssues.reviewedById))
);

/**
 * The public pages are statically generated; a publish, unpublish or edit
 * re-renders them now instead of at the next hourly revalidation. Outside a
 * Next request (tests, scripts) there is nothing to revalidate.
 */
const refreshPages = Effect.sync(() => {
  try {
    revalidatePath("/semanario", "layout");
  } catch {
    // ponytail: no Next store outside a request; the pages still revalidate hourly
  }
});

const isPublished = eq(semanarioIssues.status, "published");

/** Published issues, newest first */
export const listPublished = query((db) =>
  db.select().from(semanarioIssues).where(isPublished).orderBy(desc(semanarioIssues.number))
).pipe(
  Effect.map((rows) =>
    rows.flatMap((row): SemanarioSummary[] =>
      row.number === null
        ? []
        : [
            {
              number: row.number,
              weekStart: row.weekStart,
              title: row.title,
              intro: row.intro,
              publishedAt: row.publishedAt?.toISOString() ?? null,
              counts: {
                events: row.sections.events.length,
                threads: row.sections.threads.length,
                jobs: row.sections.jobs?.count ?? 0,
              },
            },
          ]
    )
  )
);

/** One published issue with its neighbours for prev/next navigation */
export const getPublished = (number: number) =>
  Effect.gen(function* () {
    const [found] = yield* query((db) =>
      db
        .select({ issue: semanarioIssues, reviewer: user.name })
        .from(semanarioIssues)
        .leftJoin(user, eq(user.id, semanarioIssues.reviewedById))
        .where(and(eq(semanarioIssues.number, number), isPublished))
    );
    if (!found) return yield* issueNotFound;

    const [[prev], [next]] = yield* Effect.all([
      query((db) =>
        db
          .select({ number: semanarioIssues.number })
          .from(semanarioIssues)
          .where(and(isPublished, lt(semanarioIssues.number, number)))
          .orderBy(desc(semanarioIssues.number))
          .limit(1)
      ),
      query((db) =>
        db
          .select({ number: semanarioIssues.number })
          .from(semanarioIssues)
          .where(and(isPublished, gt(semanarioIssues.number, number)))
          .orderBy(asc(semanarioIssues.number))
          .limit(1)
      ),
    ]);

    return {
      ...toIssue(found.issue, found.reviewer),
      number,
      prev: prev?.number ?? null,
      next: next?.number ?? null,
    } satisfies PublishedIssue;
  });

/** Every issue, drafts included, newest week first (the admin) */
export const listAll = withReviewer.pipe(
  Effect.map((rows) =>
    rows
      .map(({ issue, reviewer }) => toIssue(issue, reviewer))
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
      .slice(0, 104)
  )
);

const getById = (id: string) =>
  query((db) =>
    db
      .select({ issue: semanarioIssues, reviewer: user.name })
      .from(semanarioIssues)
      .leftJoin(user, eq(user.id, semanarioIssues.reviewedById))
      .where(eq(semanarioIssues.id, id))
  ).pipe(
    Effect.flatMap(([found]) =>
      found ? Effect.succeed(toIssue(found.issue, found.reviewer)) : Effect.fail(issueNotFound)
    )
  );

/**
 * Owy's weekly draft: one per week, rewritten while it is a draft. A week that
 * was already published is left alone, so a re-run can't undo a review.
 */
export const saveDraft = (input: { weekStart: string; title: string; intro: string; sections: SemanarioSections }) =>
  transaction(
    Effect.gen(function* () {
      const [existing] = yield* query((db) =>
        db.select().from(semanarioIssues).where(eq(semanarioIssues.weekStart, input.weekStart)).for("update")
      );
      if (existing?.status === "published") {
        return yield* new Conflict({
          reason: "already_published",
          message: `El Semanario de la semana del ${input.weekStart} ya está publicado`,
        });
      }

      const [row] = existing
        ? yield* query((db) =>
            db
              .update(semanarioIssues)
              .set({ title: input.title, intro: input.intro, sections: input.sections })
              .where(eq(semanarioIssues.id, existing.id))
              .returning()
          )
        : yield* query((db) => db.insert(semanarioIssues).values(input).returning());

      return toIssue(row, null);
    })
  ).pipe(
    // Two runs racing on a new week: the loser retries as an update
    Effect.catchTag("UniqueViolation", () =>
      Effect.fail(
        new Conflict({ reason: "week_taken", message: "Otro borrador de esa semana se guardó recién; probá de nuevo" })
      )
    )
  );

/** Staff edits (drafts and, for corrections, published issues) */
export const updateIssue = (input: { id: string; title?: string; intro?: string; sections?: SemanarioSections }) =>
  Effect.gen(function* () {
    const { id, ...changes } = input;
    const [row] = yield* query((db) =>
      db.update(semanarioIssues).set(changes).where(eq(semanarioIssues.id, id)).returning()
    );
    if (!row) return yield* issueNotFound;
    if (row.status === "published") yield* refreshPages;

    return yield* getById(id);
  });

/**
 * Publish: the first time it gets the next number, and whoever publishes signs
 * it as its reviewer. A person has to: Owy drafts, it never publishes.
 */
export const publish = (id: string) =>
  Effect.gen(function* () {
    const reviewer = yield* CurrentUser;
    if (reviewer.via === "api-key") {
      return yield* new Forbidden({ message: "El Semanario lo publica una persona del staff, no un bot" });
    }

    yield* transaction(
      Effect.gen(function* () {
        const [row] = yield* query((db) =>
          db.select().from(semanarioIssues).where(eq(semanarioIssues.id, id)).for("update")
        );
        if (!row) return yield* issueNotFound;

        let number = row.number;
        if (number === null) {
          const [{ last }] = yield* query((db) =>
            db
              .select({ last: max(semanarioIssues.number) })
              .from(semanarioIssues)
              .where(isNotNull(semanarioIssues.number))
          );
          number = (last ?? 0) + 1;
        }

        yield* query((db) =>
          db
            .update(semanarioIssues)
            .set({
              status: "published",
              number,
              publishedAt: row.publishedAt ?? new Date(),
              reviewedById: reviewer.id,
            })
            .where(eq(semanarioIssues.id, id))
        );
      })
    ).pipe(
      Effect.catchTag("UniqueViolation", () =>
        Effect.fail(
          new Conflict({ reason: "number_taken", message: "Se publicó otro número al mismo tiempo; probá de nuevo" })
        )
      )
    );
    yield* refreshPages;

    return yield* getById(id);
  });

/** Back to draft; it keeps its number, so publishing it again restores the same URL. */
export const unpublish = (id: string) =>
  Effect.gen(function* () {
    const [row] = yield* query((db) =>
      db.update(semanarioIssues).set({ status: "draft" }).where(eq(semanarioIssues.id, id)).returning()
    );
    if (!row) return yield* issueNotFound;
    yield* refreshPages;

    return yield* getById(id);
  });
