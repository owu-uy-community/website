import { setupServer } from "msw/node";

/**
 * One MSW server per test file. No default handlers: any outbound HTTP a test
 * did not mock with `server.use(...)` fails the test (see setup-common.ts).
 */
export const server = setupServer();
