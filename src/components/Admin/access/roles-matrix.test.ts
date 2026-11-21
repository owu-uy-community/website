import { describe, expect, test } from "vitest";

import {
  COMMUNITY_ROLE_GRANTS,
  communityStatements,
  PLATFORM_ROLE_GRANTS,
  platformStatements,
} from "lib/authz/catalog";

import { rolesMatrix } from "./roles-matrix";

describe(rolesMatrix, () => {
  test("lists what each role holds per resource", () => {
    const platform = rolesMatrix(PLATFORM_ROLE_GRANTS, platformStatements);
    const user = platform.find((row) => row.resource === "user");
    expect(user?.held.superadmin).not.toContain("impersonate-admins");
    expect(user?.held.moderator).toStrictEqual(["list", "ban", "get"]);
    expect(user?.held.staff).toStrictEqual([]);

    const community = rolesMatrix(COMMUNITY_ROLE_GRANTS, communityStatements);
    expect(community.find((row) => row.resource === "attendee")?.held.door).toStrictEqual(["checkin", "checkins"]);
    // A resource no role holds drops out.
    expect(rolesMatrix({ user: {} }, platformStatements)).toStrictEqual([]);
  });
});
