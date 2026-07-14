import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // Each test file runs in isolation so module mocks don't leak
    isolate: true,
    // Provide a fake DATABASE_URL so @workspace/db loads without throwing.
    // The pg.Pool only connects on first query; since db is mocked, it never fires.
    env: {
      DATABASE_URL: "postgresql://test:test@localhost:5432/test_db",
      SESSION_SECRET: "test-secret",
    },
  },
});
