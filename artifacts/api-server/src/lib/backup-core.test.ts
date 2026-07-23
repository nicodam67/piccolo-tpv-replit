import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPool = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock("@workspace/db", () => ({ pool: mockPool }));

const {
  BACKUP_FORMAT_VERSION,
  backupArtifactChecksum,
  backupChecksum,
  createDatabaseSnapshot,
  decryptBackup,
  encryptBackup,
  restoreDatabaseSnapshot,
  validateBackupForCurrentDatabase,
  validateBackupPayload,
} = await import("./backup-core");

function payload(tables: Record<string, unknown[]>) {
  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: "1.2.0",
    createdAt: new Date().toISOString(),
    manifest: Object.keys(tables).sort(),
    tables,
    sequences: {},
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SESSION_SECRET = "backup-test-secret-with-sufficient-entropy";
});

describe("backup cryptography and validation", () => {
  it("encrypts with authenticated GCM and detects tampering", () => {
    const encrypted = encryptBackup(JSON.stringify(payload({ employees: [{ id: "1" }] })));
    expect(JSON.parse(decryptBackup(encrypted.iv, encrypted.ciphertext))).toMatchObject({
      formatVersion: BACKUP_FORMAT_VERSION,
    });
    const corrupted = `${encrypted.ciphertext.slice(0, -2)}AA`;
    expect(() => decryptBackup(encrypted.iv, corrupted)).toThrow();
    expect(backupChecksum(encrypted.ciphertext)).not.toBe(backupChecksum(corrupted));
    const checksum = backupArtifactChecksum({
      formatVersion: BACKUP_FORMAT_VERSION,
      appVersion: "1.2.0",
      iv: encrypted.iv,
      ciphertext: encrypted.ciphertext,
    });
    expect(checksum).not.toBe(backupArtifactChecksum({
      formatVersion: BACKUP_FORMAT_VERSION,
      appVersion: "1.2.0",
      iv: "00".repeat(12),
      ciphertext: encrypted.ciphertext,
    }));
  });

  it("rejects wrong versions and incomplete manifests", () => {
    expect(() => validateBackupPayload({ ...payload({ employees: [] }), formatVersion: "1.0.0" })).toThrow(/Versión/);
    expect(() => validateBackupPayload({
      ...payload({ employees: [] }),
      manifest: ["employees", "orders"],
    })).toThrow(/incompleto/);
  });
});

describe("database snapshot and restore", () => {
  it("does not truncate large backups at 50,000 rows", async () => {
    const largeRows = Array.from({ length: 50_001 }, (_, id) => ({ id }));
    const query = vi.fn(async (statement: string) => {
      if (statement.includes("pg_catalog.pg_tables")) return { rows: [{ tablename: "orders" }] };
      if (statement.startsWith("SELECT *")) return { rows: largeRows };
      return { rows: [] };
    });
    mockPool.connect.mockResolvedValue({ query, release: vi.fn() });

    const snapshot = await createDatabaseSnapshot("1.2.0");

    expect(snapshot.rowCounts.orders).toBe(50_001);
    expect(query.mock.calls.some(([statement]) => String(statement).includes("LIMIT"))).toBe(false);
  });

  it("restores atomically on one reserved connection and is repeatable", async () => {
    const query = vi.fn(async (statement: string) => {
      if (statement.includes("pg_catalog.pg_tables")) return { rows: [{ tablename: "orders" }] };
      if (statement.includes("pg_catalog.pg_sequences")) return { rows: [{ sequencename: "orders_number_seq" }] };
      if (statement === "SHOW session_replication_role") {
        return { rows: [{ session_replication_role: "origin" }] };
      }
      return { rows: [] };
    });
    const release = vi.fn();
    mockPool.connect.mockResolvedValue({ query, release });
    const backup = {
      ...payload({ orders: [{ id: "1" }] }),
      sequences: { orders_number_seq: { lastValue: "42", isCalled: true } },
    };

    await restoreDatabaseSnapshot(backup);
    await restoreDatabaseSnapshot(backup);

    expect(query).toHaveBeenCalledWith("SET LOCAL session_replication_role = 'replica'");
    expect(query.mock.calls.some(([statement]) => String(statement).includes("TRUNCATE"))).toBe(false);
    expect(query.mock.calls.some(([statement]) => String(statement).startsWith("DELETE FROM"))).toBe(true);
    expect(query).toHaveBeenCalledWith(
      "SELECT setval($1::regclass, $2::bigint, $3::boolean)",
      ["public.orders_number_seq", "42", true],
    );
    expect(query.mock.calls.filter(([statement]) => statement === "COMMIT")).toHaveLength(2);
    expect(query.mock.calls.some(([statement]) => statement === "SET session_replication_role = 'replica'")).toBe(false);
    expect(release).toHaveBeenCalledTimes(2);
  });

  it("rolls back the complete restore when any table fails", async () => {
    const query = vi.fn(async (statement: string) => {
      if (statement.includes("pg_catalog.pg_tables")) return { rows: [{ tablename: "orders" }] };
      if (statement === "SHOW session_replication_role") {
        return { rows: [{ session_replication_role: "origin" }] };
      }
      if (statement.startsWith("INSERT INTO")) throw new Error("disk failure");
      return { rows: [] };
    });
    mockPool.connect.mockResolvedValue({ query, release: vi.fn() });

    await expect(restoreDatabaseSnapshot(payload({ orders: [{ id: "1" }] }))).rejects.toThrow("disk failure");
    expect(query).toHaveBeenCalledWith("ROLLBACK");
    expect(query).not.toHaveBeenCalledWith("COMMIT");
  });

  it("rejects an incomplete backup during dry-run validation", async () => {
    const query = vi.fn(async (statement: string) => {
      if (statement.includes("pg_catalog.pg_tables")) {
        return { rows: [{ tablename: "employees" }, { tablename: "orders" }] };
      }
      return { rows: [] };
    });
    mockPool.connect.mockResolvedValue({ query, release: vi.fn() });

    await expect(validateBackupForCurrentDatabase(payload({ employees: [] })))
      .rejects.toThrow(/incompleto|incompatible/);
  });
});
