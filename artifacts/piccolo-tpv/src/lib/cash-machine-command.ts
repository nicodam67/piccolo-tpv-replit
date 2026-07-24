export interface PendingCashMachineCommand {
  kind: 'cash-machine-payment';
  method: 'cash_machine';
  fingerprint: string;
  key: string;
  orderId: string;
  amount: string;
  terminalName: string;
  transactionId?: string;
  lastStatus?: string;
  createdAt: number;
  expiresAt: number;
}

type CommandStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface CashMachineCommandResolution {
  status: 'new' | 'resume' | 'blocked';
  command: PendingCashMachineCommand;
}

export const CASH_MACHINE_COMMAND_TTL_MS = 24 * 60 * 60 * 1000;
const storageKey = (orderId: string) => `piccolo:cash-machine-payment:${orderId}`;

export function buildCashMachinePaymentFingerprint(
  orderId: string,
  amount: string,
  terminalName: string,
  method = 'cash_machine',
  kind = 'cash-machine-payment',
) {
  return JSON.stringify({
    version: 1,
    kind,
    orderId,
    amount,
    method,
    terminalName,
  });
}

function readCommand(
  orderId: string,
  storage: CommandStorage,
  now: number,
): PendingCashMachineCommand | null {
  try {
    const stored = storage.getItem(storageKey(orderId));
    if (!stored) return null;
    const command = JSON.parse(stored) as PendingCashMachineCommand;
    if (
      command.orderId !== orderId
      || command.kind !== 'cash-machine-payment'
      || command.method !== 'cash_machine'
      || typeof command.key !== 'string'
      || typeof command.fingerprint !== 'string'
      || typeof command.expiresAt !== 'number'
    ) {
      storage.removeItem(storageKey(orderId));
      return null;
    }
    if (command.expiresAt <= now) {
      storage.removeItem(storageKey(orderId));
      return null;
    }
    return command;
  } catch {
    return null;
  }
}

export function loadOrCreateCashMachineCommand(
  orderId: string,
  amount: string,
  terminalName: string,
  storage: CommandStorage = localStorage,
  now = Date.now(),
  createKey: () => string = () => crypto.randomUUID(),
): CashMachineCommandResolution {
  const fingerprint = buildCashMachinePaymentFingerprint(orderId, amount, terminalName);
  const stored = readCommand(orderId, storage, now);
  if (stored) {
    return {
      status: stored.fingerprint === fingerprint ? 'resume' : 'blocked',
      command: stored,
    };
  }

  const command: PendingCashMachineCommand = {
    kind: 'cash-machine-payment',
    method: 'cash_machine',
    fingerprint,
    key: createKey(),
    orderId,
    amount,
    terminalName,
    createdAt: now,
    expiresAt: now + CASH_MACHINE_COMMAND_TTL_MS,
  };
  try { storage.setItem(storageKey(orderId), JSON.stringify(command)); } catch {}
  return { status: 'new', command };
}

export function saveCashMachineCommand(
  command: PendingCashMachineCommand,
  storage: CommandStorage = localStorage,
) {
  try { storage.setItem(storageKey(command.orderId), JSON.stringify(command)); } catch {}
}

export function clearCashMachineCommand(
  command: PendingCashMachineCommand,
  storage: CommandStorage = localStorage,
) {
  try {
    const key = storageKey(command.orderId);
    const stored = storage.getItem(key);
    if (!stored || (JSON.parse(stored) as PendingCashMachineCommand).key === command.key) {
      storage.removeItem(key);
    }
  } catch {}
}

export function shouldClearCashMachineCommand(status: string) {
  return ['completada', 'cancelada', 'tiempo_agotado', 'error'].includes(status);
}
