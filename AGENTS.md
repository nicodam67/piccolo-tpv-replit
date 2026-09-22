# AGENTS.md

## Cursor Cloud specific instructions

Piccolo TPV is a pnpm-workspace monorepo: an Express API (`artifacts/api-server`, port 8080),
a React/Vite frontend (`artifacts/piccolo-tpv`, port 5173) and PostgreSQL 16 + Drizzle
(`lib/db`). Standard commands and architecture are documented in `replit.md` — read that first.
This section only captures the non-obvious things needed to run/test in the Cursor Cloud VM.

### Node / pnpm
- Use the nvm **default** Node (v22.x); it works for everything (lint, typecheck, all 31 vitest
  suites, migrations, both dev servers). `pnpm` is only installed for that version, so do not
  `nvm use` a different major or `pnpm` disappears from `PATH`.

### PostgreSQL (must be started every session)
- Postgres is installed but not auto-started. Start it once per VM boot:
  `sudo pg_ctlcluster 16 main start`
- The dev database persists in the VM snapshot: database `piccolo_tpv`, role `piccolo` /
  password `piccolo`. Migrations (idempotent) have already been applied; re-running is a no-op:
  `pnpm --filter @workspace/db run migrate`

### Environment variables (no dotenv — the app reads `process.env` directly)
- Required vars live in the git-ignored `/workspace/.env` (persists in the snapshot). Load them
  into any shell before running the API/tests/migrations:
  `set -a && . ./.env && set +a`
- Keys: `DATABASE_URL`, `SESSION_SECRET`, `BOOTSTRAP_SECRET` (>=32 chars), `PORT=8080`,
  `ALLOWED_ORIGINS`, `NODE_ENV=development`.

### Same-origin gotcha + dev reverse proxy (important)
- The frontend calls the API with **root-relative** `/api/...` paths and there is **no Vite
  proxy** — in production Replit serves both from one origin. Locally you must put them behind a
  single origin, otherwise the browser hits `/api` on the Vite port and nothing works.
- A tiny dependency-free reverse proxy is provided at `/home/ubuntu/dev-proxy.mjs` (persists in
  the snapshot). It listens on port **5000** and routes `/api` + `/socket.io` → 8080 and
  everything else → 5173. Run it with `node /home/ubuntu/dev-proxy.mjs` and open the app at
  **http://localhost:5000**. If the file is missing, recreate it (it just proxies http + the
  websocket `upgrade` event to those two ports).
- CORS is origin-allowlisted in `artifacts/api-server/src/app.ts`. The proxy origin must be in
  `ALLOWED_ORIGINS` (currently `http://localhost:5000`) or every browser API call returns HTTP
  500 (`CORS: origin not allowed`). curl without an `Origin` header will still succeed, which can
  hide this — always test through the browser.

### Running the app (three long-lived processes, e.g. in tmux)
- API: `set -a && . ./.env && set +a && pnpm --filter @workspace/api-server run dev`
  (rebuilds via esbuild then starts; it also runs demo seeders and print/backup/verifactu workers)
- Frontend: `PORT=5173 pnpm --filter @workspace/piccolo-tpv run dev`
- Proxy: `node /home/ubuntu/dev-proxy.mjs`

### First-run login / bootstrap
- The first admin is created via a one-time bootstrap endpoint (not a UI signup):
  `POST /api/setup/seed-employees` with `{ bootstrapSecret, name, pin }` (pin = 4-12 digits).
- An admin already exists in the snapshot DB: name **Administrador**, PIN **1234** (role `admin`).
  Log in by selecting the employee and typing the 4-digit PIN (auto-submits). Admins land on
  `/admin`; dining rooms (salas) are managed at `/configuracion`.

### Lint / typecheck / test (run from repo root; see `replit.md`)
- Lint: `pnpm run lint` · Typecheck: `pnpm run typecheck`
- API tests need env + a running Postgres: `pnpm --filter @workspace/api-server run test`
