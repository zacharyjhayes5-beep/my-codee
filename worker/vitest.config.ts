import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The unit tests are offline and must stay that way. The live dry run in
    // scripts/ talks to Kent County and is run explicitly, never by `npm test`.
    include: ["src/**/*.test.ts"],
  },
});
