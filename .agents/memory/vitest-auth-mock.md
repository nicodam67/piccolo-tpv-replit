---
name: Vitest JWT auth mock
description: requireAuth uses synchronous jwt.verify — mock must return value, not use callback form.
---

# Vitest JWT mock must be synchronous

**Why:** The `requireAuth` middleware calls `jwt.verify(token, secret)` synchronously (2 args, no callback). Using a callback-form mock makes `cb` undefined, which throws TypeError, caught by the try/catch, and returns 401 to all authenticated requests.

## Correct mock pattern
```ts
vi.mock("jsonwebtoken", () => ({
  default: {
    verify: vi.fn(() => ({ id: "admin-uuid", role: "admin", name: "Test Admin" })),
    sign:   vi.fn(() => "mock-token"),
  },
}));
```

## Wrong pattern (will break auth in tests)
```ts
// DO NOT USE — cb is undefined, throws TypeError, all routes return 401
vi.mock("jsonwebtoken", () => ({
  default: {
    verify: (_token, _secret, cb) => {
      cb(null, { id: "admin-uuid", role: "admin", name: "Test Admin" });
    },
  },
}));
```

## Other required mocks for route tests
Always include these alongside the JWT mock:
```ts
vi.mock("drizzle-orm", async (importOriginal) => importOriginal());
vi.mock("../lib/socket", () => ({
  getIO:      vi.fn(() => ({ emit: vi.fn(), to: vi.fn(() => ({ emit: vi.fn() })) })),
  initSocket: vi.fn(),
}));
```

**How to apply:** Any new test file that tests authenticated routes in api-server must use the synchronous vi.fn() form.
