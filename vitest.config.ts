import { readdirSync } from "node:fs";
import { defineConfig } from "vitest/config";

const src = `${import.meta.dirname}/src`;
const isCI = Boolean(process.env.CI);

/**
 * The app imports `lib/…`, `app/…`, `components/…` straight from `src`
 * (tsconfig `paths: { "*": ["./src/*"] }`), so every top-level folder of `src`
 * becomes an alias. `server-only` throws outside a React Server Component
 * bundle; tests load server modules directly, so it resolves to nothing.
 */
export const alias = [
  ...readdirSync(src, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ find: new RegExp(`^${entry.name}/`), replacement: `${src}/${entry.name}/` })),
  { find: /^server-only$/, replacement: `${src}/test/empty-module.ts` },
];

/** Values server modules read at import time; nothing here reaches a real service. */
export const testEnv = {
  NODE_ENV: "test" as const,
  SKIP_ENV_VALIDATION: "true",
  BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters-long",
  NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
  // Unit tests never query; the pool connects lazily, so this is never dialled.
  DATABASE_URL: "postgresql://unit:unit@127.0.0.1:9/unit",
};

export default defineConfig({
  test: {
    reporters: isCI ? ["default", ["junit", { outputFile: "test-results/unit-junit.xml" }]] : ["default"],
    silent: "passed-only",
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      reporter: isCI ? ["text-summary", "lcov"] : ["text", "lcov"],
      // Explicit include so files no test touches still count against the total.
      include: ["src/lib/**/*.ts", "src/app/api/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.d.ts", "src/lib/db/seed.ts", "src/lib/db/create-owy-key.ts"],
    },
    projects: [
      {
        resolve: { alias },
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.integration.test.ts"],
          setupFiles: ["src/test/setup-common.ts"],
          env: testEnv,
          retry: isCI ? 1 : 0,
        },
      },
      {
        resolve: { alias },
        test: {
          name: "dom",
          environment: "happy-dom",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["src/test/setup-common.ts", "src/test/setup-dom.ts"],
          env: testEnv,
          retry: isCI ? 1 : 0,
        },
      },
    ],
  },
});
