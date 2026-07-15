/**
 * Provider-agnostic OCR interface for invoice scanning.
 * Swap the implementation in index.ts to connect a real service
 * (Azure Document Intelligence, Google Document AI, AWS Textract…)
 * without changing any route or business-logic code.
 */

export interface OcrFieldResult {
  value: string | null;
  confidence: number; // 0–1
}

export interface OcrVatLine {
  rate: number;        // fraction e.g. 0.10
  base: number;
  amount: number;
}

export interface OcrLineItem {
  lineNumber: number;
  supplierRef: string | null;
  description: string | null;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  discount: number | null;   // fraction e.g. 0.05
  vatRate: number | null;    // fraction e.g. 0.10
  lineTotal: number | null;
  confidence: number;        // 0–1 aggregate confidence for this line
}

export interface OcrExtractionResult {
  /** Raw OCR dump for debugging */
  rawText: string;

  /** Overall extraction quality score 0–1 */
  overallConfidence: number;

  // Header fields
  supplierName:        OcrFieldResult;
  legalName:           OcrFieldResult;
  nif:                 OcrFieldResult;
  invoiceNumber:       OcrFieldResult;
  invoiceDate:         OcrFieldResult; // ISO date string
  dueDate:             OcrFieldResult;
  taxableBase:         OcrFieldResult; // string-encoded number
  vatBreakdown:        { value: OcrVatLine[]; confidence: number };
  total:               OcrFieldResult;
  paymentMethod:       OcrFieldResult;
  relatedOrderNumber:  OcrFieldResult;
  relatedDeliveryNote: OcrFieldResult;

  // Line items
  lines: OcrLineItem[];
}

export interface OcrProcessingStatus {
  documentId: string;
  status: "processing" | "done" | "error";
  progress?: number; // 0–100 %
  error?: string;
}

/** The interface every OCR provider must implement */
export interface OcrProvider {
  /** Upload raw file bytes. Returns provider's document ID. */
  uploadDocument(
    fileBuffer: Buffer,
    mimeType: string,
    filename: string,
  ): Promise<string>;

  /** Trigger extraction. Returns immediately; poll getProcessingStatus. */
  extractInvoiceData(providerDocumentId: string): Promise<void>;

  /** Poll status until done. */
  getProcessingStatus(providerDocumentId: string): Promise<OcrProcessingStatus>;

  /** Fetch the result once done. */
  getResult(providerDocumentId: string): Promise<OcrExtractionResult>;

  /** Validate the extraction against basic rules (VAT math, required fields). */
  validateExtraction(result: OcrExtractionResult): ValidationReport;

  /** Save user corrections back to the provider (optional, for model improvement). */
  saveCorrections?(corrections: Record<string, string | null>): Promise<void>;
}

export interface ValidationIssue {
  field: string;
  severity: "error" | "warning";
  message: string;
}

export interface ValidationReport {
  valid: boolean;
  issues: ValidationIssue[];
}
