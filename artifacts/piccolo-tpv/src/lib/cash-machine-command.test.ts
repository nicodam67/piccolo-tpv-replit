import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CASH_MACHINE_COMMAND_TTL_MS,
  buildCashMachinePaymentFingerprint,
  clearCashMachineCommand,
  loadOrCreateCashMachineCommand,
  saveCashMachineCommand,
  shouldClearCashMachineCommand,
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
    const firstResolution = loadOrCreateCashMachineCommand(
      'order-1', '25.00', 'Caja 1', storage, 1_000, () => 'command-key-1',
    );
    const first = firstResolution.command;
    first.transactionId = 'transaction-1';
    saveCashMachineCommand(first, storage);

    const recovered = loadOrCreateCashMachineCommand(
      'order-1', '25.00', 'Caja 1', storage, 2_000, () => 'must-not-run',
    );

    assert.equal(recovered.status, 'resume');
    assert.equal(recovered.command.key, first.key);
    assert.equal(recovered.command.transactionId, 'transaction-1');
  });

  it('blocks a different amount while the original command is pending', () => {
    const storage = new MemoryStorage();
    const first = loadOrCreateCashMachineCommand(
      'order-1', '25.00', 'Caja 1', storage, 1_000, () => 'command-key-1',
    );
    const next = loadOrCreateCashMachineCommand(
      'order-1', '30.00', 'Caja 1', storage, 2_000, () => 'command-key-2',
    );

    assert.equal(next.status, 'blocked');
    assert.equal(next.command.key, first.command.key);
  });

  it('prevents a stale modal from clearing a newer command', () => {
    const storage = new MemoryStorage();
    const stale = loadOrCreateCashMachineCommand(
      'order-1', '25.00', 'Caja 1', storage, 1_000, () => 'command-key-1',
    ).command;
    clearCashMachineCommand(stale, storage);
    const current = loadOrCreateCashMachineCommand(
      'order-1', '30.00', 'Caja 1', storage, 2_000, () => 'command-key-2',
    ).command;

    clearCashMachineCommand(stale, storage);

    assert.equal(
      loadOrCreateCashMachineCommand('order-1', '30.00', 'Caja 1', storage, 3_000).command.key,
      current.key,
    );
  });

  it('uses a different key for a different order', () => {
    const storage = new MemoryStorage();
    const first = loadOrCreateCashMachineCommand(
      'order-1', '25.00', 'Caja 1', storage, 1_000, () => 'command-key-1',
    );
    const second = loadOrCreateCashMachineCommand(
      'order-2', '25.00', 'Caja 1', storage, 1_000, () => 'command-key-2',
    );
    assert.notEqual(first.command.key, second.command.key);
  });

  it('includes amount, terminal, method and order in the command fingerprint', () => {
    const base = buildCashMachinePaymentFingerprint('order-1', '25.00', 'Caja 1');
    assert.notEqual(base, buildCashMachinePaymentFingerprint('order-2', '25.00', 'Caja 1'));
    assert.notEqual(base, buildCashMachinePaymentFingerprint('order-1', '30.00', 'Caja 1'));
    assert.notEqual(base, buildCashMachinePaymentFingerprint('order-1', '25.00', 'Caja 2'));
    assert.notEqual(
      base,
      buildCashMachinePaymentFingerprint('order-1', '25.00', 'Caja 1', 'cash_machine_refund'),
    );
    assert.match(base, /cash_machine/);
  });

  it('expires pending commands with the same TTL as backend idempotency', () => {
    const storage = new MemoryStorage();
    const first = loadOrCreateCashMachineCommand(
      'order-1', '25.00', 'Caja 1', storage, 1_000, () => 'command-key-1',
    );
    const afterExpiry = loadOrCreateCashMachineCommand(
      'order-1',
      '25.00',
      'Caja 1',
      storage,
      1_000 + CASH_MACHINE_COMMAND_TTL_MS + 1,
      () => 'command-key-2',
    );
    assert.equal(afterExpiry.status, 'new');
    assert.notEqual(first.command.key, afterExpiry.command.key);
  });

  it('keeps ambiguous states and clears only definitive outcomes', () => {
    assert.equal(shouldClearCashMachineCommand('completada'), true);
    assert.equal(shouldClearCashMachineCommand('cancelada'), true);
    assert.equal(shouldClearCashMachineCommand('tiempo_agotado'), true);
    assert.equal(shouldClearCashMachineCommand('error'), true);
    assert.equal(shouldClearCashMachineCommand('intervencion_manual'), false);
    assert.equal(shouldClearCashMachineCommand('conciliacion_pendiente'), false);
    assert.equal(shouldClearCashMachineCommand('esperando_efectivo'), false);
  });

  it('keeps the pending key after a timeout until a definitive result clears it', () => {
    const storage = new MemoryStorage();
    const pending = loadOrCreateCashMachineCommand(
      'order-1', '25.00', 'Caja 1', storage, 1_000, () => 'command-key-1',
    ).command;
    const reopened = loadOrCreateCashMachineCommand(
      'order-1', '25.00', 'Caja 1', storage, 2_000, () => 'command-key-2',
    );
    assert.equal(reopened.command.key, pending.key);
    clearCashMachineCommand(pending, storage);
    const next = loadOrCreateCashMachineCommand(
      'order-1', '25.00', 'Caja 1', storage, 3_000, () => 'command-key-2',
    );
    assert.equal(next.status, 'new');
    assert.equal(next.command.key, 'command-key-2');
  });
});
