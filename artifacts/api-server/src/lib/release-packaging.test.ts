import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  RC_VERSION,
  artifactManifest,
  sha256File,
  writeChecksums,
} from "../../../../scripts/release-utils.mjs";

const root = path.resolve(import.meta.dirname, "../../../..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("Piccolo TPV release candidate packaging", () => {
  it("keeps version labels coherent and explicitly non-production", () => {
    expect(RC_VERSION).toBe("0.9.0-rc.1");
    expect(read("VERSION").trim()).toBe(RC_VERSION);
    expect(read("release/piccolo/VERSION.txt")).toContain("Solo para pruebas");
    expect(read("release/piccolo/VERSION.txt")).toContain("Producción: NO");
    expect(read("artifacts/piccolo-tpv/public/sw.js")).toContain(RC_VERSION);
  });

  it("defines three installable PWA profiles with unique identities and routes", () => {
    const manifests = ["waiter", "kds", "fichaje"].map((profile) => ({
      profile,
      value: JSON.parse(read(`artifacts/piccolo-tpv/public/${profile}.webmanifest`)),
    }));
    expect(new Set(manifests.map(({ value }) => value.id)).size).toBe(3);
    expect(manifests.find(({ profile }) => profile === "waiter")?.value.start_url).toContain("profile=waiter");
    expect(manifests.find(({ profile }) => profile === "kds")?.value).toMatchObject({
      scope: "/kds/",
      orientation: "landscape",
      display: "fullscreen",
    });
    expect(manifests.find(({ profile }) => profile === "fichaje")?.value.start_url).toContain("/fichaje/tablet");
    for (const { value } of manifests) {
      expect(value.icons).toHaveLength(1);
      expect(fs.existsSync(path.join(root, "artifacts/piccolo-tpv/public", value.icons[0].src))).toBe(true);
    }
  });

  it("requires owner-approved service-worker activation and fail-closed API offline behavior", () => {
    const worker = read("artifacts/piccolo-tpv/public/sw.js");
    expect(worker).toContain("SKIP_WAITING");
    expect(worker).toContain("Sin conexión con el servidor");
    expect(worker).toContain("No se guardan pedidos offline");
    const installHandler = worker.slice(
      worker.indexOf("self.addEventListener('install'"),
      worker.indexOf("self.addEventListener('activate'"),
    );
    expect(installHandler).not.toContain("skipWaiting");
  });

  it("preserves data, requires backup before update and explicit destructive confirmations", () => {
    const manager = read("packaging/windows/Manage-Server.ps1");
    const restore = read("packaging/windows/Restore-Server.ps1");
    const uninstall = read("packaging/windows/Complete-Uninstall.ps1");
    expect(manager.indexOf("New-PreUpdateBackup")).toBeLessThan(manager.indexOf("Stop-PiccoloTasks"));
    expect(manager).toContain("runtime\\preflight.mjs");
    expect(manager).toContain("cierra caja");
    expect(manager).toContain("datos y secretos se preservan");
    expect(manager).toContain("Wait-PiccoloHealth");
    expect(restore).toContain("RESTAURAR BASE DE DATOS");
    expect(restore).toContain("Get-FileHash");
    expect(uninstall).toContain("ELIMINAR PICCOLO Y TODOS LOS DATOS");
    expect(uninstall).toContain("Copia final");
  });

  it("configures autostart/recovery without embedding repository secrets", () => {
    const common = read("packaging/windows/Common.ps1");
    const configure = read("packaging/windows/Configure-Server.ps1");
    expect(common).toContain("New-ScheduledTaskTrigger -AtStartup");
    expect(common).toContain("-RestartCount 999");
    expect(configure).toContain("New-PiccoloSecret");
    expect(configure).toContain("Protect-PiccoloSecrets");
    expect(configure).toContain("PostgreSQL.PostgreSQL.16");
    const packaging = `${common}\n${configure}`;
    expect(packaging).not.toMatch(/SESSION_SECRET\s*=\s*["'][^"']{8,}/);
    expect(packaging).not.toMatch(/postgresql:\/\/[^:$\s]+:[^@$\s]+@/);
  });

  it("generates deterministic SHA-256 entries for release artifacts", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "piccolo-release-"));
    fs.writeFileSync(path.join(directory, "Piccolo-TPV-Setup.exe"), "client");
    fs.writeFileSync(path.join(directory, "Piccolo-Server-Setup.exe"), "server");
    const manifest = artifactManifest(directory, "abc123");
    expect(manifest.artifacts).toHaveLength(2);
    expect(manifest.signed).toBe(false);
    expect(manifest.productionCertified).toBe(false);
    writeChecksums(directory, manifest);
    expect(readFile(directory, "SHA256SUMS.txt")).toContain(
      sha256File(path.join(directory, "Piccolo-TPV-Setup.exe")),
    );
    fs.rmSync(directory, { recursive: true, force: true });
  });
});

function readFile(directory: string, name: string) {
  return fs.readFileSync(path.join(directory, name), "utf8");
}
