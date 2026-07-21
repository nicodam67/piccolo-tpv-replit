import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { pool } from "./pool";

export { pool } from "./pool";
export type { PoolClient } from "./pool";
export const db = drizzle(pool, { schema });
