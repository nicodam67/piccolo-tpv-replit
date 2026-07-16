-- ═══════════════════════════════════════════════════════════════════════════════
-- 0008_crm_loyalty.sql
-- Complete CRM / Loyalty / Gift Cards / Promotions / Wallet / Campaigns
-- All statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Core CRM client table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_clients (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre              text        NOT NULL,
  apellidos           text        NOT NULL DEFAULT '',
  telefono            text        NOT NULL DEFAULT '',
  email               text        NOT NULL DEFAULT '',
  fecha_nacimiento    date,
  direccion           text        NOT NULL DEFAULT '',
  observaciones       text        NOT NULL DEFAULT '',
  activo              boolean     NOT NULL DEFAULT true,
  rgpd_consentimiento boolean     NOT NULL DEFAULT false,
  rgpd_fecha          timestamptz,
  total_gasto         numeric(12,2) NOT NULL DEFAULT 0,
  total_visitas       integer     NOT NULL DEFAULT 0,
  ultima_visita       timestamptz,
  puntos_saldo        integer     NOT NULL DEFAULT 0,
  idioma              text        NOT NULL DEFAULT 'es',
  mesa_favorita_id    uuid,
  zona_favorita       text,
  rgpd_marketing      boolean     NOT NULL DEFAULT false,
  notas_internas      text        NOT NULL DEFAULT '',
  flag_no_presentado  boolean     NOT NULL DEFAULT false,
  bloqueo_online      boolean     NOT NULL DEFAULT false,
  cancelaciones       integer     NOT NULL DEFAULT 0,
  no_presentados      integer     NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- v2 columns on crm_clients
ALTER TABLE crm_clients ADD COLUMN IF NOT EXISTS num_cliente     integer;
ALTER TABLE crm_clients ADD COLUMN IF NOT EXISTS qr_token        text;
ALTER TABLE crm_clients ADD COLUMN IF NOT EXISTS nivel_id        uuid;
ALTER TABLE crm_clients ADD COLUMN IF NOT EXISTS nivel_nombre    text NOT NULL DEFAULT '';
ALTER TABLE crm_clients ADD COLUMN IF NOT EXISTS saldo_monedero  numeric(10,2) NOT NULL DEFAULT 0;

-- Sequential customer number sequence
CREATE SEQUENCE IF NOT EXISTS crm_num_cliente_seq START 1001;
-- Back-fill existing clients that have no num_cliente yet
UPDATE crm_clients SET num_cliente = nextval('crm_num_cliente_seq')
  WHERE num_cliente IS NULL;

-- Unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS crm_clients_qr_token_idx ON crm_clients(qr_token)
  WHERE qr_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_clients_telefono_idx ON crm_clients(telefono)
  WHERE telefono <> '';
CREATE INDEX IF NOT EXISTS crm_clients_email_idx ON crm_clients(email)
  WHERE email <> '';

-- ─── 2. Loyalty levels ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_loyalty_levels (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                text        NOT NULL,
  descripcion           text        NOT NULL DEFAULT '',
  orden                 integer     NOT NULL DEFAULT 0,
  requisito_gasto       numeric(10,2) NOT NULL DEFAULT 0,
  requisito_visitas     integer     NOT NULL DEFAULT 0,
  multiplicador_puntos  numeric(4,2) NOT NULL DEFAULT 1.00,
  descuento_pct         numeric(5,2) NOT NULL DEFAULT 0,
  beneficios            jsonb       NOT NULL DEFAULT '[]',
  color                 text        NOT NULL DEFAULT '#6b7280',
  icono                 text        NOT NULL DEFAULT '⭐',
  activo                boolean     NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ─── 3. Loyalty config ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_loyalty_config (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  activo                      boolean     NOT NULL DEFAULT false,
  puntos_por_euro             numeric(8,2) NOT NULL DEFAULT 1,
  valor_punto                 numeric(8,4) NOT NULL DEFAULT 0.0100,
  caducidad_dias              integer     NOT NULL DEFAULT 0,
  canje_minimo                integer     NOT NULL DEFAULT 100,
  bonificaciones_categorias   jsonb       NOT NULL DEFAULT '{}',
  -- v2 extended accumulation rules
  puntos_extra_cumpleanos     integer     NOT NULL DEFAULT 0,
  puntos_extra_primera_compra integer     NOT NULL DEFAULT 0,
  puntos_extra_reserva        integer     NOT NULL DEFAULT 0,
  puntos_extra_recogida       integer     NOT NULL DEFAULT 0,
  puntos_extra_online         integer     NOT NULL DEFAULT 0,
  reglas_por_producto         jsonb       NOT NULL DEFAULT '{}',
  canje_max_por_operacion     integer     NOT NULL DEFAULT 0,
  caducidad_aviso_dias        integer     NOT NULL DEFAULT 7,
  niveles_activos             boolean     NOT NULL DEFAULT false,
  monedero_activo             boolean     NOT NULL DEFAULT false,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- Add v2 columns to existing loyalty config rows (safe)
ALTER TABLE crm_loyalty_config ADD COLUMN IF NOT EXISTS puntos_extra_cumpleanos     integer NOT NULL DEFAULT 0;
ALTER TABLE crm_loyalty_config ADD COLUMN IF NOT EXISTS puntos_extra_primera_compra integer NOT NULL DEFAULT 0;
ALTER TABLE crm_loyalty_config ADD COLUMN IF NOT EXISTS puntos_extra_reserva        integer NOT NULL DEFAULT 0;
ALTER TABLE crm_loyalty_config ADD COLUMN IF NOT EXISTS puntos_extra_recogida       integer NOT NULL DEFAULT 0;
ALTER TABLE crm_loyalty_config ADD COLUMN IF NOT EXISTS puntos_extra_online         integer NOT NULL DEFAULT 0;
ALTER TABLE crm_loyalty_config ADD COLUMN IF NOT EXISTS reglas_por_producto         jsonb   NOT NULL DEFAULT '{}';
ALTER TABLE crm_loyalty_config ADD COLUMN IF NOT EXISTS canje_max_por_operacion     integer NOT NULL DEFAULT 0;
ALTER TABLE crm_loyalty_config ADD COLUMN IF NOT EXISTS caducidad_aviso_dias        integer NOT NULL DEFAULT 7;
ALTER TABLE crm_loyalty_config ADD COLUMN IF NOT EXISTS niveles_activos             boolean NOT NULL DEFAULT false;
ALTER TABLE crm_loyalty_config ADD COLUMN IF NOT EXISTS monedero_activo             boolean NOT NULL DEFAULT false;

-- ─── 4. Loyalty points ledger ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_loyalty_points (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        uuid        NOT NULL REFERENCES crm_clients(id),
  tipo             text        NOT NULL,
  puntos           integer     NOT NULL,
  saldo_anterior   integer     NOT NULL DEFAULT 0,
  saldo_posterior  integer     NOT NULL DEFAULT 0,
  descripcion      text        NOT NULL DEFAULT '',
  order_id         uuid,
  campania_id      uuid,
  empleado_id      uuid,
  empleado_nombre  text        NOT NULL DEFAULT '',
  expira_en        timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE crm_loyalty_points ADD COLUMN IF NOT EXISTS campania_id uuid;

CREATE INDEX IF NOT EXISTS crm_loyalty_points_client_id_idx ON crm_loyalty_points(client_id);
CREATE INDEX IF NOT EXISTS crm_loyalty_points_expira_en_idx ON crm_loyalty_points(expira_en)
  WHERE expira_en IS NOT NULL;

-- ─── 5. Gift cards ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_gift_cards (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo                  text        NOT NULL UNIQUE,
  saldo_inicial           numeric(10,2) NOT NULL DEFAULT 0,
  saldo_actual            numeric(10,2) NOT NULL DEFAULT 0,
  client_id               uuid        REFERENCES crm_clients(id),
  estado                  text        NOT NULL DEFAULT 'activa',
  fecha_caducidad         timestamptz,
  notas                   text        NOT NULL DEFAULT '',
  empleado_id             uuid,
  empleado_nombre         text        NOT NULL DEFAULT '',
  beneficiario_email      text        NOT NULL DEFAULT '',
  beneficiario_nombre     text        NOT NULL DEFAULT '',
  mensaje_personalizado   text        NOT NULL DEFAULT '',
  tipo_entrega            text        NOT NULL DEFAULT 'digital',
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE crm_gift_cards ADD COLUMN IF NOT EXISTS beneficiario_email      text NOT NULL DEFAULT '';
ALTER TABLE crm_gift_cards ADD COLUMN IF NOT EXISTS beneficiario_nombre     text NOT NULL DEFAULT '';
ALTER TABLE crm_gift_cards ADD COLUMN IF NOT EXISTS mensaje_personalizado   text NOT NULL DEFAULT '';
ALTER TABLE crm_gift_cards ADD COLUMN IF NOT EXISTS tipo_entrega            text NOT NULL DEFAULT 'digital';

-- ─── 6. Gift card transactions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_gift_card_transactions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_card_id     uuid        NOT NULL REFERENCES crm_gift_cards(id),
  order_id         uuid,
  tipo             text        NOT NULL,
  importe          numeric(10,2) NOT NULL,
  saldo_anterior   numeric(10,2) NOT NULL,
  saldo_posterior  numeric(10,2) NOT NULL,
  empleado_id      uuid,
  empleado_nombre  text        NOT NULL DEFAULT '',
  notas            text        NOT NULL DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_gc_txns_gift_card_id_idx ON crm_gift_card_transactions(gift_card_id);

-- ─── 7. Promotions / Coupons (extended) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_promotions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre           text        NOT NULL,
  descripcion      text        NOT NULL DEFAULT '',
  tipo             text        NOT NULL,
  valor            numeric(10,2) NOT NULL DEFAULT 0,
  codigo           text        NOT NULL DEFAULT '',
  activo           boolean     NOT NULL DEFAULT true,
  fecha_inicio     timestamptz,
  fecha_fin        timestamptz,
  dias_semana      jsonb       NOT NULL DEFAULT '[]',
  hora_inicio      text        NOT NULL DEFAULT '',
  hora_fin         text        NOT NULL DEFAULT '',
  categoria_ids    jsonb       NOT NULL DEFAULT '[]',
  product_ids      jsonb       NOT NULL DEFAULT '[]',
  monto_minimo     numeric(10,2) NOT NULL DEFAULT 0,
  uso_maximo       integer     NOT NULL DEFAULT 0,
  uso_actual       integer     NOT NULL DEFAULT 0,
  uso_maximo_por_cliente integer NOT NULL DEFAULT 0,
  canal            text        NOT NULL DEFAULT '',
  compatible       boolean     NOT NULL DEFAULT true,
  codigo_unico     boolean     NOT NULL DEFAULT false,
  producto_gratis_id uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE crm_promotions ADD COLUMN IF NOT EXISTS uso_maximo_por_cliente integer NOT NULL DEFAULT 0;
ALTER TABLE crm_promotions ADD COLUMN IF NOT EXISTS canal            text    NOT NULL DEFAULT '';
ALTER TABLE crm_promotions ADD COLUMN IF NOT EXISTS compatible       boolean NOT NULL DEFAULT true;
ALTER TABLE crm_promotions ADD COLUMN IF NOT EXISTS codigo_unico     boolean NOT NULL DEFAULT false;
ALTER TABLE crm_promotions ADD COLUMN IF NOT EXISTS producto_gratis_id uuid;

-- Coupon usage tracker (per-client, per-coupon)
CREATE TABLE IF NOT EXISTS crm_coupon_uses (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id     uuid        NOT NULL REFERENCES crm_promotions(id) ON DELETE CASCADE,
  client_id        uuid        REFERENCES crm_clients(id),
  order_id         uuid,
  used_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_coupon_uses_promo_client_idx ON crm_coupon_uses(promotion_id, client_id);

-- ─── 8. Wallet / Monedero ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_wallet (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           uuid        NOT NULL UNIQUE REFERENCES crm_clients(id),
  saldo_real          numeric(10,2) NOT NULL DEFAULT 0,
  saldo_promo         numeric(10,2) NOT NULL DEFAULT 0,
  saldo_compensacion  numeric(10,2) NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm_wallet_transactions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        uuid        NOT NULL REFERENCES crm_clients(id),
  tipo             text        NOT NULL,
  subtipo          text        NOT NULL DEFAULT '',
  importe          numeric(10,2) NOT NULL,
  saldo_anterior   numeric(10,2) NOT NULL DEFAULT 0,
  saldo_posterior  numeric(10,2) NOT NULL DEFAULT 0,
  descripcion      text        NOT NULL DEFAULT '',
  order_id         uuid,
  empleado_id      uuid,
  empleado_nombre  text        NOT NULL DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_wallet_txns_client_id_idx ON crm_wallet_transactions(client_id);

-- ─── 9. Campaigns ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_campaigns (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre               text        NOT NULL,
  descripcion          text        NOT NULL DEFAULT '',
  tipo                 text        NOT NULL DEFAULT 'manual',
  estado               text        NOT NULL DEFAULT 'borrador',
  canal                text        NOT NULL DEFAULT 'email',
  asunto               text        NOT NULL DEFAULT '',
  contenido            text        NOT NULL DEFAULT '',
  segmento             jsonb       NOT NULL DEFAULT '{}',
  fecha_envio          timestamptz,
  fecha_fin            timestamptz,
  total_destinatarios  integer     NOT NULL DEFAULT 0,
  total_enviados       integer     NOT NULL DEFAULT 0,
  total_entregados     integer     NOT NULL DEFAULT 0,
  total_fallidos       integer     NOT NULL DEFAULT 0,
  total_usados         integer     NOT NULL DEFAULT 0,
  promotion_id         uuid        REFERENCES crm_promotions(id),
  empleado_id          uuid,
  empleado_nombre      text        NOT NULL DEFAULT '',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm_campaign_sends (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid        NOT NULL REFERENCES crm_campaigns(id) ON DELETE CASCADE,
  client_id    uuid        NOT NULL REFERENCES crm_clients(id),
  estado       text        NOT NULL DEFAULT 'pendiente',
  canal        text        NOT NULL DEFAULT '',
  enviado_en   timestamptz,
  fallido_en   timestamptz,
  error        text,
  usado_en     timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_campaign_sends_campaign_id_idx ON crm_campaign_sends(campaign_id);
CREATE INDEX IF NOT EXISTS crm_campaign_sends_client_id_idx   ON crm_campaign_sends(client_id);

-- ─── 10. Consent management ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_consents (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      uuid        NOT NULL REFERENCES crm_clients(id),
  tipo           text        NOT NULL,
  valor          boolean     NOT NULL,
  canal_origen   text        NOT NULL DEFAULT '',
  texto_aceptado text        NOT NULL DEFAULT '',
  version_legal  text        NOT NULL DEFAULT '1.0',
  ip             text        NOT NULL DEFAULT '',
  revocado_en    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_consents_client_id_idx ON crm_consents(client_id);
CREATE INDEX IF NOT EXISTS crm_consents_tipo_idx      ON crm_consents(client_id, tipo);

-- ─── 11. Audit log ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_audit_log (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  accion           text        NOT NULL,
  client_id        uuid,
  entidad_tipo     text        NOT NULL DEFAULT '',
  entidad_id       uuid,
  empleado_id      uuid,
  empleado_nombre  text        NOT NULL DEFAULT '',
  terminal         text        NOT NULL DEFAULT '',
  datos            jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_audit_log_client_id_idx  ON crm_audit_log(client_id);
CREATE INDEX IF NOT EXISTS crm_audit_log_created_at_idx ON crm_audit_log(created_at);

-- ─── 12. Demo data flag table ─────────────────────────────────────────────────
-- Records which rows were inserted as demo data so they can be deleted cleanly
CREATE TABLE IF NOT EXISTS crm_demo_data (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tabla      text NOT NULL,
  row_id     uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
