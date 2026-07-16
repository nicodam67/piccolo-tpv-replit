---
name: CRM / Loyalty Module
description: Architecture decisions, table layout, and route split for the complete CRM/Loyalty/Gift Cards/Promotions/Wallet/Campaigns system.
---

## Tables (migration 0008_crm_loyalty.sql — applied)

15 tables in DB: crm_clients, crm_loyalty_levels, crm_loyalty_config, crm_loyalty_points,
crm_gift_cards, crm_gift_card_transactions, crm_wallet, crm_wallet_transactions,
crm_promotions, crm_coupon_uses, crm_campaigns, crm_campaign_sends, crm_consents,
crm_audit_log, crm_demo_data.

Migration uses CREATE TABLE IF NOT EXISTS + ALTER TABLE ADD COLUMN IF NOT EXISTS throughout
— safe to re-run.

## Route split

- `artifacts/api-server/src/routes/crm.ts` — original: clients CRUD, loyalty config,
  points issue/redeem, gift cards, promotions CRUD + validate, reports, audit.
  Exports `generateGiftCardCode()`, `issuePoints()`, `redeemPoints()`, `validatePromotion()`.
  
- `artifacts/api-server/src/routes/loyalty-extended.ts` — NEW: levels CRUD,
  wallet CRUD, campaigns CRUD + send, segmentation preview/export, consents,
  coupon-use tracking (per-client cap), expiring points, auto level review,
  auto point expiry, demo data create/delete, extended reports.

Both registered in routes/index.ts (loyalty-extended added after crmRouter).

## Client create (crm.ts POST /crm/clients)

Now:
1. Duplicate check by telefono OR email — returns 409 with existing client id.
2. Generates unique QR token (CL-XXXX-XXXX format).
3. Assigns num_cliente from sequence `crm_num_cliente_seq` via `nextval`.

## Frontend (crm.tsx)

7 tabs: Clientes · Fidelización · Niveles · Tarjetas Regalo · Promociones · Campañas · Informes

New tabs: NivelesTab (loyalty levels CRUD), CampañasTab (campaigns CRUD + send + segment builder)

FidelizacionTab now shows v2 config: birthday bonus, first-purchase bonus, online bonus,
nivelesActivos, monederoActivo.

ClientDetail shows: wallet balance (saldoMonedero), level (nivelNombre), customer number.

## CrmClient type now has v2 fields

numCliente?, qrToken?, nivelId?, nivelNombre?, saldoMonedero?

## Test note

loyalty-extended.test.ts has ~25/31 tests passing. 6 fail due to mock-complexity
(transaction chains and multi-step insert sequences are hard to replicate in Vitest unit tests
without a real DB). Error cases (400, 404, 409) all pass. 

**Why:** the makeChain approach works for simple select/update chains but the transaction
mock callback needs special care when nested update/insert calls don't call .returning().

## Demo data

POST /crm/demo-data (admin only) inserts: 4 clients (Ana VIP, Carlos Plata, María Bronce, 
Roberto birthday), 4 levels (Bronce/Plata/Oro/VIP), 3 promotions, 1 gift card, 1 campaign.
DELETE /crm/demo-data removes all flagged rows via crm_demo_data tracker.
