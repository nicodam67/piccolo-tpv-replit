---
name: VeriFactu worker gap
description: The verifactu worker polls verifactu_records but tickets are marked with verifactuStatus on ticketsTable — these are separate tables with no automatic bridge.
---

# VeriFactu worker gap

**Rule:** The verifactu background worker (`lib/verifactu-worker.ts`) polls `verifactu_records` table for `estado = 'pendiente_envio'`. The payment flow marks `ticketsTable.verifactuStatus = 'pending'` — these are different tables. There is no automatic link that converts a pending ticket into a verifactu_records row.

**Why:** The VeriFactu admin flow is invoice-driven (`POST /admin/verifactu/records` takes an `invoiceId`). Tickets don't automatically become verifactu records unless staff create them manually.

**How to apply:** If the requirement ever calls for automatic VeriFactu submission of all tickets, a bridge is needed: either the worker scans `tickets` with `verifactuStatus = 'pending'` and auto-creates `verifactu_records`, or the payment flow creates the record directly at ticket issuance.
