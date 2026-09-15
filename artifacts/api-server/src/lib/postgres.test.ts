import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { postgresErrorCode, sqlParameterList } from "./postgres";

describe("PostgreSQL route helpers", () => {
  it("finds PostgreSQL codes wrapped by the Drizzle query error", () => {
    const error = new Error("Failed query", {
      cause: Object.assign(new Error("duplicate key"), { code: "23505" }),
    });

    expect(postgresErrorCode(error)).toBe("23505");
  });

  it("binds UUID lists as separate parameters for row locking", () => {
    const ids = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ];
    const query = sql`SELECT id FROM shifts WHERE id IN (${sqlParameterList(ids)}) FOR UPDATE`;

    expect(new PgDialect().sqlToQuery(query)).toMatchObject({
      sql: "SELECT id FROM shifts WHERE id IN ($1, $2) FOR UPDATE",
      params: ids,
    });
  });
});
