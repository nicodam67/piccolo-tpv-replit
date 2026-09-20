import { describe, expect, it } from "vitest";
import { getExternalQrMenuUrl } from "./external-qr-url";

describe("external QR menu URL", () => {
  it("accepts an HTTPS URL", () => {
    expect(getExternalQrMenuUrl("https://menu.example.com/carta"))
      .toBe("https://menu.example.com/carta");
  });

  it.each([
    undefined,
    "",
    "http://menu.example.com",
    "/qr-menu/",
    "javascript:alert(1)",
    "https://user:secret@menu.example.com",
  ])("rejects missing or unsafe URL: %s", (value) => {
    expect(getExternalQrMenuUrl(value)).toBeNull();
  });
});
