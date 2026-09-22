# AGENTS.md

Project overview, module map, stack, and standard commands live in `replit.md`
(root). Read it first. Standard scripts are defined in the root `package.json`
and each package's `package.json`.

## Cursor Cloud specific instructions

These are non-obvious caveats for running Piccolo TPV in the Cursor Cloud VM.
The update script (`pnpm install --frozen-lockfile`) only refreshes
dependencies — services below must be started manually.

### Toolchain (Node 24 via nvm)
- The project targets Node 24. It is installed via nvm and made default in
  `~/.bashrc`, so login shells (and tmux sessions started as login shells) get
  Node 24 automatically.
- There is an `/exec-daemon/node` shim (Node 22) that can win in some
  non-login shells. If `node --version` shows v22, prepend the toolchain:
  `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"`.
- Package manager is pnpm (enforced by the root `preinstall` hook).

### Environment variables (NOT auto-loaded)
- Nothing loads a `.env` file (no dotenv); the app reads `process.env`. A
  gitignored `.env` exists at the repo root with `DATABASE_URL`,
  `SESSION_SECRET`, `BOOTSTRAP_SECRET`, `PORT=8080`, `NODE_ENV=development`,
  and `ALLOWED_ORIGINS=http://localhost:3000`.
- Load it before starting any service: `set -a; . /workspace/.env; set +a`.

### PostgreSQL
- A local PostgreSQL 16 cluster backs the app. It is not auto-started on boot:
  `sudo pg_ctlcluster 16 main start`.
- Dev DB/user: database `piccolo_tpv`, role `piccolo` / password `piccolo`
  (matches `DATABASE_URL` in `.env`).
- The api-server runs `verifyMigrations()` on startup and refuses to open the
  port if migrations are pending. If the DB is fresh/empty, apply them:
  `pnpm --filter @workspace/db migrate`.

### Running the app (two servers + a reverse proxy)
The api-server serves the API at `/api` only — it does NOT serve the frontend,
and the Vite config has NO `/api` proxy. In production/Replit a router unifies
them; locally you must run a reverse proxy so the SPA and API share one origin.

1. Backend (port 8080): `pnpm --filter @workspace/api-server run dev`
   (this builds with esbuild, then starts). Auto-starts Socket.io + print/
   backup/verifactu workers and dev seeders.
2. Frontend (Vite): set a non-conflicting port, e.g.
   `PORT=5173 pnpm --filter @workspace/piccolo-tpv run dev`.
3. Reverse proxy on a single origin (e.g. `http://localhost:3000`) that routes
   `/api` + `/socket.io` → 8080 and everything else → 5173. Open the app via
   the proxy origin, not the raw Vite port.

CORS gotcha: because the browser sends an `Origin` header to the proxied API,
the api-server CORS allow-list will reject requests (HTTP 500 "origin not
allowed") unless the proxy origin is in `ALLOWED_ORIGINS` — hence
`ALLOWED_ORIGINS=http://localhost:3000` in `.env`.

Minimal proxy (Node built-ins, no deps) — save outside the repo and run with
Node 24:
```js
import http from 'node:http';
const API = { host: '127.0.0.1', port: 8080 };
const VITE = { host: '127.0.0.1', port: 5173 };
const pick = (u) => (u.startsWith('/api') || u.startsWith('/socket.io') ? API : VITE);
const server = http.createServer((req, res) => {
  const t = pick(req.url);
  const p = http.request({ host: t.host, port: t.port, method: req.method, path: req.url, headers: req.headers },
    (pr) => { res.writeHead(pr.statusCode, pr.headers); pr.pipe(res); });
  p.on('error', (e) => { if (!res.headersSent) res.writeHead(502); res.end(e.message); });
  req.on('error', () => p.destroy()); req.pipe(p);
});
server.on('upgrade', (req, socket, head) => {
  socket.on('error', () => {});
  const t = pick(req.url);
  const p = http.request({ host: t.host, port: t.port, method: req.method, path: req.url, headers: req.headers });
  p.on('upgrade', (pr, ps, ph) => {
    ps.on('error', () => {});
    socket.write('HTTP/1.1 101 Switching Protocols\r\n' +
      Object.entries(pr.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n');
    if (ph && ph.length) ps.unshift(ph);
    ps.pipe(socket); socket.pipe(ps);
  });
  p.on('error', () => socket.destroy()); p.end();
});
process.on('uncaughtException', (e) => console.error('[proxy]', e.message));
server.listen(3000, () => console.log('proxy on 3000'));
```

### Auth / first login
- No users exist on a fresh DB. Bootstrap the first admin:
  `POST /api/setup/seed-employees` with body
  `{ "bootstrapSecret": "<BOOTSTRAP_SECRET>", "name": "Admin Piccolo", "pin": "1234" }`.
- Log in via PIN: `POST /api/auth/pin` with `{ employeeId, pin }`, or in the UI
  select the profile and enter the 4-digit PIN (auto-submits). Admin lands on
  `/admin`; other roles on `/tables`.

### Tests / lint / typecheck
- Standard commands are in `package.json`. Vitest api-server tests mock the DB
  by default (a fake `DATABASE_URL` is injected), so they need no running DB;
  set `RUN_DB_INTEGRATION_TESTS=1` (+ real `DATABASE_URL`) for DB-backed tests.

### Known broken tooling
- Orval codegen is broken in this environment (see `replit.md` and
  `.agents/memory/orval-codegen-workaround.md`) — do not run it; the generated
  files are edited manually.
