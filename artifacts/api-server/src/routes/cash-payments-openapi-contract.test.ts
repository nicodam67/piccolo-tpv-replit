import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = path.resolve(import.meta.dirname, "../../../..");
const specText = fs.readFileSync(path.join(root, "lib/api-spec/openapi.yaml"), "utf8");
const spec = parse(specText) as any;
const cashSource = fs.readFileSync(path.join(root, "artifacts/api-server/src/routes/cash.ts"), "utf8");
const paymentsSource = fs.readFileSync(path.join(root, "artifacts/api-server/src/routes/payments.ts"), "utf8");
const machineSource = fs.readFileSync(path.join(root, "artifacts/api-server/src/routes/cash-machine.ts"), "utf8");
const splitSource = fs.readFileSync(path.join(root, "artifacts/api-server/src/routes/splits.ts"), "utf8");
const paymentUiSource = fs.readFileSync(path.join(root, "artifacts/piccolo-tpv/src/pages/payment.tsx"), "utf8");
const machineCommandSource = fs.readFileSync(path.join(root, "artifacts/piccolo-tpv/src/lib/cash-machine-command.ts"), "utf8");

type ContractOperation = {
  method: string;
  pathname: string;
  operation: any;
};

function collectOperations(): ContractOperation[] {
  const operations: ContractOperation[] = [];
  for (const [pathname, methods] of Object.entries(spec.paths as Record<string, Record<string, any>>)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (operation?.tags?.includes("phase61-cash-payments")) {
        operations.push({ method, pathname, operation });
      }
    }
  }
  return operations.sort((a, b) =>
    `${a.method} ${a.pathname}`.localeCompare(`${b.method} ${b.pathname}`));
}

function resolveRef(ref: string): unknown {
  return ref.split("/").slice(1).reduce((value: any, part) => value?.[part], spec);
}

const operations = collectOperations();

describe("Cash & Payments OpenAPI metadata", () => {
  it("contracts 33 active operations with globally unique operationIds", () => {
    expect(operations).toHaveLength(33);
    const phaseIds = operations.map(({ operation }) => operation.operationId);
    const allIds = Object.values(spec.paths as Record<string, Record<string, any>>)
      .flatMap((pathItem) => Object.values(pathItem))
      .map((operation: any) => operation?.operationId)
      .filter(Boolean);
    expect(new Set(phaseIds).size).toBe(33);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it("uses the isolated tag, dual authentication and explicit runtime RBAC", () => {
    for (const { method, pathname, operation } of operations) {
      expect(operation.tags, `${method} ${pathname}`).toContain("cash-payments");
      expect(operation.security).toEqual([{ bearerAuth: [] }, { cookieAuth: [] }]);
      expect(operation["x-roles"]?.length, `${method} ${pathname}`).toBeGreaterThan(0);
    }
  });

  it("documents required versus optional Idempotency-Key exactly as runtime", () => {
    const byId = Object.fromEntries(operations.map(({ operation }) => [operation.operationId, operation]));
    expect(byId.closeCashPaymentsSession["x-idempotency"]).toBe("optional");
    expect(byId.voidCashSessionPayment["x-idempotency"]).toBe("optional");
    expect(byId.createOrderCashPayment["x-idempotency"]).toBe("optional");
    expect(byId.startCashPaymentsMachinePayment["x-idempotency"]).toBe("required");
    expect(byId.createCashPaymentsMachineRefund["x-idempotency"]).toBe("required");
    for (const id of ["startCashPaymentsMachinePayment", "createCashPaymentsMachineRefund"]) {
      expect(byId[id].parameters).toContainEqual(expect.objectContaining({
        name: "Idempotency-Key",
        in: "header",
        required: true,
      }));
    }
  });

  it("has no duplicate path keys and no broken local references", () => {
    const pathKeys = [...specText.matchAll(/^  (\/[^:]+):$/gm)].map((match) => match[1]);
    expect(new Set(pathKeys).size).toBe(pathKeys.length);
    for (const match of specText.matchAll(/\$ref: ["']?(#\/[^"'\s},]+)/g)) {
      expect(resolveRef(match[1]), match[1]).toBeDefined();
    }
  });

  it("separates cash, order payment, split, tip, machine and reporting groups", () => {
    const count = (predicate: (pathname: string) => boolean) =>
      operations.filter(({ pathname }) => predicate(pathname)).length;
    expect(count((p) => p === "/payment-methods" || p.startsWith("/cash-sessions/"))).toBe(12);
    expect(count((p) => p.startsWith("/orders/{orderId}/"))).toBe(3);
    expect(count((p) => p.includes("/splits"))).toBe(3);
    expect(count((p) => p.endsWith("/tip") || p.endsWith("/tips"))).toBe(2);
    expect(count((p) => p.includes("cash-machine"))).toBe(12);
    expect(count((p) => p.startsWith("/reports/"))).toBe(2);
  });

  it("excludes adjacent, simulated online and mixed financial routes", () => {
    const contractedPaths = new Set(operations.map(({ pathname }) => pathname));
    expect(contractedPaths).not.toContain("/reports/voids");
    expect(contractedPaths).not.toContain("/reports/summary");
    expect(contractedPaths).not.toContain("/director/cash");
    expect(contractedPaths).not.toContain("/public/payment/intent");
    expect(contractedPaths).not.toContain("/online-orders/{id}/payment-simulate");
  });

  it("marks only adapter-dependent cash-machine operations fail-closed", () => {
    const machineOperations = operations.filter(({ pathname }) =>
      pathname.includes("cash-machine"));
    expect(machineOperations).toHaveLength(12);
    const adapterDependent = machineOperations.filter(({ operation }) =>
      operation["x-provider-status"] !== undefined);
    expect(adapterDependent).toHaveLength(9);
    for (const { operation } of adapterDependent) {
      expect(operation["x-provider-status"])
        .toBe("simulator-only-fail-closed-in-production");
    }
    expect(spec.paths["/admin/cash-machine/config"].get["x-provider-status"]).toBeUndefined();
    expect(spec.paths["/cash-machine/transactions"].get["x-provider-status"]).toBeUndefined();
    expect(spec.paths["/cash-sessions/{id}/cash-machine-summary"].get["x-provider-status"]).toBeUndefined();
  });
});

describe("Cash & Payments focused runtime contract evidence", () => {
  it("guards opening, movement and closing with manager/admin RBAC and terminal locks", () => {
    expect(cashSource).toContain('const CASH_MANAGER_ROLES = ["manager", "admin"]');
    expect(cashSource).toContain('"cash-session:" + terminalName');
    expect(cashSource).toContain('"cash-session:" + session.terminalName');
    expect(cashSource).toContain('res.status(409).json({');
    expect(cashSource).toContain('res.status(422).json({');
    expect(cashSource).toContain("idempotency,");
  });

  it("documents payment validation, partial settlement, rate limiting and locks", () => {
    expect(paymentsSource).toContain("paymentLimiter");
    expect(paymentsSource).toContain("idempotency,");
    expect(paymentsSource).toContain("pg_advisory_xact_lock");
    expect(paymentsSource).toContain("newRemaining");
    expect(paymentsSource).toContain('res.status(400).json({ error: "Importe inválido" })');
  });

  it("preserves split semantics and enforces granular payment permissions", () => {
    expect(splitSource).toContain("Máximo 8 grupos de división");
    expect(splitSource).toContain("requireAuth");
    expect(splitSource).not.toContain("requireRole");
    expect(splitSource).toContain("requirePermission(PERMISSIONS.payments.split)");
    expect(splitSource).toContain("requirePermission(PERMISSIONS.payments.create)");
    expect(spec.paths["/orders/{id}/splits"].get["x-roles"]).toEqual(["authenticated"]);
    expect(spec.paths["/orders/{id}/splits"].post["x-roles"])
      .toEqual(["admin", "manager", "encargado", "cashier"]);
    expect(spec.paths["/orders/{id}/splits/{groupId}/pay"].put["x-roles"])
      .toEqual(["admin", "manager", "encargado", "waiter", "cashier"]);
  });

  it("requires idempotency for machine commands and fails closed when disabled", () => {
    expect(machineSource).toContain('res.status(400).json({ error: "Idempotency-Key es obligatoria" })');
    expect(machineSource).toContain('res.status(503).json({ error: "La caja automática no está habilitada" })');
    expect(machineSource).toContain("No se puede habilitar una caja simulada en producción");
    expect(machineSource).toContain("pg_advisory_xact_lock");
  });

  it("recovers an in-flight machine command across modal remounts", () => {
    expect(paymentUiSource).toContain("claimCashMachineCommand");
    expect(paymentUiSource).toContain("paymentCommand.transactionId");
    expect(paymentUiSource).not.toContain("useRef(crypto.randomUUID())");
    expect(machineCommandSource).toContain("localStorage");
    expect(machineCommandSource).toContain("CASH_MACHINE_COMMAND_TTL_MS");
    expect(machineCommandSource).toContain("'blocked'");
    expect(paymentUiSource.match(/startCashMachinePaymentRequest\(/g)).toHaveLength(1);
  });
});
