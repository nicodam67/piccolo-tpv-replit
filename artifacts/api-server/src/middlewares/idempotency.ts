/**
 * Idempotency middleware
 *
 * Reads the `Idempotency-Key` header on mutating requests (POST / PATCH / DELETE).
 * - If a prior successful (2xx) response was stored for this key+user pair, it is
 *   returned immediately with an `Idempotency-Replayed: true` header.
 * - Otherwise, the request is processed normally and the result is stored in:
 *     1. An in-memory LRU map (fast path on the same pod).
 *     2. The `idempotency_keys` PostgreSQL table (durability across restarts).
 *
 * TTL: 24 hours — matches the JWT session lifetime.
 *
 * Applied to:
 *   POST /orders, POST /orders/:id/send, POST /orders/:id/payments,
 *   POST /invoices, POST /cash-sessions/:id/close,
 *   POST /fichaje/public/clock
 */

import { type Request, type Response, type NextFunction } from "express";
import { pool } from "@workspace/db";

// ── In-memory LRU cache ────────────────────────────────────────────────────────

const TTL_MS = 24 * 60 * 60 * 1000; // 24 h
const MAX_MEM_ENTRIES = 2_000;

interface MemEntry {
  status: number;
  body: unknown;
  ts: number;
}

const memCache = new Map<string, MemEntry>();

// Evict oldest entries when the cache fills up
function evictIfNeeded() {
  if (memCache.size <= MAX_MEM_ENTRIES) return;
  // Map preserves insertion order; delete the oldest entries
  const toDelete = memCache.size - MAX_MEM_ENTRIES;
  let count = 0;
  for (const key of memCache.keys()) {
    memCache.delete(key);
    if (++count >= toDelete) break;
  }
}

// Prune expired memory entries every hour
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of memCache) {
    if (now - v.ts > TTL_MS) memCache.delete(k);
  }
}, 60 * 60 * 1_000).unref();

// ── DB table bootstrap ─────────────────────────────────────────────────────────

/**
 * Creates the `idempotency_keys` table if it doesn't exist.
 * Called at server startup alongside `ensureAuthTables()`.
 */
export async function ensureIdempotencyTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      cache_key   TEXT        PRIMARY KEY,
      user_id     TEXT        NOT NULL,
      status_code INTEGER     NOT NULL,
      response    JSONB       NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at  TIMESTAMPTZ NOT NULL
    )
  `);
  // Verify accessibility
  await pool.query("SELECT 1 FROM idempotency_keys LIMIT 0");
}

// ── Middleware factory ─────────────────────────────────────────────────────────

/**
 * Returns an async Express middleware that enforces idempotency for the request.
 *
 * Usage: `router.post("/orders", requireAuth, idempotency, handler)`
 */
export async function idempotency(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const key = req.headers["idempotency-key"] as string | undefined;

  // Only apply to mutating methods with a supplied key
  if (!key || !["POST", "PATCH", "DELETE"].includes(req.method)) {
    return next();
  }

  // Scope the key per-user so cross-user replay is impossible
  const userId = req.user?.id ?? "anon";
  const cacheKey = `${userId}:${key}`;

  // ── 1. Memory cache (hot path) ──────────────────────────────────────────────
  const mem = memCache.get(cacheKey);
  if (mem && Date.now() - mem.ts < TTL_MS) {
    res.status(mem.status).setHeader("Idempotency-Replayed", "true").json(mem.body);
    return;
  }

  // ── 2. DB lookup ────────────────────────────────────────────────────────────
  try {
    const result = await pool.query<{ status_code: number; response: unknown }>(
      `SELECT status_code, response
         FROM idempotency_keys
        WHERE cache_key = $1
          AND expires_at > now()
        LIMIT 1`,
      [cacheKey],
    );

    if (result.rows.length > 0) {
      const { status_code, response } = result.rows[0];
      memCache.set(cacheKey, { status: status_code, body: response, ts: Date.now() });
      evictIfNeeded();
      res.status(status_code).setHeader("Idempotency-Replayed", "true").json(response);
      return;
    }
  } catch {
    // DB unavailable — skip idempotency and process normally (safe degradation)
    return next();
  }

  // ── 3. Intercept response to store it ───────────────────────────────────────
  const originalJson = res.json.bind(res) as typeof res.json;
  (res as unknown as Record<string, unknown>)["json"] = (body: unknown) => {
    const status = res.statusCode;
    if (status >= 200 && status < 300) {
      const expiresAt = new Date(Date.now() + TTL_MS);
      memCache.set(cacheKey, { status, body, ts: Date.now() });
      evictIfNeeded();
      // Persist to DB asynchronously — failure is non-fatal (just means a
      // future identical request will be processed again instead of replayed)
      pool
        .query(
          `INSERT INTO idempotency_keys
             (cache_key, user_id, status_code, response, expires_at)
           VALUES ($1, $2, $3, $4::jsonb, $5)
           ON CONFLICT (cache_key) DO NOTHING`,
          [cacheKey, userId, status, JSON.stringify(body), expiresAt],
        )
        .catch(() => {/* non-critical */});
    }
    return originalJson(body);
  };

  next();
}
