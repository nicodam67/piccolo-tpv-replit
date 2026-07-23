import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  downloadBackupArtifact,
  purgeBackupArtifact,
  uploadBackupArtifact,
  verifyBackupArtifact,
  type BackupArtifact,
} from "./backup-destinations";

let root = "";
const artifact: BackupArtifact = {
  formatVersion: "2.0.0",
  appVersion: "1.2.0",
  backupId: "backup-1",
  createdAt: "2026-07-23T00:00:00.000Z",
  iv: "00".repeat(12),
  ciphertext: "ciphertext",
  checksum: "checksum-1",
};

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "piccolo-backup-"));
  process.env.BACKUP_LOCAL_ROOTS = root;
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  delete process.env.BACKUP_LOCAL_ROOTS;
});

describe("external backup destinations", () => {
  it("round-trips and verifies an artifact on local/NAS storage", async () => {
    const destination = {
      id: "local-1",
      destType: "nas",
      config: { basePath: root },
    };
    const reference = await uploadBackupArtifact(destination, artifact);
    expect(await verifyBackupArtifact(destination, reference, artifact.checksum)).toBe(true);
    expect(await downloadBackupArtifact(destination, reference)).toEqual(artifact);
    await purgeBackupArtifact(destination, reference);
    await expect(readFile(path.join(root, reference))).rejects.toThrow();
  });

  it("rejects paths outside the configured allowlist", async () => {
    await expect(uploadBackupArtifact({
      id: "bad",
      destType: "local",
      config: { basePath: path.join(root, "..", "outside") },
    }, artifact)).rejects.toThrow(/fuera/);
  });

  it("detects a corrupted artifact after upload", async () => {
    const destination = { id: "local-1", destType: "local", config: { basePath: root } };
    const reference = await uploadBackupArtifact(destination, artifact);
    await writeFile(path.join(root, reference), JSON.stringify({ ...artifact, checksum: "tampered" }));
    expect(await verifyBackupArtifact(destination, reference, artifact.checksum)).toBe(false);
  });
});
