import { pool } from "@workspace/db";

try {
  const [cash, print, backup] = await Promise.all([
    pool.query<{ count: string }>("SELECT count(*) FROM cash_sessions WHERE status = 'open'"),
    pool.query<{ count: string }>("SELECT count(*) FROM print_queue WHERE status IN ('sending', 'retrying')"),
    pool.query<{ count: string }>("SELECT count(*) FROM backup_records WHERE status = 'pending'"),
  ]);
  const result = {
    openCashSessions: Number(cash.rows[0]?.count ?? 0),
    activePrintJobs: Number(print.rows[0]?.count ?? 0),
    pendingBackups: Number(backup.rows[0]?.count ?? 0),
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.openCashSessions || result.activePrintJobs || result.pendingBackups) {
    process.stderr.write("Update blocked: active service, print jobs, or backups detected.\n");
    process.exitCode = 2;
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
