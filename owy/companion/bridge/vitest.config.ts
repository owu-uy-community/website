import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["companion/bridge/test/**/*.test.ts"],
    environment: "node",
  },
});
