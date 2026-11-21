import { afterEach, expect, it, vi } from "vitest";

const listForAdmin = vi.fn(async () => [
  { id: "conf", slug: "owu-conf-2026", name: "OWU Conf" },
  { id: "demo", slug: "open-space-demo", name: "Demo" },
]);
vi.mock("../../../agent/lib/owu-api", () => ({ owuApi: () => ({ openSpaces: { listForAdmin } }) }));

const { resolveActiveEvent } = await import("../../../agent/lib/board");

afterEach(() => vi.unstubAllEnvs());

it("the pitch target (COMPANION_PITCH_EVENT_ID) wins over OWY_EVENT_ID; without it, OWY_EVENT_ID", async () => {
  vi.stubEnv("OWY_EVENT_ID", "owu-conf-2026");
  expect((await resolveActiveEvent("open-space-demo")).id).toBe("demo");
  expect((await resolveActiveEvent()).id).toBe("conf");
  await expect(resolveActiveEvent("nope")).rejects.toThrow(/nope/);
});
