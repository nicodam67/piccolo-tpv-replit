import { describe, expect, it } from "vitest";
import SwaggerParser from "@apidevtools/swagger-parser";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../../..");
const specPath = path.join(root, "lib/api-spec/contracts/qr-menu-api.v1.yaml");

describe("QR Menu OpenAPI v1", () => {
  it("is a valid OpenAPI document", async () => {
    const document = await SwaggerParser.validate(specPath);
    expect(document.openapi).toBe("3.1.0");
    expect(document.paths["/status"]?.get).toBeTruthy();
    expect(document.paths["/catalog"]?.get).toBeTruthy();
  });

  it("marks incremental changes as planned, not operational", async () => {
    const document = await SwaggerParser.parse(specPath) as any;
    expect(document.paths["/catalog/changes"].get["x-implementation-status"])
      .toBe("planned-not-implemented");
    const routeSource = await readFile(
      path.join(root, "artifacts/api-server/src/routes/qr-menu-v1.ts"),
      "utf8",
    );
    expect(routeSource).not.toContain('"/v1/qr-menu/catalog/changes"');
  });

  it("contains no real token or staff security scheme", async () => {
    const source = await readFile(specPath, "utf8");
    expect(source).toContain("qrMenuApiToken");
    expect(source).not.toContain("PICCOLO_QR_MENU_API_TOKEN=");
    expect(source).not.toContain("bearerAuth");
  });
});
