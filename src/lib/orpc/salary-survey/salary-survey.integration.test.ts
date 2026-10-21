import { createId } from "@paralleldrive/cuid2";
import { call } from "@orpc/server";
import { eq, ne } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "lib/db";
import { salarySurveyParticipants, salarySurveyResponses, salarySurveys } from "lib/db/schema";
import { router } from "lib/orpc/router";
import { by } from "test/context";
import { makeSiteAdmin, makeUser } from "test/factories";

import type { Answers } from "./schemas";

const answers = (overrides: Partial<Answers> = {}): Answers => ({
  role: "backend",
  seniority: "senior",
  experience: "5-10",
  stacks: ["js-ts", "python"],
  employer: "empresa-uy",
  contract: "dependencia",
  modality: "remoto",
  department: "montevideo",
  currency: "UYU",
  amount: 120_000,
  hoursPerWeek: 40,
  satisfaction: 4,
  gender: null,
  education: null,
  ...overrides,
});

async function edition(status: "draft" | "open" | "closed" | "published" = "open", dates: { closesAt?: string } = {}) {
  const staff = await makeSiteAdmin();
  const slug = `t-${createId().slice(0, 10)}`;
  await call(
    router.salarySurvey.upsert,
    { slug, title: "Encuesta de prueba", opensAt: null, closesAt: dates.closesAt ?? null },
    by(staff)
  );
  await call(router.salarySurvey.setStatus, { slug, status }, by(staff));
  const [row] = await db.select().from(salarySurveys).where(eq(salarySurveys.slug, slug));

  return { slug, staff, surveyId: row.id };
}

/** An edition with 12 senior + 3 junior answers in UYU and 4 in USD, published */
async function publishedEdition() {
  const { slug, staff, surveyId } = await edition("closed");
  const rows = [
    ...Array.from({ length: 12 }, (_, index) => answers({ amount: 100_000 + index * 1000 })),
    ...Array.from({ length: 3 }, () => answers({ seniority: "junior", amount: 50_000 })),
    ...Array.from({ length: 4 }, () => answers({ currency: "USD", amount: 4000, employer: "cliente-exterior" })),
  ];
  await db.insert(salarySurveyResponses).values(rows.map((row) => ({ surveyId, ...row })));
  await call(router.salarySurvey.setStatus, { slug, status: "published" }, by(staff));

  return slug;
}

describe("salarySurvey.submit", () => {
  test("one answer per person", async () => {
    const { slug } = await edition();
    const user = await makeUser();

    await expect(call(router.salarySurvey.submit, { slug, answers: answers() }, by(user))).resolves.toStrictEqual({
      ok: true,
    });
    await expect(call(router.salarySurvey.submit, { slug, answers: answers() }, by(user))).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "already_answered" },
    });
  });

  test("the answer is stored without who answered, dated by day only", async () => {
    const { slug, surveyId } = await edition();
    const user = await makeUser();
    await call(router.salarySurvey.submit, { slug, answers: answers() }, by(user));

    const responses = await db.select().from(salarySurveyResponses).where(eq(salarySurveyResponses.surveyId, surveyId));
    const participants = await db.select().from(salarySurveyParticipants).where(eq(salarySurveyParticipants.surveyId, surveyId));

    expect(responses).toHaveLength(1);
    expect(JSON.stringify(responses)).not.toContain(user.id);
    expect(participants.map((row) => row.participantHash).join(",")).not.toContain(user.id);
    expect(responses[0].createdOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("a closed edition, or one past its closing date, takes no answers", async () => {
    const closed = await edition("closed");
    const expired = await edition("open", { closesAt: new Date(Date.now() - 60_000).toISOString() });
    const user = await makeUser();

    for (const { slug } of [closed, expired]) {
      await expect(call(router.salarySurvey.submit, { slug, answers: answers() }, by(user))).rejects.toMatchObject({
        code: "CONFLICT",
        data: { reason: "survey_closed" },
      });
    }
  });

  test("answers outside the currency's sane range are rejected", async () => {
    const { slug } = await edition();
    const user = await makeUser();

    await expect(
      call(router.salarySurvey.submit, { slug, answers: answers({ currency: "USD", amount: 120_000 }) }, by(user))
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("anonymous people sign in first; only staff manage editions", async () => {
    const { slug } = await edition();
    const user = await makeUser();

    await expect(call(router.salarySurvey.submit, { slug, answers: answers() }, by(null))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(call(router.salarySurvey.setStatus, { slug, status: "published" }, by(user))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("salarySurvey.current", () => {
  test("shows the open edition and whether the caller already answered", async () => {
    await db.update(salarySurveys).set({ status: "draft" }).where(ne(salarySurveys.status, "draft"));
    const { slug } = await edition();
    const user = await makeUser();

    await expect(call(router.salarySurvey.current, undefined, by(user))).resolves.toMatchObject({
      survey: { slug, status: "open", responseCount: 0 },
      answered: false,
    });
    await call(router.salarySurvey.submit, { slug, answers: answers() }, by(user));

    await expect(call(router.salarySurvey.current, undefined, by(user))).resolves.toMatchObject({
      survey: { slug, responseCount: 1 },
      answered: true,
    });
    await expect(call(router.salarySurvey.current, undefined, by(null))).resolves.toMatchObject({ answered: false });
  });
});

describe("salarySurvey.results", () => {
  test("only published editions have results", async () => {
    const { slug } = await edition("closed");

    await expect(call(router.salarySurvey.results, { slug }, by(null))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(call(router.salarySurvey.dataset, { slug }, by(null))).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("groups under the threshold are hidden", async () => {
    const slug = await publishedEdition();
    const results = await call(router.salarySurvey.results, { slug }, by(null));

    expect(results.threshold).toBe(10);
    expect(results.survey.responseCount).toBe(19);
    expect(results.currencies.UYU.bySeniority).toStrictEqual({
      groups: [{ key: "senior", label: "Senior", stat: { n: 12, p25: 102_750, median: 105_500, p75: 108_250 } }],
      hidden: 1,
    });
    expect(results.currencies.UYU.byStack.groups.map((group) => group.key)).toStrictEqual(["js-ts", "python"]);
  });

  test("currencies are never mixed", async () => {
    const slug = await publishedEdition();
    const results = await call(router.salarySurvey.results, { slug }, by(null));

    expect(results.currencies.UYU).toMatchObject({ n: 15, overall: { n: 15 } });
    expect(results.currencies.USD).toMatchObject({ n: 4, overall: null, byMarket: { groups: [], hidden: 1 } });
  });

  test("results carry the respondents' profile and the satisfaction scale, both above the threshold", async () => {
    const slug = await publishedEdition();
    const results = await call(router.salarySurvey.results, { slug }, by(null));

    const seniority = results.profile.find((dimension) => dimension.key === "seniority")!;
    // 12 senior + 3 junior (UYU) + 4 senior (USD): juniors are too few to be listed
    expect(seniority.groups).toStrictEqual([{ key: "senior", label: "Senior", n: 16 }]);
    expect(seniority.other).toBe(3);
    expect(results.satisfaction).toMatchObject({ n: 19, mean: 4, distribution: [0, 0, 0, 19, 0] });
  });

  test("published editions are public; the JSON rows match the CSV", async () => {
    const slug = await publishedEdition();
    const editions = await call(router.salarySurvey.editions, undefined, by(null));
    expect(editions.map((edition) => edition.slug)).toContain(slug);
    expect(editions.every((edition) => edition.status === "published")).toBe(true);

    const { rows } = await call(router.salarySurvey.datasetRows, { slug }, by(null));
    const { csv } = await call(router.salarySurvey.dataset, { slug }, by(null));
    expect(rows).toHaveLength(csv.trim().split("\n").length - 1);
    expect(rows[0]).toHaveProperty("conformidad", 4);
  });

  test("the dataset has one row per answer", async () => {
    const slug = await publishedEdition();
    const dataset = await call(router.salarySurvey.dataset, { slug }, by(null));

    expect(dataset.filename).toBe(`encuesta-sueldos-owu-${slug}.csv`);
    expect(dataset.csv.trim().split("\n")).toHaveLength(20);
  });
});
