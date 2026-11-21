import { NextRequest } from "next/server";
import { describe, expect, test } from "vitest";

import { GET } from "./route";

describe("/api/session/expired", () => {
  test("clears the session cookies the way browsers accept, then sends to /login without bouncing back", () => {
    const response = GET(new NextRequest("https://www.owu.uy/api/session/expired?next=%2Fadmin"));
    const cleared = response.headers.getSetCookie();
    const secure = cleared.filter((cookie) => cookie.startsWith("__Secure-better-auth.session_token="));

    expect(response.headers.get("location")).toBe("https://www.owu.uy/login?next=%2Fadmin&expired=1");
    // A `__Secure-` cookie only goes away with Secure on the clearing cookie
    expect(secure).toHaveLength(1);
    expect(secure[0]).toMatch(/Max-Age=0/);
    expect(secure[0]).toMatch(/; Secure/);
  });
});
