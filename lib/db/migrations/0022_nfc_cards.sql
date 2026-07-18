-- Migration 0022: NFC cards for tablet clock-in
-- Stores only SHA-256 hash of the physical card UID, never the UID itself.

CREATE TABLE IF NOT EXISTS nfc_cards (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id        uuid        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  card_token_hash    text        NOT NULL UNIQUE,
  alias              text,
  status             text        NOT NULL DEFAULT 'active',   -- 'active' | 'revoked'
  last_used_at       timestamptz,
  assigned_by        uuid        REFERENCES employees(id),
  assigned_at        timestamptz NOT NULL DEFAULT now(),
  revoked_at         timestamptz,
  revoked_by         uuid        REFERENCES employees(id),
  revoked_reason     text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nfc_cards_employee_idx ON nfc_cards(employee_id);
CREATE INDEX IF NOT EXISTS nfc_cards_status_idx   ON nfc_cards(status);
