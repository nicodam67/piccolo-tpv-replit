/**
 * OCR Simulator — realistic extraction without a real OCR service.
 *
 * Generates structured extraction data from file metadata and filename hints.
 * Produces varied confidence levels so the review UI is exercised.
 */
import crypto from "crypto";
import type {
  OcrProvider, OcrExtractionResult, OcrFieldResult,
  OcrLineItem, OcrVatLine, OcrProcessingStatus, ValidationReport, ValidationIssue,
} from "./types";

// Simulated processing store (in-memory for dev)
const store = new Map<string, { status: "processing" | "done" | "error"; result?: OcrExtractionResult }>();

/** Deterministically choose a value from a list by hashing a seed */
function pickByHash<T>(seed: string, items: T[]): T {
  const h = parseInt(crypto.createHash("md5").update(seed).digest("hex").slice(0, 8), 16);
  return items[h % items.length];
}

/** Add small random noise to a confidence base, clamped 0–1 */
function conf(base: number, seed: string, spread = 0.15): number {
  const h = parseInt(crypto.createHash("md5").update(seed + "conf").digest("hex").slice(0, 4), 16);
  const noise = ((h / 0xffff) - 0.5) * spread;
  return Math.max(0, Math.min(1, base + noise));
}

function field(value: string | null, confidence: number): OcrFieldResult {
  return { value, confidence };
}

// Fictitious supplier catalogue for the simulator
const MOCK_SUPPLIERS = [
  { name: "Hortalizas García SL", legal: "Hortalizas García Sociedad Limitada", nif: "B12345678" },
  { name: "Distribuciones Mar Azul SA", legal: "Distribuciones Mar Azul Sociedad Anónima", nif: "A87654321" },
  { name: "Cárnicas Ibéricas SL", legal: "Cárnicas Ibéricas Sociedad Limitada", nif: "B23456789" },
  { name: "Vinos y Licores del Norte SA", legal: "Vinos y Licores del Norte SA", nif: "A34567890" },
];

const MOCK_PRODUCT_POOLS: Record<string, Array<{ desc: string; ref: string; unit: string; price: number; vat: number }>> = {
  "Hortalizas García SL": [
    { desc: "Tomate cherry kg", ref: "TOM-CHE-01", unit: "kg", price: 2.80, vat: 0.04 },
    { desc: "Lechuga romana ud", ref: "LEC-ROM-02", unit: "ud", price: 0.65, vat: 0.04 },
    { desc: "Cebolla kg", ref: "CEB-01", unit: "kg", price: 1.20, vat: 0.04 },
    { desc: "Pimiento rojo kg", ref: "PIM-ROJ-01", unit: "kg", price: 2.50, vat: 0.04 },
  ],
  "Distribuciones Mar Azul SA": [
    { desc: "Merluza filete kg", ref: "MER-FIL-01", unit: "kg", price: 12.40, vat: 0.10 },
    { desc: "Gambas enteras kg", ref: "GAM-ENT-01", unit: "kg", price: 18.90, vat: 0.10 },
    { desc: "Atún lomo kg", ref: "ATU-LOM-01", unit: "kg", price: 22.00, vat: 0.10 },
  ],
  "Cárnicas Ibéricas SL": [
    { desc: "Lomo ibérico kg", ref: "LOM-IBE-01", unit: "kg", price: 28.50, vat: 0.10 },
    { desc: "Chorizo extra kg", ref: "CHO-EXT-01", unit: "kg", price: 14.20, vat: 0.10 },
    { desc: "Panceta curada kg", ref: "PAN-CUR-01", unit: "kg", price: 9.80, vat: 0.10 },
  ],
  "Vinos y Licores del Norte SA": [
    { desc: "Vino Rioja Crianza caja 12 bot.", ref: "VIN-RIO-CR-12", unit: "caja", price: 72.00, vat: 0.21 },
    { desc: "Cerveza artesanal barril 20l", ref: "CER-ART-20", unit: "barril", price: 65.00, vat: 0.21 },
    { desc: "Agua mineral 24x50cl", ref: "AGU-MIN-24", unit: "caja", price: 8.40, vat: 0.21 },
  ],
};

function buildLines(supplier: typeof MOCK_SUPPLIERS[number], seed: string): OcrLineItem[] {
  const pool = MOCK_PRODUCT_POOLS[supplier.name] ?? MOCK_PRODUCT_POOLS["Hortalizas García SL"];
  const count = 2 + (parseInt(seed.slice(0, 2), 16) % 4); // 2-5 lines
  const lines: OcrLineItem[] = [];
  for (let i = 0; i < count; i++) {
    const p = pickByHash(seed + i, pool);
    const qty = 1 + (parseInt(seed.slice(i * 2, i * 2 + 2), 16) % 10);
    const disc = parseInt(seed.slice(i, i + 1), 16) % 3 === 0 ? 0.05 : 0;
    const net = p.price * qty * (1 - disc);
    lines.push({
      lineNumber: i + 1,
      supplierRef: p.ref,
      description: p.desc,
      quantity: qty,
      unit: p.unit,
      unitPrice: p.price,
      discount: disc,
      vatRate: p.vat,
      lineTotal: Math.round(net * 100) / 100,
      confidence: conf(0.82, seed + "line" + i, 0.2),
    });
  }
  return lines;
}

function buildVatBreakdown(lines: OcrLineItem[]): OcrVatLine[] {
  const groups = new Map<number, { base: number; amount: number }>();
  for (const l of lines) {
    const rate = l.vatRate ?? 0.10;
    const base = (l.lineTotal ?? 0);
    const g = groups.get(rate) ?? { base: 0, amount: 0 };
    g.base = Math.round((g.base + base) * 10000) / 10000;
    g.amount = Math.round((g.base * rate) * 10000) / 10000;
    groups.set(rate, g);
  }
  return [...groups.entries()].map(([rate, g]) => ({ rate, base: g.base, amount: g.amount }));
}

export class OcrSimulator implements OcrProvider {
  async uploadDocument(fileBuffer: Buffer, mimeType: string, filename: string): Promise<string> {
    // Generate a stable provider ID from the file content hash
    const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex").slice(0, 16);
    const provId = `sim-${hash}`;
    store.set(provId, { status: "processing" });
    return provId;
  }

  async extractInvoiceData(providerDocumentId: string): Promise<void> {
    // Simulate async processing with a tiny delay (resolved on next tick in tests)
    const seed = providerDocumentId.replace("sim-", "");

    const supplier = pickByHash(seed, MOCK_SUPPLIERS);
    const lines = buildLines(supplier, seed);
    const vatBreakdown = buildVatBreakdown(lines);
    const taxableBase = vatBreakdown.reduce((s, v) => s + v.base, 0);
    const vatAmount = vatBreakdown.reduce((s, v) => s + v.amount, 0);
    const total = Math.round((taxableBase + vatAmount) * 100) / 100;

    // Simulate a low-confidence field occasionally
    const lowConf = parseInt(seed.slice(0, 1), 16) % 4 === 0; // 25% chance

    // Build invoice number: deterministic but looks realistic
    const yearSeed = 2024 + (parseInt(seed.slice(0, 2), 16) % 2);
    const seqSeed = 1 + (parseInt(seed.slice(2, 6), 16) % 999);
    const invoiceNumber = `${supplier.nif.slice(1, 4)}-${yearSeed}-${String(seqSeed).padStart(4, "0")}`;

    // Random-ish dates
    const monthSeed = 1 + (parseInt(seed.slice(4, 6), 16) % 12);
    const daySeed = 1 + (parseInt(seed.slice(6, 8), 16) % 28);
    const invoiceDate = `${yearSeed}-${String(monthSeed).padStart(2, "0")}-${String(daySeed).padStart(2, "0")}`;
    const dueDateObj = new Date(invoiceDate);
    dueDateObj.setDate(dueDateObj.getDate() + 30);
    const dueDate = dueDateObj.toISOString().slice(0, 10);

    const paymentMethods = ["Transferencia bancaria", "Domiciliación bancaria", "Pagaré", "Efectivo"];
    const paymentMethod = pickByHash(seed + "pm", paymentMethods);

    const rawLines = lines.map((l) =>
      `${l.lineNumber}  ${l.supplierRef}  ${l.description}  ${l.quantity} ${l.unit}  ${l.unitPrice}€  -${((l.discount ?? 0) * 100).toFixed(0)}%  ${(l.vatRate ?? 0) * 100}%  ${l.lineTotal}€`
    ).join("\n");

    const rawText = [
      supplier.legal,
      `NIF: ${supplier.nif}`,
      `Factura nº: ${invoiceNumber}`,
      `Fecha: ${invoiceDate}`,
      `Vencimiento: ${dueDate}`,
      `Forma de pago: ${paymentMethod}`,
      ``,
      rawLines,
      ``,
      `Base imponible: ${taxableBase.toFixed(2)}€`,
      vatBreakdown.map((v) => `IVA ${(v.rate * 100).toFixed(0)}%: ${v.amount.toFixed(2)}€`).join("\n"),
      `Total: ${total.toFixed(2)}€`,
    ].join("\n");

    const result: OcrExtractionResult = {
      rawText,
      overallConfidence: conf(0.80, seed + "ov", 0.15),

      supplierName:        field(supplier.name,        conf(0.90, seed + "sn")),
      legalName:           field(supplier.legal,       conf(0.85, seed + "ln")),
      nif:                 field(supplier.nif,         conf(lowConf ? 0.45 : 0.92, seed + "nif")),
      invoiceNumber:       field(invoiceNumber,        conf(0.93, seed + "in")),
      invoiceDate:         field(invoiceDate,          conf(0.91, seed + "id")),
      dueDate:             field(dueDate,              conf(lowConf ? 0.50 : 0.88, seed + "dd")),
      taxableBase:         field(String(taxableBase.toFixed(4)), conf(0.88, seed + "tb")),
      vatBreakdown:        { value: vatBreakdown,      confidence: conf(0.84, seed + "vb") },
      total:               field(String(total.toFixed(4)),       conf(0.95, seed + "tot")),
      paymentMethod:       field(paymentMethod,        conf(0.75, seed + "pay")),
      relatedOrderNumber:  field(null,                 0),
      relatedDeliveryNote: field(null,                 0),

      lines,
    };

    store.set(providerDocumentId, { status: "done", result });
  }

  async getProcessingStatus(providerDocumentId: string): Promise<OcrProcessingStatus> {
    const entry = store.get(providerDocumentId);
    if (!entry) return { documentId: providerDocumentId, status: "error", error: "Document not found" };
    return { documentId: providerDocumentId, status: entry.status, progress: entry.status === "done" ? 100 : 50 };
  }

  async getResult(providerDocumentId: string): Promise<OcrExtractionResult> {
    const entry = store.get(providerDocumentId);
    if (!entry?.result) throw new Error("Result not ready");
    return entry.result;
  }

  validateExtraction(result: OcrExtractionResult): ValidationReport {
    const issues: ValidationIssue[] = [];

    if (!result.invoiceNumber.value) {
      issues.push({ field: "invoiceNumber", severity: "error", message: "Número de factura no detectado" });
    }
    if (!result.nif.value) {
      issues.push({ field: "nif", severity: "error", message: "NIF/CIF no detectado" });
    }
    if (!result.invoiceDate.value) {
      issues.push({ field: "invoiceDate", severity: "error", message: "Fecha de factura no detectada" });
    }

    // VAT math check: sum(bases) + sum(vat amounts) ≈ total
    if (result.total.value && result.vatBreakdown.value.length > 0) {
      const computedTotal = result.vatBreakdown.value.reduce(
        (s, v) => s + v.base + v.amount, 0
      );
      const extractedTotal = parseFloat(result.total.value ?? "0");
      if (Math.abs(computedTotal - extractedTotal) > 0.02) {
        issues.push({
          field: "total",
          severity: "error",
          message: `Total extraído (${extractedTotal.toFixed(2)}) no coincide con suma de bases + cuotas (${computedTotal.toFixed(2)})`,
        });
      }
    }

    // Low confidence warnings
    const fieldNames = ["nif", "invoiceDate", "dueDate", "total", "taxableBase"] as const;
    for (const f of fieldNames) {
      const c = result[f as keyof typeof result] as { value: unknown; confidence: number } | undefined;
      if (c && typeof c.confidence === "number" && c.confidence < 0.6 && c.value) {
        issues.push({
          field: f,
          severity: "warning",
          message: `Campo "${f}" con baja confianza (${(c.confidence * 100).toFixed(0)}%) — verificar manualmente`,
        });
      }
    }

    return { valid: !issues.some((i) => i.severity === "error"), issues };
  }
}
