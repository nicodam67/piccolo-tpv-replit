import { beforeEach, describe, expect, it, vi } from "vitest";

function makeChain(value: unknown) {
  const chain: Record<string, unknown> & {
    then: (resolve: (result: unknown) => unknown) => Promise<unknown>;
  } = {
    then: (resolve) => Promise.resolve(value).then(resolve),
  };
  for (const method of ["select", "from", "limit", "set", "where", "returning", "values", "catch"]) {
    chain[method] = vi.fn(() => chain);
  }
  return chain;
}

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
}));
const mockEmit = vi.hoisted(() => vi.fn());

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return { ...actual, db: mockDb };
});

vi.mock("./socket-events", () => ({
  emitToFunction: mockEmit,
}));

vi.mock("./print-connector-sim", () => ({
  sendToPrinter: vi.fn(),
}));

const { recoverStalePrintJobs } = await import("./print-worker");

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.select.mockReturnValue(makeChain([]));
  mockDb.update.mockReturnValue(makeChain([]));
  mockDb.insert.mockReturnValue(makeChain([]));
});

describe("print worker recovery", () => {
  it("requeues stale sending jobs and audits the automatic recovery", async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([{ id: "job-stale" }]))
      .mockReturnValueOnce(makeChain([]));

    const recovered = await recoverStalePrintJobs(new Date("2026-07-23T07:00:00Z"));

    expect(recovered).toBe(1);
    expect(mockDb.update).toHaveBeenCalledOnce();
    expect(mockDb.insert).toHaveBeenCalledOnce();
    expect(mockEmit).toHaveBeenCalledWith("admin", "print:status", {
      jobId: "job-stale",
      status: "recovering",
    });
  });

  it("finalizes an acknowledged print after restart without sending it again", async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([{ id: "job-acknowledged" }]))
      .mockReturnValueOnce(makeChain([{ createdAt: new Date("2026-07-23T06:59:00Z") }]));

    expect(await recoverStalePrintJobs(new Date("2026-07-23T07:03:00Z"))).toBe(1);
    expect(mockEmit).toHaveBeenCalledWith("admin", "print:status", {
      jobId: "job-acknowledged",
      status: "printed",
    });
  });

  it("does nothing when there are no interrupted jobs", async () => {
    expect(await recoverStalePrintJobs()).toBe(0);
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });
});
