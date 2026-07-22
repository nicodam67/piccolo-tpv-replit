import { describe, expect, it } from "vitest";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../../..");

describe("legacy QR removal integrity", () => {
  it("does not contain the removed workspace package", async () => {
    await expect(access(path.join(root, "artifacts/qr-menu"))).rejects.toThrow();
    const lockfile = await readFile(path.join(root, "pnpm-lock.yaml"), "utf8");
    expect(lockfile).not.toContain("artifacts/qr-menu:");
    expect(lockfile).not.toContain("@workspace/qr-menu");
  });

  it("does not navigate to the old /qr-menu mount", async () => {
    const hub = await readFile(
      path.join(root, "artifacts/piccolo-tpv/src/pages/carta-cocina/CartaCocinaHub.tsx"),
      "utf8",
    );
    expect(hub).not.toContain('"/qr-menu/');
    expect(hub).not.toContain("'/qr-menu/");
    expect(hub).toContain("externalQrMenuUrl");
  });

  it("does not retain active Convex or Hercules environment variables", async () => {
    const replit = await readFile(path.join(root, ".replit"), "utf8");
    const envExample = await readFile(path.join(root, ".env.example"), "utf8");
    expect(replit).not.toMatch(/VITE_CONVEX_URL|VITE_HERCULES|CONVEX_IMPORT_SECRET/);
    expect(envExample).not.toMatch(/VITE_CONVEX_URL|VITE_HERCULES|CONVEX_IMPORT_SECRET/);
    expect(envExample).toContain("PICCOLO_QR_MENU_URL");
  });

  it("keeps TPV-native online ordering and courier routes", async () => {
    await expect(access(path.join(root, "artifacts/api-server/src/routes/online-orders-v2.ts")))
      .resolves.toBeUndefined();
    await expect(access(path.join(root, "artifacts/api-server/src/routes/delivery-orders.ts")))
      .resolves.toBeUndefined();
    await expect(access(path.join(root, "artifacts/piccolo-tpv/src/pages/qr-menu/QrMenuPage.tsx")))
      .resolves.toBeUndefined();
  });
});
