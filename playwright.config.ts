import { defineConfig, devices } from "@playwright/test";

import { E2E_DATABASE_URL } from "./src/test/database-url.ts";

const isCI = Boolean(process.env.CI);
const PORT = Number(process.env.E2E_PORT ?? 3100);
const REALTIME_PORT = Number(process.env.E2E_REALTIME_PORT ?? 3299);
const OBS_PORT = Number(process.env.E2E_OBS_PORT ?? 4466);

export const baseURL = `http://127.0.0.1:${PORT}`;
export const E2E_AUTH_SECRET = "e2e-secret-that-is-at-least-32-characters-long";

// Fixtures seed and mint sessions straight into the e2e database through the
// app's own Drizzle client (lib/db), which reads DATABASE_URL at import time.
process.env.DATABASE_URL = E2E_DATABASE_URL;

/** What the app under test sees. NEXT_PUBLIC_* values are inlined at build time on CI. */
export const appEnv = {
  DATABASE_URL: E2E_DATABASE_URL,
  BETTER_AUTH_SECRET: E2E_AUTH_SECRET,
  BETTER_AUTH_URL: baseURL,
  NEXT_PUBLIC_BASE_URL: baseURL,
  NEXT_PUBLIC_APP_URL: baseURL,
  NEXT_PUBLIC_DOMAIN: "127.0.0.1",
  NEXT_PUBLIC_REALTIME_URL: `ws://127.0.0.1:${REALTIME_PORT}`,
  REALTIME_SIDECAR_URL: `http://127.0.0.1:${REALTIME_PORT}`,
  SLACK_CLIENT_ID: "e2e",
  SLACK_CLIENT_SECRET: "e2e",
};

export default defineConfig({
  testDir: "e2e",
  testMatch: /.*\.e2e\.ts/,
  fullyParallel: true,
  forbidOnly: isCI,
  // A retry that passes is a defect report thrown away: find the race instead.
  retries: 0,
  workers: isCI ? 2 : undefined,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: isCI
    ? [["line"], ["junit", { outputFile: "test-results/e2e-junit.xml" }], ["blob"]]
    : [["list"], ["html", { open: "never" }]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL,
    locale: "es-UY",
    timezoneId: "America/Montevideo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: /.*\.mobile\.e2e\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /.*\.mobile\.e2e\.ts/ },
  ],
  webServer: [
    {
      command: "node scripts/dev-realtime.mjs",
      env: { REALTIME_PORT: String(REALTIME_PORT) },
      port: REALTIME_PORT,
      reuseExistingServer: !isCI,
    },
    {
      command: "node scripts/mock-obs.mjs",
      env: { MOCK_OBS_PORT: String(OBS_PORT) },
      port: OBS_PORT,
      reuseExistingServer: !isCI,
    },
    {
      command: isCI ? `pnpm start -p ${PORT} -H 127.0.0.1` : `pnpm exec next dev -p ${PORT} -H 127.0.0.1`,
      url: `${baseURL}/api/health`,
      env: appEnv,
      timeout: 180_000,
      reuseExistingServer: !isCI,
    },
  ],
});
