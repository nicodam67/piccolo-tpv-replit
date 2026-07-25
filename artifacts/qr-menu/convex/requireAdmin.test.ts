import { beforeEach, describe, expect, it, vi } from "vitest";

const getAuthUserId = vi.hoisted(() => vi.fn());
vi.mock("@convex-dev/auth/server", () => ({ getAuthUserId }));

const { requireAdmin } = await import("./requireAdmin");

function context(admin: { role: string } | null) {
  return {
    db: {
      get: vi.fn().mockResolvedValue({ email: "admin@example.com" }),
      query: vi.fn(() => ({
        withIndex: vi.fn((_name, callback) => {
          callback({ eq: vi.fn() });
          return { first: vi.fn().mockResolvedValue(admin) };
        }),
      })),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getAuthUserId.mockResolvedValue("user-1");
});

describe("Convex admin authorization", () => {
  it("fails closed when the authenticated user has no admins entry", async () => {
    await expect(requireAdmin(context(null) as never)).rejects.toThrow();
  });

  it("allows only an explicit admin entry", async () => {
    await expect(requireAdmin(context({ role: "admin" }) as never)).resolves.toMatchObject({
      role: "admin",
    });
  });

  it("rejects unauthenticated users", async () => {
    getAuthUserId.mockResolvedValue(null);
    await expect(requireAdmin(context({ role: "admin" }) as never)).rejects.toThrow();
  });
});
