/**
 * Brand-agnostic CashMachineAdapter interface.
 * Adding support for a new device manufacturer requires only a new class
 * implementing this interface — nothing else changes.
 */

export type CashMachineStatus =
  | "connected"
  | "disconnected"
  | "busy"
  | "error"
  | "maintenance";

export type PaymentStatus =
  | "pending"
  | "iniciando"
  | "esperando_efectivo"
  | "efectivo_parcial"
  | "devolviendo_cambio"
  | "completada"
  | "cancelada"
  | "tiempo_agotado"
  | "error"
  | "intervencion_manual";

export interface DeviceStatus {
  status: CashMachineStatus;
  busyWithTransactionId?: string;
  jamDetected: boolean;
  doorOpen: boolean;
  maintenanceRequired: boolean;
  lastSeen: string; // ISO timestamp
  supportsCashLevels: boolean;
}

export interface CashLevel {
  denomination: number; // e.g. 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01
  count: number;
  isLow: boolean;
}

export interface StartPaymentResult {
  deviceTransactionId: string;
  status: PaymentStatus;
}

export interface PaymentStatusResult {
  status: PaymentStatus;
  amountReceived: string;
  changeDispensed: string;
  deviceError?: string;
}

export interface RefundResult {
  status: "completada" | "error";
  deviceError?: string;
}

export interface CashMachineAdapter {
  /** Test connectivity; returns latency in ms or throws on failure */
  connect(): Promise<number>;

  /** Gracefully disconnect */
  disconnect(): Promise<void>;

  /** Full device status */
  getStatus(): Promise<DeviceStatus>;

  /**
   * Start a payment transaction.
   * @param amountCents Amount in euros (string with 2 dp)
   * @param reference   External reference (orderId or similar)
   */
  startPayment(amount: string, reference: string): Promise<StartPaymentResult>;

  /** Poll the current state of an in-progress payment */
  getPaymentStatus(deviceTransactionId: string): Promise<PaymentStatusResult>;

  /**
   * Request cancellation of an in-progress transaction.
   * If cash has been inserted, the machine returns it.
   */
  cancelPayment(deviceTransactionId: string): Promise<PaymentStatusResult>;

  /**
   * Dispense a refund amount.
   * Must be authorised by manager/admin before calling.
   */
  refund(amount: string, reference: string): Promise<RefundResult>;

  /**
   * Retrieve current coin/bill levels.
   * Returns empty array if the hardware does not support this.
   */
  getCashLevels(): Promise<CashLevel[]>;
}
