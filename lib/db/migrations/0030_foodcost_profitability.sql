ALTER TABLE ingredient_cost_history
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_reference text;

CREATE TABLE IF NOT EXISTS profitability_settings (
  id text PRIMARY KEY DEFAULT 'global',
  default_target_margin_pct numeric(5,2) NOT NULL DEFAULT 65,
  warning_gap_pct numeric(5,2) NOT NULL DEFAULT 10,
  allocation_method text NOT NULL DEFAULT 'none'
    CHECK (allocation_method IN ('none', 'revenue', 'units')),
  updated_by uuid REFERENCES employees(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO profitability_settings (id)
VALUES ('global')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS operating_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL CHECK (category IN (
    'personal', 'electricity', 'gas', 'water', 'rent', 'insurance',
    'accounting', 'maintenance', 'software', 'other'
  )),
  cost_type text NOT NULL DEFAULT 'fixed'
    CHECK (cost_type IN ('fixed', 'variable')),
  frequency text NOT NULL DEFAULT 'monthly'
    CHECK (frequency IN ('monthly', 'periodic')),
  period_months integer NOT NULL DEFAULT 1 CHECK (period_months > 0),
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS channel_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL,
  name text NOT NULL,
  percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (percent >= 0 AND percent < 100),
  fixed_amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (fixed_amount >= 0),
  active boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES employees(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS channel_commissions_channel_unique
  ON channel_commissions(channel);

CREATE TABLE IF NOT EXISTS profitability_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type text NOT NULL DEFAULT 'global'
    CHECK (scope_type IN ('global', 'category', 'product')),
  category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  channel text,
  target_margin_pct numeric(5,2) NOT NULL
    CHECK (target_margin_pct >= 0 AND target_margin_pct < 100),
  active boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES employees(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (scope_type = 'global' AND category_id IS NULL AND product_id IS NULL)
    OR (scope_type = 'category' AND category_id IS NOT NULL AND product_id IS NULL)
    OR (scope_type = 'product' AND product_id IS NOT NULL AND category_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS profitability_targets_unique_scope
  ON profitability_targets (
    scope_type,
    COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(product_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(channel, '')
  );

CREATE TABLE IF NOT EXISTS price_change_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id),
  old_price numeric(10,2) NOT NULL,
  proposed_price numeric(10,2) NOT NULL CHECK (proposed_price >= 0),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'applied')),
  requested_by uuid REFERENCES employees(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  applied_at timestamptz
);

CREATE INDEX IF NOT EXISTS price_change_proposals_product_created_idx
  ON price_change_proposals(product_id, created_at DESC);
