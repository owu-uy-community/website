import { NextRequest } from "next/server";
import { describe, expect, test, vi } from "vitest";

import { GET } from "./route";

vi.mock(import("lib/db"), () => ({ db: {} as never }));

describe(GET, () => {
  test("opening the header's link shows the confirm page and changes nothing", () => {
    const response = GET(new NextRequest("https://www.owu.uy/api/email/unsubscribe?t=abc.def"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://www.owu.uy/email/baja?t=abc.def");
  });
});
