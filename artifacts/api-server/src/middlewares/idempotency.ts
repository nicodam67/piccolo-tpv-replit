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
  if (key.length < 8 || key.length > 200) {
    res.status(400).json({ error: "Idempotency-Key no válida" });
    return;
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

  // ── 2. Cross-process serialization + durable lookup ────────────────────────
  // A session advisory lock remains held until the successful response is
  // persisted. Parallel requests with the same key cannot both run the handler.
  let client: Awaited<ReturnType<typeof pool.connect>> | undefined;
  try {
    client = await pool.connect();
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [cacheKey]);
    const result = await client.query<{ status_code: number; response: unknown }>(
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
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [cacheKey]);
      client.release();
      res.status(status_code).setHeader("Idempotency-Replayed", "true").json(response);
      return;
    }
  } catch {
    client?.release();
    res.status(503).json({ error: "No se puede garantizar la idempotencia" });
    return;
  }

  // ── 3. Intercept response to store it ───────────────────────────────────────
  const originalJson = res.json.bind(res) as typeof res.json;
  let released = false;
  const releaseLock = async () => {
    if (released || !client) return;
    released = true;
    try {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [cacheKey]);
    } finally {
      client.release();
    }
  };

  (res as unknown as Record<string, unknown>)["json"] = (body: unknown) => {
    const status = res.statusCode;
    if (status >= 200 && status < 300) {
      const expiresAt = new Date(Date.now() + TTL_MS);
      void (async () => {
        try {
          await client.query(
          `INSERT INTO idempotency_keys
             (cache_key, user_id, status_code, response, expires_at)
           VALUES ($1, $2, $3, $4::jsonb, $5)
           ON CONFLICT (cache_key) DO NOTHING`,
          [cacheKey, userId, status, JSON.stringify(body), expiresAt],
          );
          memCache.set(cacheKey, { status, body, ts: Date.now() });
          evictIfNeeded();
          await releaseLock();
          originalJson(body);
        } catch {
          await releaseLock();
          if (!res.headersSent) {
            res.status(503);
            originalJson({ error: "No se pudo persistir la respuesta idempotente" });
          }
        }
      })();
      return res;
    }
    void releaseLock();
    return originalJson(body);
  };

  res.once("close", () => { void releaseLock(); });
  next();
}
