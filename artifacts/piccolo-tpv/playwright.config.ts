import { defineConfig } from "@playwright/test";

/**
 * Piccolo TPV — Playwright E2E configuration
 *
 * Tests run against the live dev server. Start the server before running:
 *   pnpm --filter @workspace/api-server run dev   # terminal 1
 *   pnpm --filter @workspace/piccolo-tpv run dev  # terminal 2
 *
 * Run the suite:
 *   pnpm --filter @workspace/piccolo-tpv run test:e2e
 *
 * The tests use Playwright's request fixture (API-level) and the page fixture
 * (UI-level) to verify both backend state and frontend rendering.
 */

const BASE_URL = process.env.TPV_BASE_URL ?? "http://localhost:5173";
const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3000/api";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,       // TPV state is shared; run tests serially by default
  retries: 0,
  timeout: 30_000,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: BASE_URL,
    extraHTTPHeaders: {
      "Content-Type": "application/json",
    },
    ignoreHTTPSErrors: true,
  },

  // API base exported for test helpers
  projects: [
    {
      name: "api",
      use: {
        baseURL: API_BASE,
      },
    },
  ],
});

export { API_BASE, BASE_URL };
