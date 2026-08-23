import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { RC_VERSION } from "./release-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const release = path.join(root, "release", "piccolo");
const stage = path.join(release, "hardware-package");

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} failed with exit ${result.status}`);
}

function output(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command} failed`);
  return result.stdout.trim();
}

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

const dirty = output("git", ["status", "--porcelain"]);
if (dirty) throw new Error("Hardware package requires a clean committed tree");

const commit = output("git", ["rev-parse", "HEAD"]);
const shortCommit = commit.slice(0, 7);
const windowsClientSource = path.join(release, "Piccolo-TPV-Setup.exe");
const windowsServerSource = path.join(release, "Piccolo-Server-Setup.exe");
const terraMaster = fs.readdirSync(release)
  .find((name) => name === `Piccolo-TPV-${RC_VERSION}-TOS-linux-amd64-${shortCommit}.tar.gz`);
const guidePdf = path.join(release, "INSTALAR-Y-PROBAR-PICCOLO.pdf");

for (const required of [windowsClientSource, windowsServerSource, guidePdf]) {
  if (!fs.existsSync(required)) throw new Error(`Missing required artifact: ${required}`);
}
if (!terraMaster) throw new Error("Missing TerraMaster bundle for current commit");

fs.rmSync(stage, { recursive: true, force: true });
for (const directory of [
  "01-Windows-TPV",
  "02-Windows-Servidor",
  "03-TerraMaster",
  "04-Documentacion",
  "05-Diagnostico",
]) {
  fs.mkdirSync(path.join(stage, directory), { recursive: true });
}

const clientName = `Piccolo-TPV-Windows-${RC_VERSION}-${shortCommit}.exe`;
const serverName = `Piccolo-Server-Windows-${RC_VERSION}-${shortCommit}.exe`;
fs.copyFileSync(windowsClientSource, path.join(stage, "01-Windows-TPV", clientName));
fs.copyFileSync(windowsServerSource, path.join(stage, "02-Windows-Servidor", serverName));
const terraMasterSha256 = sha256(path.join(release, terraMaster));
fs.writeFileSync(
  path.join(stage, "03-TerraMaster", "ARTEFACTO-TERRAMASTER.txt"),
  [
    "El servidor TerraMaster se entrega como artefacto adjunto independiente",
    "para evitar duplicar 65 MB dentro de este ZIP.",
    "",
    `Nombre exacto: ${terraMaster}`,
    `SHA-256: ${terraMasterSha256}`,
    `Commit: ${commit}`,
    "",
    "Debe descargarse junto a este ZIP desde la entrega de Cursor Cloud.",
    "También es reproducible desde el repositorio con:",
    "  pnpm --filter @workspace/api-server run build",
    "  pnpm --filter @workspace/piccolo-tpv run build",
    "  pnpm run release:build-rc-linux",
  ].join("\n"),
);

for (const name of fs.readdirSync(release).filter((entry) => /\.(md|txt|html|pdf)$/.test(entry))) {
  fs.copyFileSync(path.join(release, name), path.join(stage, "04-Documentacion", name));
}
fs.cpSync(path.join(root, "packaging", "diagnostics"), path.join(stage, "05-Diagnostico"), {
  recursive: true,
  force: true,
});

const components = {
  product: "Piccolo TPV",
  version: RC_VERSION,
  commit,
  warning: "VERSIÓN DE PRUEBAS — NO USAR PARA FACTURACIÓN FISCAL REAL",
  fiscalPhase1Included: true,
  pullRequest: "https://github.com/nicodam67/piccolo-tpv-replit/pull/52",
  generatedAt: new Date().toISOString(),
  components: {
    windowsTpv: clientName,
    windowsServer: serverName,
    terraMaster,
    terraMasterSha256,
    terraMasterDelivery: "artefacto adjunto independiente",
    tabletAccess: "https://<servidor-piccolo>/",
    kdsAccess: "https://<servidor-piccolo>/kds/<departamento>",
    timeclockAccess: "https://<servidor-piccolo>/fichaje/tablet",
  },
};
fs.writeFileSync(
  path.join(stage, "BUILD-MANIFEST.json"),
  `${JSON.stringify(components, null, 2)}\n`,
);

const files = [];
function collect(directory, prefix = "") {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = path.join(prefix, entry.name).replaceAll("\\", "/");
    if (entry.isDirectory()) collect(absolute, relative);
    else files.push({ relative, absolute });
  }
}
collect(stage);
const checksums = files
  .sort((a, b) => a.relative.localeCompare(b.relative))
  .map((file) => `${sha256(file.absolute)}  ${file.relative}`);
fs.writeFileSync(path.join(stage, "SHA256SUMS.txt"), `${checksums.join("\n")}\n`);

const finalName = `Piccolo-TPV-${RC_VERSION}-Hardware-Test-${shortCommit}.zip`;
const finalPath = path.join(release, finalName);
fs.rmSync(finalPath, { force: true });
run("zip", ["-qr", finalPath, "."], stage);
const finalSha = sha256(finalPath);
fs.writeFileSync(
  path.join(release, `${finalName}.sha256`),
  `${finalSha}  ${finalName}\n`,
);
process.stdout.write(`${JSON.stringify({
  file: finalPath,
  sha256: finalSha,
  bytes: fs.statSync(finalPath).size,
}, null, 2)}\n`);
