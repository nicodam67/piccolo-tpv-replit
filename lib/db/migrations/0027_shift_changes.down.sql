DROP INDEX IF EXISTS shift_change_events_request_idx;
DROP INDEX IF EXISTS shift_change_requests_schedule_idx;
DROP INDEX IF EXISTS shift_change_requests_status_idx;
DROP INDEX IF EXISTS shift_change_requests_recipient_idx;
DROP INDEX IF EXISTS shift_change_requests_requester_idx;
DROP TABLE IF EXISTS shift_change_events;
DROP TABLE IF EXISTS shift_change_locks;
DROP TABLE IF EXISTS shift_change_requests;
