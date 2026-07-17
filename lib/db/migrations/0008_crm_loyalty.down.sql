-- Down migration: 0008_crm_loyalty
-- CAUTION: all CRM/loyalty data will be permanently lost.

DROP INDEX IF EXISTS crm_audit_log_created_at_idx;
DROP INDEX IF EXISTS crm_audit_log_client_id_idx;
DROP INDEX IF EXISTS crm_consents_tipo_idx;
DROP INDEX IF EXISTS crm_consents_client_id_idx;
DROP INDEX IF EXISTS crm_campaign_sends_client_id_idx;
DROP INDEX IF EXISTS crm_campaign_sends_campaign_id_idx;
DROP INDEX IF EXISTS crm_wallet_txns_client_id_idx;
DROP INDEX IF EXISTS crm_coupon_uses_promo_client_idx;
DROP INDEX IF EXISTS crm_gc_txns_gift_card_id_idx;
DROP INDEX IF EXISTS crm_loyalty_points_expira_en_idx;
DROP INDEX IF EXISTS crm_loyalty_points_client_id_idx;
DROP INDEX IF EXISTS crm_clients_email_idx;
DROP INDEX IF EXISTS crm_clients_telefono_idx;
DROP INDEX IF EXISTS crm_clients_qr_token_idx;

DROP TABLE IF EXISTS crm_demo_data CASCADE;
DROP TABLE IF EXISTS crm_audit_log CASCADE;
DROP TABLE IF EXISTS crm_consents CASCADE;
DROP TABLE IF EXISTS crm_campaign_sends CASCADE;
DROP TABLE IF EXISTS crm_campaigns CASCADE;
DROP TABLE IF EXISTS crm_wallet_transactions CASCADE;
DROP TABLE IF EXISTS crm_wallet CASCADE;
DROP TABLE IF EXISTS crm_coupon_uses CASCADE;
DROP TABLE IF EXISTS crm_promotions CASCADE;
DROP TABLE IF EXISTS crm_gift_card_transactions CASCADE;
DROP TABLE IF EXISTS crm_gift_cards CASCADE;
DROP TABLE IF EXISTS crm_loyalty_points CASCADE;
DROP TABLE IF EXISTS crm_loyalty_config CASCADE;
DROP TABLE IF EXISTS crm_loyalty_levels CASCADE;
DROP TABLE IF EXISTS crm_clients CASCADE;

DROP SEQUENCE IF EXISTS crm_num_cliente_seq;
