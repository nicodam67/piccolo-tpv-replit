/**
 * SimulatorAdapter — a full-featured software simulator for the CashMachineAdapter.
 * Used in development and testing. Progresses through realistic payment states.
 *
 * Test-control: set process.env.CASH_MACHINE_SCENARIO or pass X-Simulator-Scenario header
 * via the registry before starting a transaction.
 *
 * Scenarios:
 *   "normal"             — full payment, no change (default)
 *   "with_change"        — exact amount + 5€ extra → change dispensed
 *   "partial"            — efectivo_parcial intermediate state
 *   "timeout"            — transaction times out
 *   "cancel_no_cash"     — cancelled before any cash inserted
 *   "cancel_with_cash"   — cancelled after cash inserted → machine returns cash
 *   "refund_error"       — refund fails with device error
 *   "disconnected"       — device is offline
 */

import type {
  CashMachineAdapter,
  CashLevel,
  DeviceStatus,
  PaymentStatus,
  PaymentStatusResult,
  RefundResult,
  StartPaymentResult,
} from "./adapter";

interface SimTransaction {
  reference: string;
  amountRequested: number;
  scenario: string;
  callCount: number;  // each getPaymentStatus call increments this
  cancelled: boolean;
}

export class SimulatorAdapter implements CashMachineAdapter {
  private transactions = new Map<string, SimTransaction>();
  private transactionsByReference = new Map<string, string>();
  private refundedReferences = new Set<string>();
  private connected = true;
  private _nextScenario = "normal";

  /** Set the scenario for the NEXT startPayment call (used by tests/registry) */
  setNextScenario(scenario: string) {
    this._nextScenario = scenario;
  }

  reset() {
    this.transactions.clear();
    this.transactionsByReference.clear();
    this.refundedReferences.clear();
    this._nextScenario = "normal";
    this.connected = true;
  }

  async connect(): Promise<number> {
    if (this._nextScenario === "disconnected") {
      throw new Error("Simulator: device offline");
    }
    this.connected = true;
    return 12; // simulated 12ms latency
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async getStatus(): Promise<DeviceStatus> {
    const isConnected = this.connected && this._nextScenario !== "disconnected";
    const busyTx = [...this.transactions.entries()].find(([, t]) => {
      return !["completada", "cancelada", "tiempo_agotado", "error"].includes(
        this._getTxStatus(t)
      );
    });
    return {
      status: isConnected ? (busyTx ? "busy" : "connected") : "disconnected",
      busyWithTransactionId: busyTx?.[0],
      jamDetected: false,
      doorOpen: false,
      maintenanceRequired: false,
      lastSeen: new Date().toISOString(),
      supportsCashLevels: true,
    };
  }

  async startPayment(amount: string, reference: string): Promise<StartPaymentResult> {
    if (!this.connected || this._nextScenario === "disconnected") {
      throw new Error("Simulator: device offline");
    }
    const existingId = this.transactionsByReference.get(reference);
    if (existingId) {
      return {
        deviceTransactionId: existingId,
        status: this._getTxStatus(this.transactions.get(existingId)!),
      };
    }
    const deviceTransactionId = `SIM-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const scenario = process.env["CASH_MACHINE_SCENARIO"] ?? this._nextScenario;
    this._nextScenario = "normal"; // reset after use

    this.transactions.set(deviceTransactionId, {
      reference,
      amountRequested: parseFloat(amount),
      scenario,
      callCount: 0,
      cancelled: false,
    });
    this.transactionsByReference.set(reference, deviceTransactionId);

    return { deviceTransactionId, status: "iniciando" };
  }

  async getPaymentStatus(deviceTransactionId: string): Promise<PaymentStatusResult> {
    const tx = this.transactions.get(deviceTransactionId);
    if (!tx) {
      return { status: "error", amountReceived: "0.00", changeDispensed: "0.00", deviceError: "Transaction not found" };
    }

    if (tx.cancelled) {
      const hadCash = tx.callCount >= 2;
      return {
        status: "cancelada",
        amountReceived: hadCash ? tx.amountRequested.toFixed(2) : "0.00",
        changeDispensed: "0.00",
      };
    }

    tx.callCount += 1;
    const status = this._getTxStatus(tx);
    const amountReceived = this._getAmountReceived(tx, status);
    const changeDispensed = this._getChangeDispensed(tx, status);
    return { status, amountReceived, changeDispensed };
  }

  async cancelPayment(deviceTransactionId: string): Promise<PaymentStatusResult> {
    const tx = this.transactions.get(deviceTransactionId);
    if (!tx) {
      return { status: "error", amountReceived: "0.00", changeDispensed: "0.00", deviceError: "Transaction not found" };
    }
    tx.cancelled = true;
    const hadCash = tx.callCount >= 2;
    return {
      status: "cancelada",
      amountReceived: hadCash ? tx.amountRequested.toFixed(2) : "0.00",
      changeDispensed: "0.00",
    };
  }

  async refund(amount: string, reference: string): Promise<RefundResult> {
    if (this.refundedReferences.has(reference)) return { status: "completada" };
    if (this._nextScenario === "refund_error") {
      return { status: "error", deviceError: "Simulator: refund mechanism jammed" };
    }
    this.refundedReferences.add(reference);
    return { status: "completada" };
  }

  async getCashLevels(): Promise<CashLevel[]> {
    return [
      { denomination: 50,   count: 10, isLow: false },
      { denomination: 20,   count: 15, isLow: false },
      { denomination: 10,   count: 20, isLow: false },
      { denomination: 5,    count: 8,  isLow: false },
      { denomination: 2,    count: 25, isLow: false },
      { denomination: 1,    count: 30, isLow: false },
      { denomination: 0.50, count: 40, isLow: false },
      { denomination: 0.20, count: 20, isLow: false },
      { denomination: 0.10, count: 5,  isLow: true  },
    ];
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private _getTxStatus(tx: SimTransaction): PaymentStatus {
    const { scenario, callCount } = tx;

    if (scenario === "timeout") {
      if (callCount <= 1) return "iniciando";
      if (callCount <= 2) return "esperando_efectivo";
      return "tiempo_agotado";
    }

    if (scenario === "cancel_no_cash") {
      if (callCount <= 1) return "iniciando";
      return "esperando_efectivo";
    }

    if (scenario === "cancel_with_cash") {
      if (callCount <= 1) return "iniciando";
      if (callCount <= 2) return "esperando_efectivo";
      return "efectivo_parcial";
    }

    if (scenario === "partial") {
      if (callCount <= 1) return "iniciando";
      if (callCount <= 2) return "esperando_efectivo";
      if (callCount <= 3) return "efectivo_parcial";
      if (callCount <= 4) return "devolviendo_cambio";
      return "completada";
    }

    // normal / with_change
    if (callCount <= 1) return "iniciando";
    if (callCount <= 2) return "esperando_efectivo";
    if (callCount <= 3) return "devolviendo_cambio";
    return "completada";
  }

  private _getAmountReceived(tx: SimTransaction, status: PaymentStatus): string {
    if (["devolviendo_cambio", "completada"].includes(status)) {
      const received = tx.scenario === "with_change"
        ? tx.amountRequested + 5
        : tx.amountRequested;
      return received.toFixed(2);
    }
    if (status === "efectivo_parcial") {
      return (tx.amountRequested / 2).toFixed(2);
    }
    return "0.00";
  }

  private _getChangeDispensed(tx: SimTransaction, status: PaymentStatus): string {
    if (status === "completada" && tx.scenario === "with_change") {
      return (5).toFixed(2);
    }
    return "0.00";
  }
}
