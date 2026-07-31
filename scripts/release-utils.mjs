import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const RC_VERSION = "0.9.0-rc.1";
export const NODE_VERSION = "24.18.0";
export const CADDY_VERSION = "2.10.2";

export function hashFile(filePath, algorithm = "sha256") {
  const hash = createHash(algorithm);
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

export function sha256File(filePath) {
  return hashFile(filePath, "sha256");
}

export function artifactManifest(outputDirectory, gitCommit) {
  const files = fs.readdirSync(outputDirectory)
    .filter((name) => /\.(exe|zip|tar\.gz)$/.test(name))
    .sort()
    .map((name) => {
      const filePath = path.join(outputDirectory, name);
      return {
        path: name,
        sha256: sha256File(filePath),
        bytes: fs.statSync(filePath).size,
      };
    });
  return {
    product: "Piccolo TPV",
    version: RC_VERSION,
    label: `Piccolo TPV ${RC_VERSION} — Solo para pruebas`,
    channel: "release-candidate",
    gitCommit,
    builtAt: new Date().toISOString(),
    nodeVersion: NODE_VERSION,
    caddyVersion: CADDY_VERSION,
    migrationHead: "0026_production_departments_printing",
    backupFormatVersion: "2.0.0",
    signed: false,
    productionCertified: false,
    artifacts: files,
  };
}

export function writeChecksums(outputDirectory, manifest) {
  const lines = manifest.artifacts.map((entry) => `${entry.sha256}  ${entry.path}`);
  fs.writeFileSync(path.join(outputDirectory, "SHA256SUMS.txt"), `${lines.join("\n")}\n`);
  fs.writeFileSync(
    path.join(outputDirectory, "artifact-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}
