import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const linuxDir = path.join(root, "packaging", "linux");

describe("linux/tos packaging", () => {
  it("includes installer scripts and service units", () => {
    for (const name of [
      "common.sh",
      "configure-server.sh",
      "install-docker.sh",
      "install-native.sh",
      "install-tos.sh",
      "manage-server.sh",
      "docker-compose.yml",
      "Caddyfile.docker",
      "docker/Dockerfile",
      "docker/entrypoint.sh",
      "piccolo-api.service",
      "piccolo-caddy.service",
    ]) {
      assert.ok(fs.existsSync(path.join(linuxDir, name)), name);
    }
  });

  it("documents TerraMaster installation", () => {
    const guide = fs.readFileSync(path.join(root, "release", "piccolo", "TOS-INSTALACION.md"), "utf8");
    assert.match(guide, /TerraMaster/);
    assert.match(guide, /Docker/);
    assert.match(guide, /F4-424/);
  });

  it("uses amd64 linux dependencies in the linux release builder", () => {
    const builder = fs.readFileSync(path.join(root, "scripts", "build-release-candidate-linux.mjs"), "utf8");
    assert.match(builder, /node-linux-x64\.tar\.xz/);
    assert.match(builder, /caddy-linux-amd64\.tar\.gz/);
    assert.match(builder, /TOS-linux-amd64/);
  });

  it("keeps docker compose services for postgres, piccolo and caddy", () => {
    const compose = fs.readFileSync(path.join(linuxDir, "docker-compose.yml"), "utf8");
    assert.match(compose, /postgres:/);
    assert.match(compose, /piccolo:/);
    assert.match(compose, /caddy:/);
    assert.match(compose, /postgres:16-alpine/);
  });
});
