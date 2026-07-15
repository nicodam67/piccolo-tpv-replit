/**
 * AdapterRegistry — singleton that picks and holds the active adapter.
 * Currently always returns the SimulatorAdapter.
 * To add a real hardware adapter: implement CashMachineAdapter and register it here.
 */

import type { CashMachineAdapter } from "./adapter";
import { SimulatorAdapter } from "./simulator";

class AdapterRegistry {
  private _adapter: CashMachineAdapter | null = null;

  getAdapter(): CashMachineAdapter {
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
    const adapter = this.getAdapter();
    if (adapter instanceof SimulatorAdapter) {
      (adapter as SimulatorAdapter).setNextScenario(scenario);
    }
  }
}

export const adapterRegistry = new AdapterRegistry();
