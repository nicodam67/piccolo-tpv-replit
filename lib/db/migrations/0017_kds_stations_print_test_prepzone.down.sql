-- Down migration: 0017_kds_stations_print_test_prepzone
-- CAUTION: KDS station and print test data will be permanently lost.
-- NOTE: The prepZone value remap (frío→ensalada etc.) is NOT reversed here because
-- the original values were free-form and reverting would incorrectly map all
-- 'ensalada' products back to 'frío'. Reverse the remap manually if needed.

DROP INDEX IF EXISTS idx_print_test_results_session;

DROP TABLE IF EXISTS print_test_results CASCADE;
DROP TABLE IF EXISTS kds_stations CASCADE;
