# Authentication — Piccolo TPV

> Last updated: 2025. Covers JWT-based authentication, session lifecycle, token revocation, and the manager authorization flow.

---

## Overview

Piccolo TPV uses **PIN-based authentication**. Staff identify themselves with a numeric PIN; the server issues a signed JWT that must accompany every subsequent request in the `Authorization: Bearer <token>` header.

```
Staff → PIN login → JWT (12 h, includes jti) → API requests
                                              ↓
                                   POST /auth/logout → jti revoked in DB
```

---

## Endpoints

### `POST /api/auth/pin`

Authenticate with an employee ID and PIN.

**Request body:**
```json
{ "employeeId": "<uuid>", "pin": "1234" }
```

**Success (200):**
```json
{
  "token": "<jwt>",
  "employee": { "id": "...", "name": "Carmen", "role": "waiter" }
}
```

**Errors:**
| Status | Condition |
|--------|-----------|
| 400 | Missing `employeeId` or `pin` |
| 401 | Employee not found or wrong PIN |
| 429 | Rate limit exceeded (10 attempts / IP / 15 min) |

---

### `GET /api/auth/me`

Returns the authenticated user's info from the current JWT.

**Headers:** `Authorization: Bearer <token>`

**Success (200):**
```json
{ "id": "...", "name": "Carmen", "role": "waiter", "expiresAt": "2025-01-01T12:00:00.000Z" }
```

**Errors:** 401 (no token, invalid signature, expired, revoked).

---

### `POST /api/auth/logout`

Revokes the current token by inserting its `jti` into the `revoked_tokens` table.

**Guarantees (fail-closed):** If the DB INSERT fails, the endpoint returns **503** — the client **must not** clear the local session until it receives a 200. This prevents a network failure during logout from leaving the token unreachable to revocation.

**Success (200):**
```json
{ "ok": true }
```

**Error (503):** DB write failed — retry before clearing local state.

---

### `POST /api/auth/manager-authorize`

Issues a short-lived (60 s) *manager authorization token* scoped to a specific operation. Used for high-privilege actions (large discounts, void, cash open) when performed by a role that isn't admin/manager.

**Request body:**
```json
{
  "managerId": "<uuid>",
  "pin":       "5678",
  "operation": "discount.apply"
}
```

**Rate limits:**
- **5 / IP / 15 min** (`managerAuthLimiter`)
- **3 / managerId / 15 min** (`managerTargetLimiter`) — prevents targeted brute-force on a specific manager

**Error messages are intentionally normalized:** the same generic message is returned whether the `managerId` does not belong to a manager or the PIN is wrong. This prevents an oracle attack that could reveal which employees have the manager role.

**Success (200):**
```json
{ "authorized": true, "token": "<jwt 60s>", "managerName": "Ana" }
```

---

## JWT Payload

```json
{
  "id":   "<employee uuid>",
  "name": "Carmen",
  "role": "waiter",
  "jti":  "<uuid v4>",
  "iat":  1700000000,
  "exp":  1700043200
}
```

- **`jti`** (JWT ID) — unique per login; stored in `revoked_tokens` on logout. Tokens issued before task #243 do not carry `jti` and cannot be individually revoked (they expire naturally after 12 h).
- **`exp`** — 12 hours from issue.

---

## Token Revocation

The revocation store is the `revoked_tokens` PostgreSQL table:

| Column | Type | Description |
|--------|------|-------------|
| `jti` | TEXT PK | JWT ID from the token payload |
| `revoked_at` | TIMESTAMPTZ | When the token was revoked |
| `expires_at` | TIMESTAMPTZ | Natural JWT expiry (for cleanup) |

**Revocation check (fail-closed):** Every request that carries a `jti` claim goes through a DB lookup. If the DB is unreachable, the request is **rejected with 503** rather than silently accepted. This is the safer default for a POS environment where token confidentiality matters.

Expired rows are pruned asynchronously during logout (non-critical).

---

## Rate Limiting

| Endpoint | Window | Max | Key |
|----------|--------|-----|-----|
| `POST /auth/pin` | 15 min | 10 | IP |
| `GET /employees/login-list` | 1 min | 30 | IP |
| `POST /auth/manager-authorize` | 15 min | 5 | IP |
| `POST /auth/manager-authorize` | 15 min | 3 | `managerId` body field |
| `POST /orders/:id/payments` | 1 min | 30 | IP |
| `POST /admin/verifactu/records` | 1 min | 10 | IP |
| `POST /backup/create` | 1 hour | 5 | IP |
| `POST /hr/import/upload` | 1 min | 5 | IP |

---

## Security Headers

All responses include these headers (set globally in `app.ts`):

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 0
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=()
```

---

## Input Sanitization

All request bodies pass through a global `sanitizeInputs` middleware that strips HTML tags from every string field before the body reaches route handlers or Zod schemas. This prevents stored-XSS from text columns even when Zod validation is accidentally omitted.

---

## Frontend integration

```typescript
// Login
const { token, employee } = await api.post("/auth/pin", { employeeId, pin });
localStorage.setItem("token", token);

// Authenticated request (added by the api-client interceptor automatically)
const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };

// Logout (must await 200 before clearing localStorage)
try {
  await api.post("/auth/logout");
  localStorage.removeItem("token");
} catch (err) {
  if (err.status === 503) {
    alert("No se pudo cerrar sesión. Inténtalo de nuevo.");
  }
}
```
