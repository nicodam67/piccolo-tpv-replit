#!/usr/bin/env node --experimental-strip-types
/**
 * audit-routes.ts
 *
 * Static analysis of all Express route files to detect endpoints missing
 * `requireAuth`.  Handles three guard patterns:
 *   1. Inline:  router.get("/path", requireAuth, ...)
 *   2. Spread:  const guard = [requireAuth, ...]; router.get("/path", ...guard, ...)
 *   3. Multiline: router.put(\n  "/path",\n  requireAuth, ...)
 *
 * Strategy:
 *   For every router.<method>( occurrence, extract a 12-line window starting
 *   at that line.  Search the window for the path string (in quotes) and for
 *   auth markers (inline requireAuth or spread of a guard const).
 *
 * Exit codes:
 *   0 — all sensitive routes are guarded
 *   1 — one or more unguarded routes detected
 */

import { readdirSync, readFileSync } from "fs";
import { join } from "path";

// ─── Configuration ────────────────────────────────────────────────────────────

const ROUTES_DIR = join(import.meta.dirname, "../src/routes");

/**
 * Paths (or path prefixes) that are intentionally public.
 * Each new public endpoint requires a deliberate entry here.
 */
const PUBLIC_ALLOWLIST: RegExp[] = [
  /^\/health/,
  /^\/employees\/login-list/,         // PIN-login selector (no role data)
  /^\/auth\/pin/,                     // rate-limited PIN login
  /^\/fichaje\/public\//,             // mobile clock screen (intentionally no auth)
  /^\/public\//,                      // all /public/* routes (QR carta, online orders, etc.)
  /^\/order-status\//,                // online order status for customer
  /^\/driver\//,                      // delivery driver view (token-based)
  /^\/courier\//,                     // courier summary (token-based)
  /^\/v1\/qr-menu\//,                 // dedicated M2M bearer token + rate limit
  /^\/menu/,                          // public menu redirect
  /^\/config\/business$/,             // used by public setup wizard & QR carta
  /^\/setup\/detect$/,                // pre-auth module detection for setup wizard
  /^\/setup\/seed-employees$/,        // one-time bootstrap; only acts when DB is empty
  // ── Tablet kiosk endpoints (protected by pairing code or device token, not JWT) ──
  /^\/tablet\/register$/,             // requires admin-generated pairing code
  /^\/tablet\/device\//,              // device token validation & ping
  /^\/tablet\/verify-pin$/,           // PIN check gated by device token + rate limiting
  /^\/tablet\/clock$/,                // clock action gated by device token + idempotency
];

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

// How many lines to look ahead from the router.<method>( line for context
const WINDOW = 14;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isAllowlisted(routePath: string): boolean {
  return PUBLIC_ALLOWLIST.some((re) => re.test(routePath));
}

/**
 * Extract names of const arrays that contain requireAuth.
 * Matches single-line or multi-line const declarations:
 *   const guard = [requireAuth, requireRole(...)]
 *   const adminOnly = [\n  requireAuth, requireRole(...)\n]
 */
function findGuardConsts(source: string): Set<string> {
  const guards = new Set<string>();

  // Match across potential line breaks: const <name> = [ ... requireAuth ... ]
  // Strategy: find `const <name> = [` then grab up to next `]`
  const constStart = /const\s+(\w+)\s*=\s*\[/g;
  let m: RegExpExecArray | null;
  while ((m = constStart.exec(source)) !== null) {
    const name = m[1];
    const afterBracket = source.slice(m.index + m[0].length);
    const closeBracket = afterBracket.indexOf("]");
    if (closeBracket === -1) continue;
    const body = afterBracket.slice(0, closeBracket);
    if (body.includes("requireAuth")) {
      guards.add(name);
    }
  }
  return guards;
}

// ─── Per-file analysis ────────────────────────────────────────────────────────

interface Finding {
  file: string;
  method: string;
  path: string;
  line: number;
}

function analyzeFile(filename: string, source: string): Finding[] {
  const findings: Finding[] = [];
  const lines = source.split("\n");
  const guardConsts = findGuardConsts(source);

  // Regex matching spread of any known guard const
  const spreadGuardRe = guardConsts.size > 0
    ? new RegExp(`\\.\\.\\.(?:${[...guardConsts].join("|")})\\b`)
    : null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const method of METHODS) {
      // Must see `router.<method>(` on this line
      if (!new RegExp(`router\\.${method}\\s*\\(`).test(line)) continue;

      // Build a multi-line window for path + auth detection
      const window = lines.slice(i, i + WINDOW).join("\n");

      // ── Extract path ────────────────────────────────────────────
      // Look for a quoted string that looks like an Express path
      const pathMatch = window.match(/["'`](\/[^"'`]*?)["'`]/);
      if (!pathMatch) continue;
      const routePath = pathMatch[1];

      if (isAllowlisted(routePath)) continue;

      // ── Detect auth guard ───────────────────────────────────────
      const hasInlineAuth = /requireAuth/.test(window);
      const hasSpreadGuard = spreadGuardRe ? spreadGuardRe.test(window) : false;

      if (!hasInlineAuth && !hasSpreadGuard) {
        findings.push({ file: filename, method: method.toUpperCase(), path: routePath, line: i + 1 });
      }
    }
  }

  return findings;
}

// ─── Runner ───────────────────────────────────────────────────────────────────

const routeFiles = readdirSync(ROUTES_DIR)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "index.ts")
  .sort();

const allFindings: Finding[] = [];

for (const file of routeFiles) {
  const source = readFileSync(join(ROUTES_DIR, file), "utf-8");
  allFindings.push(...analyzeFile(file, source));
}

if (allFindings.length === 0) {
  console.log(`\n✅  Route audit PASSED — ${routeFiles.length} route files checked, no unguarded endpoints found.\n`);
  process.exit(0);
} else {
  console.error(`\n❌  Route audit FAILED — ${allFindings.length} unguarded endpoint(s) detected:\n`);
  for (const f of allFindings) {
    console.error(`  [${f.file}:${f.line}]  ${f.method} ${f.path}`);
  }
  console.error(`\nFix: add requireAuth (and requireRole if needed) to each route above,`);
  console.error(`OR add the path to PUBLIC_ALLOWLIST in scripts/audit-routes.ts if public access is intentional.\n`);
  process.exit(1);
}
