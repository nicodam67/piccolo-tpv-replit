import { db } from "@workspace/db";
import { paymentMethodsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const DEFAULT_METHODS = [
  { code: "cash",            name: "Efectivo",           sortOrder: 1,  active: true },
  { code: "card",            name: "Tarjeta",            sortOrder: 2,  active: true },
  { code: "bizum",           name: "Bizum",              sortOrder: 3,  active: true },
  { code: "transfer",        name: "Transferencia",      sortOrder: 4,  active: true },
  { code: "cheque_rest",     name: "Cheque restaurante", sortOrder: 5,  active: true },
  { code: "invitation",      name: "Invitación",         sortOrder: 6,  active: true },
  { code: "other",           name: "Otro",               sortOrder: 7,  active: true },
];

export async function seedCash(): Promise<void> {
  for (const m of DEFAULT_METHODS) {
    const [existing] = await db
      .select()
      .from(paymentMethodsTable)
      .where(eq(paymentMethodsTable.code, m.code));
    if (!existing) {
      await db.insert(paymentMethodsTable).values(m);
      console.log(`[seed] payment_method: ${m.name}`);
    }
  }
}
