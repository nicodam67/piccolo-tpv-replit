-- Down migration: 0010_director_module
-- CAUTION: all director dashboard data will be permanently lost.

DROP INDEX IF EXISTS director_snapshots_date_idx;
DROP INDEX IF EXISTS director_costs_effective_idx;
DROP INDEX IF EXISTS director_alerts_created_idx;
DROP INDEX IF EXISTS director_alerts_priority_idx;
DROP INDEX IF EXISTS director_alerts_status_idx;

DROP TABLE IF EXISTS director_custom_reports CASCADE;
DROP TABLE IF EXISTS director_daily_snapshots CASCADE;
DROP TABLE IF EXISTS director_costs CASCADE;
DROP TABLE IF EXISTS director_alerts CASCADE;
DROP TABLE IF EXISTS director_goals CASCADE;
