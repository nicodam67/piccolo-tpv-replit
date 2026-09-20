# Piccolo TPV

Monorepo del TPV Piccolo. La carta QR oficial se mantiene en el repositorio independiente `nicodam67/piccolo-qr-menu`; ambos repositorios todavia no estan integrados.

## Instalacion

```bash
pnpm install --frozen-lockfile
```

Variables minimas: copiar `.env.example`, configurar `DATABASE_URL` y `SESSION_SECRET`, y ejecutar:

```bash
pnpm --filter @workspace/db migrate
```

## Verificacion

```bash
pnpm run typecheck
pnpm run lint
pnpm --filter @workspace/api-server run test
pnpm run build
pnpm audit
```

El build raiz procesa nueve paquetes del workspace y ya no incluye una aplicacion QR heredada.

## QR externo

Configurar opcionalmente una URL HTTPS:

```env
PICCOLO_QR_MENU_URL=https://menu.example.com
```

Si no se configura, el TPV no muestra enlaces rotos. Consulta `docs/external-qr-configuration.md`.
