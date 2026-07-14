# Threat Model

## Project Overview

Piccolo TPV is a restaurant Point-of-Sale (POS) system built with Node.js/Express 5 (API server), React (frontend tablet UI), PostgreSQL + Drizzle ORM (database), and WebSockets (real-time kitchen display and waiter notifications). Employees authenticate using a PIN-based login that issues JWT session tokens. The system is publicly deployed on Replit Autoscale at `https://piccolo-tpv.replit.app`.

Roles in the system: **waiter** (table management, ordering), **kitchen staff** (KDS display), **admin** (cash sessions, payments, dashboard).

## Assets

- **Employee PINs and session JWTs** — Compromise allows impersonation of any employee including admins.
- **Payment and cash session data** — Records of all payments, cash movements, and reconciliation. Manipulation could enable financial fraud.
- **Order data** — Active orders, items, prices, modifiers. Tampering could affect billing accuracy.
- **Customer PII (allergy notes)** — Allergy information attached to order items; disclosure could have health/safety implications.
- **Application secret (`SESSION_SECRET`)** — Used to sign JWTs. Compromise allows forging tokens for any employee/role.

## Trust Boundaries

- **Public internet → API server** — The API is publicly accessible. All trust enforcement must occur server-side.
- **Client tablet → API server** — Employees authenticate with a PIN and receive a JWT. All protected routes must validate the JWT.
- **API server → PostgreSQL** — Database access is privileged. Injection at the API layer would give full DB access.
- **Authenticated vs. public** — `/employees/login-list` and `/api/health` are intentionally public. All other endpoints require a valid JWT.
- **Role boundaries** — The system has multiple roles (waiter, admin, kitchen) but role enforcement at the route level is absent.

## Scan Anchors

- **Production entry points**: `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/index.ts`
- **Highest-risk code areas**: `artifacts/api-server/src/routes/auth.ts` (authentication), `artifacts/api-server/src/routes/payments.ts` (payment processing), `artifacts/api-server/src/routes/cash.ts` (cash session management)
- **Auth middleware**: `artifacts/api-server/src/middlewares/auth.ts`
- **Public surfaces**: `GET /api/employees/login-list`, `GET /api/health`
- **Authenticated surfaces**: All other `/api/*` routes
- **Dev-only**: `artifacts/mockup-sandbox/` (design canvas, not production-reachable via main API)

## Threat Categories

### Spoofing

Authentication is PIN-based with bcryptjs hashing and JWT issuance (12h expiry). However, the PIN login route (`POST /auth/pin`) references an undefined JavaScript symbol (`PinLoginInput`) at runtime, causing a `ReferenceError` that crashes the auth handler. This makes **all authentication impossible** and renders every protected endpoint inaccessible — or if uncaught, could produce unexpected behavior. Session tokens must be signed with a configured `SESSION_SECRET`; absence causes a 500 error rather than insecure issuance.

### Tampering

Payment totals are calculated server-side from database prices. No client-supplied prices are trusted in the payment flow. Order item prices are stored at order-creation time (snapshot pricing). However, the absence of role-based authorization means any authenticated employee (any role) can perform privileged operations like closing cash sessions or voiding payments.

### Information Disclosure

- The `/employees/login-list` endpoint is intentionally public and exposes employee IDs, names, and roles to unauthenticated callers, enabling employee enumeration.
- CORS is configured with wildcard (`*`), meaning any origin can make API calls.
- Error responses for auth failures are generic and do not leak internal details.
- Pino HTTP logger strips query parameters from request URLs, reducing accidental token logging.

### Denial of Service

There is no rate limiting on any endpoint, including the PIN authentication endpoint. An attacker can brute-force employee PINs (typically 4–6 digits) without restriction.

### Elevation of Privilege

The `requireAuth` middleware validates JWT presence and signature but **does not enforce role-based access control**. Any authenticated employee of any role can access admin-level endpoints (cash sessions, payment processing, dashboard, order management). Role data is present in the JWT payload but never checked against endpoint requirements.

All database queries use Drizzle ORM's parameterized query builder — no raw SQL string concatenation was identified, making SQL injection highly unlikely.
