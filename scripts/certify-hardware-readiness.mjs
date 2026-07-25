import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ref = (value) => createHash("sha256").update(String(value)).digest("hex").slice(0, 12);

async function timedFetch(fetchImpl, url, init) {
  const startedAt = performance.now();
  const response = await fetchImpl(url, init);
  const durationMs = Number((performance.now() - startedAt).toFixed(1));
  if (!response.ok) throw new Error(`HTTP_${response.status}:${new URL(url).pathname}`);
  return { body: await response.json(), durationMs };
}

export async function collectHardwareReadiness({
  baseUrl,
  token,
  fetchImpl = fetch,
  concurrentClients = 7,
}) {
  const api = baseUrl.replace(/\/$/, "");
  const auth = { Authorization: `Bearer ${token}` };
  const health = await timedFetch(fetchImpl, `${api}/healthz`);
  const departmentsResult = await timedFetch(
    fetchImpl,
    `${api}/production-departments`,
    { headers: auth },
  );
  const stationsResult = await timedFetch(
    fetchImpl,
    `${api}/admin/kds-stations`,
    { headers: auth },
  );
  const printersResult = await timedFetch(
    fetchImpl,
    `${api}/production/printers`,
    { headers: auth },
  );
  const departments = departmentsResult.body;
  const navDepartments = departments.filter((department) => department.showInKdsNav);

  const loadStarted = performance.now();
  const probes = await Promise.all(
    Array.from({ length: concurrentClients }, async (_, clientIndex) => {
      const zones = await Promise.all(navDepartments.map(async (department) => {
        const result = await timedFetch(
          fetchImpl,
          `${api}/kds/${encodeURIComponent(department.code)}`,
          { headers: auth },
        );
        return {
          departmentRef: ref(department.code),
          taskCount: Array.isArray(result.body) ? result.body.length : null,
          durationMs: result.durationMs,
        };
      }));
      return { clientRef: `D${clientIndex + 1}`, zones };
    }),
  );

  return {
    schemaVersion: "hardware-readiness-v1",
    runId: randomUUID(),
    collectedAt: new Date().toISOString(),
    globalStatus: "PENDING_PHYSICAL_CERTIFICATION",
    softwareBoundary: "Read-only API reachability/load; no physical device is certified",
    health: { ok: health.body?.status === "ok", durationMs: health.durationMs },
    departments: departments.map((department) => ({
      departmentRef: ref(department.code),
      outputMode: department.outputMode,
      workflowProfile: department.workflowProfile,
      printerCount: department.printerIds?.length ?? 0,
      showInKdsNav: department.showInKdsNav,
    })),
    kdsStations: stationsResult.body.map((station) => ({
      stationRef: ref(station.id),
      departmentRef: ref(station.zoneType),
      active: station.active,
      hasDisplayUrl: Boolean(station.displayUrl),
      hasLastPing: Boolean(station.lastPingAt),
    })),
    printers: printersResult.body.map((printer) => ({
      printerRef: ref(printer.id),
      active: printer.active,
      lastStatus: printer.lastStatus,
    })),
    sevenClientReadProbe: {
      requestedClients: concurrentClients,
      durationMs: Number((performance.now() - loadStarted).toFixed(1)),
      clients: probes,
      meaning: "Concurrent read-only KDS probe, not seven physical tablets",
    },
    physicalMetrics: {
      browserMemory: "PENDING_PHYSICAL_CERTIFICATION",
      wifiReconnect: "PENDING_PHYSICAL_CERTIFICATION",
      orientation: "PENDING_PHYSICAL_CERTIFICATION",
      nfc: "PENDING_PHYSICAL_CERTIFICATION",
    },
  };
}

async function main() {
  const baseUrl = process.env.API_BASE_URL;
  const token = process.env.CERT_AUTH_TOKEN;
  if (!baseUrl || !token) {
    throw new Error("API_BASE_URL and CERT_AUTH_TOKEN are required");
  }
  const evidence = await collectHardwareReadiness({
    baseUrl,
    token,
    concurrentClients: Number(process.env.CERT_CONCURRENT_CLIENTS ?? 7),
  });
  const output = process.env.CERT_EVIDENCE_PATH
    ?? "/tmp/piccolo-certification/hardware-readiness.json";
  fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
  fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({
    ok: true,
    runId: evidence.runId,
    status: evidence.globalStatus,
    evidencePath: output,
  }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error.message }));
    process.exit(1);
  });
}
