import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/freeze-clock.ts"],
    testTimeout: 60_000,
    hookTimeout: 30_000,
    silent: "passed-only",
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**"],
      exclude: ["**/*.d.ts"],
      thresholds: {
        statements: 90,
        branches: 65,
        functions: 90,
        lines: 90,
      },
    },
  },
});
