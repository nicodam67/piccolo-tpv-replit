import type { QrDaySchedule } from "@workspace/db";

export const SUPPORTED_CURRENCIES = ["EUR", "USD", "GBP", "MXN"] as const;
export const SUPPORTED_LANGUAGES = ["es", "en", "pt", "fr", "ca", "eu", "gl"] as const;
export const SUPPORTED_FISCAL_REGIMES = [
  "general",
  "simplificado",
  "recargo_equivalencia",
  "regimen_especial",
] as const;

export type OpeningHours = Record<
  string,
  { open: string; close: string; open2?: string; close2?: string }
>;

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const QR_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

const DAY_TO_QR: Record<(typeof DAY_KEYS)[number], (typeof QR_DAYS)[number]> = {
  mon: "monday",
  tue: "tuesday",
  wed: "wednesday",
  thu: "thursday",
  fri: "friday",
  sat: "saturday",
  sun: "sunday",
};

const QR_TO_DAY = Object.fromEntries(
  Object.entries(DAY_TO_QR).map(([shortDay, longDay]) => [longDay, shortDay]),
) as Record<(typeof QR_DAYS)[number], (typeof DAY_KEYS)[number]>;

const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const NIF_RE = /^(?:[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]|\d{8}[A-Z]|[XYZ]\d{7}[A-Z])$/;

export interface ValidationIssue {
  field: string;
  message: string;
}

function minutes(value: string): number {
  const [hours, mins] = value.split(":").map(Number);
  return hours * 60 + mins;
}

function validateTimeRange(
  open: string,
  close: string,
  field: string,
): { issue?: ValidationIssue; start: number; end: number } {
  if (!TIME_RE.test(open) || !TIME_RE.test(close)) {
    return {
      issue: { field, message: "El horario debe usar el formato HH:mm." },
      start: 0,
      end: 0,
    };
  }

  const start = minutes(open);
  let end = minutes(close);
  if (end <= start) {
    // Restaurant shifts may legitimately close after midnight, but a daytime
    // end before the start is almost certainly an input error.
    if (start < 12 * 60 || end > 4 * 60) {
      return {
        issue: { field, message: "La hora de cierre debe ser posterior a la apertura." },
        start,
        end,
      };
    }
    end += 24 * 60;
  }
  return { start, end };
}

export function validateOpeningHours(value: unknown): ValidationIssue[] {
  if (value === null || value === undefined) return [];
  if (typeof value !== "object" || Array.isArray(value)) {
    return [{ field: "openingHours", message: "Los horarios deben ser un objeto por día." }];
  }

  const issues: ValidationIssue[] = [];
  for (const [day, rawSlot] of Object.entries(value)) {
    if (!DAY_KEYS.includes(day as (typeof DAY_KEYS)[number])) {
      issues.push({ field: `openingHours.${day}`, message: "Día no soportado." });
      continue;
    }
    if (!rawSlot || typeof rawSlot !== "object" || Array.isArray(rawSlot)) {
      issues.push({ field: `openingHours.${day}`, message: "Turno no válido." });
      continue;
    }

    const slot = rawSlot as Record<string, unknown>;
    const first = validateTimeRange(
      String(slot.open ?? ""),
      String(slot.close ?? ""),
      `openingHours.${day}`,
    );
    if (first.issue) issues.push(first.issue);

    const hasSecondStart = typeof slot.open2 === "string" && slot.open2.length > 0;
    const hasSecondEnd = typeof slot.close2 === "string" && slot.close2.length > 0;
    if (hasSecondStart !== hasSecondEnd) {
      issues.push({
        field: `openingHours.${day}`,
        message: "El segundo turno necesita apertura y cierre.",
      });
      continue;
    }
    if (hasSecondStart && hasSecondEnd) {
      const second = validateTimeRange(
        slot.open2 as string,
        slot.close2 as string,
        `openingHours.${day}.turno2`,
      );
      if (second.issue) issues.push(second.issue);
      if (!first.issue && !second.issue) {
        let secondStart = second.start;
        let secondEnd = second.end;
        if (secondStart < first.start) {
          secondStart += 24 * 60;
          secondEnd += 24 * 60;
        }
        if (secondStart < first.end) {
          issues.push({
            field: `openingHours.${day}.turno2`,
            message: "Los turnos no pueden solaparse.",
          });
        }
      }
    }
  }
  return issues;
}

export function validateQrSchedule(value: unknown): ValidationIssue[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) {
    return [{ field: "schedule", message: "El horario QR debe ser una lista de días." }];
  }

  const seen = new Set<string>();
  const issues: ValidationIssue[] = [];
  for (const [index, rawDay] of value.entries()) {
    if (!rawDay || typeof rawDay !== "object") {
      issues.push({ field: `schedule.${index}`, message: "Día no válido." });
      continue;
    }
    const day = rawDay as Record<string, unknown>;
    if (!QR_DAYS.includes(day.day as (typeof QR_DAYS)[number])) {
      issues.push({ field: `schedule.${index}.day`, message: "Día no soportado." });
      continue;
    }
    if (seen.has(day.day as string)) {
      issues.push({ field: `schedule.${index}.day`, message: "El día está duplicado." });
      continue;
    }
    seen.add(day.day as string);

    const shifts = [day.shift1, day.shift2] as unknown[];
    const ranges: Array<{ start: number; end: number }> = [];
    for (const [shiftIndex, rawShift] of shifts.entries()) {
      if (!rawShift || typeof rawShift !== "object") {
        issues.push({
          field: `schedule.${index}.shift${shiftIndex + 1}`,
          message: "Turno no válido.",
        });
        continue;
      }
      const shift = rawShift as Record<string, unknown>;
      if (typeof shift.open !== "boolean") {
        issues.push({
          field: `schedule.${index}.shift${shiftIndex + 1}.open`,
          message: "El estado del turno debe ser booleano.",
        });
        continue;
      }
      if (!shift.open) continue;
      const range = validateTimeRange(
        String(shift.openTime ?? ""),
        String(shift.closeTime ?? ""),
        `schedule.${index}.shift${shiftIndex + 1}`,
      );
      if (range.issue) issues.push(range.issue);
      else ranges.push(range);
    }
    if (ranges.length === 2) {
      let secondStart = ranges[1].start;
      let secondEnd = ranges[1].end;
      if (secondStart < ranges[0].start) {
        secondStart += 24 * 60;
        secondEnd += 24 * 60;
      }
      if (secondStart < ranges[0].end) {
        issues.push({
          field: `schedule.${index}.shift2`,
          message: "Los turnos no pueden solaparse.",
        });
      }
    }
  }
  return issues;
}

export function qrScheduleToOpeningHours(schedule: QrDaySchedule[]): OpeningHours {
  const result: OpeningHours = {};
  for (const day of schedule) {
    const key = QR_TO_DAY[day.day as (typeof QR_DAYS)[number]];
    if (!key) continue;
    const openShifts = [day.shift1, day.shift2].filter((shift) => shift.open);
    if (openShifts.length === 0) continue;
    result[key] = {
      open: openShifts[0].openTime,
      close: openShifts[0].closeTime,
      ...(openShifts[1]
        ? { open2: openShifts[1].openTime, close2: openShifts[1].closeTime }
        : {}),
    };
  }
  return result;
}

export function openingHoursToQrSchedule(hours: OpeningHours | null | undefined): QrDaySchedule[] | null {
  if (!hours) return null;
  return DAY_KEYS.map((key) => {
    const slot = hours[key];
    return {
      day: DAY_TO_QR[key],
      shift1: {
        open: Boolean(slot),
        openTime: slot?.open ?? "13:00",
        closeTime: slot?.close ?? "16:00",
      },
      shift2: {
        open: Boolean(slot?.open2 && slot?.close2),
        openTime: slot?.open2 ?? "20:00",
        closeTime: slot?.close2 ?? "23:00",
      },
    };
  });
}

export function validateBusinessConfigInput(input: unknown): {
  data?: Record<string, unknown>;
  issues: ValidationIssue[];
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { issues: [{ field: "body", message: "Configuración no válida." }] };
  }

  const allowedStringFields = [
    "nombreComercial", "razonSocial", "nif", "direccionFiscal", "codigoPostal",
    "poblacion", "provincia", "pais", "telefono", "email", "web", "logoUrl", "tagline",
  ] as const;
  const source = input as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  const issues: ValidationIssue[] = [];

  for (const field of allowedStringFields) {
    if (source[field] === undefined) continue;
    if (typeof source[field] !== "string") {
      issues.push({ field, message: "Debe ser texto." });
      continue;
    }
    data[field] = source[field].trim();
  }

  if ("nombreComercial" in source && !data.nombreComercial) {
    issues.push({ field: "nombreComercial", message: "El nombre comercial es obligatorio." });
  }

  const fiscalFields = ["razonSocial", "nif", "direccionFiscal"] as const;
  if (fiscalFields.some((field) => field in source)) {
    for (const field of fiscalFields) {
      const value = field in source ? data[field] : source[field];
      if (field in source && !value) {
        issues.push({ field, message: "El dato fiscal es obligatorio." });
      }
    }
  }

  if (typeof data.nif === "string") {
    const normalizedNif = data.nif.toUpperCase().replace(/[\s-]/g, "");
    data.nif = normalizedNif;
    if (normalizedNif && !NIF_RE.test(normalizedNif)) {
      issues.push({ field: "nif", message: "El NIF/CIF no tiene un formato válido." });
    }
  }
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email as string)) {
    issues.push({ field: "email", message: "El email no tiene un formato válido." });
  }
  for (const field of ["web", "logoUrl"] as const) {
    if (!data[field]) continue;
    try {
      new URL(data[field] as string);
    } catch {
      issues.push({ field, message: "Debe ser una URL absoluta válida." });
    }
  }

  if (source.moneda !== undefined) {
    if (!SUPPORTED_CURRENCIES.includes(source.moneda as (typeof SUPPORTED_CURRENCIES)[number])) {
      issues.push({ field: "moneda", message: "Moneda no soportada." });
    } else data.moneda = source.moneda;
  }
  if (source.idioma !== undefined) {
    if (!SUPPORTED_LANGUAGES.includes(source.idioma as (typeof SUPPORTED_LANGUAGES)[number])) {
      issues.push({ field: "idioma", message: "Idioma no soportado." });
    } else data.idioma = source.idioma;
  }
  if (source.regimenFiscal !== undefined) {
    if (!SUPPORTED_FISCAL_REGIMES.includes(
      source.regimenFiscal as (typeof SUPPORTED_FISCAL_REGIMES)[number],
    )) {
      issues.push({ field: "regimenFiscal", message: "Régimen fiscal no soportado." });
    } else data.regimenFiscal = source.regimenFiscal;
  }

  return { data: issues.length === 0 ? data : undefined, issues };
}

export function localeForLanguage(language: string): string {
  const regions: Record<string, string> = {
    es: "es-ES",
    en: "en-GB",
    pt: "pt-PT",
    fr: "fr-FR",
    ca: "ca-ES",
    eu: "eu-ES",
    gl: "gl-ES",
  };
  return regions[language] ?? "es-ES";
}

export function languageFromLocale(locale: string): string | null {
  const language = locale.trim().toLowerCase().split("-")[0];
  return SUPPORTED_LANGUAGES.includes(language as (typeof SUPPORTED_LANGUAGES)[number])
    ? language
    : null;
}

export function sanitizePrintTemplate(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!value) return value ?? null;
  const {
    nombreComercial: _name,
    datosFiscales: _fiscal,
    logoUrl: _logo,
    ...presentation
  } = value;
  return presentation;
}
