import { createHash } from "node:crypto";
import physicalCatalogJson from "../../../../docs/certification/entrega67-physical-certification.json";
import { maskSecrets } from "./mask-secrets";

export const CERTIFICATION_STATUSES = [
  "pending",
  "in_progress",
  "passed",
  "failed",
  "not_applicable",
] as const;

export type CertificationStatus = typeof CERTIFICATION_STATUSES[number];

export interface PhysicalCertificationCase {
  caseId: string;
  area: "printing" | "kds" | "tablet" | "timeclock" | "backup";
  deviceRef: string;
  requiredHardware: string;
  preparation: string;
  steps: string[];
  expected: string;
  evidence: string[];
  status: string;
}

export interface CertificationEvent {
  id: string;
  testType: string;
  result: string;
  notes: string;
  performedBy: string;
  performedAt: Date | string;
  metadata: Record<string, unknown> | null;
}

export const PHYSICAL_CERTIFICATION_CASES =
  (physicalCatalogJson.cases as PhysicalCertificationCase[]);

export const PHYSICAL_CERTIFICATION_CASE_IDS =
  new Set(PHYSICAL_CERTIFICATION_CASES.map((entry) => entry.caseId));

export function certificationTestType(caseId: string) {
  return `entrega67:${caseId}`;
}

export function sanitizeCertificationText(value: unknown, maxLength = 2_000): string {
  return String(value ?? "")
    .slice(0, maxLength)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer ***")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, (ip) => `[ip:${certificationRef(ip)}]`)
    .replace(/\b(?:[0-9a-f]{2}:){5}[0-9a-f]{2}\b/gi, (mac) => `[mac:${certificationRef(mac)}]`)
    .replace(/\b((?:secret|password|token|api[_-]?key)\s*[:=]\s*)\S+/gi, "$1***");
}

export function sanitizeCertificationData(value: unknown): unknown {
  if (typeof value === "string") return sanitizeCertificationText(value);
  if (Array.isArray(value)) return value.slice(0, 50).map(sanitizeCertificationData);
  if (value && typeof value === "object") {
    const masked = maskSecrets(value) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(masked).slice(0, 50).map(([key, entry]) => [
        key,
        sanitizeCertificationData(entry),
      ]),
    );
  }
  return value;
}

export function certificationRef(value: unknown) {
  return createHash("sha256").update(String(value ?? "")).digest("hex").slice(0, 12);
}

export function mergeCertificationCases(events: CertificationEvent[]) {
  const latest = new Map<string, CertificationEvent>();
  for (const event of events) {
    const caseId = event.testType.startsWith("entrega67:")
      ? event.testType.slice("entrega67:".length)
      : "";
    if (!PHYSICAL_CERTIFICATION_CASE_IDS.has(caseId) || latest.has(caseId)) continue;
    latest.set(caseId, event);
  }
  return PHYSICAL_CERTIFICATION_CASES.map((entry) => {
    const event = latest.get(entry.caseId);
    return {
      ...entry,
      catalogStatus: entry.status,
      status: (event?.result ?? "pending") as CertificationStatus,
      notes: event?.notes ?? "",
      performedBy: event?.performedBy ?? null,
      performedAt: event?.performedAt ?? null,
      evidence: event?.metadata?.evidence ?? [],
    };
  });
}

export function certificationSummary(
  cases: Array<{ status: CertificationStatus }>,
) {
  const counts = Object.fromEntries(
    CERTIFICATION_STATUSES.map((status) => [
      status,
      cases.filter((entry) => entry.status === status).length,
    ]),
  ) as Record<CertificationStatus, number>;
  const status = counts.failed > 0
    ? "blocked"
    : counts.in_progress > 0
      ? "in_progress"
      : counts.passed + counts.not_applicable === cases.length
        ? "ready_for_signoff"
        : "pending";
  return { total: cases.length, counts, status };
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderCertificationHtml(snapshot: Record<string, any>, autoPrint = false) {
  const rows = snapshot.certification.cases.map((entry: Record<string, unknown>) => `
    <tr>
      <td>${escapeHtml(entry.caseId)}</td>
      <td>${escapeHtml(entry.area)}</td>
      <td><span class="status ${escapeHtml(entry.status)}">${escapeHtml(entry.status)}</span></td>
      <td>${escapeHtml(entry.performedBy ?? "—")}</td>
      <td>${escapeHtml(entry.performedAt ?? "—")}</td>
      <td>${escapeHtml(entry.notes ?? "")}</td>
    </tr>`).join("");
  const stepRows = snapshot.steps.map((step: Record<string, any>) => `
    <tr>
      <td>${escapeHtml(step.label)}</td>
      <td>${escapeHtml(step.status)}</td>
      <td>${escapeHtml(step.configured.join("; "))}</td>
      <td>${escapeHtml(step.missing.join("; "))}</td>
      <td>${escapeHtml(step.errors.join("; "))}</td>
    </tr>`).join("");
  const incidentRows = snapshot.incidents.map((incident: Record<string, unknown>) => `
    <tr>
      <td>${escapeHtml(incident.level)}</td>
      <td>${escapeHtml(incident.module)}</td>
      <td>${escapeHtml(incident.message)}</td>
      <td>${escapeHtml(incident.createdAt)}</td>
    </tr>`).join("");
  const deviceRows = snapshot.devices.details.map((device: Record<string, unknown>) => `
    <tr>
      <td>${escapeHtml(device.type)}</td>
      <td>${escapeHtml(device.name)}</td>
      <td>${escapeHtml(device.model)}</td>
      <td>${escapeHtml(device.status)}</td>
      <td>${escapeHtml(device.detection)}</td>
    </tr>`).join("");
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Certificación física Piccolo TPV</title>
<style>
@page{size:A4;margin:14mm}body{font:12px Arial,sans-serif;color:#172033}h1{font-size:23px}h2{margin-top:24px;border-bottom:2px solid #0e7490;padding-bottom:5px}
table{width:100%;border-collapse:collapse;margin:10px 0;font-size:10px}th,td{border:1px solid #cbd5e1;padding:5px;text-align:left;vertical-align:top}th{background:#e2e8f0}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:5px}.warning{background:#fef3c7;padding:10px;border:1px solid #f59e0b}.status{font-weight:bold}.passed{color:#15803d}.failed{color:#b91c1c}.in_progress{color:#b45309}
</style></head><body>
<h1>Informe de instalación y certificación física</h1>
<p class="warning">Evidencia operativa. La automatización no certifica hardware físico y no se incluyen secretos ni direcciones IP.</p>
<div class="meta"><div><b>Generado:</b> ${escapeHtml(snapshot.generatedAt)}</div><div><b>Versión:</b> ${escapeHtml(snapshot.version)}</div><div><b>Restaurante:</b> ${escapeHtml(snapshot.configuration.restaurantName)}</div><div><b>NIF:</b> ${escapeHtml(snapshot.configuration.nif)}</div></div>
<h2>Configuración y diagnóstico</h2><table><thead><tr><th>Paso</th><th>Estado</th><th>Configurado</th><th>Falta</th><th>Errores</th></tr></thead><tbody>${stepRows}</tbody></table>
<h2>Dispositivos</h2><p>Ordenadores: ${snapshot.devices.mainComputers}; impresoras: ${snapshot.devices.printers}; KDS: ${snapshot.devices.kds}; tablets inventariadas: ${snapshot.devices.tablets}; tablets conectadas: ${snapshot.devices.connectedTablets}; destinos: ${escapeHtml(snapshot.devices.storageTypes.join(", ")) || "ninguno"}.</p>
<table><thead><tr><th>Tipo</th><th>Nombre</th><th>Modelo/zona</th><th>Estado</th><th>Detección</th></tr></thead><tbody>${deviceRows || "<tr><td colspan='5'>Sin dispositivos</td></tr>"}</tbody></table>
<h2>Checklist físico (${snapshot.certification.summary.total})</h2><table><thead><tr><th>ID</th><th>Área</th><th>Estado</th><th>Usuario</th><th>Fecha/hora</th><th>Observaciones</th></tr></thead><tbody>${rows}</tbody></table>
<h2>Incidencias</h2><table><thead><tr><th>Nivel</th><th>Módulo</th><th>Mensaje</th><th>Fecha</th></tr></thead><tbody>${incidentRows || "<tr><td colspan='4'>Sin incidencias abiertas</td></tr>"}</tbody></table>
<p><b>Estado global:</b> ${escapeHtml(snapshot.certification.summary.status)}. Requiere firma humana para cualquier aprobación física.</p>
${autoPrint ? "<script>window.addEventListener('load',()=>window.print())</script>" : ""}
</body></html>`;
}
