import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

/**
 * Formatter settings. They keep the Prettier config this repo used before
 * (120 columns, ES5 trailing commas, double quotes); import sorting stays off
 * so imports only move when someone edits them.
 *
 * Tailwind classes are ordered against `globals.css`, so the theme's own
 * utilities (`bg-primary`, `border-border`) sort like built-in ones instead of
 * being shoved to the front as unknown classes.
 */
export default defineConfig({
  ...ultracite,
  printWidth: 120,
  proseWrap: "preserve",
  sortImports: false,
  sortPackageJson: false,
  sortTailwindcss: {
    ...(typeof ultracite.sortTailwindcss === "object" ? ultracite.sortTailwindcss : {}),
    stylesheet: "src/app/globals.css",
  },
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    "owy/**",
    "content/**",
    "public/**",
    "data/**",
    "pnpm-lock.yaml",
    // pnpm rewrites this file on every install; formatting it only creates churn.
    "pnpm-workspace.yaml",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    "coverage/**",
  ],
});
