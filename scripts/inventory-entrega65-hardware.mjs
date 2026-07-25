import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "docs/inventories/entrega65-hardware-capabilities.json");

const item = (
  component,
  fileOrModule,
  currentFunction,
  protocol,
  status,
  evidence,
  externalDependency,
  availableTest,
  pendingTest,
  criticality,
  decision,
) => ({
  component,
  fileOrModule,
  currentFunction,
  protocol,
  status,
  evidence,
  externalDependency,
  availableTest,
  pendingTest,
  criticality,
  decision,
});

const pendingPhysical = (device, scenario) =>
  `PENDING_PHYSICAL_CERTIFICATION: ${device}; ${scenario}`;

const capabilities = [
  item("print-job-generation", "routes/orders.ts + lib/print-dispatch.ts", "Enqueue kitchen and added tickets after order send", "internal/DB", "validated-software", "service-flow, orders and printer suites", "PostgreSQL", "send/order tests", "Physical output remains pending", "critical", "retain"),
  item("print-queue", "schema/printers.ts + lib/print-worker.ts", "Persistent pending/retrying/sending/printed/error queue", "PostgreSQL polling", "validated-software", "queue CRUD and full staging suite pass", "PostgreSQL", "printers.test.ts", pendingPhysical("printer", "queue delivery and restart"), "critical", "certify-physically"),
  item("print-routing-category-product", "lib/print-dispatch.ts + routes/printers.ts", "Product override, category override, prep-zone fallback", "internal configuration", "implemented-unverified", "routing code and admin matrix exist", "Configured printers/catalog", "software source and service-flow evidence", pendingPhysical("all zone printers", "routing priority"), "high", "add-software-test-and-certify"),
  item("print-worker-retry", "lib/print-worker.ts", "Three attempts then optional fallback", "worker polling", "implemented-unverified", "MAX_ATTEMPTS=3 and status transitions in code", "Printer connector", "queue route tests only", pendingPhysical("primary and fallback printers", "offline, timeout and retry"), "critical", "add-worker-tests"),
  item("print-worker-restart", "lib/print-worker.ts", "Resumes pending/retrying jobs", "worker polling", "implemented-unverified", "persistent queue; sending rows are not recovered", "PostgreSQL", "none for orphan sending", pendingPhysical("printer/service", "restart during sending"), "high", "needs-software-correction"),
  item("print-fallback-printer", "lib/print-worker.ts + schema/printers.ts", "One fallback attempt after primary failures", "internal/TCP intended", "implemented-unverified", "fallbackPrinterId and fallback audit exist", "Two physical printers", "no worker integration test", pendingPhysical("two printers", "primary failure and fallback output"), "high", "certify-physically"),
  item("print-retry-reprint", "routes/printers.ts", "Manual retry and creation of reprint job with audit", "HTTP/internal queue", "validated-software", "retry/reprint endpoints and audits tested", "Configured printer", "printers.test.ts", pendingPhysical("printer", "same/alternate printer and REIMPRESION mark"), "high", "certify-physically"),
  item("print-cancellation-modification", "lib/print-dispatch.ts", "Builders exist but have no runtime call sites", "internal", "unsupported", "dispatchCancellationPrint/dispatchModificationPrint are uncalled", "None", "none", "Define operational requirement before physical test", "medium", "owner-decision"),
  item("print-tcp-schema", "schema/printers.ts", "Stores printer IP and port 9100", "TCP/IP intended", "configuration-only", "admin CRUD stores address/port", "LAN printer", "CRUD tests", pendingPhysical("network printer", "TCP transport"), "critical", "needs-connector"),
  item("print-usb", "print-connector-sim.ts", "No USB/local-agent transport", "USB", "unsupported", "only simulator connector exists", "USB driver/local agent", "none", pendingPhysical("USB printer", "requires implementation first"), "high", "blocked"),
  item("escpos-payload", "lib/ticket-builder.ts", "Plain-text ticket payload", "plain text; not ESC/POS bytes", "unsupported", "no ESC/POS command bytes", "Real connector/codepage", "ticket-builder string tests", pendingPhysical("ESC/POS printer", "charset, cut and drawer"), "critical", "needs-connector"),
  item("paper-cut", "pages/admin-print-test.tsx", "Manual checklist step only", "ESC/POS command absent", "configuration-only", "wizard records operator pass/fail only", "Compatible printer", "none", pendingPhysical("printer", "automatic cut"), "high", "blocked"),
  item("cash-drawer-kick", "pages/admin-print-test.tsx + ticket-builder.ts", "Template flag/manual checklist; no command", "ESC/POS drawer kick absent", "unsupported", "no physical kick implementation", "Drawer connected to printer", "none", pendingPhysical("cash drawer", "open pulse"), "critical", "blocked"),
  item("production-print-connector", "lib/print-connector-sim.ts", "Simulator rejects production sends", "simulated", "fail-closed", "NODE_ENV=production returns connector unavailable", "Physical connector", "production-connectors.test.ts", pendingPhysical("printer", "all production print cases"), "critical", "blocked"),

  item("kds-zone-routing", "routes/orders.ts + routes/kds.ts", "Creates task using product prepZone", "PostgreSQL/internal", "validated-software", "KDS and service-flow suites pass", "Valid catalog prepZone", "kds.test.ts", pendingPhysical("KDS screens", "one order across departments"), "high", "certify-physically"),
  item("kds-fixed-zones", "routes/kds.ts + pages/kds.tsx", "Hardcoded cocina/pizza/ensalada/barra/pase/sin_partida", "internal enum", "implemented-unverified", "new zones require code; sin_partida lacks nav", "Owner department design", "FSM tests", "Validate final department list", "high", "owner-decision"),
  item("kds-realtime", "lib/socket.ts + pages/kds.tsx", "Socket refresh plus REST refetch", "Socket.IO/HTTPS", "validated-software", "socket auth/reconnect and KDS tests pass", "Stable LAN/Wi-Fi", "socket-reconnect.test.ts", pendingPhysical("KDS", "disconnect/reconnect and missed event"), "high", "certify-physically"),
  item("kds-polling", "pages/kds.tsx", "10s task polling and 15s history fallback", "HTTPS", "validated-software", "refetch intervals and cleanup exist", "API/LAN", "build/typecheck", pendingPhysical("KDS", "degraded socket mode"), "medium", "retain"),
  item("kds-stations", "routes/kds.ts + schema/kds-stations.ts", "Station metadata, heartbeat and ping", "HTTP", "implemented-unverified", "admin station UI/API exist; not used for routing", "Physical displays", "admin/API tests", pendingPhysical("each KDS", "ping, orientation, reboot"), "high", "certify-physically"),
  item("kds-pase", "routes/orders.ts + pages/kds.tsx", "Aggregates ready orders and marks collected/served", "HTTP/Socket.IO", "validated-software", "FSM and pase code/tests", "Pase screen", "kds.test.ts", pendingPhysical("pase display", "partial readiness and handoff"), "high", "certify-physically"),
  item("kds-backup-ticket", "business_config.printMode + print-dispatch.ts", "Global KDS-only/printers-only/both", "configuration", "implemented-unverified", "global mode tested; no per-zone mode", "Printers", "orders.test.ts", pendingPhysical("KDS+printer", "dual path/fallback"), "critical", "owner-decision"),
  item("department-mode-per-zone", "business_config.printMode", "Only one global mode; routing is printer-only per product/category", "configuration", "unsupported", "cannot set KDS/print/both/neither independently per zone", "Department design", "none", "Owner must approve software change", "critical", "needs-software-correction"),

  item("waiter-browser-tpv", "artifacts/piccolo-tpv", "Touch web TPV for tables/orders/payments", "HTTPS browser", "validated-software", "752 API tests and 26 E2E pass", "Modern browser/device", "run-e2e-staging-local.sh", pendingPhysical("D1-D7", "touch and full order"), "critical", "certify-physically"),
  item("seven-waiter-devices", "routes/installation.ts", "Default seed is five tablets plus main PC", "configuration", "configuration-only", "no hard fleet limit or certified seven-device profile", "Seven physical devices/Wi-Fi", "none", pendingPhysical("7 waiter devices", "simultaneous service"), "critical", "owner-decision"),
  item("tpv-pwa", "public/sw.js + manifest.json", "Static shell cache and install metadata", "PWA/HTTPS", "implemented-unverified", "service worker exists; manifest is fichaje-focused", "HTTPS/browser", "build only", pendingPhysical("tablet/phone", "install, update, offline shell"), "medium", "certify-physically"),
  item("tpv-small-screen-orientation", "piccolo-tpv responsive UI", "Responsive/touch layouts", "browser", "implemented-unverified", "no visual-device E2E", "Phones/tablets", "build only", pendingPhysical("phone/tablet", "portrait/landscape"), "medium", "certify-physically"),
  item("session-pin", "routes/auth.ts", "PIN login, HttpOnly JWT, revocation and rate limits", "HTTPS/JWT", "validated-software", "auth/security/E2E suites pass", "Secure clock/device", "auth.test.ts", pendingPhysical("shared tablets", "seven-user PIN rotation"), "high", "certify-operationally"),
  item("tablet-device-token", "routes/tablet.ts", "Pairing, token, revoke and action proof", "HTTPS header token", "validated-software", "tablet security tests pass", "Fichaje tablet", "tablet-security.test.ts", pendingPhysical("fichaje tablet", "pair/revoke/re-pair"), "high", "certify-physically"),
  item("nfc-fichaje", "hooks/useNfc.ts + routes/fichaje.ts", "Web NFC identify and proof", "Web NFC/NDEF/HTTPS", "implemented-unverified", "API logic tested; comments mark physical pending", "Android NFC device/cards", "authorization tests", pendingPhysical("NFC reader/cards", "valid, unknown, revoked, double tap"), "high", "blocked-external"),
  item("mobile-fichaje", "pages/FichajeReloj.tsx", "Mobile clock is disabled", "HTTPS", "fail-closed", "mobileClockEnabled forced false", "Owner decision", "contract tests", "No physical certification until enabled by design", "medium", "owner-decision"),
  item("offline-device-registry", "routes/offline.ts", "Device registration, block/revoke and diagnostics", "HTTPS/device fingerprint", "implemented-unverified", "API exists; no full airplane-mode E2E", "Physical devices/network", "certification endpoint smoke", pendingPhysical("waiter device", "block/loss/reconnect"), "high", "certify-physically"),
  item("offline-operation-queue", "lib/offline-queue.ts", "IndexedDB queue/sync helper", "IndexedDB/HTTPS", "implemented-unverified", "enqueueOperation has no active page call sites", "Browser/device", "none end-to-end", pendingPhysical("tablet", "airplane mode order"), "high", "blocked"),
  item("offline-cash-payment", "routes/offline.ts", "Explicitly fails unsupported cash sync without ledger effect", "HTTPS", "fail-closed", "offline_cash_payment_unsupported persisted as failed", "None", "offline-cash-payment.integration.test.ts", "Do not enable physical test until implementation is authorized", "critical", "retain-disabled"),

  item("manual-cash-payment", "routes/payments.ts", "Records cash under open cash session", "HTTPS/PostgreSQL", "validated-software", "service flow/E2E/concurrency pass", "Cash handling procedure", "payments and E2E tests", pendingPhysical("cash drawer", "count/reconcile"), "critical", "certify-operationally"),
  item("manual-card-payment", "routes/payments.ts", "Manual accounting entry for card", "manual external terminal", "configuration-only", "no card terminal connector", "External TPE", "payment tests", pendingPhysical("card terminal", "manual reconciliation"), "critical", "owner-decision"),
  item("automatic-cash-machine-simulator", "lib/cash-machine/simulator.ts", "Simulated payment/change/cancel/reconcile scenarios", "internal simulator", "simulated", "cash-machine tests", "None", "cash-machine.test.ts", "Not admissible as physical evidence", "critical", "keep-development-only"),
  item("automatic-cash-machine-adapter", "lib/cash-machine/registry.ts", "Only simulator registered; production rejects it", "adapter interface", "fail-closed", "production connector tests", "Real hardware/driver/credentials", "production-connectors.test.ts", pendingPhysical("cash recycler", "full lifecycle"), "critical", "blocked-external"),
  item("card-terminal-integration", "payment.tsx/payment methods", "No terminal SDK; card button is manual", "unsupported", "unsupported", "no Redsys/Ingenico/other adapter", "External provider/device", "none", pendingPhysical("TPE", "requires owner-selected process"), "critical", "owner-decision"),
  item("physical-payment-recovery", "cash-machine-command.ts + cash-machine.ts", "Stable command fingerprint, polling and reconcile", "HTTPS/localStorage/Web Locks", "validated-software", "idempotency/concurrency/recovery tests pass", "Real adapter", "cash machine and command tests", pendingPhysical("cash recycler", "timeout and uncertain outcome"), "critical", "certify-physically"),

  item("node-api-server", "artifacts/api-server", "Express API and in-process workers", "HTTPS/Node.js", "validated-software", "build, E2E, security and performance pass", "Host/process supervision", "production certification software", "Install under chosen topology", "critical", "needs-configuration"),
  item("postgresql", "lib/db", "Primary transactional data store", "PostgreSQL", "validated-software", "27 migrations, 752 DB tests, migration check", "Managed/local PostgreSQL", "run-e2e-staging-local.sh", "Capacity, monitoring and power drill", "critical", "needs-infrastructure"),
  item("lan-router-switch-wifi", "installation/network registry", "Manual inventory/diagnostics only", "Ethernet/Wi-Fi", "blocked-external", "no network hardware managed by app", "Router/switch/AP/cabling", "none", pendingPhysical("LAN", "coverage, loss, reconnect, seven devices"), "critical", "owner-selection"),
  item("local-dns-static-ip", "installation config", "Stores network entries; no DNS service", "TCP/IP/DNS", "configuration-only", "printer/KDS config assumes reachable addresses", "Router/DHCP/DNS", "none", pendingPhysical("LAN", "stable addressing"), "high", "needs-configuration"),
  item("external-monitoring", "/api/healthz + diagnostics", "Health endpoints and admin diagnostics", "HTTPS", "configuration-only", "no external monitor provisioned", "Monitoring service", "health smoke", "Configure alert destination", "high", "owner-selection"),
  item("ups-power", "none", "No UPS or graceful power workflow", "power", "unsupported", "no repository implementation", "UPS/electrical installation", "none", pendingPhysical("server/NAS/network", "power loss"), "critical", "blocked-external"),

  item("database-backup", "lib/backup-core.ts", "Encrypted full JSON snapshot with manifest/checksum", "PostgreSQL/JSON/AES-256-GCM", "validated-software", "164-table restore/repeat/rollback passed", "SESSION_SECRET", "backup-core + restore staging", "External destination still pending", "critical", "retain"),
  item("incremental-backup", "backup type field", "Labels exist but engine always snapshots all tables", "N/A", "unsupported", "no delta/changelog implementation", "Owner requirement", "none", "Do not advertise incremental", "medium", "owner-decision"),
  item("nas-destination", "lib/backup-destinations.ts", "Writes atomically to allowlisted mounted path", "mounted filesystem", "implemented-unverified", "local temp-dir tests only", "NAS mount/permissions/network", "backup-destinations.test.ts", pendingPhysical("NAS", "write, loss, space, restore"), "critical", "blocked-external"),
  item("s3-destination", "lib/backup-destinations.ts", "Put/Get/Head/Delete with checksum metadata", "S3-compatible API", "implemented-unverified", "AWS SDK calls mocked", "Bucket/endpoint/IAM/egress", "backup-destinations.test.ts", pendingPhysical("S3 account", "real round-trip and restore"), "critical", "blocked-external"),
  item("sftp-backup", "migration comment only", "No adapter", "SFTP", "unsupported", "no runtime code", "SFTP server", "none", "Not planned", "low", "unsupported"),
  item("invoice-file-storage", "routes/invoice-scanner.ts", "Stores binaries on local uploads path", "filesystem", "configuration-only", "DB backup stores metadata, not files", "Persistent volume/file backup", "upload tests", "File restore drill", "high", "needs-software-or-ops-decision"),
  item("image-storage", "catalog/branding URL fields", "Stores URLs, not image binaries", "HTTP URL", "configuration-only", "backup restores URLs only", "CDN/object storage", "none", "Broken URL restore scenario", "medium", "owner-decision"),
  item("transactional-restore", "lib/backup-core.ts", "Full transactional restore and rollback on failure", "PostgreSQL", "validated-software", "restore staging: 164 tables, repeated restore, rollback", "Staging PostgreSQL", "run-restore-staging-local.sh", "NAS/S3 source restore pending", "critical", "retain"),
  item("schema-rollback", "lib/db migrations", "Forward migrations only", "SQL", "unsupported", "no production down-runner", "Release procedure", "migration check only", "Forward-fix/backup rollback rehearsal", "high", "owner-decision"),
  item("terramaster-f4-424", "no vendor integration", "Potential OS-mounted NAS only", "SMB/NFS mount candidate", "blocked-external", "no vendor-specific code or test", "Candidate hardware supplied by owner", "none", pendingPhysical("TerraMaster candidate", "mount/write/restore/RAID handled externally"), "medium", "candidate-not-certified"),

  item("ticket", "routes/payments.ts + schema/payments.ts", "Creates T-series ticket at full settlement", "PostgreSQL", "validated-software", "E2E payment/ticket passes", "Business config", "critical paths E2E", "Physical print pending", "critical", "retain"),
  item("prefactura", "routes/orders.ts/documents", "Non-fiscal pre-payment document", "PostgreSQL/print queue", "validated-software", "service flow tests", "Printer", "service-flow.test.ts", pendingPhysical("printer", "prefactura output"), "high", "certify-physically"),
  item("invoice", "routes/documents.ts", "Manual F/R invoice creation and numbering", "PostgreSQL", "validated-software", "documents contracts/tests", "Fiscal configuration", "documents tests", "Legal/fiscal review", "critical", "needs-credentials"),
  item("ticket-verifactu-bridge", "payments.ts vs routes/verifactu.ts", "No automatic ticket/invoice to fiscal record bridge", "none", "unsupported", "tickets stay pending; records require manual invoiceId API", "Owner/legal design", "absence documented", "Bridge software and legal certification required", "critical", "blocked"),
  item("verifactu-hash-xml-qr", "lib/verifactu.ts", "Hash chain, XML and QR generation", "SHA-256/XML", "validated-software", "pure tests pass", "Fiscal rules review", "verifactu.test.ts", "Does not prove AEAT compliance", "critical", "needs-legal-certification"),
  item("verifactu-worker", "lib/verifactu-worker.ts", "Polls pending/retry records", "background worker", "implemented-unverified", "worker exists but created records start validado and config defaults inactive", "Connected record flow", "limited software tests", "Queue/retry integration test", "high", "needs-software-correction"),
  item("verifactu-simulator", "lib/verifactu.ts", "Local simulated acceptance outside production", "simulator", "simulated", "production gate tests", "None", "verifactu tests", "Never count as AEAT certification", "critical", "keep-development-only"),
  item("verifactu-production-connector", "lib/verifactu.ts", "Production/test submission blocked", "AEAT/mTLS", "fail-closed", "PROD-001/CERT-002 and production tests", "Certificate, credentials, connector", "production-connectors.test.ts", pendingPhysical("AEAT credentials", "test/prod controlled send"), "critical", "blocked-external"),
  item("fiscal-signature", "lib/verifactu.ts", "Hash chaining but no XAdES/mTLS implementation", "XML/hash", "unsupported", "no certificate-backed signature code", "Certificate/provider", "hash tests only", "Legal and connector certification", "critical", "blocked"),
  item("fiscal-contingency", "none", "No explicit AEAT contingency workflow", "N/A", "unsupported", "no runtime implementation", "Legal/owner decision", "none", "Define manual contingency", "critical", "owner-decision"),
];

const allowedStatuses = new Set([
  "validated-software",
  "implemented-unverified",
  "simulated",
  "fail-closed",
  "configuration-only",
  "unsupported",
  "blocked-external",
  "legacy",
]);

for (const capability of capabilities) {
  if (!allowedStatuses.has(capability.status)) {
    throw new Error(`Invalid status for ${capability.component}: ${capability.status}`);
  }
}

capabilities.sort((a, b) => a.component.localeCompare(b.component));
fs.writeFileSync(output, `${JSON.stringify({
  delivery: 65,
  baseCommit: "c45fdbe",
  allowedStatuses: [...allowedStatuses],
  capabilityCount: capabilities.length,
  capabilities,
}, null, 2)}\n`);

console.log(`Entrega 65 hardware inventory: ${capabilities.length} capabilities.`);
