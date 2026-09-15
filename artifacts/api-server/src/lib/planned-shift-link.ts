import { sql, type SQL } from "drizzle-orm";

interface QueryExecutor {
  execute(query: SQL): Promise<{ rows: unknown[] }>;
}

/**
 * Resolve only an unambiguous published shift containing the clock timestamp.
 * No early/late tolerance is invented: those rules are not configured today.
 */
export async function resolvePlannedShiftId(
  executor: QueryExecutor,
  employeeId: string,
  at: Date,
): Promise<string | null> {
  const result = await executor.execute(sql`
    WITH config AS (
      SELECT COALESCE(
        (SELECT timezone FROM fichaje_settings ORDER BY id LIMIT 1),
        'UTC'
      ) AS timezone
    )
    SELECT shift.id
    FROM shifts AS shift
    INNER JOIN planning_schedules AS schedule ON schedule.id = shift.schedule_id
    LEFT JOIN hr_work_centers AS center ON center.id = schedule.work_center_id
    CROSS JOIN config
    WHERE shift.employee_id = ${employeeId}
      AND schedule.status = 'PUBLISHED'
      AND ${at} >= (
        (shift.shift_date::text || ' ' || shift.start_time)::timestamp
        AT TIME ZONE COALESCE(center.timezone, config.timezone)
      )
      AND ${at} < (
        (
          shift.shift_date::timestamp
          + CASE WHEN shift.end_time <= shift.start_time THEN interval '1 day' ELSE interval '0 day' END
          + shift.end_time::time
        ) AT TIME ZONE COALESCE(center.timezone, config.timezone)
      )
    ORDER BY shift.shift_date, shift.start_time, shift.id
    LIMIT 2
    FOR SHARE OF shift
  `);
  const rows = result.rows as Array<{ id: string }>;
  return rows.length === 1 ? rows[0]!.id : null;
}
