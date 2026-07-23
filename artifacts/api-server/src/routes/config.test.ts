import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

function makeChain(value: unknown) {
  const chain: Record<string, unknown> & {
    then: (resolve: (result: unknown) => unknown, reject?: (error: unknown) => unknown) => Promise<unknown>;
  } = {
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  for (const method of [
    "select", "from", "where", "limit", "insert", "values", "returning",
    "update", "set", "orderBy", "leftJoin", "innerJoin", "catch",
  ]) {
    chain[method] = vi.fn(() => chain);
  }
  return chain;
}

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}));

const mockJwtVerify = vi.hoisted(() => vi.fn((_token: string, _secret: string) => ({
  id: "employee-1",
  name: "Admin Test",
  role: _token,
})));

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return { ...actual, db: mockDb };
});

vi.mock("jsonwebtoken", () => ({
  default: { verify: mockJwtVerify },
}));

vi.mock("../lib/document-audit", () => ({
  logDocumentAction: vi.fn().mockResolvedValue(undefined),
}));

const { default: configRouter } = await import("./config");

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use("/api", configRouter);
  return instance;
}

const EXISTING_CONFIG = {
  id: "11111111-1111-4111-8111-111111111111",
  nombreComercial: "Piccolo",
  razonSocial: "Piccolo Restauración SL",
  nif: "B12345678",
  direccionFiscal: "C/ Major 1",
  codigoPostal: "43540",
  poblacion: "La Ràpita",
  provincia: "Tarragona",
  pais: "España",
  telefono: "977000000",
  email: "hola@piccolo.test",
  web: "https://piccolo.test",
  logoUrl: "",
  active: true,
  tagline: "",
  heroImageUrl: "",
  heroVideoUrl: "",
  foundedYear: null,
  address: "",
  phone: "",
  openingHours: { mon: { open: "12:00", close: "16:00" } },
  cardLayout: "grid",
  accentColor: "#ef4444",
  printMode: "kds_only",
  printTemplateConfig: null,
  moneda: "EUR",
  idioma: "es",
  regimenFiscal: "general",
  setupCompleted: false,
  goLiveAt: null,
  qrCity: "",
  qrProvince: "",
  qrPostalCode: "",
  qrCountry: "",
  themeColors: null,
  themeFonts: null,
  cardSettings: null,
  qrSchedule: null,
  updatedAt: new Date(),
};

beforeEach(() => {
  process.env.SESSION_SECRET = "test-secret";
  vi.clearAllMocks();
  mockDb.select.mockImplementation(() => makeChain([]));
  mockDb.insert.mockImplementation(() => makeChain([]));
  mockDb.update.mockImplementation(() => makeChain([]));
});

describe("unified configuration API", () => {
  it("returns public defaults from the canonical business/timezone sources", async () => {
    const response = await request(app()).get("/api/config/business");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      moneda: "EUR",
      idioma: "es",
      timezone: "Europe/Madrid",
    });
  });

  it("exposes one read-only inventory over existing sources to settings managers", async () => {
    const response = await request(app())
      .get("/api/admin/configuration")
      .set("Authorization", "Bearer manager");

    expect(response.status).toBe(200);
    expect(response.body.sourceOfTruth).toMatchObject({
      business: "business_config",
      openingHours: "business_config.opening_hours",
      printers: "printers",
      clockTablet: "tablet_devices + fichaje_settings",
    });
    expect(response.body.compatibility).toEqual({
      desktop: { supported: true, configured: false },
      waiterTablets: { supported: true, configured: false },
      fixedClockTablet: { supported: true, configured: false },
      kds: { supported: true, configured: false },
      qrMenu: { supported: true, configured: false },
    });
  });

  it("denies the unified inventory to staff without settings.manage", async () => {
    const response = await request(app())
      .get("/api/admin/configuration")
      .set("Authorization", "Bearer waiter");

    expect(response.status).toBe(403);
  });

  it("allows only admins to write critical business configuration", async () => {
    const response = await request(app())
      .put("/api/config/business")
      .set("Authorization", "Bearer manager")
      .send({ nombreComercial: "Otro" });

    expect(response.status).toBe(403);
  });

  it.each([
    [{ moneda: "BTC" }, "moneda"],
    [{ idioma: "xx" }, "idioma"],
    [{ nif: "123" }, "nif"],
    [{ razonSocial: "", nif: "", direccionFiscal: "" }, "razonSocial"],
  ])("rejects invalid critical writes", async (payload, field) => {
    const response = await request(app())
      .put("/api/config/business")
      .set("Authorization", "Bearer admin")
      .send(payload);

    expect(response.status).toBe(422);
    expect(response.body.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ field }),
    ]));
  });

  it("writes a valid update to the existing canonical row", async () => {
    mockDb.select.mockImplementation(() => makeChain([EXISTING_CONFIG]));
    mockDb.update.mockImplementation(() => makeChain([
      { ...EXISTING_CONFIG, nombreComercial: "Piccolo Centro" },
    ]));

    const response = await request(app())
      .put("/api/config/business")
      .set("Authorization", "Bearer admin")
      .send({ nombreComercial: "Piccolo Centro" });

    expect(response.status).toBe(200);
    expect(response.body.nombreComercial).toBe("Piccolo Centro");
    expect(mockDb.update).toHaveBeenCalledOnce();
  });

  it("rejects incoherent hours through the existing branding adapter", async () => {
    const response = await request(app())
      .patch("/api/admin/branding")
      .set("Authorization", "Bearer admin")
      .send({ openingHours: { mon: { open: "10:00", close: "09:00" } } });

    expect(response.status).toBe(422);
    expect(response.body.issues[0].field).toBe("openingHours.mon");
  });
});
