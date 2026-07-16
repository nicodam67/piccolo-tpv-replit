/**
 * offline-db.ts — IndexedDB wrapper for offline data caching
 * Stores: products/menu, open tables, authorized employees, pending operations
 */

const DB_NAME = 'piccolo-offline';
const DB_VERSION = 1;

let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('menu')) {
        db.createObjectStore('menu', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('tables')) {
        db.createObjectStore('tables', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('employees')) {
        db.createObjectStore('employees', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('operations')) {
        const ops = db.createObjectStore('operations', { keyPath: 'idempotencyKey' });
        ops.createIndex('status', 'status', { unique: false });
        ops.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result;
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
}

function tx(
  store: string,
  mode: IDBTransactionMode = 'readonly'
): Promise<IDBObjectStore> {
  return openDB().then((db) => db.transaction(store, mode).objectStore(store));
}

// ─── Generic helpers ──────────────────────────────────────────────────────────
function idbGet<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  return tx(store).then(
    (s) =>
      new Promise((res, rej) => {
        const r = s.get(key);
        r.onsuccess = () => res(r.result as T);
        r.onerror = () => rej(r.error);
      })
  );
}

function idbPut(store: string, value: unknown): Promise<void> {
  return tx(store, 'readwrite').then(
    (s) =>
      new Promise((res, rej) => {
        const r = s.put(value);
        r.onsuccess = () => res();
        r.onerror = () => rej(r.error);
      })
  );
}

function idbGetAll<T>(store: string): Promise<T[]> {
  return tx(store).then(
    (s) =>
      new Promise((res, rej) => {
        const r = s.getAll();
        r.onsuccess = () => res(r.result as T[]);
        r.onerror = () => rej(r.error);
      })
  );
}

function idbDelete(store: string, key: IDBValidKey): Promise<void> {
  return tx(store, 'readwrite').then(
    (s) =>
      new Promise((res, rej) => {
        const r = s.delete(key);
        r.onsuccess = () => res();
        r.onerror = () => rej(r.error);
      })
  );
}

function idbClear(store: string): Promise<void> {
  return tx(store, 'readwrite').then(
    (s) =>
      new Promise((res, rej) => {
        const r = s.clear();
        r.onsuccess = () => res();
        r.onerror = () => rej(r.error);
      })
  );
}

// ─── Menu / Products ──────────────────────────────────────────────────────────
export const offlineMenu = {
  saveAll: (items: unknown[]) =>
    openDB().then((db) => {
      const st = db.transaction('menu', 'readwrite').objectStore('menu');
      st.clear();
      (items as { id: string }[]).forEach((item) => st.put(item));
      return idbPut('meta', { key: 'menu_cached_at', value: Date.now() });
    }),
  getAll: () => idbGetAll<{ id: string }>('menu'),
  getCachedAt: () => idbGet<{ key: string; value: number }>('meta', 'menu_cached_at').then((m) => m?.value ?? null),
};

// ─── Tables ───────────────────────────────────────────────────────────────────
export const offlineTables = {
  saveAll: (tables: unknown[]) =>
    openDB().then((db) => {
      const st = db.transaction('tables', 'readwrite').objectStore('tables');
      st.clear();
      (tables as { id: string }[]).forEach((t) => st.put(t));
    }),
  getAll: () => idbGetAll<{ id: string }>('tables'),
  update: (table: { id: string }) => idbPut('tables', table),
};

// ─── Employees (for offline PIN auth) ────────────────────────────────────────
export const offlineEmployees = {
  saveAll: (employees: unknown[]) =>
    openDB().then((db) => {
      const st = db.transaction('employees', 'readwrite').objectStore('employees');
      st.clear();
      (employees as { id: string }[]).forEach((e) => st.put(e));
    }),
  getAll: () => idbGetAll<{ id: string; pin?: string; role?: string }>('employees'),
};

// ─── Pending Operations ───────────────────────────────────────────────────────
export interface OfflineOperation {
  idempotencyKey: string;
  operationType: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'sending' | 'synced' | 'conflict' | 'failed';
  createdAt: number;
  updatedAt: number;
  attempts: number;
  lastError?: string;
}

export const offlineOps = {
  enqueue: (op: Omit<OfflineOperation, 'status' | 'attempts' | 'createdAt' | 'updatedAt'>) =>
    idbPut('operations', {
      ...op,
      status: 'pending',
      attempts: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  getPending: async () => {
    const all = await idbGetAll<OfflineOperation>('operations');
    return all.filter((op) => op.status === 'pending' || op.status === 'failed');
  },
  getAll: () => idbGetAll<OfflineOperation>('operations'),
  update: (key: string, patch: Partial<OfflineOperation>) =>
    idbGet<OfflineOperation>('operations', key).then((existing) => {
      if (!existing) return;
      return idbPut('operations', { ...existing, ...patch, updatedAt: Date.now() });
    }),
  remove: (key: string) => idbDelete('operations', key),
  clearSynced: async () => {
    const all = await idbGetAll<OfflineOperation>('operations');
    const synced = all.filter((op) => op.status === 'synced');
    for (const op of synced) {
      await idbDelete('operations', op.idempotencyKey);
    }
  },
  count: async () => {
    const all = await idbGetAll<OfflineOperation>('operations');
    return all.filter((op) => op.status === 'pending' || op.status === 'failed').length;
  },
};

export { idbGet, idbPut, idbGetAll, idbDelete, idbClear };
