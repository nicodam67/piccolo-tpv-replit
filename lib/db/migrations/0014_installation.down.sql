-- Down migration: 0014_installation
-- CAUTION: all installation device and network registry data will be permanently lost.

DROP TABLE IF EXISTS installation_tests CASCADE;
DROP TABLE IF EXISTS network_registry CASCADE;
DROP TABLE IF EXISTS installation_devices CASCADE;
