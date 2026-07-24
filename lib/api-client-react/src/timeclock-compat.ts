// Compatibility exports for Entrega 57 — re-export generated client + request helpers.
export * from "./timeclock-generated/api";
export type * from "./timeclock-generated/api.schemas";
export {
  CreateTimeclockAbsenceInputAbsenceType,
  FichajeSettingsWeekStart,
} from "./timeclock-generated/api.schemas";

/** Attach tablet device credential via header (never URL or query string). */
export function deviceTokenRequest(deviceToken: string, init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  headers.set("x-device-token", deviceToken);
  return { ...init, headers };
}

/** Optional idempotency for clock mutations (min 8 chars). */
export function idempotencyRequest(key: string, init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  headers.set("Idempotency-Key", key);
  return { ...init, headers };
}

/** Merge multiple RequestInit fragments (headers are combined). */
export function mergeRequest(...parts: RequestInit[]): RequestInit {
  return parts.reduce<RequestInit>((acc, part) => {
    const headers = new Headers(acc.headers);
    new Headers(part.headers).forEach((value, key) => headers.set(key, value));
    return { ...acc, ...part, headers };
  }, {});
}

export { ApiError } from "./custom-fetch";
