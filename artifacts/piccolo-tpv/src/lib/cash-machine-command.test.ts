import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clearCashMachineCommand,
  loadOrCreateCashMachineCommand,
  saveCashMachineCommand,
} from './cash-machine-command';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe('cash-machine pending command recovery', () => {
  it('reuses the command key and transaction after a modal remount', () => {
    const storage = new MemoryStorage();
    const first = loadOrCreateCashMachineCommand('order-1', '25.00', 'Caja 1', storage);
    first.transactionId = 'transaction-1';
    saveCashMachineCommand(first, storage);

    const recovered = loadOrCreateCashMachineCommand('order-1', '25.00', 'Caja 1', storage);

    assert.equal(recovered.key, first.key);
    assert.equal(recovered.transactionId, 'transaction-1');
  });

  it('does not reuse a command for a different amount', () => {
    const storage = new MemoryStorage();
    const first = loadOrCreateCashMachineCommand('order-1', '25.00', 'Caja 1', storage);
    const next = loadOrCreateCashMachineCommand('order-1', '30.00', 'Caja 1', storage);

    assert.notEqual(next.key, first.key);
  });

  it('prevents a stale modal from clearing a newer command', () => {
    const storage = new MemoryStorage();
    const stale = loadOrCreateCashMachineCommand('order-1', '25.00', 'Caja 1', storage);
    const current = loadOrCreateCashMachineCommand('order-1', '30.00', 'Caja 1', storage);

    clearCashMachineCommand(stale, storage);

    assert.equal(
      loadOrCreateCashMachineCommand('order-1', '30.00', 'Caja 1', storage).key,
      current.key,
    );
  });
});
