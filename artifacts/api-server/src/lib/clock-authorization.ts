import { createHash, randomBytes } from "node:crypto";
import { and, eq, gte, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  breaksTable,
  clockAuthorizationsTable,
  employeesTable,
  fichajeAuditTable,
  tabletDevicesTable,
  timeRecordsTable,
} from "@workspace/db";

export const CLOCK_ACTIONS = [
  "clock_in",
  "clock_out",
  "break_start",
  "break_end",
] as const;

export type ClockAction = (typeof CLOCK_ACTIONS)[number];
export type ClockMethod = "pin" | "nfc";

const PROOF_TTL_MS = 90_000;
export const CLOCK_AUTH_DENIED = "No se pudo autorizar el fichaje";

export interface ClockAuthorizationRecord {
  id: string;
  proofHash: string;
  employeeId: string;
  deviceId: string;
  allowedAction: string;
  method: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

export class ClockAuthorizationError extends Error {
  constructor(
    public readonly status: number,
    public readonly reason: string,
    public readonly externalMessage = CLOCK_AUTH_DENIED,
  ) {
    super(reason);
  }
}

export function hashClockProof(proof: string): string {
  return createHash("sha256").update(proof).digest("hex");
}

export function validateClockAuthorization(
  authorization: ClockAuthorizationRecord | undefined,
  request: { employeeId: string; deviceId: string; action: ClockAction },
  now = new Date(),
): void {
  if (!authorization) {
    throw new ClockAuthorizationError(401, "proof_not_found");
  }
  if (authorization.consumedAt) {
    throw new ClockAuthorizationError(401, "proof_reused");
  }
  if (authorization.expiresAt <= now) {
    throw new ClockAuthorizationError(401, "proof_expired");
  }
  if (authorization.employeeId !== request.employeeId) {
    throw new ClockAuthorizationError(401, "employee_mismatch");
  }
  if (authorization.deviceId !== request.deviceId) {
    throw new ClockAuthorizationError(401, "device_mismatch");
  }
  if (authorization.allowedAction !== request.action) {
    throw new ClockAuthorizationError(401, "action_mismatch");
  }
}

export async function issueClockProofs(input: {
  employeeId: string;
  deviceId: string;
  method: ClockMethod;
}): Promise<{ proofs: Record<ClockAction, string>; expiresAt: string }> {
  const expiresAt = new Date(Date.now() + PROOF_TTL_MS);
  const proofs = {} as Record<ClockAction, string>;
  const rows = CLOCK_ACTIONS.map((action) => {
    const proof = randomBytes(32).toString("base64url");
    proofs[action] = proof;
    return {
      proofHash: hashClockProof(proof),
      employeeId: input.employeeId,
      deviceId: input.deviceId,
      allowedAction: action,
      method: input.method,
      expiresAt,
    };
  });

  await db.transaction(async (tx) => {
    await tx.insert(clockAuthorizationsTable).values(rows);
    await tx.insert(fichajeAuditTable).values({
      action: "clock_authorization_issued",
      employeeId: input.employeeId,
      performedBy: input.employeeId,
      entityType: "tablet_device",
      entityId: input.deviceId,
      details: {
        method: input.method,
        actions: CLOCK_ACTIONS,
        expiresAt: expiresAt.toISOString(),
      },
    });
  });

  return { proofs, expiresAt: expiresAt.toISOString() };
}

export async function auditClockAuthorizationFailure(input: {
  employeeId?: string;
  deviceId?: string;
  action?: string;
  reason: string;
}): Promise<void> {
  try {
    await db.insert(fichajeAuditTable).values({
      action: "clock_authorization_rejected",
      employeeId: input.employeeId,
      performedBy: input.employeeId,
      entityType: input.deviceId ? "tablet_device" : "clock_authorization",
      entityId: input.deviceId,
      details: { action: input.action, reason: input.reason },
    });
  } catch {
    // Rejection must remain fail-closed even if audit storage is unavailable.
  }
}

export async function consumeClockProof(input: {
  proof: string;
  employeeId: string;
  deviceId: string;
  action: ClockAction;
}): Promise<Record<string, unknown>> {
  const proofHash = hashClockProof(input.proof);

  return db.transaction(async (tx) => {
    const [authorization] = await tx
      .select()
      .from(clockAuthorizationsTable)
      .where(eq(clockAuthorizationsTable.proofHash, proofHash))
      .limit(1)
      .for("update");

    validateClockAuthorization(
      authorization as ClockAuthorizationRecord | undefined,
      input,
    );

    const [device] = await tx
      .select({ id: tabletDevicesTable.id, status: tabletDevicesTable.status })
      .from(tabletDevicesTable)
      .where(eq(tabletDevicesTable.id, input.deviceId))
      .limit(1);
    const [employee] = await tx
      .select({ id: employeesTable.id, active: employeesTable.active })
      .from(employeesTable)
      .where(eq(employeesTable.id, input.employeeId))
      .limit(1);

    if (!device || device.status !== "active" || !employee?.active) {
      throw new ClockAuthorizationError(401, "subject_inactive");
    }

    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    let entityType = "time_record";
    let entityId: string;
    let payload: Record<string, unknown>;

    if (input.action === "clock_in") {
      const [existing] = await tx
        .select({ id: timeRecordsTable.id })
        .from(timeRecordsTable)
        .where(and(
          eq(timeRecordsTable.employeeId, input.employeeId),
          isNull(timeRecordsTable.clockOut),
          gte(timeRecordsTable.clockIn, today),
        ))
        .limit(1);
      if (existing) {
        throw new ClockAuthorizationError(409, "clock_in_already_open", "Acción de fichaje no disponible");
      }

      const [record] = await tx
        .insert(timeRecordsTable)
        .values({
          employeeId: input.employeeId,
          clockIn: now,
          source: authorization.method,
          deviceId: input.deviceId,
        })
        .returning();
      entityId = record.id;
      payload = { record };
    } else {
      const [openRecord] = await tx
        .select()
        .from(timeRecordsTable)
        .where(and(
          eq(timeRecordsTable.employeeId, input.employeeId),
          isNull(timeRecordsTable.clockOut),
          gte(timeRecordsTable.clockIn, today),
        ))
        .limit(1)
        .for("update");
      if (!openRecord) {
        throw new ClockAuthorizationError(409, "clock_record_missing", "Acción de fichaje no disponible");
      }

      if (input.action === "clock_out") {
        await tx
          .update(breaksTable)
          .set({ breakEnd: now })
          .where(and(eq(breaksTable.recordId, openRecord.id), isNull(breaksTable.breakEnd)));
        const [record] = await tx
          .update(timeRecordsTable)
          .set({ clockOut: now, updatedAt: now })
          .where(eq(timeRecordsTable.id, openRecord.id))
          .returning();
        entityId = record.id;
        payload = { record };
      } else if (input.action === "break_start") {
        const [existingBreak] = await tx
          .select({ id: breaksTable.id })
          .from(breaksTable)
          .where(and(eq(breaksTable.recordId, openRecord.id), isNull(breaksTable.breakEnd)))
          .limit(1);
        if (existingBreak) {
          throw new ClockAuthorizationError(409, "break_already_open", "Acción de fichaje no disponible");
        }
        const [createdBreak] = await tx
          .insert(breaksTable)
          .values({ recordId: openRecord.id, breakStart: now })
          .returning();
        entityType = "break";
        entityId = createdBreak.id;
        payload = { break: createdBreak };
      } else {
        const [openBreak] = await tx
          .select()
          .from(breaksTable)
          .where(and(eq(breaksTable.recordId, openRecord.id), isNull(breaksTable.breakEnd)))
          .limit(1)
          .for("update");
        if (!openBreak) {
          throw new ClockAuthorizationError(409, "break_missing", "Acción de fichaje no disponible");
        }
        const [updatedBreak] = await tx
          .update(breaksTable)
          .set({ breakEnd: now })
          .where(eq(breaksTable.id, openBreak.id))
          .returning();
        entityType = "break";
        entityId = updatedBreak.id;
        payload = { break: updatedBreak };
      }
    }

    await tx
      .update(clockAuthorizationsTable)
      .set({ consumedAt: now })
      .where(eq(clockAuthorizationsTable.id, authorization.id));
    await tx.insert(fichajeAuditTable).values({
      action: input.action,
      employeeId: input.employeeId,
      performedBy: input.employeeId,
      entityType,
      entityId,
      details: {
        method: authorization.method,
        deviceId: input.deviceId,
        authorizationId: authorization.id,
      },
    });
    await tx
      .update(tabletDevicesTable)
      .set({ lastSeenAt: now })
      .where(eq(tabletDevicesTable.id, input.deviceId));

    return { success: true, ...payload, serverTime: now.toISOString() };
  });
}
