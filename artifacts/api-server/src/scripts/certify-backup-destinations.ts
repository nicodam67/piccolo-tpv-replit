import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  BACKUP_FORMAT_VERSION,
  backupArtifactChecksum,
  decryptBackup,
  encryptBackup,
} from "../lib/backup-core";
import {
  downloadBackupArtifact,
  purgeBackupArtifact,
  uploadBackupArtifact,
  verifyBackupArtifact,
  type BackupArtifact,
  type BackupDestination,
} from "../lib/backup-destinations";
import { maskSecrets } from "../lib/mask-secrets";

function ref(value: unknown) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 12);
}

function loadDestination(filePath: string): BackupDestination {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as BackupDestination;
  if (!parsed.id || !["local", "local_mount", "nas", "s3"].includes(parsed.destType)) {
    throw new Error(`Invalid certification destination: ${path.basename(filePath)}`);
  }
  return parsed;
}

async function roundTrip(destination: BackupDestination, artifact: BackupArtifact) {
  const reference = await uploadBackupArtifact(destination, artifact);
  const verified = await verifyBackupArtifact(destination, reference, artifact.checksum);
  const downloaded = await downloadBackupArtifact(destination, reference);
  const downloadedChecksum = backupArtifactChecksum(downloaded);
  return {
    reference,
    verified,
    downloadedChecksumMatch: downloadedChecksum === artifact.checksum,
  };
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Certification refuses NODE_ENV=production");
  if (process.env.ALLOW_EXTERNAL_STORAGE_TEST !== "YES_I_UNDERSTAND") {
    throw new Error("ALLOW_EXTERNAL_STORAGE_TEST=YES_I_UNDERSTAND is required");
  }
  if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET is required");
  const configPaths = [
    process.env.CERT_DEST_A_JSON_PATH,
    process.env.CERT_DEST_B_JSON_PATH,
  ].filter(Boolean) as string[];
  if (configPaths.length < 2) throw new Error("Two external destination config paths are required");
  const destinations = configPaths.map(loadDestination);

  const runId = randomUUID();
  const payload = JSON.stringify({
    certification: true,
    runId,
    createdAt: new Date().toISOString(),
    physicalStatus: "PENDING_PHYSICAL_CERTIFICATION",
  });
  const encrypted = await encryptBackup(payload);
  const artifact: BackupArtifact = {
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: "entrega67",
    backupId: `cert-${runId}`,
    createdAt: new Date().toISOString(),
    iv: encrypted.iv,
    ciphertext: encrypted.ciphertext,
    checksum: "",
  };
  artifact.checksum = backupArtifactChecksum(artifact);

  const results: Array<{
    destination: BackupDestination;
    reference: string;
    verified: boolean;
    downloadedChecksumMatch: boolean;
  }> = [];
  try {
    for (const destination of destinations) {
      const result = await roundTrip(destination, artifact);
      results.push({ destination, ...result });
    }
    // Switching to B must not invalidate the already verified copy on A.
    const oldStillValid = await verifyBackupArtifact(
      results[0].destination,
      results[0].reference,
      artifact.checksum,
    );
    const downloaded = await downloadBackupArtifact(
      results[1].destination,
      results[1].reference,
    );
    const decrypted = await decryptBackup(downloaded.iv, downloaded.ciphertext);
    if (decrypted !== payload) throw new Error("Destination B decrypted payload mismatch");

    const evidence = {
      schemaVersion: "backup-destination-cert-v1",
      runId,
      collectedAt: new Date().toISOString(),
      globalStatus: "PENDING_PHYSICAL_CERTIFICATION",
      destinations: results.map((result) => ({
        destinationRef: ref(result.destination.id),
        destType: result.destination.destType,
        config: maskSecrets(result.destination.config),
        verified: result.verified,
        downloadedChecksumMatch: result.downloadedChecksumMatch,
        referenceRef: ref(result.reference),
      })),
      switchSafety: {
        oldDestinationStillValid: oldStillValid,
        newDestinationDecrypts: true,
      },
      restoreDrill: "Run scripts/run-restore-staging-local.sh separately",
      checksumRef: `${artifact.checksum.slice(0, 8)}…`,
    };
    const output = process.env.CERT_EVIDENCE_PATH
      ?? "/tmp/piccolo-certification/backup-destination.json";
    fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
    fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
    console.log(JSON.stringify({ ok: true, runId, status: evidence.globalStatus, evidencePath: output }));
  } finally {
    for (const result of results) {
      await purgeBackupArtifact(result.destination, result.reference).catch(() => {});
    }
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exit(1);
});
