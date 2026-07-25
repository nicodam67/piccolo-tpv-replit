import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "docs/certification/entrega67-physical-certification.json");

const physical = (
  caseId,
  area,
  deviceRef,
  requiredHardware,
  preparation,
  steps,
  expected,
  evidence,
) => ({
  caseId,
  area,
  deviceRef,
  requiredHardware,
  preparation,
  steps,
  expected,
  evidence,
  status: "PENDING_PHYSICAL_CERTIFICATION",
});

const cases = [
  physical("PRINT-CHAR-CP858", "printing", "PRINTER_BY_DEPARTMENT", "ESC/POS printer", "Set CP858", ["Print canonical Spanish/Catalan/€ ticket"], "All glyphs legible", ["jobId", "photoRef", "operator"]),
  physical("PRINT-CHAR-CP437", "printing", "PRINTER_BY_DEPARTMENT", "ESC/POS printer", "Set CP437", ["Print same canonical ticket"], "Document unsupported/replaced glyphs; no silent acceptance", ["jobId", "photoRef"]),
  physical("PRINT-CHAR-W1252", "printing", "PRINTER_BY_DEPARTMENT", "ESC/POS printer", "Set Windows-1252", ["Print canonical ticket"], "Configured glyphs legible", ["jobId", "photoRef"]),
  physical("PRINT-UTF8-SOURCE", "printing", "PRINTER_BY_DEPARTMENT", "ESC/POS printer", "Use Unicode source fixture", ["Print through configured single-byte codepage"], "Conversion is documented; UTF-8 mode is not claimed", ["jobId", "codePage", "photoRef"]),
  physical("PRINT-LONG", "printing", "PRINTER_BY_DEPARTMENT", "ESC/POS printer with paper", "Load 40-line fixture", ["Enqueue long profile", "Inspect complete output"], "No truncation or premature cut", ["jobId", "photoRef"]),
  physical("PRINT-MULTIPLE", "printing", "PRINTER_BY_DEPARTMENT", "ESC/POS printer", "Queue three marked tickets", ["Submit concurrently", "Compare order"], "Three distinct complete tickets", ["jobIds", "photoRef"]),
  physical("PRINT-SIMULTANEOUS", "printing", "ALL_PRINTERS", "Printers for all departments", "Configure both mode", ["Send multi-department order"], "One output per configured destination", ["orderId", "jobIds", "photoRefs"]),
  physical("PRINT-TIMEOUT", "printing", "PRINTER_BY_DEPARTMENT", "Network-controllable printer", "Queue one job", ["Delay/drop TCP", "Restore"], "Retry/backoff then marked recovery", ["jobId", "auditIds"]),
  physical("PRINT-POWER-OFF", "printing", "PRINTER_BY_DEPARTMENT", "Printer", "Power off before send", ["Send", "Power on"], "No job loss; marked recovery", ["jobId", "statusTimeline"]),
  physical("PRINT-PAPER-OUT", "printing", "PRINTER_BY_DEPARTMENT", "Printer", "Remove paper", ["Send job", "Replace paper"], "Operator observes failure/recovery; software does not overclaim status", ["jobId", "photoRef"]),
  physical("PRINT-COVER-OPEN", "printing", "PRINTER_BY_DEPARTMENT", "Printer", "Open cover", ["Send job", "Close cover"], "Behavior documented per model", ["jobId", "photoRef"]),
  physical("PRINT-LAN-LOSS", "printing", "ALL_PRINTERS", "Switch/router", "Queue pending jobs", ["Disconnect LAN", "Restore"], "All jobs remain durable and drain", ["jobIds", "auditIds"]),
  physical("PRINT-FALLBACK", "printing", "PRIMARY_AND_FALLBACK", "Two printers", "Set fallback", ["Disable primary", "Send"], "Exactly one marked fallback output", ["jobId", "photoRef"]),
  physical("PRINT-CUT", "printing", "PRINTER_BY_DEPARTMENT", "Cut-capable printer", "Enable cut", ["Print certification ticket"], "One correct cut", ["jobId", "videoRef"]),
  physical("PRINT-DRAWER", "printing", "CASH_PRINTER", "Compatible drawer", "Enable drawer test", ["Run explicit drawer profile"], "One drawer pulse", ["jobId", "videoRef"]),
  physical("PRINT-RESTART", "printing", "SERVER_AND_PRINTER", "API host + printer", "Leave pending/retrying/sending jobs", ["Restart API", "Observe"], "Durable recovery, visible REENVIADO", ["jobIds", "auditIds"]),

  physical("KDS-MULTI-STATION", "kds", "KDS_ALL", "One display per department", "Configure stations", ["Send one multi-department order"], "Tasks appear only in correct displays", ["orderId", "taskIds", "videoRef"]),
  physical("KDS-CONCURRENT-ORDERS", "kds", "KDS_ALL", "KDS displays", "Prepare seven orders", ["Send concurrently"], "No lost/duplicate/cross-order task", ["orderIds", "taskIds"]),
  physical("KDS-RECONNECT", "kds", "KDS_BY_DEPARTMENT", "Network-controllable display", "Open active KDS", ["Disconnect", "Create task", "Reconnect"], "Polling/refetch recovers authoritative tasks", ["taskIds", "videoRef"]),
  physical("KDS-FSM", "kds", "KDS_BY_PROFILE", "Touch display", "Seed standard/pizza/bar/pase tasks", ["Execute every allowed transition"], "Only profile-valid transitions succeed", ["taskIds", "auditIds"]),
  physical("KDS-REDISPATCH", "kds", "KDS_AND_PRINTER", "KDS + printer", "Prepare one task", ["Redispatch KDS", "Redispatch both"], "Single reset and marked print with audit", ["taskId", "jobId", "auditId"]),
  physical("KDS-PASE", "kds", "KDS_PASE", "Pase display", "Prepare partially ready order", ["Complete departments", "Collect/serve"], "Pase receives full order and notifies waiter", ["orderId", "videoRef"]),

  ...Array.from({ length: 7 }, (_, index) => {
    const id = `D${index + 1}`;
    return physical(
      `TABLET-${id}`,
      "tablet",
      id,
      "Waiter tablet/phone",
      "Staging HTTPS, assigned user and Wi-Fi zone",
      ["PIN login", "Open table", "Add product/modifier", "Send", "Wi-Fi loss/reconnect", "Logout/revoke", "Observe memory"],
      "One authoritative order, no session bleed, reconnect without duplication",
      ["deviceRef", "userRef", "orderId", "latencies", "memoryBeforeAfter", "videoRef"],
    );
  }),
  physical("TABLET-FLEET-7", "tablet", "D1-D7", "Seven devices simultaneously", "Assign seven distinct users/tables", ["Run overlapping service", "Induce one Wi-Fi loss"], "Seven isolated sessions and orders", ["orderIds", "deviceMetrics"]),
  physical("TABLET-PWA", "tablet", "D7", "PWA-capable browser", "Install from explicit TPV URL", ["Cold start", "Update", "Offline shell"], "No stale session or silent offline mutation", ["swVersion", "videoRef"]),

  physical("FICHAJE-PIN", "timeclock", "F1", "Fichaje tablet", "Pair device", ["PIN clock in/out/break", "Network loss"], "Proofs single-use; offline fails closed", ["recordIds", "auditIds"]),
  physical("FICHAJE-TOKEN", "timeclock", "F1", "Fichaje tablet", "Registered token", ["Revoke", "Retry", "Re-pair"], "Revoked token denied; new token works", ["deviceRef", "auditIds"]),
  physical("FICHAJE-NFC", "timeclock", "F2", "Android Web NFC + cards", "HTTPS and assigned test cards", ["Known tap", "Unknown tap", "Revoked tap", "Double tap"], "Correct proof/denial/debounce", ["cardRefs", "auditIds", "videoRef"]),

  physical("BACKUP-LOCAL", "backup", "DEST-A", "Persistent local mount", "Allowlisted staging path", ["Upload", "Verify", "Download", "Restore", "Purge"], "Checksum and manifest match", ["backupId", "truncatedChecksum"]),
  physical("BACKUP-NAS", "backup", "NAS-1", "Real NAS mount", "SMB/NFS mounted outside repo", ["Backup", "Disconnect", "Reconnect", "Restore"], "No partial artifact or data loss", ["destinationRef", "backupId", "restoreReport"]),
  physical("BACKUP-S3", "backup", "S3-1", "Staging S3-compatible bucket", "Credentials only in environment", ["Put", "Head", "Get", "Verify", "Restore", "Delete"], "Round-trip and checksum pass", ["destinationRef", "objectRef", "restoreReport"]),
  physical("BACKUP-SWITCH", "backup", "DEST-A-TO-B", "Two destinations", "Verified baseline on A", ["Upload/verify on B", "Restore from A", "Restore from B"], "Old copy remains until B is proven", ["backupIds", "switchEvidence"]),
  physical("BACKUP-CORRUPTION", "backup", "DEST-A", "Staging destination", "Create valid artifact", ["Tamper artifact", "Attempt verify/restore"], "Corruption rejected and DB unchanged", ["backupId", "rollbackReport"]),
];

cases.sort((a, b) => a.caseId.localeCompare(b.caseId));
fs.writeFileSync(output, `${JSON.stringify({
  delivery: 67,
  baseCommit: "21ca916",
  globalStatus: "PENDING_PHYSICAL_CERTIFICATION",
  caseCount: cases.length,
  rules: {
    automationDoesNotCertifyHardware: true,
    secretsAllowedInEvidence: false,
    productionDataAllowed: false,
  },
  cases,
}, null, 2)}\n`);

console.log(`Entrega 67 physical certification inventory: ${cases.length} pending cases.`);
