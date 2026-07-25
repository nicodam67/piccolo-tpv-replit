import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ref = (value) => createHash("sha256").update(String(value)).digest("hex").slice(0, 12);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(fetchImpl, url, token, init = {}) {
  const response = await fetchImpl(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`HTTP_${response.status}:${body.error ?? new URL(url).pathname}`);
  return body;
}

export async function collectPhysicalPrintEvidence({
  baseUrl,
  token,
  printerIds,
  fetchImpl = fetch,
  pollTimeoutMs = 60_000,
}) {
  const api = baseUrl.replace(/\/$/, "");
  const profiles = ["standard", "charset", "long", "drawer"];
  const jobs = [];
  for (const printerId of printerIds) {
    for (const profile of profiles) {
      const commandId = randomUUID();
      const created = await request(
        fetchImpl,
        `${api}/admin/printers/${encodeURIComponent(printerId)}/test`,
        token,
        {
          method: "POST",
          headers: { "Idempotency-Key": `physical-print-${commandId}` },
          body: JSON.stringify({ profile }),
        },
      );
      jobs.push({
        jobId: created.jobId,
        printerRef: ref(printerId),
        profile,
        physicalStatus: created.physicalStatus,
      });
    }
    for (let copy = 0; copy < 3; copy++) {
      const created = await request(
        fetchImpl,
        `${api}/admin/printers/${encodeURIComponent(printerId)}/test`,
        token,
        {
          method: "POST",
          headers: { "Idempotency-Key": `physical-multiple-${randomUUID()}` },
          body: JSON.stringify({ profile: "standard" }),
        },
      );
      jobs.push({
        jobId: created.jobId,
        printerRef: ref(printerId),
        profile: `multiple-${copy + 1}`,
        physicalStatus: created.physicalStatus,
      });
    }
  }

  const deadline = Date.now() + pollTimeoutMs;
  let queue = [];
  do {
    queue = await request(fetchImpl, `${api}/admin/print-queue?limit=500`, token);
    const byId = new Map(queue.map((job) => [job.id, job]));
    if (jobs.every((job) => {
      const status = byId.get(job.jobId)?.status;
      return ["printed", "error", "cancelled"].includes(status);
    })) break;
    await sleep(1000);
  } while (Date.now() < deadline);

  const byId = new Map(queue.map((job) => [job.id, job]));
  const audit = await request(fetchImpl, `${api}/admin/print-audit?limit=500`, token);
  return {
    schemaVersion: "escpos-physical-session-v1",
    runId: randomUUID(),
    collectedAt: new Date().toISOString(),
    globalStatus: "PENDING_PHYSICAL_CERTIFICATION",
    meaningOfPrinted: "Socket accepted bytes; operator must verify paper output",
    jobs: jobs.map((job) => {
      const queueJob = byId.get(job.jobId);
      return {
        jobRef: ref(job.jobId),
        printerRef: job.printerRef,
        profile: job.profile,
        queueStatus: queueJob?.status ?? "unknown",
        attempts: queueJob?.attempts ?? null,
        hasError: Boolean(queueJob?.lastError),
        auditActions: audit
          .filter((entry) => entry.printQueueId === job.jobId)
          .map((entry) => entry.action),
        operatorObservation: "PENDING_PHYSICAL_CERTIFICATION",
      };
    }),
  };
}

async function main() {
  if (process.env.ALLOW_PHYSICAL_PRINT_TEST !== "YES_I_UNDERSTAND") {
    throw new Error("ALLOW_PHYSICAL_PRINT_TEST=YES_I_UNDERSTAND is required");
  }
  const baseUrl = process.env.API_BASE_URL;
  const token = process.env.CERT_AUTH_TOKEN;
  const printerIds = (process.env.CERT_PRINTER_IDS ?? "").split(",").filter(Boolean);
  if (!baseUrl || !token || !printerIds.length) {
    throw new Error("API_BASE_URL, CERT_AUTH_TOKEN and CERT_PRINTER_IDS are required");
  }
  const evidence = await collectPhysicalPrintEvidence({ baseUrl, token, printerIds });
  const output = process.env.CERT_EVIDENCE_PATH
    ?? "/tmp/piccolo-certification/escpos-session.json";
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
