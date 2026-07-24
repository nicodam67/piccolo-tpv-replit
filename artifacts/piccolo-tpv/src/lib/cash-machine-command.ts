export interface PendingCashMachineCommand {
  key: string;
  orderId: string;
  amount: string;
  terminalName: string;
  transactionId?: string;
}

type CommandStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const storageKey = (orderId: string) => `piccolo:cash-machine-payment:${orderId}`;

export function loadOrCreateCashMachineCommand(
  orderId: string,
  amount: string,
  terminalName: string,
  storage: CommandStorage = sessionStorage,
): PendingCashMachineCommand {
  try {
    const stored = storage.getItem(storageKey(orderId));
    if (stored) {
      const command = JSON.parse(stored) as PendingCashMachineCommand;
      if (
        command.orderId === orderId
        && command.amount === amount
        && command.terminalName === terminalName
        && typeof command.key === 'string'
      ) return command;
    }
  } catch {
    // Storage may be unavailable in hardened browser contexts.
  }

  const command = { key: crypto.randomUUID(), orderId, amount, terminalName };
  try { storage.setItem(storageKey(orderId), JSON.stringify(command)); } catch {}
  return command;
}

export function saveCashMachineCommand(
  command: PendingCashMachineCommand,
  storage: CommandStorage = sessionStorage,
) {
  try { storage.setItem(storageKey(command.orderId), JSON.stringify(command)); } catch {}
}

export function clearCashMachineCommand(
  command: PendingCashMachineCommand,
  storage: CommandStorage = sessionStorage,
) {
  try {
    const key = storageKey(command.orderId);
    const stored = storage.getItem(key);
    if (!stored || (JSON.parse(stored) as PendingCashMachineCommand).key === command.key) {
      storage.removeItem(key);
    }
  } catch {}
}
