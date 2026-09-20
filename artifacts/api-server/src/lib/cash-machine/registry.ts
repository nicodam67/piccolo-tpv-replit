/**
 * AdapterRegistry — singleton that picks and holds the active adapter.
 * Currently always returns the SimulatorAdapter.
 * To add a real hardware adapter: implement CashMachineAdapter and register it here.
 */

import type { CashMachineAdapter } from "./adapter";
import { SimulatorAdapter } from "./simulator";

export class CashMachineConnectorUnavailableError extends Error {
  constructor() {
    super("Conector real de caja automática no configurado");
  }
}

class AdapterRegistry {
  private _adapter: CashMachineAdapter | null = null;

  getAdapter(): CashMachineAdapter {
    if (
      process.env["NODE_ENV"] === "production"
      && (!this._adapter || this._adapter instanceof SimulatorAdapter)
    ) {
      throw new CashMachineConnectorUnavailableError();
    }
    if (!this._adapter) {
      this._adapter = new SimulatorAdapter();
    }
    return this._adapter;
  }

  /** Replace the adapter (used in tests to inject a mock) */
  setAdapter(adapter: CashMachineAdapter) {
    this._adapter = adapter;
  }

  /** Reset to simulator (used between tests) */
  reset() {
    if (this._adapter instanceof SimulatorAdapter) {
      (this._adapter as SimulatorAdapter).reset();
    } else {
      this._adapter = new SimulatorAdapter();
    }
  }

  /** Set scenario for the simulator (no-op for real adapters) */
  setScenario(scenario: string) {
    if (process.env["NODE_ENV"] === "production") {
      throw new CashMachineConnectorUnavailableError();
    }
    const adapter = this.getAdapter();
    if (adapter instanceof SimulatorAdapter) {
      (adapter as SimulatorAdapter).setNextScenario(scenario);
    }
  }
}

export const adapterRegistry = new AdapterRegistry();
