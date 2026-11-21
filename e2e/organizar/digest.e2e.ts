import type { APIRequestContext } from "@playwright/test";

import { baseURL, E2E_CRON_SECRET } from "../../playwright.config";
import { makeEvent, makeUser } from "../../src/test/factories";
import { expect, test } from "../fixtures";
import { DAY, lastEmailTo, mailbox, makeOrganizer } from "./kit";

/** The daily cron with ?digest=now: every sweep, and the weekly digest whatever the day. */
async function runDigest(request: APIRequestContext) {
  const response = await request.get(`${baseURL}/api/cron/tick?digest=now`, {
    headers: { authorization: `Bearer ${E2E_CRON_SECRET}` },
    timeout: 120_000,
  });
  expect(response.ok(), await response.text()).toBe(true);
}

test("a weekly follower gets no mail per event, then one digest with both", async ({ pageFor, request }) => {
  const id = Date.now().toString(36);
  const { community, organizer } = await makeOrganizer("editor", { name: `Comunidad semanal ${id}` });
  const follower = await makeUser({ name: "Seguidora Semanal" });

  const page = await pageFor(follower);
  await page.goto(`/comunidad/${community.slug}`);
  await page.getByRole("button", { name: /^Seguir/ }).click();
  await expect(page.getByRole("button", { name: /Siguiendo/ })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Cada evento" })).toBeChecked();
  await page.getByRole("radio", { name: "Un resumen por semana" }).click();
  await expect(page.getByRole("radio", { name: "Un resumen por semana" })).toBeChecked();
  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(page.getByRole("radio", { name: "Un resumen por semana" })).toBeChecked();

  const panel = await pageFor(organizer);
  const names = [`Primer meetup ${id}`, `Segundo meetup ${id}`];
  for (const [index, name] of names.entries()) {
    const start = new Date(Date.now() + (4 + index * 4) * DAY);
    const draft = await makeEvent(community.id, {
      name,
      summary: "Charlas cortas",
      status: "draft",
      heldUntil: new Date(Date.now() + 7 * DAY),
      registration: "none",
      startDate: start,
      endDate: new Date(start.getTime() + 2 * 3_600_000),
    });
    const published = await panel.request.post("/api/orpc/events/publish", {
      data: { json: { communityId: community.id, eventId: draft.id } },
    });
    expect(published.ok(), await published.text()).toBe(true);
  }

  await runDigest(request);
  const digest = await lastEmailTo(request, follower.email, "Esta semana en OWU: 2 eventos");
  expect(names.every((name) => digest.text.includes(name))).toBe(true);
  // A second run that week sends nothing new, and no per-event mail ever went out
  await runDigest(request);
  const subjects = (await mailbox(request, follower.email)).map((message) => message.subject);
  expect(subjects.filter((subject) => subject.startsWith("Esta semana en OWU"))).toHaveLength(1);
  expect(subjects.filter((subject) => subject.includes("publicó"))).toStrictEqual([]);
});
