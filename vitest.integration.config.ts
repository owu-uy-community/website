import { defineConfig } from "vitest/config";

import { TEST_DATABASE_URL } from "./src/test/database-url.ts";
import { alias, testEnv } from "./vitest.config.ts";

const isCI = Boolean(process.env.CI);

/**
 * Integration tests run procedures against a real Postgres. The global setup
 * recreates the database named in TEST_DATABASE_URL (it must end in `_test`)
 * and pushes the Drizzle schema, so every run starts empty.
 *
 * Locally that is the docker-compose Postgres on :5433; CI uses a service
 * container. Tests create their own uniquely-named rows, so files run in
 * parallel — except `*.serial.integration.test.ts`, which touch singleton rows
 * (OBS rigs, the stage wall) and run one file at a time.
 */
const databaseUrl = TEST_DATABASE_URL;

const shared = {
  environment: "node" as const,
  setupFiles: ["src/test/setup-common.ts"],
  env: { ...testEnv, DATABASE_URL: databaseUrl, TEST_DATABASE_URL: databaseUrl },
  testTimeout: 20_000,
  hookTimeout: 60_000,
};

export default defineConfig({
  test: {
    globalSetup: ["src/test/integration-global-setup.ts"],
    reporters: isCI ? ["default", ["junit", { outputFile: "test-results/integration-junit.xml" }]] : ["default"],
    silent: "passed-only",
    projects: [
      {
        resolve: { alias },
        test: {
          ...shared,
          name: "integration",
          include: ["src/**/*.integration.test.ts"],
          exclude: ["src/**/*.serial.integration.test.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          ...shared,
          name: "integration-serial",
          include: ["src/**/*.serial.integration.test.ts"],
          fileParallelism: false,
        },
      },
    ],
  },
});
