import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  CADDY_VERSION,
  NODE_VERSION,
  RC_VERSION,
  artifactManifest,
  hashFile,
  writeChecksums,
} from "./release-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const release = path.join(root, "release", "piccolo");
const stage = path.join(release, "staging-linux");
const app = path.join(stage, "app");
const allowDirty = process.argv.includes("--allow-dirty");

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} failed with exit ${result.status}`);
}

function output(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command} failed`);
  return result.stdout.trim();
}

function copy(source, destination) {
  fs.cpSync(source, destination, { recursive: true, force: true });
}

async function downloadVerified(url, checksumsUrl, expectedName, destination) {
  if (fs.existsSync(destination)) return;
  const [fileResponse, checksumsResponse] = await Promise.all([fetch(url), fetch(checksumsUrl)]);
  if (!fileResponse.ok || !checksumsResponse.ok) throw new Error(`Unable to download ${expectedName}`);
  fs.writeFileSync(destination, Buffer.from(await fileResponse.arrayBuffer()), { mode: 0o600 });
  const checksums = await checksumsResponse.text();
  const expected = checksums.split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .find((parts) => parts[parts.length - 1] === expectedName)?.[0]?.toLowerCase();
  const algorithm = expected?.length === 128 ? "sha512" : "sha256";
  if (!expected || hashFile(destination, algorithm) !== expected) {
    fs.rmSync(destination, { force: true });
    throw new Error(`Checksum mismatch for ${expectedName}`);
  }
}

if (!allowDirty && output("git", ["status", "--porcelain"])) {
  throw new Error("Linux release build requires a clean commit (use --allow-dirty only for development)");
}
run("node", ["scripts/check-version-coherence.mjs"]);

fs.rmSync(stage, { recursive: true, force: true });
for (const dir of ["server", "web", "db", "runtime", "linux", "diagnostics", "docs", "dependencies"]) {
  fs.mkdirSync(path.join(app, dir), { recursive: true });
}

run("pnpm", ["--filter", "@workspace/api-server", "deploy", "--prod", "--legacy", path.join(app, "server")]);
for (const disposable of ["src", "build.mjs", "tsconfig.json", "vitest.config.ts"]) {
  fs.rmSync(path.join(app, "server", disposable), { recursive: true, force: true });
}
copy(path.join(root, "artifacts", "api-server", "dist"), path.join(app, "server", "dist"));
copy(path.join(root, "artifacts", "piccolo-tpv", "dist", "public"), path.join(app, "web"));
copy(path.join(root, "lib", "db", "migrations"), path.join(app, "db", "migrations"));
copy(path.join(root, "lib", "db", "drizzle"), path.join(app, "db", "drizzle"));
copy(path.join(root, "packaging", "runtime"), path.join(app, "runtime"));
copy(path.join(root, "packaging", "linux"), path.join(app, "linux"));
copy(path.join(root, "packaging", "diagnostics"), path.join(app, "diagnostics"));
for (const name of fs.readdirSync(release).filter((entry) => /\.(md|txt|html|pdf)$/.test(entry))) {
  copy(path.join(release, name), path.join(app, "docs", name));
}

const nodeName = `node-v${NODE_VERSION}-linux-x64.tar.xz`;
const nodeDestination = path.join(app, "dependencies", "node-linux-x64.tar.xz");
await downloadVerified(
  `https://nodejs.org/dist/v${NODE_VERSION}/${nodeName}`,
  `https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt`,
  nodeName,
  nodeDestination,
);
const caddyName = `caddy_${CADDY_VERSION}_linux_amd64.tar.gz`;
const caddyDestination = path.join(app, "dependencies", "caddy-linux-amd64.tar.gz");
await downloadVerified(
  `https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/${caddyName}`,
  `https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/caddy_${CADDY_VERSION}_checksums.txt`,
  caddyName,
  caddyDestination,
);

fs.writeFileSync(path.join(app, "VERSION.txt"), `Piccolo TPV ${RC_VERSION} — Linux/TOS — Solo para pruebas\n`);
fs.writeFileSync(path.join(app, "COMMIT.txt"), `${output("git", ["rev-parse", "HEAD"])}\n`);
for (const script of [
  "install-tos.sh",
  "install-docker.sh",
  "install-native.sh",
  "configure-server.sh",
  "manage-server.sh",
  "common.sh",
  "docker/entrypoint.sh",
]) {
  const filePath = path.join(app, "linux", script);
  if (fs.existsSync(filePath)) fs.chmodSync(filePath, 0o755);
}

const commit = output("git", ["rev-parse", "--short", "HEAD"]);
const bundleName = `Piccolo-TPV-${RC_VERSION}-TOS-linux-amd64-${commit}.tar.gz`;
const bundlePath = path.join(release, bundleName);
fs.rmSync(bundlePath, { force: true });
run("tar", ["-czf", bundlePath, "-C", app, "."]);

const manifest = artifactManifest(release, output("git", ["rev-parse", "HEAD"]));
writeChecksums(release, manifest);
fs.writeFileSync(path.join(release, "build-metadata-linux.json"), `${JSON.stringify({
  version: RC_VERSION,
  commit: output("git", ["rev-parse", "HEAD"]),
  platform: "linux-amd64",
  target: "tos",
  node: NODE_VERSION,
  caddy: CADDY_VERSION,
  bundle: bundleName,
  releaseCandidate: true,
  productionCertified: false,
}, null, 2)}\n`);
process.stdout.write(`Built Linux/TOS bundle ${bundlePath}\n`);
