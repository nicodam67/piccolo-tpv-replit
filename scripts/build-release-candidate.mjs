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
  sha256File,
  writeChecksums,
} from "./release-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const release = path.join(root, "release", "piccolo");
const stage = path.join(release, "staging");
const app = path.join(stage, "app");
const allowDirty = process.argv.includes("--allow-dirty");
const noInstaller = process.argv.includes("--no-installer");

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) throw new Error(`${command} failed with exit ${result.status}`);
}

function output(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", shell: process.platform === "win32" });
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
  throw new Error("Release build requires a clean commit (use --allow-dirty only for development)");
}
run("node", ["scripts/check-version-coherence.mjs"]);

fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(path.join(app, "server"), { recursive: true });
fs.mkdirSync(path.join(app, "web"), { recursive: true });
fs.mkdirSync(path.join(app, "db"), { recursive: true });
fs.mkdirSync(path.join(app, "runtime"), { recursive: true });
fs.mkdirSync(path.join(app, "installer"), { recursive: true });
fs.mkdirSync(path.join(app, "diagnostics"), { recursive: true });
fs.mkdirSync(path.join(app, "docs"), { recursive: true });
fs.mkdirSync(path.join(app, "dependencies"), { recursive: true });

run("pnpm", ["--filter", "@workspace/api-server", "deploy", "--prod", "--legacy", path.join(app, "server")]);
for (const disposable of ["src", "build.mjs", "tsconfig.json", "vitest.config.ts"]) {
  fs.rmSync(path.join(app, "server", disposable), { recursive: true, force: true });
}
copy(path.join(root, "artifacts", "api-server", "dist"), path.join(app, "server", "dist"));
copy(path.join(root, "artifacts", "piccolo-tpv", "dist", "public"), path.join(app, "web"));
copy(path.join(root, "lib", "db", "migrations"), path.join(app, "db", "migrations"));
copy(path.join(root, "lib", "db", "drizzle"), path.join(app, "db", "drizzle"));
copy(path.join(root, "packaging", "runtime"), path.join(app, "runtime"));
copy(path.join(root, "packaging", "diagnostics"), path.join(app, "diagnostics"));
for (const name of [
  "Common.ps1",
  "Configure-Server.ps1",
  "Manage-Server.ps1",
  "Restore-Server.ps1",
  "Complete-Uninstall.ps1",
  "Launch-Piccolo.ps1",
]) copy(path.join(root, "packaging", "windows", name), path.join(app, "installer", name));
for (const name of fs.readdirSync(release).filter((entry) => /\.(md|txt|html|pdf)$/.test(entry))) {
  copy(path.join(release, name), path.join(app, "docs", name));
}

const nodeName = `node-v${NODE_VERSION}-win-x64.zip`;
const nodeDestination = path.join(app, "dependencies", "node-win-x64.zip");
await downloadVerified(
  `https://nodejs.org/dist/v${NODE_VERSION}/${nodeName}`,
  `https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt`,
  nodeName,
  nodeDestination,
);
const caddyName = `caddy_${CADDY_VERSION}_windows_amd64.zip`;
const caddyDestination = path.join(app, "dependencies", "caddy-win-x64.zip");
await downloadVerified(
  `https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/${caddyName}`,
  `https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/caddy_${CADDY_VERSION}_checksums.txt`,
  caddyName,
  caddyDestination,
);

fs.writeFileSync(path.join(app, "VERSION.txt"), `Piccolo TPV ${RC_VERSION} — Solo para pruebas\n`);
fs.writeFileSync(path.join(app, "COMMIT.txt"), `${output("git", ["rev-parse", "HEAD"])}\n`);

const portableName = `Piccolo-TPV-${RC_VERSION}-portable.zip`;
fs.rmSync(path.join(release, portableName), { force: true });
if (process.platform === "win32") {
  run("powershell.exe", [
    "-NoProfile",
    "-Command",
    `Compress-Archive -Path '${app}\\*' -DestinationPath '${path.join(release, portableName)}' -Force`,
  ]);
} else {
  run("zip", ["-qr", path.join(release, portableName), "."], app);
}

if (!noInstaller) {
  const makensis = process.env.MAKENSIS
    ?? (process.platform === "win32"
      ? "C:\\Program Files (x86)\\NSIS\\makensis.exe"
      : "makensis");
  const packagingDir = path.join(root, "packaging", "windows");
  const define = process.platform === "win32" ? "/D" : "-D";
  run(makensis, [
    `${define}VERSION=${RC_VERSION}`,
    `${define}OUTPUT_DIR=${release}`,
    `${define}PACKAGING_DIR=${packagingDir}`,
    path.join(packagingDir, "PiccoloTPV-Client.nsi"),
  ]);
  run(makensis, [
    `${define}VERSION=${RC_VERSION}`,
    `${define}OUTPUT_DIR=${release}`,
    `${define}STAGE_DIR=${stage}`,
    path.join(packagingDir, "PiccoloTPV-Server.nsi"),
  ]);
}

const commit = output("git", ["rev-parse", "HEAD"]);
const manifest = artifactManifest(release, commit);
writeChecksums(release, manifest);
fs.writeFileSync(path.join(release, "build-metadata.json"), `${JSON.stringify({
  version: RC_VERSION,
  commit,
  node: process.version,
  pnpm: output("pnpm", ["--version"]),
  cleanCommit: !output("git", ["status", "--porcelain"]),
  releaseCandidate: true,
  stableRelease: false,
  codeSigned: false,
  hardwareCertified: false,
}, null, 2)}\n`);
process.stdout.write(`Built ${manifest.artifacts.length} RC artifacts in ${release}\n`);
