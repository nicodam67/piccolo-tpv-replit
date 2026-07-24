import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export interface TableQrPayload {
  rid: string;
  tid: string;
  zid: string;
  tv: string;
  rv: string;
  exp: number;
}

function signingSecret(): string {
  const secret = process.env.QR_TABLE_HMAC_SECRET
    ?? (process.env.NODE_ENV !== "production" ? process.env.SESSION_SECRET : undefined);
  if (!secret || secret.length < 32) throw new Error("QR_TABLE_HMAC_SECRET no configurado");
  return secret;
}

export function tableVersion(input: {
  id: string;
  zoneId: string;
  name: string;
  active: boolean;
}): string {
  return createHash("sha256")
    .update(`${input.id}\0${input.zoneId}\0${input.name}\0${input.active}`)
    .digest("base64url")
    .slice(0, 22);
}

export function restaurantVersion(updatedAt: Date): string {
  return createHash("sha256")
    .update(updatedAt.toISOString())
    .digest("base64url")
    .slice(0, 22);
}

export function tableSessionMatchesCurrent(
  session: { token: string; tableId: string | null; zoneId: string | null; tableLabel: string },
  table: { id: string; zoneId: string; name: string; active: boolean } | undefined,
  businessUpdatedAt: Date | undefined,
): boolean {
  if (!table || !businessUpdatedAt || !table.active || session.tableId !== table.id) return false;
  return session.zoneId === table.zoneId
    && session.tableLabel === table.name
    && session.token.endsWith(`.${restaurantVersion(businessUpdatedAt)}`);
}

export function signTableQr(payload: TableQrPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", signingSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyTableQr(ticket: string): TableQrPayload {
  const [encoded, provided] = ticket.split(".");
  if (!encoded || !provided) throw new Error("QR_MALFORMED");
  const expected = createHmac("sha256", signingSecret()).update(encoded).digest();
  const actual = Buffer.from(provided, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error("QR_SIGNATURE_INVALID");
  }
  let payload: TableQrPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as TableQrPayload;
  } catch {
    throw new Error("QR_PAYLOAD_INVALID");
  }
  if (
    !payload.rid || !payload.tid || !payload.zid || !payload.tv || !payload.rv
    || !Number.isInteger(payload.exp)
  ) throw new Error("QR_PAYLOAD_INVALID");
  if (payload.exp <= Math.floor(Date.now() / 1000)) throw new Error("QR_EXPIRED");
  return payload;
}
