import { db } from "@workspace/db";
import {
  crmClientsTable,
  crmGiftCardsTable,
  crmLoyaltyPointsTable,
  ordersTable,
  reservationsTable,
  type CrmClient,
} from "@workspace/db";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";

type CrmClientInput = {
  nombre: string;
  apellidos?: string;
  telefono?: string;
  email?: string;
  fechaNacimiento?: string | null;
  direccion?: string;
  observaciones?: string;
  rgpdConsentimiento?: boolean;
  idioma?: string;
  zonaFavorita?: string | null;
  mesaFavoritaId?: string | null;
};

export class CrmClientIdentityRequiredError extends Error {
  constructor() {
    super("La reserva debe incluir teléfono, email o un cliente CRM seleccionado");
  }
}

export class CrmClientNotFoundError extends Error {
  constructor() {
    super("El cliente CRM seleccionado no existe");
  }
}

export class CrmClientConflictError extends Error {
  constructor(
    message: string,
    public readonly clients: Array<Pick<CrmClient, "id" | "nombre" | "apellidos">>,
  ) {
    super(message);
  }
}

export function normalizeCrmPhone(value?: string | null): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("0034") && digits.length === 13) return digits.slice(4);
  if (digits.startsWith("34") && digits.length === 11) return digits.slice(2);
  return digits;
}

export function normalizeCrmEmail(value?: string | null): string {
  return String(value ?? "").trim().toLowerCase();
}

export function splitCrmDisplayName(displayName: string): {
  nombre: string;
  apellidos: string;
} {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  return {
    nombre: parts.shift() ?? displayName.trim(),
    apellidos: parts.join(" "),
  };
}

export function generateCrmQrToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const segment = (length: number) =>
    Array.from(
      { length },
      () => chars[Math.floor(Math.random() * chars.length)],
    ).join("");
  return `CL-${segment(4)}-${segment(4)}`;
}

function phoneCandidates(phone: string): string[] {
  const normalized = normalizeCrmPhone(phone);
  if (!normalized) return [];
  if (normalized.length === 9) {
    return [normalized, `34${normalized}`, `0034${normalized}`];
  }
  return [normalized];
}

function identityLockKeys(input: Pick<CrmClientInput, "telefono" | "email">): string[] {
  const keys: string[] = [];
  const phone = normalizeCrmPhone(input.telefono);
  const email = normalizeCrmEmail(input.email);
  if (phone) keys.push(`crm:phone:${phone}`);
  if (email) keys.push(`crm:email:${email}`);
  return keys.sort();
}

type CrmTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function lockIdentities(
  tx: CrmTransaction,
  input: Pick<CrmClientInput, "telefono" | "email">,
): Promise<void> {
  for (const key of identityLockKeys(input)) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
  }
}

async function findClientsByIdentity(
  tx: CrmTransaction,
  input: Pick<CrmClientInput, "telefono" | "email">,
): Promise<CrmClient[]> {
  const conditions = [];
  const phones = phoneCandidates(input.telefono ?? "");
  const email = normalizeCrmEmail(input.email);

  if (phones.length) {
    conditions.push(
      inArray(
        sql<string>`regexp_replace(${crmClientsTable.telefono}, '[^0-9]', '', 'g')`,
        phones,
      ),
    );
  }
  if (email) {
    conditions.push(sql`lower(trim(${crmClientsTable.email})) = ${email}`);
  }
  if (!conditions.length) return [];

  return tx
    .select()
    .from(crmClientsTable)
    .where(or(...conditions))
    .limit(3);
}

async function insertCrmClient(
  tx: CrmTransaction,
  input: CrmClientInput,
): Promise<CrmClient> {
  const sequence = await tx.execute(
    sql`SELECT nextval('crm_num_cliente_seq') as n`,
  );
  const numCliente = Number(sequence.rows[0]?.n ?? 1000);
  const [client] = await tx
    .insert(crmClientsTable)
    .values({
      nombre: input.nombre.trim(),
      apellidos: input.apellidos?.trim() ?? "",
      telefono: input.telefono?.trim() ?? "",
      email: normalizeCrmEmail(input.email),
      fechaNacimiento: input.fechaNacimiento || null,
      direccion: input.direccion?.trim() ?? "",
      observaciones: input.observaciones?.trim() ?? "",
      rgpdConsentimiento: input.rgpdConsentimiento === true,
      rgpdFecha: input.rgpdConsentimiento ? new Date() : null,
      idioma: input.idioma ?? "es",
      zonaFavorita: input.zonaFavorita ?? null,
      mesaFavoritaId: input.mesaFavoritaId ?? null,
      qrToken: generateCrmQrToken(),
      numCliente,
    })
    .returning();
  return client;
}

export async function createCanonicalCrmClient(
  input: CrmClientInput,
): Promise<CrmClient> {
  return db.transaction(async (tx) => {
    await lockIdentities(tx, input);
    const matches = await findClientsByIdentity(tx, input);
    if (matches.length) {
      throw new CrmClientConflictError(
        `Ya existe un cliente con ese teléfono o email (${matches[0].nombre})`,
        matches,
      );
    }
    return insertCrmClient(tx, input);
  });
}

export async function resolveCrmClientForReservation(input: {
  clientId?: string | null;
  nombre: string;
  telefono?: string | null;
  email?: string | null;
  idioma?: string | null;
  zonaFavorita?: string | null;
  mesaFavoritaId?: string | null;
}): Promise<CrmClient> {
  if (input.clientId) {
    const [selected] = await db
      .select()
      .from(crmClientsTable)
      .where(eq(crmClientsTable.id, input.clientId))
      .limit(1);
    if (!selected) throw new CrmClientNotFoundError();
    return selected;
  }

  const phone = normalizeCrmPhone(input.telefono);
  const email = normalizeCrmEmail(input.email);
  if (!phone && !email) throw new CrmClientIdentityRequiredError();

  return db.transaction(async (tx) => {
    await lockIdentities(tx, input);
    const matches = await findClientsByIdentity(tx, input);
    if (matches.length > 1) {
      throw new CrmClientConflictError(
        "El teléfono y el email coinciden con clientes CRM distintos; seleccione la ficha correcta",
        matches,
      );
    }
    if (matches[0]) return matches[0];

    const name = splitCrmDisplayName(input.nombre);
    return insertCrmClient(tx, {
      ...name,
      telefono: input.telefono?.trim() ?? "",
      email,
      idioma: input.idioma ?? "es",
      zonaFavorita: input.zonaFavorita ?? null,
      mesaFavoritaId: input.mesaFavoritaId ?? null,
    });
  });
}

/** Existing CRM history, keyed by canonical clientId with legacy phone fallback. */
export async function getClientHistory(clientId: string) {
  const [client] = await db
    .select()
    .from(crmClientsTable)
    .where(eq(crmClientsTable.id, clientId));
  if (!client) return null;

  const orders = await db
    .select({
      id: ordersTable.id,
      createdAt: ordersTable.createdAt,
      status: ordersTable.status,
    })
    .from(ordersTable)
    .where(and(eq(ordersTable.clientId, clientId), eq(ordersTable.status, "paid")))
    .orderBy(desc(ordersTable.createdAt))
    .limit(20);

  const reservationConditions = [eq(reservationsTable.clientId, clientId)];
  const phones = phoneCandidates(client.telefono);
  if (phones.length) {
    reservationConditions.push(
      and(
        sql`${reservationsTable.clientId} IS NULL`,
        inArray(
          sql<string>`regexp_replace(${reservationsTable.telefono}, '[^0-9]', '', 'g')`,
          phones,
        ),
      )!,
    );
  }
  const reservations = await db
    .select()
    .from(reservationsTable)
    .where(or(...reservationConditions))
    .orderBy(desc(reservationsTable.createdAt))
    .limit(10);

  const points = await db
    .select()
    .from(crmLoyaltyPointsTable)
    .where(eq(crmLoyaltyPointsTable.clientId, clientId))
    .orderBy(desc(crmLoyaltyPointsTable.createdAt))
    .limit(20);

  const giftCards = await db
    .select()
    .from(crmGiftCardsTable)
    .where(eq(crmGiftCardsTable.clientId, clientId))
    .orderBy(desc(crmGiftCardsTable.createdAt))
    .limit(10);

  const ticketMedio =
    client.totalVisitas > 0
      ? parseFloat(
          (parseFloat(client.totalGasto) / client.totalVisitas).toFixed(2),
        )
      : 0;

  return {
    client,
    orders,
    reservations,
    points,
    giftCards,
    stats: {
      totalGasto: parseFloat(client.totalGasto),
      totalVisitas: client.totalVisitas,
      ticketMedio,
      puntosSaldo: client.puntosSaldo,
      ultimaVisita: client.ultimaVisita,
    },
  };
}
