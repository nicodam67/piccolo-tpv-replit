import { defineConfig } from "vitest/config";

const runDatabaseIntegration = process.env["RUN_DB_INTEGRATION_TESTS"] === "1";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // Each test file runs in isolation so module mocks don't leak
    isolate: true,
    // Provide a fake DATABASE_URL so @workspace/db loads without throwing.
    // The pg.Pool only connects on first query; since db is mocked, it never fires.
    env: {
      DATABASE_URL: runDatabaseIntegration
        ? process.env["DATABASE_URL"] ?? ""
        : "postgresql://test:test@localhost:5432/test_db",
      SESSION_SECRET: process.env["SESSION_SECRET"] ?? "test-session-secret-at-least-32-characters",
    },
  },
});
