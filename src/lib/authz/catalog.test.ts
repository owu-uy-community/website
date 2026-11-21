import { describe, expect, test } from "vitest";

import { redact } from "./audit";
import {
  COMMUNITY_ROLE_GRANTS,
  communityPart,
  grantsWithin,
  intersectGrants,
  PLATFORM_ROLE_GRANTS,
  platformRolesOf,
  sanitizeGrants,
} from "./catalog";
import { slackTeamOf } from "./slack";

describe("permission catalog", () => {
  test("platform roles read from user.role: several, legacy names mapped, unknown dropped, never empty", () => {
    expect([
      platformRolesOf("staff,moderator"),
      platformRolesOf("admin"),
      platformRolesOf("hacker"),
      platformRolesOf(null),
    ]).toStrictEqual([["staff", "moderator"], ["staff"], ["user"], ["user"]]);
  });

  test("each built-in community role holds everything the one below it holds", () => {
    const ladder = ["member", "editor", "admin", "owner"] as const;
    const nested = ladder
      .slice(1)
      .map((role, index) => grantsWithin(COMMUNITY_ROLE_GRANTS[ladder[index]], COMMUNITY_ROLE_GRANTS[role]));

    expect(nested).toStrictEqual([true, true, true]);
    expect(grantsWithin(COMMUNITY_ROLE_GRANTS.door, COMMUNITY_ROLE_GRANTS.member)).toBe(true);
  });

  test("nobody, not even superadmins, may view the site as another privileged person", () => {
    const holders = Object.entries(PLATFORM_ROLE_GRANTS)
      .filter(([, grants]) => ((grants as Record<string, readonly string[]>).user ?? []).includes("impersonate-admins"))
      .map(([role]) => role);

    expect(holders).toStrictEqual([]);
  });

  test("grants are cleaned of unknown resources and actions, intersected and cut to the community part", () => {
    const dirty = { event: ["read", "hack"], nope: ["x"], stage: ["operate"], attendee: [] as string[] };
    const clean = sanitizeGrants(dirty);

    expect(clean).toStrictEqual({ event: ["read"], stage: ["operate"] });
    expect(intersectGrants(clean, { event: ["read", "update"] })).toStrictEqual({ event: ["read"] });
    expect(communityPart(clean)).toStrictEqual({ event: ["read"] });
  });
});

describe("Slack and audit helpers", () => {
  test("the workspace comes from a Slack ID token; anything else is null", () => {
    const token = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;

    expect([
      slackTeamOf(token({ "https://slack.com/team_id": "T03FS7KF3" })),
      slackTeamOf(token({ sub: "U1" })),
      slackTeamOf("not-a-token"),
      slackTeamOf(null),
    ]).toStrictEqual(["T03FS7KF3", null, null, null]);
  });

  test("audit payloads drop credentials and cut long strings, at any depth", () => {
    const photo = `data:image/jpeg;base64,${"A".repeat(1000)}`;
    const kept = redact({ input: { apiKey: "owy_secret", code: "123456", imageData: photo, title: "Charla" } }) as {
      input: Record<string, string>;
    };

    expect(kept.input).toMatchObject({ apiKey: "[redactado]", code: "[redactado]", title: "Charla" });
    expect(kept.input.imageData.length).toBeLessThan(310);
  });
});
