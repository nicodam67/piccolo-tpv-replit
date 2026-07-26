import { pool } from "@workspace/db";
import { applyMigrations, verifyMigrations } from "../../../../lib/db/src/migrations";

const mode = process.argv[2] ?? "check";
const operation = mode === "apply" ? applyMigrations() : verifyMigrations();

operation
  .then((result) => {
    if (Array.isArray(result)) {
      process.stdout.write(`Applied ${result.length} migration(s): ${result.join(", ") || "none"}\n`);
    } else {
      process.stdout.write("Migration verification passed\n");
    }
  })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
