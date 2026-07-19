# Piccolo QR — Import Scripts

Scripts de importación reanudable para migrar el backup del menú al nuevo
proyecto Convex. Todos los scripts se ejecutan con `tsx` y son idempotentes:
si se interrumpen y se relancen, retoman desde donde lo dejaron.

---

## Requisitos

| Variable de entorno | Descripción |
|---------------------|-------------|
| `CONVEX_URL` | URL del nuevo proyecto Convex (`https://xxx.convex.cloud`) |
| `CONVEX_IMPORT_SECRET` | Secret de importación configurado en Convex env vars |

Instala las dependencias antes de ejecutar:

```bash
pnpm install
```

---

## Estructura del backup

Los scripts esperan un directorio con esta estructura:

```
backup/
  categories/
    documents.jsonl        # Una categoría por línea (JSONL)
  menuItems/
    documents.jsonl        # Un producto por línea
  branding/
    documents.jsonl        # Documento de branding (único)
  _storage/
    documents.jsonl        # Metadatos de archivos de Storage
  media/
    piccolo_qr_media_01.zip   # Archivos de imagen (hasta 200 MB cada uno)
    piccolo_qr_media_02.zip
    piccolo_qr_media_03.zip
    piccolo_qr_media_04.zip
```

También se soporta el formato plano (`backup/categories.jsonl`, etc.).

El backup de Piccolo está en `import_piccolo_qr/` dentro de este proyecto.

---

## Orden de ejecución

Ejecuta los scripts **en este orden**:

### Paso 1 — Importar datos estructurados

```bash
CONVEX_URL=https://xxx.convex.cloud \
CONVEX_IMPORT_SECRET=your-secret \
npx tsx scripts/import-data.ts --input ./import_piccolo_qr
```

Importa **categorías → productos → branding** en ese orden (las categorías
deben existir antes de importar productos). Guarda el mapa de IDs en
`import_piccolo_qr/.id-map.json`.

**Opciones:**
- `--batch 25` — tamaño de lote (default: 25)
- `--force` — re-importa aunque ya existan registros

---

### Paso 2 — Subir imágenes

```bash
CONVEX_URL=https://xxx.convex.cloud \
CONVEX_IMPORT_SECRET=your-secret \
npx tsx scripts/import-images.ts --input ./import_piccolo_qr
```

Sube los archivos de los ZIPs a Convex Storage y actualiza los campos
`imageStorageId`/`heroImageStorageId` con los nuevos IDs. Genera
`import_piccolo_qr/images-report.json`.

**Requisito previo:** Las ZIPs deben estar en `import_piccolo_qr/media/`.

**Opciones:**
- `--dry-run` — muestra qué subiría sin hacer cambios

---

### Paso 3 — Verificar

```bash
CONVEX_URL=https://xxx.convex.cloud \
CONVEX_IMPORT_SECRET=your-secret \
npx tsx scripts/verify-import.ts --input ./import_piccolo_qr
```

Compara el backup con los datos en Convex y genera
`import_piccolo_qr/verify-report.json`.

Comprueba: totales por tabla, refs de categoría, refs de imagen, errores
en el log de importación.

---

### Paso 4 — Generar informe final

```bash
npx tsx scripts/export-import-report.ts \
  --input ./import_piccolo_qr \
  --output ./MIGRATION_REPORT.md
```

Combina `images-report.json`, `verify-report.json` e `.id-map.json` en
un informe Markdown listo para entregar.

---

## Reanudar una importación interrumpida

El sistema es completamente reanudable. Si el proceso se interrumpe:

1. Simplemente vuelve a ejecutar el mismo script.
2. Los registros ya presentes en `importLog` se saltan automáticamente.
3. El archivo `.id-map.json` persiste los IDs entre ejecuciones.

Para **reiniciar** la importación de una tabla desde cero:
```bash
# Desde una shell de Convex o HTTP, llama a:
importSupport:clearImportLog  { table: "menuItems", secret: "..." }
# Luego borra la entrada correspondiente en .id-map.json
# y vuelve a ejecutar import-data.ts
```

---

## Scripts heredados (`scripts/import/`)

Los scripts numerados en `scripts/import/` son el origen de los scripts
principales y contienen la misma lógica con la ruta de datos fijada a
`import_piccolo_qr/`. Se mantienen para referencia.

| Script | Equivalente |
|--------|-------------|
| `scripts/import/01-import-tables.ts` | `scripts/import-data.ts` |
| `scripts/import/02-import-storage.ts` | `scripts/import-images.ts` |
| `scripts/import/03-verify.ts` | `scripts/verify-import.ts` |

---

## Funciones Convex de soporte (`convex/importSupport.ts`)

| Función | Tipo | Descripción |
|---------|------|-------------|
| `importBatch` | mutation | Inserta un lote de registros y los registra en `importLog` |
| `markImported` | mutation | Registra manualmente un ID en `importLog` (upsert) |
| `checkImported` | query | Comprueba si un ID externo ya fue importado |
| `getImportLog` | query | Devuelve el log de una tabla |
| `getImportSummary` | query | Cuenta ok/error/skipped por tabla |
| `clearImportLog` | mutation | Borra el log de una tabla (para reiniciar) |
| `patchDocument` | mutation | Actualiza campos de un documento (para storage refs) |
| `generateImportUploadUrl` | mutation | Genera una URL de subida a Convex Storage |
| `countTable` | query | Cuenta documentos en una tabla |

Todas las funciones requieren el parámetro `secret` (igual a `CONVEX_IMPORT_SECRET`).
