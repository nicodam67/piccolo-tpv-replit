DROP INDEX IF EXISTS reservations_center_date_status_real_idx;
DROP INDEX IF EXISTS tickets_employee_issued_real_idx;
DROP INDEX IF EXISTS staffing_need_proposal_items_proposal_idx;
DROP INDEX IF EXISTS staffing_need_proposals_schedule_idx;
DROP INDEX IF EXISTS staffing_demand_rules_scope_idx;

DROP TABLE IF EXISTS staffing_need_proposal_items;
DROP TABLE IF EXISTS staffing_need_proposals;
DROP TABLE IF EXISTS staffing_demand_rules;

ALTER TABLE reservations DROP COLUMN IF EXISTS work_center_id;
