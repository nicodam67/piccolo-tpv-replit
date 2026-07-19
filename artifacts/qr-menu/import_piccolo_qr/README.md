# Piccolo QR — Datos de importación

Exportación del proyecto Convex original (kindhearted-viper-426) para importar
en el nuevo proyecto independiente.

## Contenido

| Carpeta | Fichero | Registros | Descripción |
|---------|---------|-----------|-------------|
| `branding/` | `documents.jsonl` | 1 | Configuración visual, horarios, colores, fuentes |
| `categories/` | `documents.jsonl` | 26 | Categorías del menú (20 raíz + 6 sub-Vinos) |
| `menuItems/` | `documents.jsonl` | 195 | Platos (172 con imagen, 23 sin imagen) |
| `_storage/` | `documents.jsonl` | 262 | Metadatos de archivos (186 PNG, 69 JPEG, 5 MP4, 2 WEBP) |

Los archivos de imagen/video están en los paquetes de media (NO incluidos aquí):
- `piccolo_qr_media_01.zip` — 58 archivos (~111 MB)
- `piccolo_qr_media_02.zip` — 63 archivos (~118 MB)
- `piccolo_qr_media_03.zip` — 78 archivos (~120 MB)
- `piccolo_qr_media_04.zip` — 63 archivos (~116 MB)

Cada archivo de media se identifica por su `internalId` (UUID) en `_storage/documents.jsonl`.

## Cómo importar

Ver `../scripts/import/` para los scripts de importación reanudable.

```bash
# Importar tablas (categorías → ítems → branding)
cd artifacts/qr-menu
CONVEX_URL=https://TU-PROYECTO.convex.cloud \
CONVEX_IMPORT_SECRET=tu-secret \
  pnpm tsx scripts/import/01-import-tables.ts

# Importar archivos de media (después de subir los ZIP)
CONVEX_URL=... CONVEX_IMPORT_SECRET=... \
  pnpm tsx scripts/import/02-import-storage.ts

# Verificar
CONVEX_URL=... CONVEX_IMPORT_SECRET=... \
  pnpm tsx scripts/import/03-verify.ts
```
