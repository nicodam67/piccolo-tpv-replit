# Session Lifecycle — Piccolo TPV

> Describes every state a session can be in, how it transitions between states, and what the client must do in each case.

---

## Session States

```
              PIN login
                 │
                 ▼
         ┌─────────────┐
         │   ACTIVE    │  JWT valid, jti not in revoked_tokens
         └──────┬──────┘
                │
       ┌────────┴──────────┐
       │                   │
       ▼                   ▼
┌────────────┐      ┌────────────┐
│  EXPIRED   │      │  REVOKED   │
│ (12 h TTL) │      │ (logout or │
│            │      │ compromise)│
└────────────┘      └────────────┘
```

### ACTIVE

- JWT signature is valid.
- `jti` is not present in `revoked_tokens`.
- All protected endpoints are accessible (subject to role/permission checks).

### EXPIRED

- JWT `exp` timestamp is in the past.
- `jwt.verify` raises `TokenExpiredError`.
- Server returns **401** `{ error: "Sesión no válida" }`.
- Client must re-authenticate (PIN login).

### REVOKED

- `jti` was inserted into `revoked_tokens` via `POST /auth/logout`.
- Server returns **401** `{ error: "Sesión cerrada. Por favor inicia sesión de nuevo." }`.
- Client must re-authenticate.

---

## Login Flow

```
1. Client → POST /api/auth/pin { employeeId, pin }
2. Server:
     a. SELECT employee + pinHash
     b. bcrypt.compare(pin, pinHash)
     c. Generate jti = randomUUID()
     d. jwt.sign({ id, name, role, jti }, SESSION_SECRET, { expiresIn: "12h" })
3. Server → 200 { token, employee }
4. Client stores token in localStorage (or memory)
```

---

## Request Lifecycle

Every request to a protected endpoint goes through this middleware chain:

```
1. Authorization header present?  → NO  → 401
2. jwt.verify(token, SESSION_SECRET) → FAIL → 401
3. decoded.jti present?
     YES → SELECT 1 FROM revoked_tokens WHERE jti = ?
             FOUND      → 401 (revoked)
             DB ERROR   → 503 (fail-closed)
             NOT FOUND  → continue
     NO  → continue (legacy token, expires naturally)
4. req.user = decoded
5. requireRole / requirePermission checks
6. Route handler
```

---

## Logout Flow

```
1. Client → POST /api/auth/logout
            Authorization: Bearer <token>
2. Server:
     a. requireAuth validates token → req.user populated
     b. if (!jti || !exp) → 200 { ok: true } (no-op, token already irrevocable)
     c. INSERT INTO revoked_tokens (jti, expires_at) ON CONFLICT DO NOTHING
          FAIL → 503 (token NOT revoked server-side)
          OK   → 200 { ok: true }
     d. Async: DELETE FROM revoked_tokens WHERE expires_at < now() (cleanup)
3. Client:
     - On 200 → clear localStorage
     - On 503 → show error, do NOT clear localStorage, retry
     - On 4xx → token may already be invalid; clear localStorage
```

> **Why fail-closed?** If the INSERT fails, the token is still valid. Returning 200 and clearing localStorage would make the revocation silent — an attacker with the token could keep using it. Returning 503 forces the client to retry until the DB recovers.

---

## Manager Authorization Token (ephemeral)

Manager authorization tokens are separate from session tokens:

| Property | Session token | Manager auth token |
|----------|----------|----------|
| Lifetime | 12 hours | 60 seconds |
| Stored in localStorage | Yes | No (in-memory, per-action) |
| Revocable | Yes (jti in DB) | No (short-lived enough) |
| Scope | All requests | One operation only |
| Carried in | `Authorization` header | `X-Manager-Auth` header |

The 60-second window is intentional: if the manager enters their PIN and the cashier takes longer than 1 minute to complete the action, they must re-authorize. This prevents PIN sharing (manager enters PIN and leaves; cashier applies arbitrary discounts minutes later).

---

## Token Cleanup

Expired jti entries are deleted lazily (during any `POST /auth/logout` call) and do not affect correctness. The `revocation check` query always filters by `expires_at > now()` implicitly — expired entries are simply ignored during lookup even if cleanup hasn't run.

> **Scheduled cleanup** (future): a cron job in the backup worker should periodically run `DELETE FROM revoked_tokens WHERE expires_at < now()` to keep the table compact.

---

## Security Properties

| Property | Value |
|----------|-------|
| Token algorithm | HS256 (HMAC-SHA256) |
| Token lifetime | 12 hours |
| Revocation granularity | Per-token (`jti`) |
| Revocation check failure | **Fail-closed** (503) |
| Logout failure | **Fail-closed** (503) |
| PIN comparison | `bcrypt` (constant-time) |
| Manager PIN oracle | Normalized error + constant-time comparison |
| Rate limit (login) | 10 / IP / 15 min |
| Rate limit (manager authorize) | 5 / IP / 15 min + 3 / managerId / 15 min |
