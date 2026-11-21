import { eq } from "drizzle-orm";
import { http, HttpResponse } from "msw";
import { describe, expect, test } from "vitest";

import { db } from "lib/db";
import { user } from "lib/db/schema";
import { makeCommunity, makeMember } from "test/factories";
import { server } from "test/msw/server";

import { syncOwuSlack } from "./slack-sync";

describe("the daily OWU Slack check", () => {
  test("marks role holders who left the OWU Slack and clears whoever came back; Slack failures change nothing", async () => {
    const community = await makeCommunity();
    const [left, back, flaky] = await Promise.all([
      makeMember(community.id, "editor", {}, { slack: "U0LEFTOWU" }),
      makeMember(community.id, "editor", { slackDeactivatedAt: new Date("2026-10-01") }, { slack: "U0BACKOWU" }),
      makeMember(community.id, "editor", {}, { slack: "U0FLAKY" }),
    ]);
    server.use(
      http.get("https://slack.com/api/users.info", ({ request }) => {
        const id = new URL(request.url).searchParams.get("user");
        if (id === "U0LEFTOWU") return HttpResponse.json({ ok: true, user: { deleted: true } });
        if (id === "U0FLAKY") return HttpResponse.json({ ok: false, error: "ratelimited" });

        return HttpResponse.json({ ok: true, user: { deleted: false } });
      })
    );

    await syncOwuSlack("xoxb-test");

    const marks = await Promise.all(
      [left, back, flaky].map(async (person) =>
        Boolean((await db.select().from(user).where(eq(user.id, person.id)))[0].slackDeactivatedAt)
      )
    );
    expect(marks).toStrictEqual([true, false, false]);
  });

  test("without Owy's Slack token it does nothing", async () => {
    await expect(syncOwuSlack("")).resolves.toStrictEqual({ skipped: "sin OWY_SLACK_BOT_TOKEN" });
  });
});
