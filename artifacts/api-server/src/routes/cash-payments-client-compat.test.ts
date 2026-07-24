import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  cashPaymentStatusLabel,
  getCashPaymentsMethodReportQueryKey,
  getCashPaymentsSessionReportListQueryKey,
  getGetCurrentCashSessionQueryKey,
  idempotencyRequest,
  requireIdempotencyRequest,
} from "../../../../lib/api-client-react/src/cash-payments-compat";

const root = path.resolve(import.meta.dirname, "../../../..");
const compat = fs.readFileSync(
  path.join(root, "lib/api-client-react/src/cash-payments-compat.ts"),
  "utf8",
);
const legacy = fs.readFileSync(
  path.join(root, "lib/api-client-react/src/generated/api.ts"),
  "utf8",
);
const paymentPage = fs.readFileSync(
  path.join(root, "artifacts/piccolo-tpv/src/pages/payment.tsx"),
  "utf8",
);
const migratedConsumers = [
  "payment.tsx",
  "cash-session.tsx",
  "z-report.tsx",
  "x-report.tsx",
  "prefactura.tsx",
  "ticket.tsx",
  "caja-automatica.tsx",
  "caja-automatica-estado.tsx",
].map((file) => fs.readFileSync(
  path.join(root, "artifacts/piccolo-tpv/src/pages", file),
  "utf8",
));

describe("Cash & Payments compatibility adapters", () => {
  it("preserves one explicit idempotency key across retries", () => {
    const first = idempotencyRequest("machine-command-123");
    const retry = idempotencyRequest("machine-command-123", first);
    expect(new Headers(first.headers).get("Idempotency-Key")).toBe("machine-command-123");
    expect(new Headers(retry.headers).get("Idempotency-Key")).toBe("machine-command-123");
  });

  it("requires a valid key for physical commands and distinguishes commands", () => {
    expect(() => requireIdempotencyRequest(undefined)).toThrow(/required/);
    expect(() => idempotencyRequest("short")).toThrow(/8 and 200/);
    const first = requireIdempotencyRequest(idempotencyRequest("machine-command-123"));
    const second = requireIdempotencyRequest(idempotencyRequest("machine-command-456"));
    expect(new Headers(first.headers).get("Idempotency-Key"))
      .not.toBe(new Headers(second.headers).get("Idempotency-Key"));
  });

  it("translates only visual payment labels without changing identifiers", () => {
    expect(cashPaymentStatusLabel("completed")).toBe("Completado");
    expect(cashPaymentStatusLabel("voided")).toBe("Anulado");
    expect(cashPaymentStatusLabel("completada")).toBe("Completada");
    expect(cashPaymentStatusLabel("conciliacion_pendiente")).toBe("conciliacion_pendiente");
  });

  it("preserves shared query keys and nullable-session cache separation", () => {
    expect(getGetCurrentCashSessionQueryKey()).toEqual(["/api/cash-sessions/current"]);
    expect(getGetCurrentCashSessionQueryKey({ terminal: "Caja barra" }))
      .toEqual(["/api/cash-sessions/current", "Caja barra"]);
    expect(getCashPaymentsMethodReportQueryKey({ from: "2026-01-01", to: "2026-01-31" }))
      .toEqual(["reports", "payments", "2026-01-01", "2026-01-31"]);
    expect(getCashPaymentsSessionReportListQueryKey({ from: "2026-01-01", to: "2026-01-31" }))
      .toEqual(["reports", "cash", "2026-01-01", "2026-01-31"]);
  });

  it("delegates errors and replay responses without catch-based normalization", () => {
    expect(compat).not.toMatch(/\bcatch\s*\(/);
    expect(compat).toContain("generated.createOrderCashPayment");
    expect(compat).toContain("generated.startCashPaymentsMachinePayment");
    expect(compat).toContain("generated.createCashPaymentsMachineRefund");
  });
});

describe("Cash & Payments consumer migration", () => {
  it("imports active consumers through the stable compatibility export", () => {
    for (const source of migratedConsumers) {
      expect(source).toContain("@workspace/api-client-react/cash-payments");
      expect(source).not.toContain("@workspace/api-client-react/cash-payments-generated");
    }
  });

  it("removes direct HTTP for contracted polling and operational reports", () => {
    expect(paymentPage).not.toContain("`/api/cash-machine/payments/${id}`");
    const reports = fs.readFileSync(
      path.join(root, "artifacts/piccolo-tpv/src/pages/informes.tsx"),
      "utf8",
    );
    expect(reports).not.toContain("api(`/api/reports/payments");
    expect(reports).not.toContain("api(`/api/reports/cash");
  });

  it("preserves sequential mixed-payment execution and double-submit guard", () => {
    expect(paymentPage).toContain("for (const m of paymentMethods)");
    expect(paymentPage).toContain("await new Promise<any>");
    expect(paymentPage).toContain("setSubmitting(true)");
    expect(paymentPage).toContain("disabled={submitting");
  });

  it("removes duplicate legacy hooks while retaining generated delegation", () => {
    for (const hook of [
      "useGetCurrentCashSession",
      "useAddPayment",
      "useCloseCashSession",
      "useGetOrderSplits",
      "useGetCashMachineConfig",
      "useCreateCashMachineRefund",
    ]) {
      expect(legacy).not.toMatch(new RegExp(`export (?:const|function) ${hook}\\b`));
      expect(compat).toMatch(new RegExp(`\\b${hook}\\b`));
    }
    expect(legacy).toContain("useGetBusinessConfig");
    expect(legacy).toContain("useAddDiscount");
  });
});
