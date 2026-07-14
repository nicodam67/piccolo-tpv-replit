import { db } from "@workspace/db";
import { documentAuditLogTable } from "@workspace/db";

interface LogDocumentActionParams {
  action: string;
  documentType?: string;
  documentId?: string;
  employeeId?: string | null;
  employeeName?: string;
  terminal?: string;
  printCount?: number;
  amount?: string | null;
  details?: string;
}

/**
 * Insert an immutable row into document_audit_log.
 * Swallows errors so a logging failure never blocks the primary operation.
 */
export async function logDocumentAction(params: LogDocumentActionParams): Promise<void> {
  try {
    await db.insert(documentAuditLogTable).values({
      action: params.action,
      documentType: params.documentType ?? "",
      documentId: params.documentId ?? "",
      employeeId: params.employeeId ?? null,
      employeeName: params.employeeName ?? "",
      terminal: params.terminal ?? "",
      printCount: params.printCount ?? 1,
      amount: params.amount ?? null,
      details: params.details ?? "",
    });
  } catch (err) {
    console.error("[document-audit] Failed to write audit log:", err);
  }
}
