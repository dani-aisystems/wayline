// Database tests (npm run test:db): run against a real Supabase, one file at a time, in order.
// Kept apart from `npm test`, which must stay fast and need no network.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/db/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
