import { beforeEach, describe, expect, it, vi } from "vitest";

function makeChain(value: unknown) {
  const chain: Record<string, unknown> & {
    then: (resolve: (result: unknown) => unknown) => Promise<unknown>;
  } = {
    then: (resolve) => Promise.resolve(value).then(resolve),
  };
  for (const method of ["select", "from", "where", "limit", "insert", "values"]) {
    chain[method] = vi.fn(() => chain);
  }
  return chain;
}

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return { ...actual, db: mockDb };
});

const { dispatchKitchenPrint } = await import("./print-dispatch");

const CONFIG = {
  printMode: "printers_only",
  printTemplateConfig: null,
  nombreComercial: "Piccolo",
  datosFiscales: "Piccolo SL",
  web: "",
};

const PRINTER = {
  id: "printer-1",
  name: "Cocina",
  type: "cocina",
  brand: "",
  model: "",
  ip: "127.0.0.1",
  port: 9100,
  paperWidth: 80,
  copies: 1,
  active: true,
  isPrimary: true,
  fallbackPrinterId: null,
  lastStatus: "online",
  lastStatusAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const PARAMS = {
  order: { id: "order-1", tableName: "Mesa 1" },
  items: [{
    productId: "product-1",
    categoryId: "category-1",
    prepZone: "cocina",
    ticketItem: { quantity: 1, name: "Pizza" },
  }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.select.mockImplementation(() => makeChain([]));
  mockDb.insert.mockImplementation(() => makeChain([]));
});

describe("atomic print dispatch", () => {
  it("uses a content fingerprint to avoid duplicate physical print jobs", async () => {
    const results = [
      [CONFIG], [PRINTER], [], [],
      [CONFIG], [PRINTER], [], [{ id: "existing-job" }],
    ];
    mockDb.select.mockImplementation(() => makeChain(results.shift() ?? []));

    expect(await dispatchKitchenPrint(PARAMS)).toBe(1);
    expect(await dispatchKitchenPrint(PARAMS)).toBe(0);
    expect(mockDb.insert).toHaveBeenCalledOnce();
  });

  it("fails closed in printers-only mode when no printer can receive the command", async () => {
    const results = [[CONFIG], []];
    mockDb.select.mockImplementation(() => makeChain(results.shift() ?? []));

    await expect(dispatchKitchenPrint(PARAMS)).rejects.toThrow("NO_ACTIVE_PRINTERS");
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("fails closed when only part of a printers-only command is routed", async () => {
    const results = [[CONFIG], [PRINTER], []];
    mockDb.select.mockImplementation(() => makeChain(results.shift() ?? []));

    await expect(dispatchKitchenPrint({
      ...PARAMS,
      items: [
        ...PARAMS.items,
        {
          productId: "drink-1",
          categoryId: "drinks",
          prepZone: "barra",
          ticketItem: { quantity: 1, name: "Agua" },
        },
      ],
    })).rejects.toThrow("NO_PRINT_ROUTE");
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});
