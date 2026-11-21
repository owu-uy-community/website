import { afterAll, afterEach, beforeAll, vi } from "vitest";

import { server } from "./msw/server";

// Outside Next, a "use cache" directive is an inert string, but cacheLife() and cacheTag() throw
// without the Cache Components runtime. Tests call cached functions (route helpers, page data)
// directly, so here they're no-ops.
vi.mock(import("next/cache"), async (importOriginal) => ({
  ...(await importOriginal()),
  cacheLife: () => {},
  cacheTag: () => {},
}));

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

afterAll(() => {
  server.close();
});
