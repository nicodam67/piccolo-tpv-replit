import { describe, expect, it } from "vitest";
import {
  generateCrmQrToken,
  normalizeCrmEmail,
  normalizeCrmPhone,
  splitCrmDisplayName,
} from "./crm-client-service";

describe("CRM canonical customer identity", () => {
  it("normalizes common Spanish phone formats to one identity", () => {
    expect(normalizeCrmPhone("612 345 678")).toBe("612345678");
    expect(normalizeCrmPhone("+34 612 345 678")).toBe("612345678");
    expect(normalizeCrmPhone("0034-612-345-678")).toBe("612345678");
  });

  it("normalizes email casing and whitespace", () => {
    expect(normalizeCrmEmail("  ANA@Example.COM ")).toBe("ana@example.com");
  });

  it("splits a reservation display name for a new CRM record", () => {
    expect(splitCrmDisplayName("Ana García López")).toEqual({
      nombre: "Ana",
      apellidos: "García López",
    });
  });

  it("uses the existing CRM QR token format", () => {
    expect(generateCrmQrToken()).toMatch(/^CL-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });
});
