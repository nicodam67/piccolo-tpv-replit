import { describe, expect, it } from "vitest";
import {
  languageFromLocale,
  localeForLanguage,
  openingHoursToQrSchedule,
  qrScheduleToOpeningHours,
  sanitizePrintTemplate,
  validateBusinessConfigInput,
  validateOpeningHours,
  validateQrSchedule,
} from "./configuration";

describe("unified configuration validation", () => {
  it("accepts and normalizes a complete supported business configuration", () => {
    const result = validateBusinessConfigInput({
      nombreComercial: "  Piccolo  ",
      razonSocial: "Piccolo Restauración SL",
      nif: "b-12345678",
      direccionFiscal: "C/ Major 1",
      moneda: "EUR",
      idioma: "es",
      regimenFiscal: "general",
    });

    expect(result.issues).toEqual([]);
    expect(result.data).toMatchObject({
      nombreComercial: "Piccolo",
      nif: "B12345678",
      moneda: "EUR",
      idioma: "es",
    });
  });

  it.each([
    [{ nif: "123" }, "nif"],
    [{ moneda: "BTC" }, "moneda"],
    [{ idioma: "xx" }, "idioma"],
    [{ regimenFiscal: "inventado" }, "regimenFiscal"],
    [{ razonSocial: "", nif: "", direccionFiscal: "" }, "razonSocial"],
  ])("rejects unsupported or incomplete values", (input, field) => {
    const result = validateBusinessConfigInput(input);
    expect(result.data).toBeUndefined();
    expect(result.issues.some((issue) => issue.field === field)).toBe(true);
  });

  it("accepts coherent split and overnight restaurant hours", () => {
    expect(validateOpeningHours({
      fri: { open: "13:00", close: "16:00", open2: "20:00", close2: "00:00" },
    })).toEqual([]);
  });

  it.each([
    [{ mon: { open: "10:00", close: "09:00" } }, "posterior"],
    [{ mon: { open: "12:00", close: "17:00", open2: "16:00", close2: "22:00" } }, "solaparse"],
    [{ mon: { open: "12:00", close: "16:00", open2: "20:00" } }, "apertura y cierre"],
  ])("rejects incoherent hours", (schedule, message) => {
    expect(validateOpeningHours(schedule).some((issue) => issue.message.includes(message))).toBe(true);
  });

  it("uses openingHours as the canonical representation for QR", () => {
    const qrSchedule = [
      {
        day: "monday",
        shift1: { open: true, openTime: "12:00", closeTime: "16:00" },
        shift2: { open: true, openTime: "20:00", closeTime: "23:30" },
      },
      {
        day: "tuesday",
        shift1: { open: false, openTime: "12:00", closeTime: "16:00" },
        shift2: { open: false, openTime: "20:00", closeTime: "23:30" },
      },
    ];

    expect(validateQrSchedule(qrSchedule)).toEqual([]);
    const canonical = qrScheduleToOpeningHours(qrSchedule);
    expect(canonical).toEqual({
      mon: { open: "12:00", close: "16:00", open2: "20:00", close2: "23:30" },
    });
    expect(openingHoursToQrSchedule(canonical)?.find((day) => day.day === "monday"))
      .toMatchObject(qrSchedule[0]);
  });

  it("removes business identity duplicates from print presentation settings", () => {
    expect(sanitizePrintTemplate({
      nombreComercial: "Duplicado",
      datosFiscales: "Duplicado",
      logoUrl: "https://duplicate.invalid/logo.png",
      piePagina: "Gracias",
      mostrarPrecios: false,
    })).toEqual({ piePagina: "Gracias", mostrarPrecios: false });
  });

  it("maps the timeclock locale to the canonical business language", () => {
    expect(languageFromLocale("ca-ES")).toBe("ca");
    expect(localeForLanguage("ca")).toBe("ca-ES");
    expect(languageFromLocale("xx-ZZ")).toBeNull();
  });
});
