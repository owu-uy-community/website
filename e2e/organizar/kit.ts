import AxeBuilder from "@axe-core/playwright";
import type { APIRequestContext, Page } from "@playwright/test";

import { baseURL, E2E_CRON_SECRET } from "../../playwright.config";
import { makeCommunity, makeEvent, makeMember, makeRsvp } from "../../src/test/factories";
import { expect } from "../fixtures";

/**
 * Organizá's e2e kit: events at times relative to now (so the scheduled sweeps find them), the dev
 * mailbox, the tick, broken requests and axe. Everything seeds through the app's own Drizzle client.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** A community and an organizer (editor unless told) who can open its panel. */
export async function makeOrganizer(role = "editor", overrides: Parameters<typeof makeCommunity>[0] = {}) {
  const community = await makeCommunity({ name: `Comunidad ${Date.now().toString(36)}`, ...overrides });
  const organizer = await makeMember(community.id, role, { name: "Organizadora de Prueba" });

  return { community, organizer, panel: `/organizar/panel/${community.slug}` };
}

/** A published event with OWU sign-up, starting `startsIn` ms from now (default: in 20 days, for 2 h). */
export function makePublishedEvent(
  communityId: string,
  {
    startsIn = 20 * DAY,
    hours = 2,
    ...overrides
  }: { startsIn?: number; hours?: number } & Parameters<typeof makeEvent>[1] = {}
) {
  const start = new Date(Date.now() + startsIn);

  return makeEvent(communityId, {
    name: `Meetup ${Date.now().toString(36)}`,
    status: "published",
    publishedAt: new Date(),
    registration: "owu",
    capacity: 40,
    startDate: start,
    endDate: new Date(start.getTime() + hours * HOUR),
    ...overrides,
  });
}

/** `count` people signed up, attending unless told; `checkedIn` of them came through the door. */
export async function makeRegistrations(
  eventId: string,
  count: number,
  { checkedIn = 0, ...overrides }: { checkedIn?: number } & Parameters<typeof makeRsvp>[1] = {}
) {
  const rows = [];
  for (let index = 0; index < count; index++) {
    rows.push(
      await makeRsvp(eventId, {
        name: `Persona ${index + 1}`,
        checkedInAt: index < checkedIn ? new Date() : null,
        checkinSource: index < checkedIn ? "owu" : null,
        ...overrides,
      })
    );
  }

  return rows;
}

type MailboxMessage = { to: string; subject: string; html: string; text: string; at: string };

/** What the app "sent" to someone, newest first (EMAIL_MAILBOX=1). */
export async function mailbox(request: APIRequestContext, to: string): Promise<MailboxMessage[]> {
  const response = await request.get(`${baseURL}/api/dev/mailbox?to=${encodeURIComponent(to)}`);

  return (await response.json()) as MailboxMessage[];
}

/** Waits for a mail to `to` whose subject matches, and returns it. */
export async function lastEmailTo(request: APIRequestContext, to: string, subject: RegExp | string) {
  let found: MailboxMessage | undefined;
  await expect
    .poll(
      async () => {
        found = (await mailbox(request, to)).find((message) =>
          typeof subject === "string" ? message.subject.includes(subject) : subject.test(message.subject)
        );
        return Boolean(found);
      },
      { message: `an email to ${to} matching ${subject}` }
    )
    .toBe(true);

  return found!;
}

/** The first link in a mail's text whose URL contains `fragment`. */
export function linkIn(message: MailboxMessage, fragment: string) {
  const url = message.text.match(/https?:\/\/\S+/g)?.find((candidate) => candidate.includes(fragment));
  if (!url) throw new Error(`No link with "${fragment}" in "${message.subject}"`);

  return url.replace(/[).,]+$/, "");
}

/** Runs every scheduled sweep now (reminders, offers, feedback, holds, venues, email): what QStash does every 5 min. */
export async function runTick(request: APIRequestContext) {
  const response = await request.get(`${baseURL}/api/cron/tick`, {
    headers: { authorization: `Bearer ${E2E_CRON_SECRET}` },
    timeout: 120_000,
  });
  expect(response.ok(), await response.text()).toBe(true);

  return (await response.json()) as Record<string, unknown>;
}

/** Makes calls to one oRPC procedure ("events.list") fail, to see the page's error state. */
export async function failNext(page: Page, procedure: string, { times = Infinity } = {}) {
  let left = times;
  await page.route(`**/api/orpc/${procedure.replaceAll(".", "/")}**`, async (route) => {
    if (left-- <= 0) return route.fallback();
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ json: {} }) });
  });
}

/** No serious or critical WCAG 2.2 AA issue on the page (or inside `include`). */
export async function expectAccessible(
  page: Page,
  { include, exclude }: { include?: string; exclude?: string[] } = {}
) {
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]);
  if (include) builder = builder.include(include);
  for (const selector of exclude ?? []) builder = builder.exclude(selector);
  const { violations } = await builder.analyze();
  const serious = violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => ({
      id: violation.id,
      help: violation.help,
      nodes: violation.nodes.slice(0, 3).map((node) => node.target.join(" ")),
    }));
  expect(serious).toStrictEqual([]);
}

export { DAY, HOUR };
