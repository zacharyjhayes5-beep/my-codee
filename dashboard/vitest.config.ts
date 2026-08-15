import { defineConfig } from "vitest/config";

/**
 * Kept separate from vite.config.ts on purpose — that file carries the
 * `base: '/my-codee/'` that GitHub Pages depends on, and it should not be
 * touched to add test settings.
 */
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts"],
  },
});
