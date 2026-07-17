// ─── Semantic error codes ─────────────────────────────────────────────────────
export const ERROR_CODES = {
  AUTH_REQUIRED:    'AUTH_REQUIRED',
  SESSION_EXPIRED:  'SESSION_EXPIRED',
  FORBIDDEN:        'FORBIDDEN',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND:        'NOT_FOUND',
  CONFLICT:         'CONFLICT',
  RATE_LIMITED:     'RATE_LIMITED',
  SERVER_ERROR:     'SERVER_ERROR',
  NETWORK_ERROR:    'NETWORK_ERROR',
  TIMEOUT:          'TIMEOUT',
  UNKNOWN_ERROR:    'UNKNOWN_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Map an HTTP status to a semantic error code. */
export function httpStatusToCode(status: number): ErrorCode {
  if (status === 401) return ERROR_CODES.AUTH_REQUIRED;
  if (status === 403) return ERROR_CODES.FORBIDDEN;
  if (status === 404) return ERROR_CODES.NOT_FOUND;
  if (status === 409) return ERROR_CODES.CONFLICT;
  if (status === 422) return ERROR_CODES.VALIDATION_ERROR;
  if (status === 429) return ERROR_CODES.RATE_LIMITED;
  if (status >= 500)  return ERROR_CODES.SERVER_ERROR;
  return ERROR_CODES.UNKNOWN_ERROR;
}

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Structured error thrown by `api.*` methods.
 *
 * - `code`             — one of the 11 semantic codes above
 * - `httpStatus`       — the HTTP status code, if the request reached the server
 * - `requestId`        — UUID generated per call, printed in logs for tracing
 * - `detail`           — raw response body (for debugging)
 * - `validationErrors` — field-level errors for 422 responses
 */
export class ApiClientError extends Error {
  override readonly name = 'ApiClientError';
  readonly code: ErrorCode;
  readonly httpStatus: number | null;
  readonly requestId: string | null;
  readonly detail: unknown;
  readonly validationErrors: ValidationError[];

  constructor(opts: {
    code: ErrorCode;
    message: string;
    httpStatus?: number | null;
    requestId?: string | null;
    detail?: unknown;
    validationErrors?: ValidationError[];
  }) {
    super(opts.message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.code             = opts.code;
    this.httpStatus       = opts.httpStatus ?? null;
    this.requestId        = opts.requestId ?? null;
    this.detail           = opts.detail ?? null;
    this.validationErrors = opts.validationErrors ?? [];
  }

  get isAuth(): boolean {
    return this.code === ERROR_CODES.AUTH_REQUIRED || this.code === ERROR_CODES.SESSION_EXPIRED;
  }
  get isForbidden(): boolean { return this.code === ERROR_CODES.FORBIDDEN; }
  get isNotFound():  boolean { return this.code === ERROR_CODES.NOT_FOUND;  }
  get isConflict():  boolean { return this.code === ERROR_CODES.CONFLICT;   }
}
