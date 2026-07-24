import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import OpenAPIResponseValidator from "openapi-response-validator";

const root = path.resolve(import.meta.dirname, "../../../..");
const spec = parse(fs.readFileSync(path.join(root, "lib/api-spec/openapi.yaml"), "utf8")) as any;

const operations = [
  ["get", "/tables/occupation-summary"],
  ["get", "/tables/{tableId}/history"],
  ["get", "/admin/alert-config"],
  ["patch", "/admin/alert-config"],
  ["post", "/tables/{tableId}/clean"],
  ["post", "/tables/{tableId}/block"],
  ["post", "/tables/{tableId}/transfer"],
  ["post", "/tables/merge"],
  ["post", "/tables/{tableId}/separate"],
  ["post", "/orders/{orderId}/move-items"],
  ["post", "/tables/{tableId}/transfer-waiter"],
  ["post", "/orders/{orderId}/prefactura/print"],
  ["get", "/orders/{orderId}/prefactura/status"],
  ["get", "/kds/history"],
  ["post", "/kitchen-tasks/{taskId}/resend"],
  ["get", "/admin/kds-stations"],
  ["post", "/admin/kds-stations"],
  ["patch", "/admin/kds-stations/{id}"],
  ["delete", "/admin/kds-stations/{id}"],
  ["post", "/admin/kds-stations/{id}/ping"],
  ["get", "/admin/kds-zones/transitions"],
] as const;

function validate(pathname: string, method: string, status: number, body: unknown) {
  const operation = spec.paths[pathname][method];
  const responses = Object.fromEntries(Object.entries(operation.responses).map(([code, response]: [string, any]) => {
    if (!response?.$ref) return [code, response];
    const name = response.$ref.split("/").at(-1);
    return [code, spec.components.responses[name]];
  }));
  const validator = new OpenAPIResponseValidator({
    responses,
    components: spec.components,
  });
  return validator.validateResponse(status, body);
}

describe("floor domain OpenAPI contracts", () => {
  it("documents every endpoint in scope with unique operationId, auth and responses", () => {
    const ids = new Set<string>();
    for (const [method, pathname] of operations) {
      const operation = spec.paths[pathname]?.[method];
      expect(operation, `${method.toUpperCase()} ${pathname}`).toBeTruthy();
      expect(operation.operationId).toBeTruthy();
      expect(ids.has(operation.operationId)).toBe(false);
      ids.add(operation.operationId);
      expect(operation.security).toEqual([{ bearerAuth: [] }]);
      expect(Object.keys(operation.responses).some((status) => status.startsWith("2"))).toBe(true);
    }
  });

  it("validates representative runtime table and alert responses", () => {
    const table = {
      id: "11111111-1111-4111-8111-111111111111",
      zoneId: "22222222-2222-4222-8222-222222222222",
      name: "Mesa 1", capacity: 4, status: "free",
      x: 40, y: 40, width: 80, height: 80, shape: "square",
      rotation: 0, layout: "normal", mergeGroup: null, active: true,
      currentOrderId: null, openedAt: null, employeeName: null,
      guestCount: null, clientName: null, currentTotal: null,
    };
    expect(validate("/tables/{tableId}/clean", "post", 200, table)).toBeUndefined();
    expect(validate("/tables/{tableId}/block", "post", 200, table)).toBeUndefined();
    expect(validate("/tables/occupation-summary", "get", 200, {
      freeCount: 1, occupiedCount: 0, reservedCount: 0, pendingCleaningCount: 0,
      blockedCount: 0, currentGuests: 0, pendingReservations: 0, avgOccupationMinutes: 0,
    })).toBeUndefined();
    expect(validate("/admin/alert-config", "get", 200, {
      id: "33333333-3333-4333-8333-333333333333",
      reservaProximaMin: 30, sinComandaMin: 15,
      prefacturaPendienteMin: 10, mesaSuciaMin: 5,
      updatedAt: "2026-07-23T00:00:00.000Z",
    })).toBeUndefined();
  });

  it("validates prefactura, KDS station and error responses", () => {
    expect(validate("/orders/{orderId}/prefactura/print", "post", 201, {
      prefacturaNumber: 1, prefacturaCode: "P-0001",
      isReprint: false, totalPrints: 1, amount: "12.50",
    })).toBeUndefined();
    expect(validate("/admin/kds-stations", "post", 201, {
      id: "44444444-4444-4444-8444-444444444444",
      name: "Cocina", zoneType: "cocina", ip: "192.0.2.10",
      displayUrl: null, notes: null, lastPingAt: null, active: true,
      createdAt: "2026-07-23T00:00:00.000Z",
      updatedAt: "2026-07-23T00:00:00.000Z",
    })).toBeUndefined();
    expect(validate("/tables/merge", "post", 400, {
      error: "Se necesitan al menos 2 mesas para unir",
    })).toBeUndefined();
  });
});
