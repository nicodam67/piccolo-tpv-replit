import { db } from "@workspace/db";
import { invoiceSeriesTable } from "@workspace/db";
import { sql } from "drizzle-orm";

/**
 * Atomically allocate the next correlative number for a given serie+documentType.
 *
 * Uses INSERT … ON CONFLICT (serie, document_type) DO UPDATE to ensure a single
 * atomic read-modify-write even on first use. No separate SELECT path means
 * concurrent callers can never both see "row missing" and both insert, which
 * was the race condition the previous SELECT+INSERT approach left open.
 *
 * The (serie, documentType) UNIQUE constraint in the schema backs the ON CONFLICT.
 */
export async function getNextNumber(serie: string, documentType: string): Promise<number> {
  const rows = await db.execute<{ current_number: number }>(sql`
    INSERT INTO invoice_series (id, serie, document_type, current_number, prefix, updated_at)
    VALUES (gen_random_uuid(), ${serie}, ${documentType}, 1, '', now())
    ON CONFLICT (serie, document_type)
    DO UPDATE SET
      current_number = invoice_series.current_number + 1,
      updated_at     = now()
    RETURNING current_number
  `);

  const row = (rows as any).rows?.[0] ?? (rows as any)[0];
  if (!row) throw new Error(`getNextNumber: no row returned for serie=${serie} documentType=${documentType}`);
  return Number(row.current_number);
}
