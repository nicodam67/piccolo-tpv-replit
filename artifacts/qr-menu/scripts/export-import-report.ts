#!/usr/bin/env tsx
/**
 * export-import-report.ts — Genera MIGRATION_REPORT.md combinando todos los
 * informes de importación.
 *
 * Uso:
 *   npx tsx scripts/export-import-report.ts \
 *     --input ./import_piccolo_qr \
 *     --output ./MIGRATION_REPORT.md
 *
 * Lee:
 *   <input>/.id-map.json
 *   <input>/images-report.json
 *   <input>/verify-report.json
 *
 * Genera:
 *   <output>  (por defecto: ./MIGRATION_REPORT.md)
 */

import * as fs from "fs";
import * as path from "path";

// ── Arg parsing ────────────────────────────────────────────────────────────────
function parseArgs(): { input: string; output: string } {
  const argv = process.argv.slice(2);
  let input = path.resolve("import_piccolo_qr");
  let output = path.resolve("MIGRATION_REPORT.md");
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input"  && argv[i+1]) { input  = path.resolve(argv[++i]); }
    if (argv[i] === "--output" && argv[i+1]) { output = path.resolve(argv[++i]); }
  }
  return { input, output };
}

function readJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function badge(ok: boolean): string { return ok ? "✅" : "❌"; }
function pct(n: number, total: number): string {
  if (total === 0) return "–";
  return `${((n / total) * 100).toFixed(1)}%`;
}

interface IdMap { categories: Record<string,string>; menuItems: Record<string,string>; branding: Record<string,string>; storage: Record<string,string>; }
interface ImgReport {
  generatedAt: string;
  summary: { total: number; uploaded: number; skipped: number; missing: number; error: number };
  images: Array<{ storageId: string; status: string; error?: string; }>;
}
interface VerifyReport {
  generatedAt: string;
  passed: boolean;
  checks: Record<string, { source: number; convex: number; ok: boolean; note?: string }>;
  issues: Array<{ level: string; message: string }>;
  idMapCompleteness: { categories: string; menuItems: string; storage: string };
  importLogSummary: Record<string, { ok: number; error: number; skipped: number }>;
}

async function main() {
  const { input, output } = parseArgs();
  console.log(`Reading from: ${input}`);
  console.log(`Writing to:   ${output}`);

  const idMap    = readJson<IdMap>(path.join(input, ".id-map.json"));
  const imgRep   = readJson<ImgReport>(path.join(input, "images-report.json"));
  const verRep   = readJson<VerifyReport>(path.join(input, "verify-report.json"));

  const now = new Date().toISOString();
  const lines: string[] = [];

  // ── Header ──────────────────────────────────────────────────────────────────
  lines.push("# Piccolo QR — Migration Report");
  lines.push("");
  lines.push(`**Generated:** ${now}`);
  lines.push(`**Input directory:** \`${input}\``);
  lines.push("");

  // ── Overall status ─────────────────────────────────────────────────────────
  const overallOk = verRep?.passed ?? false;
  lines.push(`## ${badge(overallOk)} Overall Status: ${overallOk ? "PASSED" : "FAILED"}`);
  lines.push("");
  if (!overallOk && verRep?.issues?.length) {
    lines.push("### Issues");
    lines.push("");
    for (const issue of verRep.issues) {
      lines.push(`- ${issue.level === "error" ? "❌" : "⚠️"} ${issue.message}`);
    }
    lines.push("");
  }

  // ── Data import summary ────────────────────────────────────────────────────
  lines.push("## Data Import");
  lines.push("");
  if (verRep?.checks) {
    lines.push("| Table | Source | Convex | Status |");
    lines.push("|-------|--------|--------|--------|");
    for (const [table, check] of Object.entries(verRep.checks)) {
      lines.push(`| \`${table}\` | ${check.source} | ${check.convex} | ${badge(check.ok)}${check.note ? ` ${check.note}` : ""} |`);
    }
    lines.push("");
  } else {
    lines.push("_verify-report.json not found. Run verify-import.ts first._");
    lines.push("");
  }

  // ── ID map ─────────────────────────────────────────────────────────────────
  lines.push("## ID Mapping");
  lines.push("");
  if (idMap) {
    lines.push("| Table | Mapped IDs |");
    lines.push("|-------|-----------|");
    lines.push(`| \`categories\` | ${Object.keys(idMap.categories).length} |`);
    lines.push(`| \`menuItems\`  | ${Object.keys(idMap.menuItems).length} |`);
    lines.push(`| \`branding\`   | ${Object.keys(idMap.branding).length} |`);
    lines.push(`| \`_storage\`   | ${Object.keys(idMap.storage).length} |`);
    lines.push("");
  } else {
    lines.push("_`.id-map.json` not found. Run import-data.ts first._");
    lines.push("");
  }

  // ── Images ─────────────────────────────────────────────────────────────────
  lines.push("## Media Upload");
  lines.push("");
  if (imgRep) {
    const s = imgRep.summary;
    lines.push(`**Generated:** ${imgRep.generatedAt}`);
    lines.push("");
    lines.push("| Metric | Count | % |");
    lines.push("|--------|-------|---|");
    lines.push(`| Total files | ${s.total} | – |`);
    lines.push(`| Uploaded | ${s.uploaded} | ${pct(s.uploaded, s.total)} |`);
    lines.push(`| Skipped (already uploaded) | ${s.skipped} | ${pct(s.skipped, s.total)} |`);
    lines.push(`| Missing in archives | ${s.missing} | ${pct(s.missing, s.total)} |`);
    lines.push(`| Errors | ${s.error} | ${pct(s.error, s.total)} |`);
    lines.push("");

    const errors = imgRep.images.filter((i) => i.status === "error" || i.status === "missing");
    if (errors.length > 0) {
      lines.push("### Files with issues");
      lines.push("");
      lines.push("| Storage ID | Status | Error |");
      lines.push("|------------|--------|-------|");
      for (const img of errors.slice(0, 50)) {
        lines.push(`| \`${img.storageId}\` | ${img.status} | ${img.error ?? "–"} |`);
      }
      if (errors.length > 50) lines.push(`_… and ${errors.length - 50} more_`);
      lines.push("");
    }
  } else {
    lines.push("_images-report.json not found. Run import-images.ts first._");
    lines.push("");
  }

  // ── Import log ─────────────────────────────────────────────────────────────
  if (verRep?.importLogSummary && Object.keys(verRep.importLogSummary).length > 0) {
    lines.push("## Import Log (by table)");
    lines.push("");
    lines.push("| Table | OK | Errors | Skipped |");
    lines.push("|-------|-----|--------|---------|");
    for (const [table, counts] of Object.entries(verRep.importLogSummary)) {
      lines.push(`| \`${table}\` | ${counts.ok} | ${counts.error} | ${counts.skipped} |`);
    }
    lines.push("");
  }

  // ── Next steps ─────────────────────────────────────────────────────────────
  lines.push("## Next Steps");
  lines.push("");
  if (!overallOk) {
    lines.push("1. Review the issues listed above.");
    lines.push("2. If storage refs are unmapped, re-run `import-images.ts` with the correct media ZIPs.");
    lines.push("3. Re-run `verify-import.ts` and `export-import-report.ts` to confirm.");
  } else {
    lines.push("1. ✅ All checks passed — the import is complete.");
    lines.push("2. Update `VITE_CONVEX_URL` in the qr-menu Vite config to point at the new project.");
    lines.push("3. Deploy with `npx convex deploy` and verify the live menu looks correct.");
    lines.push("4. Remove the Hércules OIDC configuration once the new project is stable.");
  }
  lines.push("");
  lines.push("---");
  lines.push(`_Report generated by \`scripts/export-import-report.ts\` at ${now}_`);

  fs.writeFileSync(output, lines.join("\n"));
  console.log(`✅ Report written to ${output}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
