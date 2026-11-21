import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

/**
 * Every dashboard page checks who's looking before it renders anything. The admin layout already
 * denies people without a role; this keeps each page asking for its own permission too, so a new
 * page can't quietly open itself to everyone with any role.
 */
const GUARDS = [
  "requirePermission(",
  "requireDashboardAccess(",
  "requireSignedIn(",
  "resolveAdminCommunityScope(",
  "redirectToEventPage(",
  "panelAccess(",
  "panelCommunity(",
];

const pagesUnder = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((file) => /(^|\/)page\.tsx$/.test(file))
    .map((file) => join(dir, file));

describe("dashboard pages", () => {
  test("every page under /admin and /organizar/panel calls a guard", () => {
    const root = join(process.cwd(), "src/app");
    const unguarded = [...pagesUnder(join(root, "admin")), ...pagesUnder(join(root, "organizar/panel"))]
      .filter((file) => !GUARDS.some((guard) => readFileSync(file, "utf8").includes(guard)))
      .map((file) => file.slice(root.length + 1));

    expect(unguarded).toStrictEqual([]);
  });
});
