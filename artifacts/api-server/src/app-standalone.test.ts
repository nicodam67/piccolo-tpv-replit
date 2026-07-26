import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Express } from "express";

describe("standalone same-origin server package", () => {
  const webRoot = fs.mkdtempSync(path.join(os.tmpdir(), "piccolo-web-"));
  let app: Express;
  const originalRoot = process.env.PICCOLO_WEB_ROOT;

  beforeAll(async () => {
    fs.writeFileSync(path.join(webRoot, "index.html"), "<!doctype html><title>Piccolo RC</title>");
    fs.writeFileSync(path.join(webRoot, "sw.js"), "self.addEventListener('fetch',()=>{});");
    fs.writeFileSync(path.join(webRoot, "waiter.webmanifest"), "{}");
    process.env.PICCOLO_WEB_ROOT = webRoot;
    vi.resetModules();
    app = (await import("./app")).default;
  });

  afterAll(() => {
    if (originalRoot === undefined) delete process.env.PICCOLO_WEB_ROOT;
    else process.env.PICCOLO_WEB_ROOT = originalRoot;
    fs.rmSync(webRoot, { recursive: true, force: true });
  });

  it("serves SPA deep links without intercepting API routes", async () => {
    const page = await request(app).get("/admin/instalacion/asistente").set("Accept", "text/html");
    expect(page.status).toBe(200);
    expect(page.text).toContain("Piccolo RC");
    const health = await request(app).get("/api/healthz");
    expect(health.status).toBe(200);
    expect(health.headers["x-piccolo-version"]).toBe("0.9.0-rc.1");
  });

  it("prevents stale service-worker and manifest caching", async () => {
    const worker = await request(app).get("/sw.js");
    const manifest = await request(app).get("/waiter.webmanifest");
    expect(worker.headers["cache-control"]).toBe("no-store");
    expect(manifest.headers["cache-control"]).toBe("no-store");
  });
});
