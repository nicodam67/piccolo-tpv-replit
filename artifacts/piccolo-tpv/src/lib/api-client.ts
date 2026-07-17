/**
 * Centralized API client for Piccolo TPV.
 *
 * Wraps `customFetch` from @workspace/api-client-react and adds:
 *   - Base-URL injection from Vite's BASE_URL (called once on module load)
 *   - Per-call AbortController timeout (default 10 s, 60 s for uploads)
 *   - UUID requestId generated per call and printed in logs
 *   - Console log: method + path + status + latency — never headers or body
 *   - Typed `ApiClientError` with semantic error codes
 *
 * Usage:
 *   import { api } from '../lib/api-client';
 *   const zones = await api.get<Zone[]>('/api/zones');
 *   await api.post('/api/orders', { tableId, guestCount });
 */

import { customFetch, setBaseUrl, ApiError } from '@workspace/api-client-react';
import { ApiClientError, httpStatusToCode, ERROR_CODES } from './api-errors';

// ── Base URL ──────────────────────────────────────────────────────────────────
// Called once at module init so that EVERY customFetch call app-wide is
// prefixed with the Vite BASE_URL (e.g. /piccolo-tpv in sub-path deployments).
//
// CONTRACT — all callers of customFetch anywhere in this app MUST use
// root-relative paths starting with "/" (e.g. "/api/zones"), never include
// the base prefix themselves (never "${BASE}/api/zones"). customFetch's
// applyBaseUrl only prepends to paths that start with "/" and will produce
// double-prefixed URLs (/prefix/prefix/api/...) if callers include the
// prefix themselves.
const BASE = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
setBaseUrl(BASE || null);

const DEFAULT_TIMEOUT_MS = 10_000;
const UPLOAD_TIMEOUT_MS  = 60_000;

// ── Logging ───────────────────────────────────────────────────────────────────
type LogStatus = number | 'ERR';

function log(
  requestId: string,
  method: string,
  path: string,
  status: LogStatus,
  ms: number,
): void {
  // Avoid leaking tokens or PII — log only method, path (no query-string
  // values), status, and latency.
  const safePath = path.split('?')[0];
  const level = typeof status === 'number' && status >= 400 ? 'warn' : 'debug';
  // eslint-disable-next-line no-console
  (console[level] as typeof console.log)(
    `[api] ${method} ${safePath} → ${status} (${ms}ms) [${requestId}]`,
  );
}

// ── Error conversion ──────────────────────────────────────────────────────────
function toClientError(err: unknown, requestId: string): ApiClientError {
  if (err instanceof ApiError) {
    const data  = err.data as Record<string, unknown> | null;
    const msg   =
      (data?.error   as string | undefined) ??
      (data?.message as string | undefined) ??
      err.message;

    if (err.status === 401) {
      const code =
        msg.toLowerCase().includes('expirada') ||
        msg.toLowerCase().includes('expired') ||
        msg.toLowerCase().includes('no válida')
          ? ERROR_CODES.SESSION_EXPIRED
          : ERROR_CODES.AUTH_REQUIRED;
      return new ApiClientError({ code, message: msg, httpStatus: 401, requestId });
    }

    return new ApiClientError({
      code:      httpStatusToCode(err.status),
      message:   msg,
      httpStatus: err.status,
      requestId,
      detail:    data,
    });
  }

  if (err instanceof Error && err.name === 'AbortError') {
    return new ApiClientError({
      code:    ERROR_CODES.TIMEOUT,
      message: 'La petición tardó demasiado. Comprueba tu conexión.',
      requestId,
    });
  }

  if (err instanceof TypeError) {
    return new ApiClientError({
      code:    ERROR_CODES.NETWORK_ERROR,
      message: 'Error de red. Comprueba tu conexión.',
      requestId,
    });
  }

  return new ApiClientError({
    code:    ERROR_CODES.UNKNOWN_ERROR,
    message: err instanceof Error ? err.message : 'Error desconocido',
    requestId,
  });
}

// ── Core ──────────────────────────────────────────────────────────────────────
export interface RequestOptions {
  /** Override per-call timeout (ms). Default: 10 000. */
  timeoutMs?: number;
  /** Additional headers merged on top of the defaults. */
  headers?: Record<string, string>;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts: RequestOptions = {},
): Promise<T> {
  const requestId = crypto.randomUUID();
  const start     = Date.now();
  const { timeoutMs = DEFAULT_TIMEOUT_MS, headers } = opts;

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), timeoutMs);

  const init: RequestInit = {
    method,
    signal: controller.signal,
  };

  if (body !== undefined && body !== null) {
    init.body    = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json', ...(headers ?? {}) };
  } else if (headers) {
    init.headers = headers;
  }

  try {
    const result = await customFetch<T>(path, init);
    log(requestId, method, path, 200, Date.now() - start);
    return result;
  } catch (err) {
    const status: LogStatus = err instanceof ApiError ? err.status : 'ERR';
    log(requestId, method, path, status, Date.now() - start);
    throw toClientError(err, requestId);
  } finally {
    clearTimeout(timer);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
export const api = {
  /** GET /api/... — returns parsed JSON or throws ApiClientError */
  get<T = unknown>(path: string, opts?: RequestOptions): Promise<T> {
    return request<T>('GET', path, undefined, opts);
  },

  /** POST /api/... with JSON body */
  post<T = unknown>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return request<T>('POST', path, body, opts);
  },

  /** PUT /api/... with JSON body */
  put<T = unknown>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return request<T>('PUT', path, body, opts);
  },

  /** PATCH /api/... with JSON body */
  patch<T = unknown>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return request<T>('PATCH', path, body, opts);
  },

  /** DELETE /api/... */
  delete<T = unknown>(path: string, opts?: RequestOptions): Promise<T> {
    return request<T>('DELETE', path, undefined, opts);
  },

  /**
   * POST /api/... with a FormData body (multipart/form-data).
   * Timeout defaults to 60 s to accommodate large uploads.
   */
  upload<T = unknown>(path: string, formData: FormData, opts?: RequestOptions): Promise<T> {
    const requestId = crypto.randomUUID();
    const start     = Date.now();
    const timeoutMs = opts?.timeoutMs ?? UPLOAD_TIMEOUT_MS;

    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), timeoutMs);

    return customFetch<T>(path, {
      method: 'POST',
      body:   formData,
      signal: controller.signal,
    }).then((result) => {
      clearTimeout(timer);
      log(requestId, 'POST', path, 200, Date.now() - start);
      return result;
    }).catch((err) => {
      clearTimeout(timer);
      const status: LogStatus = err instanceof ApiError ? err.status : 'ERR';
      log(requestId, 'POST', path, status, Date.now() - start);
      throw toClientError(err, requestId);
    });
  },
};

// Re-export so consumers can catch typed errors without a second import.
export { ApiClientError, ERROR_CODES } from './api-errors';
export type { ErrorCode, ValidationError } from './api-errors';
