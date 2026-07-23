import { describe, expect, it } from 'vitest';
import {
  getRecoverableOfflineOperations,
  type OfflineOperation,
} from './offline-db';

function operation(
  status: OfflineOperation['status'],
  createdAt: number,
  patch: Partial<OfflineOperation> = {},
): OfflineOperation {
  return {
    idempotencyKey: `${status}-${createdAt}`,
    operationType: 'add_item',
    payload: {},
    status,
    createdAt,
    updatedAt: createdAt,
    attempts: 0,
    ...patch,
  };
}

describe('offline operation recovery', () => {
  it('recovers stale sending operations after a TPV restart in original order', () => {
    const now = 1_000_000;
    const result = getRecoverableOfflineOperations([
      operation('pending', 300),
      operation('sending', 100, { updatedAt: now - 6 * 60_000 }),
      operation('sending', 200, { updatedAt: now - 60_000 }),
    ], now);

    expect(result.map((item) => item.createdAt)).toEqual([100, 300]);
    expect(result[0].status).toBe('pending');
  });

  it('retries transient failures but excludes permanent failures and completed work', () => {
    const result = getRecoverableOfflineOperations([
      operation('failed', 1, { retryable: true }),
      operation('failed', 2, { retryable: false }),
      operation('synced', 3),
      operation('conflict', 4),
    ]);

    expect(result.map((item) => item.createdAt)).toEqual([1]);
  });
});
