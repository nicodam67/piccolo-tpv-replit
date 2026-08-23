import { beforeAll, describe, expect, it } from "vitest";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  categoriesTable,
  employeesTable,
  invoicesTable,
  orderItemsTable,
  ordersTable,
  pool,
  productsTable,
  ticketsTable,
  verifactuRecordsTable,
} from "@workspace/db";
import { createFiscalRecord } from "./fiscal-issuance.js";
import { getNextNumber } from "./invoice-series.js";

const enabled = process.env["RUN_DB_INTEGRATION_TESTS"] === "1";
const describeDb = enabled ? describe : describe.skip;
const EMISOR_NIF = "89890001K";
let employeeId = "";
let productId = "";

async function createOrder(status = "paid"): Promise<string> {
  const [order] = await db.insert(ordersTable).values({ status }).returning();
  return order.id;
}

async function issueFullInvoice(orderId: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`);
    const [existing] = await tx
      .select()
      .from(invoicesTable)
      .where(and(eq(invoicesTable.orderId, orderId), eq(invoicesTable.serie, "F")))
      .limit(1);
    if (existing) return existing;

    const numero = await getNextNumber("F", "factura", tx);
    const issuedAt = new Date();
    const [invoice] = await tx
      .insert(invoicesTable)
      .values({
        serie: "F",
        invoiceNumber: numero,
        issuedAt,
        emisorNombre: "Piccolo Test",
        emisorNif: EMISOR_NIF,
        orderId,
        subtotal: "100.00",
        taxTotal: "21.00",
        total: "121.00",
        taxBreakdown: [{ rate: 21, base: "100.00", cuota: "21.00" }],
        status: "issued",
        verifactuStatus: "pending",
      })
      .returning();
    await createFiscalRecord(tx, {
      invoiceId: invoice.id,
      serie: invoice.serie,
      numero,
      issuedAt,
      generatedAt: new Date(),
      tipoFactura: "F1",
      emisorNif: invoice.emisorNif,
      emisorNombre: invoice.emisorNombre,
      baseImponible: invoice.subtotal,
      cuotaTotal: invoice.taxTotal,
      importeTotal: invoice.total,
      desgloseIva: [{
        tipoImpositivo: "21.00",
        baseImponible: "100.00",
        cuotaRepercutida: "21.00",
      }],
    });
    return invoice;
  });
}

describeDb.sequential("SIF Phase 1 — PostgreSQL transactional core", () => {
  beforeAll(async () => {
    const migration = await pool.query<{ name: string | null }>(
      "SELECT to_regclass('public.fiscal_chain_state')::text AS name",
    );
    if (!migration.rows[0]?.name) {
      throw new Error("Run @workspace/db migrate before the Phase 1 integration tests");
    }
    const [employee] = await db
      .insert(employeesTable)
      .values({ name: "Fiscal Integration", role: "admin" })
      .returning();
    employeeId = employee.id;
    const [category] = await db
      .insert(categoriesTable)
      .values({ name: "Fiscal Integration" })
      .returning();
    const [product] = await db
      .insert(productsTable)
      .values({ categoryId: category.id, name: "Producto fiscal", price: "12.10" })
      .returning();
    productId = product.id;
  });

  it("emits one invoice with exactly one persistent fiscal record", async () => {
    const invoice = await issueFullInvoice(await createOrder());
    const records = await db
      .select()
      .from(verifactuRecordsTable)
      .where(and(
        eq(verifactuRecordsTable.invoiceId, invoice.id),
        eq(verifactuRecordsTable.registroTipo, "alta"),
      ));
    expect(records).toHaveLength(1);
    expect(records[0].estado).toBe("pendiente_envio");
  });

  it("rolls invoice and numbering back when fiscal record creation fails", async () => {
    const orderId = await createOrder("open");
    await expect(db.transaction(async (tx) => {
      const numero = await getNextNumber("F", "factura", tx);
      const [invoice] = await tx
        .insert(invoicesTable)
        .values({
          serie: "F",
          invoiceNumber: numero,
          emisorNombre: "Invalid issuer",
          emisorNif: "",
          orderId,
          subtotal: "10.00",
          taxTotal: "2.10",
          total: "12.10",
          status: "issued",
        })
        .returning();
      await createFiscalRecord(tx, {
        invoiceId: invoice.id,
        serie: "F",
        numero,
        issuedAt: invoice.issuedAt,
        tipoFactura: "F1",
        emisorNif: "",
        emisorNombre: invoice.emisorNombre,
        baseImponible: invoice.subtotal,
        cuotaTotal: invoice.taxTotal,
        importeTotal: invoice.total,
      });
    })).rejects.toThrow("falta el NIF");

    const invoices = await db
      .select()
      .from(invoicesTable)
      .where(eq(invoicesTable.orderId, orderId));
    expect(invoices).toHaveLength(0);
  });

  it("rejects a commit that tries to leave an issued invoice without a fiscal record", async () => {
    const orderId = await createOrder();
    await expect(db.transaction(async (tx) => {
      const numero = await getNextNumber("F", "factura", tx);
      await tx.insert(invoicesTable).values({
        serie: "F",
        invoiceNumber: numero,
        emisorNombre: "Piccolo Test",
        emisorNif: EMISOR_NIF,
        orderId,
        subtotal: "10.00",
        taxTotal: "2.10",
        total: "12.10",
        status: "issued",
      });
    })).rejects.toThrow("Failed query: commit");
    const orphan = await db
      .select()
      .from(invoicesTable)
      .where(eq(invoicesTable.orderId, orderId));
    expect(orphan).toHaveLength(0);
  });

  it("deduplicates a double click for the same logical order", async () => {
    const orderId = await createOrder();
    const [first, second] = await Promise.all([
      issueFullInvoice(orderId),
      issueFullInvoice(orderId),
    ]);
    expect(first.id).toBe(second.id);

    const records = await db
      .select({ id: verifactuRecordsTable.id })
      .from(verifactuRecordsTable)
      .where(eq(verifactuRecordsTable.invoiceId, first.id));
    expect(records).toHaveLength(1);
  });

  it("allows only one F1/F2 source under a concurrent cross-document race", async () => {
    const orderId = await createOrder();
    const issueInvoice = db.transaction(async (tx) => {
      const numero = await getNextNumber("F", "factura", tx);
      const issuedAt = new Date();
      const [invoice] = await tx.insert(invoicesTable).values({
        serie: "F",
        invoiceNumber: numero,
        issuedAt,
        emisorNombre: "Piccolo Test",
        emisorNif: EMISOR_NIF,
        orderId,
        subtotal: "10.00",
        taxTotal: "2.10",
        total: "12.10",
        status: "issued",
      }).returning();
      await createFiscalRecord(tx, {
        invoiceId: invoice.id,
        serie: "F",
        numero,
        issuedAt,
        tipoFactura: "F1",
        emisorNif: EMISOR_NIF,
        emisorNombre: "Piccolo Test",
        baseImponible: "10.00",
        cuotaTotal: "2.10",
        importeTotal: "12.10",
      });
      return invoice.id;
    });
    const issueTicket = db.transaction(async (tx) => {
      const numero = await getNextNumber("T", "ticket", tx);
      const issuedAt = new Date();
      const [ticket] = await tx.insert(ticketsTable).values({
        orderId,
        ticketNumber: numero,
        serie: "T",
        nifEmisor: EMISOR_NIF,
        razonSocialEmisor: "Piccolo Test",
        subtotal: "10.00",
        taxTotal: "2.10",
        total: "12.10",
        issuedAt,
        employeeId,
      }).returning();
      await createFiscalRecord(tx, {
        ticketId: ticket.id,
        serie: "T",
        numero,
        issuedAt,
        tipoFactura: "F2",
        emisorNif: EMISOR_NIF,
        emisorNombre: "Piccolo Test",
        baseImponible: "10.00",
        cuotaTotal: "2.10",
        importeTotal: "12.10",
      });
      return ticket.id;
    });

    const outcomes = await Promise.allSettled([issueInvoice, issueTicket]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const [invoiceCount, ticketCount, fiscalCount] = await Promise.all([
      db.select({ id: invoicesTable.id }).from(invoicesTable).where(eq(invoicesTable.orderId, orderId)),
      db.select({ id: ticketsTable.id }).from(ticketsTable).where(eq(ticketsTable.orderId, orderId)),
      db.select({ id: verifactuRecordsTable.id })
        .from(verifactuRecordsTable)
        .where(sql`${verifactuRecordsTable.invoiceId} IN (
          SELECT id FROM invoices WHERE order_id = ${orderId}
        ) OR ${verifactuRecordsTable.ticketId} IN (
          SELECT id FROM tickets WHERE order_id = ${orderId}
        )`),
    ]);
    expect(invoiceCount.length + ticketCount.length).toBe(1);
    expect(fiscalCount).toHaveLength(1);
  });

  it("serializes concurrent numbers and produces one non-branching chain", async () => {
    const orderIds = await Promise.all(Array.from({ length: 12 }, () => createOrder()));
    const invoices = await Promise.all(orderIds.map(issueFullInvoice));
    expect(new Set(invoices.map((invoice) => invoice.invoiceNumber)).size).toBe(invoices.length);

    const records = await db
      .select()
      .from(verifactuRecordsTable)
      .where(inArray(verifactuRecordsTable.invoiceId, invoices.map((invoice) => invoice.id)))
      .orderBy(asc(verifactuRecordsTable.chainSequence));
    expect(records).toHaveLength(invoices.length);
    expect(new Set(records.map((record) => record.chainSequence)).size).toBe(records.length);
    for (let index = 1; index < records.length; index += 1) {
      expect(records[index].huellaAnterior).toBe(records[index - 1].huella);
      expect(records[index].chainSequence).toBe(records[index - 1].chainSequence + 1);
    }

    const branches = await pool.query(
      `SELECT huella_anterior
         FROM verifactu_records
        WHERE chain_key = $1 AND huella_anterior <> ''
        GROUP BY huella_anterior
       HAVING count(*) > 1`,
      [records[0].chainKey],
    );
    expect(branches.rows).toHaveLength(0);
  });

  it("rejects arbitrary update and delete of an emitted fiscal record", async () => {
    const invoice = await issueFullInvoice(await createOrder());
    const [record] = await db
      .select()
      .from(verifactuRecordsTable)
      .where(eq(verifactuRecordsTable.invoiceId, invoice.id));

    await expect(pool.query(
      "UPDATE verifactu_records SET importe_total = '999.99' WHERE id = $1",
      [record.id],
    )).rejects.toThrow("No se puede modificar");
    await expect(pool.query(
      "DELETE FROM verifactu_records WHERE id = $1",
      [record.id],
    )).rejects.toThrow("inmutables");
  });

  it("freezes order lines and keeps the issued product-name snapshot", async () => {
    const orderId = await createOrder("open");
    const [item] = await db.insert(orderItemsTable).values({
      orderId,
      productId,
      quantity: 1,
      unitPrice: "12.10",
      taxRate: 21,
    }).returning();
    await issueFullInvoice(orderId);

    await expect(db
      .update(orderItemsTable)
      .set({ quantity: 2 })
      .where(eq(orderItemsTable.id, item.id)))
      .rejects.toThrow("Failed query: update");
    await db
      .update(productsTable)
      .set({ name: "Producto renombrado" })
      .where(eq(productsTable.id, productId));
    const [persisted] = await db
      .select({
        name: orderItemsTable.productNameSnapshot,
        quantity: orderItemsTable.quantity,
      })
      .from(orderItemsTable)
      .where(eq(orderItemsTable.id, item.id));
    expect(persisted.name).toBe("Producto fiscal");
    expect(persisted.quantity).toBe(1);
  });

  it("persists pending delivery state across a simulated process restart", async () => {
    const invoice = await issueFullInvoice(await createOrder());
    // A fresh PostgreSQL session represents a new Node process reading only
    // durable state after restart (no module-level/in-memory state is involved).
    const restartedClient = await pool.connect();
    try {
      const result = await restartedClient.query<{ estado: string }>(
        "SELECT estado FROM verifactu_records WHERE invoice_id = $1",
        [invoice.id],
      );
      expect(result.rows).toEqual([{ estado: "pendiente_envio" }]);
    } finally {
      restartedClient.release();
    }
  });

  it("keeps invoice and fiscal record pending when AEAT/Internet is unavailable", async () => {
    const invoice = await issueFullInvoice(await createOrder());
    const [record] = await db
      .select()
      .from(verifactuRecordsTable)
      .where(eq(verifactuRecordsTable.invoiceId, invoice.id));
    expect(invoice.status).toBe("issued");
    expect(record.estado).toBe("pendiente_envio");
    expect(record.aeatFechaEnvio).toBeNull();
    expect(record.reintentos).toBe(0);
  });
});
