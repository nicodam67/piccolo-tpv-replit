# Exportación completa del proyecto Piccolo TPV

> Cómo producir un ZIP completo, reproducible y seguro del proyecto.

## Qué incluye la exportación

- Frontend React/Vite (`artifacts/piccolo-tpv/src/`)
- Backend Express (`artifacts/api-server/src/`)
- Esquema de base de datos y migraciones (`lib/db/`)
- Cliente API generado (`lib/api-client-react/`)
- Esquemas Zod compartidos (`lib/api-zod/`)
- Configuración de monorepo (pnpm workspaces)
- Documentación (`docs/`, `*.md`)
- Tests y configuración de CI
- Scripts de utilidad

## Qué excluye la exportación

- `node_modules/` (se reconstruye con `pnpm install`)
- `.git/` (historial de versiones — exportar por separado si se necesita)
- `dist/`, `build/`, `.cache/` (artefactos de compilación)
- `.env`, `.env.local`, `.env.production` (secretos reales)
- `*.log`, archivos temporales
- Backups grandes de la base de datos

---

## Pasos para exportar

### Paso 1 — Verificar que no hay secretos en el código

```bash
# Buscar posibles secretos hardcodeados antes de exportar
grep -r "SESSION_SECRET\|sk_live\|pk_live\|DATABASE_URL" \
  --include="*.ts" --include="*.tsx" --include="*.js" \
  --exclude-dir=node_modules --exclude-dir=.git \
  . | grep -v "process.env\|import.meta.env\|example\|\.md"
```

Si aparece algún resultado, revisar y eliminar el secreto antes de continuar.

### Paso 2 — Limpiar artefactos de compilación

```bash
# Desde la raíz del workspace
find . -name "dist" -type d \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -exec rm -rf {} + 2>/dev/null; true

find . -name ".cache" -type d \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -exec rm -rf {} + 2>/dev/null; true
```

### Paso 3 — Crear el ZIP

```bash
# Desde el directorio PADRE del workspace (un nivel arriba)
cd ..

# Nombre del archivo con fecha
EXPORT_NAME="piccolo-tpv-export-$(date +%Y%m%d).zip"

zip -r "$EXPORT_NAME" workspace/ \
  --exclude "workspace/node_modules/*" \
  --exclude "workspace/*/node_modules/*" \
  --exclude "workspace/*/*/node_modules/*" \
  --exclude "workspace/.git/*" \
  --exclude "workspace/*/dist/*" \
  --exclude "workspace/*/.cache/*" \
  --exclude "workspace/**/*.log" \
  --exclude "workspace/.env" \
  --exclude "workspace/**/.env" \
  --exclude "workspace/**/.env.local" \
  --exclude "workspace/**/.env.production"

echo "Exportación creada: $EXPORT_NAME ($(du -sh $EXPORT_NAME | cut -f1))"
```

### Paso 4 — Verificar la exportación

```bash
# Listar el contenido del ZIP para confirmar que incluye lo esperado
unzip -l "$EXPORT_NAME" | grep -E "src/|migrations/|schema/" | head -30

# Verificar que NO incluye secretos
unzip -p "$EXPORT_NAME" "workspace/.env" 2>/dev/null \
  && echo "⚠️ WARNING: .env incluido" \
  || echo "✅ .env correctamente excluido"

# Verificar tamaño razonable (<50MB sin node_modules)
du -sh "$EXPORT_NAME"
```

### Paso 5 — Verificar que el proyecto se puede reproducir

En un entorno limpio, descomprimir y ejecutar:

```bash
unzip piccolo-tpv-export-YYYYMMDD.zip
cd workspace

# Instalar dependencias
pnpm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con valores reales (DATABASE_URL, SESSION_SECRET)

# Aplicar migraciones a la base de datos
cd lib/db
DATABASE_URL=<url> pnpm drizzle-kit push
cd ../..

# Compilar y arrancar el backend
pnpm --filter @workspace/api-server run dev

# En otra terminal, arrancar el frontend
pnpm --filter @workspace/piccolo-tpv run dev
```

---

## Exportación solo del código fuente (más ligera)

Si solo se necesita el código fuente sin archivos de configuración de Replit:

```bash
zip -r piccolo-tpv-src-$(date +%Y%m%d).zip workspace/ \
  --exclude "workspace/node_modules/*" \
  --exclude "workspace/*/node_modules/*" \
  --exclude "workspace/*/.git/*" \
  --exclude "workspace/.git/*" \
  --exclude "workspace/*/dist/*" \
  --exclude "workspace/*/.cache/*" \
  --exclude "workspace/.cache/*" \
  --exclude "workspace/**/*.log" \
  --exclude "workspace/.env*" \
  --exclude "workspace/**/.env*" \
  --include "workspace/artifacts/piccolo-tpv/src/*" \
  --include "workspace/artifacts/api-server/src/*" \
  --include "workspace/lib/db/*" \
  --include "workspace/lib/api-client-react/src/*" \
  --include "workspace/lib/api-zod/src/*" \
  --include "workspace/docs/*" \
  --include "workspace/package.json" \
  --include "workspace/pnpm-workspace.yaml" \
  --include "workspace/.env.example" \
  --include "workspace/README.md" \
  --include "workspace/EXPORT_PROJECT.md"
```

---

## Alternativa: exportar desde la UI de Replit

1. En el panel lateral de Replit, hacer clic en los tres puntos (...) del proyecto.
2. Seleccionar **Download as zip**.
3. Replit excluye `node_modules` automáticamente.
4. **Nota:** Esta opción puede agotar tiempo en proyectos grandes (+280 MB de código). Usar los comandos shell anteriores si falla.

---

## Restaurar a partir del ZIP

```bash
unzip piccolo-tpv-export-YYYYMMDD.zip
cd workspace

# 1. Instalar dependencias
pnpm install

# 2. Configurar entorno
cp .env.example .env
nano .env  # rellenar DATABASE_URL y SESSION_SECRET

# 3. Crear la base de datos y aplicar migraciones
cd lib/db
pnpm drizzle-kit push

# 4. (Opcional) Sembrar datos iniciales de empleados
cd ../..
curl -X POST http://localhost:8080/api/setup/seed-employees

# 5. Arrancar todo
pnpm --filter @workspace/api-server run dev &
pnpm --filter @workspace/piccolo-tpv run dev
```

---

## Archivos esenciales para reproducibilidad

| Archivo | Función |
|---|---|
| `package.json` | Workspaces del monorepo |
| `pnpm-workspace.yaml` | Configuración de pnpm workspaces |
| `pnpm-lock.yaml` | Lockfile de dependencias (versiones exactas) |
| `lib/db/migrations/*.sql` | Todas las migraciones (base de datos) |
| `lib/db/src/schema/` | Esquema Drizzle completo |
| `.env.example` | Plantilla de variables de entorno |
| `tsconfig.base.json` | Configuración TypeScript compartida |
| `artifacts/api-server/build.mjs` | Script de compilación del backend |

Si alguno de estos archivos falta en el ZIP, el proyecto no podrá reproducirse.
