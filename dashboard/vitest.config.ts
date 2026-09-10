import { defineConfig } from "vitest/config";

/**
 * Kept separate from vite.config.ts on purpose — that file carries the
 * `base: '/my-codee/'` that GitHub Pages depends on, and it should not be
 * touched to add test settings.
 */
export default defineConfig({
  test: {
    environment: "node",
    /**
     * Pin the clock to the agency's own timezone.
     *
     * Half this application reasons about "his day" rather than a UTC one —
     * a call logged at eight in the evening in Michigan belongs to that
     * evening, not to tomorrow. Tests written against that behaviour pass on
     * his machine and failed in CI, which runs in UTC, for no reason other
     * than the runner's clock. Pinning it here makes the suite deterministic
     * everywhere and matches the only timezone this agency operates in.
     */
    env: { TZ: "America/New_York" },
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts"],
  },
});
