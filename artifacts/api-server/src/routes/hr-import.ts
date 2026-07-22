/**
 * HR Import — Universal import wizard for any biometric device/format
 * Supports: CSV, TSV, XLSX, XLS, JSON, TXT (delimited)
 *
 * Routes:
 *   POST /hr/import/upload       — Upload + detect format, return preview
 *   POST /hr/import/preview      — Re-run preview with custom mapping
 *   POST /hr/import/confirm      — Confirm import, generate time_records
 *   POST /hr/import/:id/assign-row — Manually assign pending row to employee
 *   DELETE /hr/import/:id/revert — Revert a confirmed import
 *   GET  /hr/import/history      — List import history
 *   GET  /hr/import/history/:id/rows — Row details
 *   GET/POST /hr/import/templates — Mapping templates
 *   PATCH /hr/import/templates/:id — Update template
 *   DELETE /hr/import/templates/:id — Delete template
 */
import { Router } from "express";
import multer from "multer";
import crypto from "node:crypto";
import ExcelJS from "exceljs";
import { db } from "@workspace/db";
import {
  employeesTable,
  hrImportHistoryTable,
  hrImportRowsTable,
  hrImportTemplatesTable,
  hrEmployeeExternalIdsTable,
  timeRecordsTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import rateLimit from "express-rate-limit";

const router = Router();

// Rate limiter: 5 import operations per minute per IP.
// File parsing is CPU/memory-intensive; limiting prevents accidental or
// deliberate resource exhaustion from repeated large file uploads.
const importLimiter = rateLimit({
  windowMs: 60 * 1_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas importaciones. Espere un minuto e inténtelo de nuevo." },
});

// ─── Multer setup (memory, 10 MB) ─────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "text/csv", "text/plain", "text/tab-separated-values",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/json",
      "application/octet-stream",
    ];
    const ext = file.originalname.split(".").pop()?.toLowerCase();
    const allowedExt = ["csv", "txt", "tsv", "xlsx", "json"];
    if (allowed.includes(file.mimetype) || (ext && allowedExt.includes(ext))) {
      cb(null, true);
    } else {
      cb(new Error("Formato de archivo no soportado"));
    }
  },
});

// ─── Types ────────────────────────────────────────────────────────────────────
interface RawRow { [key: string]: string }

interface ColumnMapping {
  employeeIdentifier?: string;  // column name containing the employee ID
  clockIn?: string;             // column name for clock-in time
  clockOut?: string;            // column name for clock-out time (optional)
  date?: string;                // separate date column (if time is separate)
  identifierType?: "anviz_id" | "nfc_id" | "external_code" | "name";
  dateFormat?: string;          // e.g. "DD/MM/YYYY HH:mm"
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hashBuffer(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function hashRow(row: RawRow): string {
  return crypto.createHash("sha256").update(JSON.stringify(row)).digest("hex");
}

function detectFormat(filename: string, _mimetype: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "csv";
  if (ext === "xlsx") return "xlsx";
  if (ext === "json") return "json";
  if (ext === "tsv") return "tsv";
  return "csv";
}

async function parseFile(buf: Buffer, format: string, separator?: string): Promise<RawRow[]> {
  if (format === "json") {
    const parsed = JSON.parse(buf.toString("utf-8"));
    return Array.isArray(parsed) ? parsed : [parsed];
  }
  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const headers: string[] = [];
    ws.getRow(1).eachCell((cell, colNum) => { headers[colNum - 1] = String(cell.value ?? "").trim(); });
    const rows: RawRow[] = [];
    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const obj: RawRow = {};
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        const h = headers[colNum - 1];
        if (h) obj[h] = String(cell.value instanceof Date ? cell.value.toISOString() : (cell.value ?? ""));
      });
      rows.push(obj);
    });
    return rows;
  }
  // CSV / TSV / TXT
  const text = buf.toString("utf-8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];

  const sep = separator ?? detectSeparator(lines[0]!);
  const headers = lines[0]!.split(sep).map((h) => h.trim().replace(/^["']|["']$/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.split(sep).map((v) => v.trim().replace(/^["']|["']$/g, ""));
    const row: RawRow = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row;
  });
}

function detectSeparator(header: string): string {
  if (header.includes(";")) return ";";
  if (header.includes("\t")) return "\t";
  return ",";
}

function guessColumnMapping(headers: string[]): ColumnMapping {
  const lower = headers.map((h) => h.toLowerCase());

  const empCol = headers.find((_, i) =>
    ["id", "emp", "empleado", "employee", "userid", "user_id", "deviceuserid", "anvizid", "user"].some((k) =>
      lower[i]!.includes(k),
    ),
  );
  const clockInCol = headers.find((_, i) =>
    ["checkin", "clock_in", "entrada", "in_time", "checktime", "time_in", "start"].some((k) =>
      lower[i]!.includes(k),
    ),
  );
  const clockOutCol = headers.find((_, i) =>
    ["checkout", "clock_out", "salida", "out_time", "time_out", "end"].some((k) =>
      lower[i]!.includes(k),
    ),
  );
  const dateCol = headers.find((_, i) =>
    ["date", "fecha", "day"].some((k) => lower[i]! === k),
  );

  return {
    employeeIdentifier: empCol,
    clockIn: clockInCol,
    clockOut: clockOutCol,
    date: dateCol,
    identifierType: "anviz_id",
    dateFormat: "auto",
  };
}

function parseDateTime(value: string, _format: string = "auto"): Date | null {
  if (!value) return null;
  // Try ISO first
  let d = new Date(value);
  if (!isNaN(d.getTime())) return d;
  // DD/MM/YYYY HH:mm
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[\s,T](\d{2}):(\d{2})/);
  if (m) {
    d = new Date(+m[3]!, +m[2]! - 1, +m[1]!, +m[4]!, +m[5]!);
    if (!isNaN(d.getTime())) return d;
  }
  // YYYY-MM-DD HH:mm:ss
  const m2 = value.match(/^(\d{4})-(\d{2})-(\d{2})\s(\d{2}):(\d{2})/);
  if (m2) {
    d = new Date(+m2[1]!, +m2[2]! - 1, +m2[3]!, +m2[4]!, +m2[5]!);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

async function resolveEmployee(
  identifier: string,
  identifierType: string,
): Promise<{ employee: typeof employeesTable.$inferSelect | null; matchedBy: string | null }> {
  if (!identifier) return { employee: null, matchedBy: null };

  // Try anviz_id
  if (identifierType === "anviz_id") {
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.anvizId, identifier));
    if (emp) return { employee: emp, matchedBy: "anviz_id" };
  }
  // Try nfc_id
  if (identifierType === "nfc_id") {
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.nfcId, identifier));
    if (emp) return { employee: emp, matchedBy: "nfc_id" };
  }
  // Try external_code on employees
  {
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.externalCode, identifier));
    if (emp) return { employee: emp, matchedBy: "external_code" };
  }
  // Try hr_employee_external_ids
  {
    const [extRow] = await db
      .select()
      .from(hrEmployeeExternalIdsTable)
      .where(eq(hrEmployeeExternalIdsTable.externalId, identifier));
    if (extRow) {
      const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, extRow.employeeId));
      if (emp) return { employee: emp, matchedBy: "external_id_table" };
    }
  }
  return { employee: null, matchedBy: null };
}

// ─── UPLOAD + PREVIEW ─────────────────────────────────────────────────────────

router.post("/hr/import/upload", requireAuth, requireRole("admin", "manager", "encargado"), importLimiter, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) { res.status(400).json({ error: "No se recibió ningún archivo" }); return; }

    const buf = req.file.buffer;
    const fileHash = hashBuffer(buf);
    const format = detectFormat(req.file.originalname, req.file.mimetype);
    const rows = await parseFile(buf, format);

    if (rows.length === 0) { res.status(400).json({ error: "El archivo no contiene datos" }); return; }

    const headers = Object.keys(rows[0]!);
    const mapping = guessColumnMapping(headers);
    const preview = rows.slice(0, 5);

    // Check if file was already imported (confirmed)
    const existing = await db
      .select()
      .from(hrImportHistoryTable)
      .where(and(eq(hrImportHistoryTable.fileHash, fileHash), eq(hrImportHistoryTable.status, "confirmed")));

    // Save a pending history entry with all parsed rows stored server-side.
    // This is critical for binary formats (XLSX/XLS) where the client cannot
    // re-parse the file — confirm reads rows from the DB, not from the client.
    const [history] = await db
      .insert(hrImportHistoryTable)
      .values({
        filename: req.file.originalname,
        fileHash,
        fileFormat: format,
        status: "preview",
        rowsTotal: rows.length,
        importedBy: req.user!.id,
        columnMapping: mapping,
        parsedRows: rows as unknown as Record<string, unknown>[],
      })
      .returning();

    res.json({
      historyId: history!.id,
      filename: req.file.originalname,
      fileHash,
      format,
      rowsTotal: rows.length,
      headers,
      suggestedMapping: mapping,
      preview,
      alreadyImported: existing.length > 0 ? existing[0] : null,
      separator: headers.length > 0 ? detectSeparator(Object.keys(rows[0]!).join(",")) : ",",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al procesar el archivo" });
  }
});

// ─── CONFIRM IMPORT ───────────────────────────────────────────────────────────
// Client sends: historyId, mapping, pendingAssignments? (rows come from server-side storage)

router.post("/hr/import/confirm", requireAuth, requireRole("admin", "manager", "encargado"), importLimiter, async (req, res) => {
  try {
    const {
      historyId,
      mapping,
      pendingAssignments = {},
      templateId,
      saveAsTemplate,
      templateName,
      templateManufacturer,
    } = req.body as {
      historyId: string;
      mapping: ColumnMapping;
      pendingAssignments?: Record<string, string>; // externalIdentifier -> employeeId
      templateId?: string;
      saveAsTemplate?: boolean;
      templateName?: string;
      templateManufacturer?: string;
    };

    if (!historyId || !mapping) {
      res.status(400).json({ error: "Faltan historyId o mapping" });
      return;
    }

    const [history] = await db.select().from(hrImportHistoryTable).where(eq(hrImportHistoryTable.id, historyId));
    if (!history) { res.status(404).json({ error: "Importación no encontrada" }); return; }
    if (history.status === "confirmed") { res.status(400).json({ error: "Esta importación ya fue confirmada" }); return; }

    // Load rows from server-side storage (never trust client-provided rows).
    // parsedRows is stored during upload for all formats including binary XLSX/XLS.
    const rawRows = (history.parsedRows as RawRow[] | null) ?? [];
    if (rawRows.length === 0) {
      res.status(400).json({ error: "No hay filas almacenadas para esta importación. Vuelve a subir el archivo." });
      return;
    }

    // Check for existing confirmed import with same hash (prevent duplicates)
    const existing = await db
      .select()
      .from(hrImportHistoryTable)
      .where(and(eq(hrImportHistoryTable.fileHash, history.fileHash), eq(hrImportHistoryTable.status, "confirmed")));
    if (existing.length > 0) {
      res.status(409).json({ error: "Este archivo ya fue importado anteriormente", existing: existing[0] });
      return;
    }

    // Process rows
    let imported = 0, skipped = 0, errors = 0, pending = 0;
    const errorList: { row: number; message: string }[] = [];

    const insertedRows: Array<typeof hrImportRowsTable.$inferInsert> = [];
    const timeRecordInserts: Array<typeof timeRecordsTable.$inferInsert & { _rowIdx: number }> = [];

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i]!;
      const rowNum = i + 1;
      const rawData = row;

      // Extract fields using mapping
      const empIdentifier = mapping.employeeIdentifier ? row[mapping.employeeIdentifier] ?? "" : "";
      const clockInRaw = mapping.clockIn ? row[mapping.clockIn] ?? "" : "";
      const clockOutRaw = mapping.clockOut ? row[mapping.clockOut] ?? "" : "";
      const dateRaw = mapping.date ? row[mapping.date] ?? "" : "";

      // Build full datetime if date is separate
      const clockInStr = dateRaw && clockInRaw && !clockInRaw.includes("/") && !clockInRaw.includes("-")
        ? `${dateRaw} ${clockInRaw}`
        : clockInRaw;
      const clockOutStr = dateRaw && clockOutRaw && !clockOutRaw.includes("/") && !clockOutRaw.includes("-")
        ? `${dateRaw} ${clockOutRaw}`
        : clockOutRaw;

      const clockIn = parseDateTime(clockInStr, mapping.dateFormat ?? "auto");
      const clockOut = clockOutStr ? parseDateTime(clockOutStr, mapping.dateFormat ?? "auto") : null;

      if (!clockIn) {
        errorList.push({ row: rowNum, message: `Fila ${rowNum}: no se pudo parsear la hora de entrada '${clockInStr}'` });
        insertedRows.push({
          importId: historyId,
          rowNumber: rowNum,
          externalIdentifier: empIdentifier || null,
          rawData,
          status: "error",
          errorMessage: `No se pudo parsear la hora de entrada: '${clockInStr}'`,
        });
        errors++;
        continue;
      }

      // Resolve employee
      let employee: typeof employeesTable.$inferSelect | null = null;
      let matchedBy: string | null = null;

      // Check manual assignment first
      if (empIdentifier && pendingAssignments[empIdentifier]) {
        const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, pendingAssignments[empIdentifier]!));
        if (emp) { employee = emp; matchedBy = "manual"; }
      }

      if (!employee && empIdentifier) {
        const result = await resolveEmployee(empIdentifier, mapping.identifierType ?? "anviz_id");
        employee = result.employee;
        matchedBy = result.matchedBy;
      }

      if (!employee) {
        insertedRows.push({
          importId: historyId,
          rowNumber: rowNum,
          externalIdentifier: empIdentifier || null,
          rawData,
          status: "pending",
          errorMessage: `No se encontró empleado para identificador '${empIdentifier}'`,
        });
        pending++;
        continue;
      }

      // Check duplicate: same employee + same clockIn
      const existingRecord = await db
        .select()
        .from(timeRecordsTable)
        .where(and(eq(timeRecordsTable.employeeId, employee.id), eq(timeRecordsTable.clockIn, clockIn)));

      if (existingRecord.length > 0) {
        insertedRows.push({
          importId: historyId,
          rowNumber: rowNum,
          employeeId: employee.id,
          externalIdentifier: empIdentifier || null,
          rawData,
          matchedBy,
          status: "skipped",
          errorMessage: "Registro duplicado (mismo empleado y hora de entrada)",
        });
        skipped++;
        continue;
      }

      // Queue for insert
      const rowObj: typeof hrImportRowsTable.$inferInsert & { _rowIdx: number } = {
        importId: historyId,
        rowNumber: rowNum,
        employeeId: employee.id,
        externalIdentifier: empIdentifier || null,
        rawData,
        matchedBy: matchedBy ?? undefined,
        status: "imported",
        _rowIdx: insertedRows.length,
      };

      timeRecordInserts.push({
        employeeId: employee.id,
        clockIn,
        clockOut: clockOut ?? undefined,
        source: "import",
        isManual: false,
        importHistoryId: historyId,
        externalRecordId: empIdentifier || null,
        _rowIdx: rowObj._rowIdx,
      } as typeof timeRecordsTable.$inferInsert & { _rowIdx: number });

      insertedRows.push(rowObj);
      imported++;
    }

    // Bulk insert import rows
    let insertedRowRecords: Array<typeof hrImportRowsTable.$inferSelect> = [];
    if (insertedRows.length > 0) {
      insertedRowRecords = await db
        .insert(hrImportRowsTable)
        .values(insertedRows.map(({ ...r }) => { delete (r as Record<string, unknown>)["_rowIdx"]; return r; }))
        .returning();
    }

    // Insert time records and update row references
    for (const tr of timeRecordInserts) {
      const { _rowIdx, ...trData } = tr;
      const rowRecord = insertedRowRecords[_rowIdx];
      const [rec] = await db
        .insert(timeRecordsTable)
        .values(trData)
        .returning();
      if (rowRecord && rec) {
        await db
          .update(hrImportRowsTable)
          .set({ timeRecordId: rec.id })
          .where(eq(hrImportRowsTable.id, rowRecord.id));
      }
    }

    // Save as template if requested
    let savedTemplateId = templateId ?? null;
    if (saveAsTemplate && templateName) {
      const [tmpl] = await db
        .insert(hrImportTemplatesTable)
        .values({
          name: templateName,
          manufacturer: templateManufacturer ?? "",
          fileFormat: history.fileFormat,
          config: mapping as unknown as Record<string, unknown>,
          createdBy: req.user!.id,
        })
        .returning();
      savedTemplateId = tmpl!.id;
    }

    // Update history record (rowsTotal already set during upload)
    const [updatedHistory] = await db
      .update(hrImportHistoryTable)
      .set({
        status: "confirmed",
        rowsTotal: history.rowsTotal ?? rawRows.length,
        rowsImported: imported,
        rowsSkipped: skipped,
        rowsErrors: errors,
        rowsPending: pending,
        columnMapping: mapping,
        templateId: savedTemplateId,
        errors: errorList.length > 0 ? errorList : null,
        confirmedAt: new Date(),
      })
      .where(eq(hrImportHistoryTable.id, historyId))
      .returning();

    res.json({
      ok: true,
      history: updatedHistory,
      imported,
      skipped,
      errors,
      pending,
      savedTemplateId,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al confirmar importación" });
  }
});

// ─── ASSIGN PENDING ROW ───────────────────────────────────────────────────────

router.post("/hr/import/:id/assign-row", requireAuth, requireRole("admin", "manager", "encargado"), async (req, res) => {
  const importId = req.params.id as string;
  try {
    const { rowId, employeeId, saveExternalId = false } = req.body as {
      rowId: string;
      employeeId: string;
      saveExternalId?: boolean;
    };

    const [importRow] = await db.select().from(hrImportRowsTable).where(eq(hrImportRowsTable.id, rowId));
    if (!importRow) { res.status(404).json({ error: "Fila no encontrada" }); return; }
    if (importRow.status !== "pending") { res.status(400).json({ error: "La fila ya fue procesada" }); return; }

    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
    if (!emp) { res.status(404).json({ error: "Empleado no encontrado" }); return; }

    // Get history to get mapping info
    const [history] = await db.select().from(hrImportHistoryTable).where(eq(hrImportHistoryTable.id, importId));
    const mapping = (history?.columnMapping as ColumnMapping | null) ?? {};

    const rawData = importRow.rawData as RawRow;
    const clockInRaw = mapping.clockIn ? rawData[mapping.clockIn] ?? "" : "";
    const dateRaw = mapping.date ? rawData[mapping.date] ?? "" : "";
    const clockOutRaw = mapping.clockOut ? rawData[mapping.clockOut] ?? "" : "";

    const clockInStr = dateRaw && clockInRaw && !clockInRaw.includes("/") && !clockInRaw.includes("-")
      ? `${dateRaw} ${clockInRaw}` : clockInRaw;
    const clockOutStr = dateRaw && clockOutRaw && !clockOutRaw.includes("/") && !clockOutRaw.includes("-")
      ? `${dateRaw} ${clockOutRaw}` : clockOutRaw;

    const clockIn = parseDateTime(clockInStr);
    const clockOut = clockOutStr ? parseDateTime(clockOutStr) : null;

    if (!clockIn) {
      res.status(400).json({ error: "No se puede parsear la hora de entrada" });
      return;
    }

    const [rec] = await db
      .insert(timeRecordsTable)
      .values({
        employeeId,
        clockIn,
        clockOut: clockOut ?? undefined,
        source: "import",
        isManual: false,
        importHistoryId: importId,
        externalRecordId: importRow.externalIdentifier ?? undefined,
      })
      .returning();

    await db
      .update(hrImportRowsTable)
      .set({ employeeId, matchedBy: "manual", status: "imported", timeRecordId: rec!.id })
      .where(eq(hrImportRowsTable.id, rowId));

    // Update history pending count
    const [hist] = await db.select().from(hrImportHistoryTable).where(eq(hrImportHistoryTable.id, importId));
    if (hist) {
      await db
        .update(hrImportHistoryTable)
        .set({
          rowsImported: (hist.rowsImported ?? 0) + 1,
          rowsPending: Math.max(0, (hist.rowsPending ?? 0) - 1),
        })
        .where(eq(hrImportHistoryTable.id, importId));
    }

    // Optionally save external ID mapping
    if (saveExternalId && importRow.externalIdentifier) {
      await db
        .insert(hrEmployeeExternalIdsTable)
        .values({
          employeeId,
          source: "import",
          externalId: importRow.externalIdentifier,
          notes: `Auto-guardado desde importación ${history?.filename ?? ""}`,
        })
        .onConflictDoNothing();
    }

    res.json({ ok: true, timeRecord: rec });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al asignar fila" });
  }
});

// ─── REVERT IMPORT ────────────────────────────────────────────────────────────

router.delete("/hr/import/:id/revert", requireAuth, requireRole("admin", "manager"), async (req, res) => {
  const id = req.params.id as string;
  try {
    const { reason } = req.body as { reason?: string };
    const [history] = await db.select().from(hrImportHistoryTable).where(eq(hrImportHistoryTable.id, id));
    if (!history) { res.status(404).json({ error: "Importación no encontrada" }); return; }
    if (history.status !== "confirmed") { res.status(400).json({ error: "Solo se pueden revertir importaciones confirmadas" }); return; }

    // Get all imported rows with time records
    const rows = await db
      .select()
      .from(hrImportRowsTable)
      .where(and(eq(hrImportRowsTable.importId, id), eq(hrImportRowsTable.status, "imported")));

    const timeRecordIds = rows.map((r) => r.timeRecordId).filter(Boolean) as string[];

    if (timeRecordIds.length > 0) {
      await db.delete(timeRecordsTable).where(inArray(timeRecordsTable.id, timeRecordIds));
    }

    // Mark rows as reverted
    await db
      .update(hrImportRowsTable)
      .set({ status: "reverted" })
      .where(eq(hrImportRowsTable.importId, id));

    // Mark history as reverted
    const [updated] = await db
      .update(hrImportHistoryTable)
      .set({
        status: "reverted",
        revertedAt: new Date(),
        revertReason: reason ?? null,
        revertedBy: req.user!.id,
      })
      .where(eq(hrImportHistoryTable.id, id))
      .returning();

    res.json({ ok: true, history: updated, recordsDeleted: timeRecordIds.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al revertir importación" });
  }
});

// ─── HISTORY ──────────────────────────────────────────────────────────────────

router.get("/hr/import/history", requireAuth, requireRole("admin", "manager", "encargado"), async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(hrImportHistoryTable)
      .where(eq(hrImportHistoryTable.status, "confirmed"))
      .orderBy(hrImportHistoryTable.createdAt);

    // Also include reverted for full audit trail
    const all = await db.select().from(hrImportHistoryTable).orderBy(hrImportHistoryTable.createdAt);
    res.json(all);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener historial" });
  }
});

router.get("/hr/import/history/:id/rows", requireAuth, requireRole("admin", "manager", "encargado"), async (req, res) => {
  const id = req.params.id as string;
  try {
    const rows = await db
      .select()
      .from(hrImportRowsTable)
      .leftJoin(employeesTable, eq(hrImportRowsTable.employeeId, employeesTable.id))
      .where(eq(hrImportRowsTable.importId, id))
      .orderBy(hrImportRowsTable.rowNumber);

    res.json(
      rows.map((r) => ({
        ...r.hr_import_rows,
        employee: r.employees ? { id: r.employees.id, name: r.employees.name, lastName: r.employees.lastName } : null,
      })),
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener filas" });
  }
});

// ─── TEMPLATES ────────────────────────────────────────────────────────────────

router.get("/hr/import/templates", requireAuth, requireRole("admin", "manager", "encargado"), async (req, res) => {
  try {
    const rows = await db.select().from(hrImportTemplatesTable).where(eq(hrImportTemplatesTable.active, true));
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener plantillas" });
  }
});

router.post("/hr/import/templates", requireAuth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const { name, manufacturer = "", fileFormat = "csv", config = {} } = req.body as {
      name: string;
      manufacturer?: string;
      fileFormat?: string;
      config?: Record<string, unknown>;
    };
    if (!name?.trim()) { res.status(400).json({ error: "Nombre requerido" }); return; }
    const [row] = await db
      .insert(hrImportTemplatesTable)
      .values({ name: name.trim(), manufacturer, fileFormat, config, createdBy: req.user!.id })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al crear plantilla" });
  }
});

router.patch("/hr/import/templates/:id", requireAuth, requireRole("admin", "manager"), async (req, res) => {
  const id = req.params.id as string;
  try {
    const { name, manufacturer, fileFormat, config } = req.body as {
      name?: string;
      manufacturer?: string;
      fileFormat?: string;
      config?: Record<string, unknown>;
    };
    const updates: Partial<typeof hrImportTemplatesTable.$inferInsert> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name.trim();
    if (manufacturer !== undefined) updates.manufacturer = manufacturer;
    if (fileFormat !== undefined) updates.fileFormat = fileFormat;
    if (config !== undefined) updates.config = config;
    const [updated] = await db
      .update(hrImportTemplatesTable)
      .set(updates)
      .where(eq(hrImportTemplatesTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Plantilla no encontrada" }); return; }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al actualizar plantilla" });
  }
});

router.delete("/hr/import/templates/:id", requireAuth, requireRole("admin", "manager"), async (req, res) => {
  const id = req.params.id as string;
  try {
    await db.update(hrImportTemplatesTable).set({ active: false }).where(eq(hrImportTemplatesTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al eliminar plantilla" });
  }
});

export default router;
