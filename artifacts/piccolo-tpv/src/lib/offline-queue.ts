/**
 * offline-queue.ts — Enqueue & sync offline operations with the server
 *
 * Device lifecycle:
 *  1. getDeviceId() returns a stable local fingerprint (persisted in localStorage)
 *  2. ensureDeviceRegistered() registers the device on the server once per install
 *     and retries automatically if the server had not seen this fingerprint before
 *  3. syncQueue() enforces registration before any sync attempt so that the server's
 *     device-governance controls are never bypassed by an unknown fingerprint
 */
import { offlineOps, type OfflineOperation } from './offline-db';

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';
const REGISTERED_KEY = 'offline_device_registered';

function getDeviceId(): string {
  let id = localStorage.getItem('offline_device_id');
  if (!id) {
    id = `dev_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    localStorage.setItem('offline_device_id', id);
    // Force re-registration whenever a new fingerprint is generated
    localStorage.removeItem(REGISTERED_KEY);
  }
  return id;
}

/** Register this device with the server if not already done.
 *  Returns false only if the server is unreachable; throws on auth errors. */
async function ensureDeviceRegistered(): Promise<boolean> {
  if (localStorage.getItem(REGISTERED_KEY) === 'true') return true;

  const deviceId = getDeviceId();
  const deviceName = `TPV-${deviceId.slice(4, 12)}`;

  try {
    const r = await fetch(`${BASE}/api/offline/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name: deviceName, deviceType: 'tpv', fingerprint: deviceId }),
    });

    if (r.ok) {
      localStorage.setItem(REGISTERED_KEY, 'true');
      return true;
    }

    // 409 or similar → already registered (race condition on concurrent tabs)
    if (r.status === 409 || r.status === 200) {
      localStorage.setItem(REGISTERED_KEY, 'true');
      return true;
    }

    return false;
  } catch {
    // Network failure — cannot register right now; will retry on next sync
    return false;
  }
}

export function buildIdempotencyKey(
  operationType: string,
  entityId: string,
  clientTimestamp: number
): string {
  return `${getDeviceId()}.${operationType}.${entityId}.${clientTimestamp}`;
}

export async function enqueueOperation(
  operationType: string,
  entityId: string,
  payload: Record<string, unknown>
): Promise<string> {
  const ts = Date.now();
  const key = buildIdempotencyKey(operationType, entityId, ts);
  await offlineOps.enqueue({ idempotencyKey: key, operationType, payload });
  return key;
}

export async function syncQueue(): Promise<{
  synced: number;
  conflicts: number;
  failed: number;
}> {
  const pending = await offlineOps.getPending();
  if (pending.length === 0) return { synced: 0, conflicts: 0, failed: 0 };

  // Ensure this device is registered before attempting any sync.
  // If registration fails (network down), abort gracefully.
  const registered = await ensureDeviceRegistered();
  if (!registered) {
    return { synced: 0, conflicts: 0, failed: 0 };
  }

  const results = { synced: 0, conflicts: 0, failed: 0 };
  let needsReRegistration = false;

  // Send in batches of 10
  for (let i = 0; i < pending.length; i += 10) {
    const batch = pending.slice(i, i + 10);

    // Mark as sending
    for (const op of batch) {
      await offlineOps.update(op.idempotencyKey, { status: 'sending' });
    }

    try {
      const res = await fetch(`${BASE}/api/offline/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          deviceId: getDeviceId(),
          operations: batch.map((op) => ({
            idempotencyKey: op.idempotencyKey,
            operationType: op.operationType,
            payload: op.payload,
          })),
        }),
      });

      // If server rejects as unknown device, clear registration flag and stop —
      // next syncQueue call will re-register automatically
      if (res.status === 403) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        if (body.error === 'device_unknown') {
          localStorage.removeItem(REGISTERED_KEY);
          needsReRegistration = true;
          // Reset sending → pending so these ops are retried
          for (const op of batch) {
            await offlineOps.update(op.idempotencyKey, { status: 'pending', attempts: op.attempts + 1 });
          }
          break;
        }
        // device_blocked / device_revoked — fail all ops permanently
        for (const op of batch) {
          await offlineOps.update(op.idempotencyKey, {
            status: 'failed',
            lastError: `HTTP 403 ${body.error ?? 'forbidden'}`,
            attempts: op.attempts + 1,
          });
          results.failed++;
        }
        continue;
      }

      if (!res.ok) {
        for (const op of batch) {
          await offlineOps.update(op.idempotencyKey, {
            status: 'failed',
            lastError: `HTTP ${res.status}`,
            attempts: op.attempts + 1,
          });
          results.failed++;
        }
        continue;
      }

      const data = (await res.json()) as {
        results: Array<{
          idempotencyKey: string;
          status: 'synced' | 'conflict' | 'failed' | 'skipped';
          error?: string;
        }>;
      };

      for (const r of data.results) {
        const op = batch.find((b) => b.idempotencyKey === r.idempotencyKey);
        if (!op) continue;
        await offlineOps.update(r.idempotencyKey, {
          status: r.status === 'skipped' ? 'synced' : r.status,
          lastError: r.error,
          attempts: op.attempts + 1,
        });
        if (r.status === 'synced' || r.status === 'skipped') results.synced++;
        else if (r.status === 'conflict') results.conflicts++;
        else results.failed++;
      }
    } catch (err) {
      for (const op of batch) {
        await offlineOps.update(op.idempotencyKey, {
          status: 'failed',
          lastError: String(err),
          attempts: op.attempts + 1,
        });
        results.failed++;
      }
    }
  }

  if (!needsReRegistration) {
    // Clean up synced ops older than 24h
    await offlineOps.clearSynced();
  }
  return results;
}

export { getDeviceId };
