---
name: ExcelJS migration
description: xlsx replaced with exceljs in all 4 route files; key API differences and test mock fix.
---

# ExcelJS migration (xlsx removed)

**Why:** xlsx 0.18.5 has a known CVE (R1 production risk). ExcelJS is the actively maintained replacement.

## Files changed
- `artifacts/api-server/src/routes/products.ts`
- `artifacts/api-server/src/routes/director.ts`
- `artifacts/api-server/src/routes/hr-import.ts`
- `artifacts/api-server/src/routes/backup.ts`

## Export pattern (sync context)
```ts
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("Sheet Name");
if (rows.length > 0) {
  ws.columns = Object.keys(rows[0]).map((k) => ({ header: k, key: k, width: 20 }));
  ws.addRows(rows);
}
const buf = Buffer.from(await wb.xlsx.writeBuffer());
```
Route handler must be `async` — writeBuffer() is async.

## Import (parse) pattern
```ts
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(buf);
const ws = wb.worksheets[0];
const headers: string[] = [];
ws.getRow(1).eachCell((cell, colNum) => { headers[colNum - 1] = String(cell.value ?? "").trim(); });
const rows: RawRow[] = [];
ws.eachRow((row, rowNum) => {
  if (rowNum === 1) return;
  const obj: RawRow = {};
  row.eachCell({ includeEmpty: true }, (cell, colNum) => {
    const h = headers[colNum - 1];
    if (h) obj[h] = cell.value ?? "";
  });
  rows.push(obj);
});
```

## hr-import.ts specific
- `parseFile()` made async (was sync) — update call site with `await parseFile(...)`
- `.xls` support dropped — ExcelJS only handles `.xlsx`
- Removed `"application/vnd.ms-excel"` from allowed MIME types
- Dates in cells: check `cell.value instanceof Date` → `.toISOString()`

**How to apply:** Any new route that exports or imports spreadsheets must use ExcelJS, never xlsx.
