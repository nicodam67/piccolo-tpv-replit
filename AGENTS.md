# AGENTS.md

## Cursor Cloud specific instructions

This is a **pnpm workspace** for the **Piccolo** restaurant platform. See `replit.md`, `docs/architecture.md`, and each package's `package.json` for standard commands; the notes below only cover non-obvious things needed to run/test it in the Cursor Cloud VM.

### Runtime / package manager
- The active `node` is `/exec-daemon/node` (v22.x) and always wins on `PATH`; it satisfies the toolchain (Vite 7 needs Node ≥ 22.12). Do not try to force Node 24 — `pnpm` (via nvm) already works with this node.
- Use `pnpm` only (root `preinstall` rejects npm/yarn). The update script runs `pnpm install`.

### PostgreSQL (required for the TPV / api-server)
- A local PostgreSQL 16 cluster is used. Start it with `sudo pg_ctlcluster 16 main start` (it is not auto-started on boot).
- Dev DB/role: database `piccolo_tpv`, user `piccolo`, password `piccolo` → `DATABASE_URL=postgresql://piccolo:piccolo@localhost:5432/piccolo_tpv`.
- Apply migrations with `pnpm --filter @workspace/db migrate`. **The api-server refuses to boot if migrations are pending** (`verifyMigrations()` in `artifacts/api-server/src/index.ts`).

### Environment variables (no dotenv!)
- Services do **not** auto-load `.env`. Export vars into the shell before starting (e.g. `set -a && . /workspace/.env && set +a`). A gitignored `/workspace/.env` holds the dev values.
- Required: `DATABASE_URL`, `SESSION_SECRET` (≥32 chars), `PORT`, `NODE_ENV`. `BOOTSTRAP_SECRET` (≥32 chars) is required to create the first admin.
- `ALLOWED_ORIGINS` must include the browser origin used to reach the app (see proxy gotcha below).

### Running the services (dev)
- api-server (port 8080): `pnpm --filter @workspace/api-server run dev`. Note its `dev` script does a **full esbuild build then start — there is no hot reload**; restart it after code changes. Health check: `GET /api/healthz`.
- piccolo-tpv (Vite, port 5173): `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/piccolo-tpv run dev`.
- qr-menu (Vite, port 5174): `PORT=5174 pnpm --filter @workspace/qr-menu run dev`. Runs in **demo mode** (local seed mocks) when `VITE_CONVEX_URL` is unset; set it to use the real Convex backend.

### Critical gotcha: TPV frontend + `/api` + CORS
- The TPV frontend calls **same-origin `/api`** and there is **no Vite proxy**. To exercise it end-to-end locally you must put a reverse proxy in front that serves the TPV dev server and routes `/api` (incl. the `/api/socket.io` websocket) to api-server:8080, so the browser sees one origin.
- Whatever origin the browser uses (e.g. `http://localhost:5000`) **must be in `ALLOWED_ORIGINS`**. Otherwise the server's CORS check rejects the browser `Origin` and login/API calls fail with **HTTP 500** (curl works because it sends no `Origin`). This is the most common "login is broken" trap.

### Bootstrapping a login (empty DB)
- Create the first admin: `POST /api/setup/seed-employees` with `{ "bootstrapSecret": "<BOOTSTRAP_SECRET>", "name": "Admin", "pin": "1234" }` (one-time; refuses once employees exist).
- Login is PIN-based: `GET /api/employees/login-list` then `POST /api/auth/pin` with `{ employeeId, pin }`.
- The product catalog (carta) is empty on a fresh DB; create categories/products via `POST /api/admin/categories` and `POST /api/admin/products` (admin JWT) before an order can have line items.

### Lint / typecheck / test / build (from repo root)
- Lint: `pnpm run lint` · Typecheck: `pnpm run typecheck` · Build: `pnpm run build`.
- Tests: api-server Vitest via `pnpm --filter @workspace/api-server run test` (uses mocked DB by default; set `RUN_DB_INTEGRATION_TESTS=1` + a real `DATABASE_URL` for integration tests). Playwright e2e (`piccolo-tpv`) defaults to TPV `:5173` and API `:3000/api` — override `TPV_BASE_URL` / `API_BASE_URL` to match your ports.
