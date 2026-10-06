import { afterAll, afterEach, beforeAll, vi } from "vitest";

import { server } from "./msw/server";

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  server.resetHandlers();
  vi.useRealTimers();
});

afterAll(() => {
  server.close();
});
