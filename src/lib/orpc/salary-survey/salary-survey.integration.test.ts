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

describe("salarySurvey.submit", () => {
  test("one answer per person, stored without who answered", async () => {
    const { slug, surveyId } = await edition();
    const user = await makeUser();

    await expect(call(router.salarySurvey.submit, { slug, answers: answers() }, by(user))).resolves.toEqual({ ok: true });
    await expect(call(router.salarySurvey.submit, { slug, answers: answers() }, by(user))).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "already_answered" },
    });

    const responses = await db.select().from(salarySurveyResponses).where(eq(salarySurveyResponses.surveyId, surveyId));
    const participants = await db.select().from(salarySurveyParticipants).where(eq(salarySurveyParticipants.surveyId, surveyId));
    expect(responses).toHaveLength(1);
    expect(participants).toHaveLength(1);
    expect(JSON.stringify(responses)).not.toContain(user.id);
    expect(participants[0].participantHash).not.toContain(user.id);
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

    expect(await call(router.salarySurvey.current, undefined, by(user))).toMatchObject({
      survey: { slug, status: "open", responseCount: 0 },
      answered: false,
    });
    await call(router.salarySurvey.submit, { slug, answers: answers() }, by(user));
    expect(await call(router.salarySurvey.current, undefined, by(user))).toMatchObject({
      survey: { slug, responseCount: 1 },
      answered: true,
    });
    expect(await call(router.salarySurvey.current, undefined, by(null))).toMatchObject({ answered: false });
  });
});

describe("salarySurvey.results", () => {
  test("only published editions, with small groups hidden and currencies apart", async () => {
    const { slug, staff, surveyId } = await edition("closed");
    await expect(call(router.salarySurvey.results, { slug }, by(null))).rejects.toMatchObject({ code: "NOT_FOUND" });

    const rows = [
      ...Array.from({ length: 12 }, (_, index) => ({ ...answers({ amount: 100_000 + index * 1000 }) })),
      ...Array.from({ length: 3 }, () => answers({ seniority: "junior", amount: 50_000 })),
      ...Array.from({ length: 4 }, () => answers({ currency: "USD", amount: 4000, employer: "cliente-exterior" })),
    ];
    await db.insert(salarySurveyResponses).values(rows.map((row) => ({ surveyId, ...row })));
    await call(router.salarySurvey.setStatus, { slug, status: "published" }, by(staff));

    const results = await call(router.salarySurvey.results, { slug }, by(null));

    expect(results.threshold).toBe(10);
    expect(results.survey.responseCount).toBe(19);
    expect(results.currencies.UYU.n).toBe(15);
    expect(results.currencies.UYU.overall).toMatchObject({ n: 15 });
    expect(results.currencies.UYU.bySeniority).toEqual({
      groups: [{ key: "senior", label: "Senior", stat: { n: 12, p25: 102_750, median: 105_500, p75: 108_250 } }],
      hidden: 1,
    });
    expect(results.currencies.UYU.byStack.groups.map((group) => group.key)).toEqual(["js-ts", "python"]);
    expect(results.currencies.USD).toMatchObject({ n: 4, overall: null, byMarket: { groups: [], hidden: 1 } });

    const dataset = await call(router.salarySurvey.dataset, { slug }, by(null));
    expect(dataset.filename).toBe(`encuesta-sueldos-owu-${slug}.csv`);
    expect(dataset.csv.trim().split("\n")).toHaveLength(20);
  });
});
