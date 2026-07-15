#!/bin/bash
set -e
pnpm install --frozen-lockfile

# Idempotent pre-push DDL — sequences and other objects that drizzle-push
# cannot create but that table defaults reference.  Must run BEFORE db push so
# Postgres can resolve the nextval(...) default on prefactura_prints.
node --input-type=module <<'EOF'
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(`
  -- Prefactura internal consecutive numbering (independent of T-/F- fiscal series)
  CREATE SEQUENCE IF NOT EXISTS prefactura_number_seq START 1;
`);
await pool.end();
console.log('pre-push DDL OK');
EOF

pnpm --filter db push
