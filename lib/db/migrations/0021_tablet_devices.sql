-- Migration 0021: tablet_devices
-- Registers tablets used as fixed clock-in kiosks for fichaje

CREATE TABLE IF NOT EXISTS tablet_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  device_token TEXT NOT NULL UNIQUE,
  location TEXT NOT NULL DEFAULT 'Piccolo La Ràpita',
  status TEXT NOT NULL DEFAULT 'active',
  last_seen_at TIMESTAMPTZ,
  app_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);
