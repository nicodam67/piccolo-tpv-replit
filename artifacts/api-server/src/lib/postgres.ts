import { sql, type SQL } from "drizzle-orm";

export function postgresErrorCode(error: unknown): string | undefined {
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export function sqlParameterList(values: readonly unknown[]): SQL {
  return sql.join(values.map((value) => sql`${value}`), sql`, `);
}
