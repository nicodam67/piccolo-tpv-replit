# Piccolo QR — Migration Log

## Estado inicial (Task #272 — 2026-07-19)

### Proyecto Convex actual
| Campo | Valor |
|-------|-------|
| URL deployment | `https://kindhearted-viper-426.convex.cloud` |
| Propietario | Proyecto Hércules compartido |
| Auth provider | OIDC de Hércules (`hercules-auth.com`) |

### Variables de entorno presentes
| Variable | Tipo | Descripción |
|----------|------|-------------|
| `VITE_CONVEX_URL` | env var (shared) | URL del Convex de Hércules |
| `VITE_HERCULES_OIDC_AUTHORITY` | env var (shared) | Dominio OIDC de Hércules |
| `VITE_HERCULES_OIDC_CLIENT_ID` | env var (shared) | Client ID OIDC de Hércules |
| `VITE_HERCULES_WEBSITE_ID` | env var (shared) | ID de website en Hércules |
| `SESSION_SECRET` | secret | Secret de sesión (TPV, no del QR) |

### Esquema Convex existente
| Tabla | Descripción |
|-------|-------------|
| `users` | Perfiles de usuario sincronizados desde OIDC |
| `categories` | Categorías del menú (nombre, orden, parentId, traducciones) |
| `branding` | Configuración visual, horarios, fuentes, colores |
| `menuItems` | Productos (precio, alérgenos, tags, media ración, imagen) |

### Dependencias de Hércules en el código
| Fichero | Dependencia |
|---------|-------------|
| `convex/auth.config.ts` | `HERCULES_OIDC_AUTHORITY`, `HERCULES_OIDC_CLIENT_ID` |
| `convex/translate.ts` | `https://ai-gateway.hercules.app/v1`, `HERCULES_API_KEY` |
| `src/components/providers/auth.tsx` | `@usehercules/auth` |
| `src/components/providers/convex.tsx` | `@usehercules/auth/convex-react` |
| `src/components/ui/signin.tsx` | `@usehercules/auth/react` |
| `src/hooks/use-auth.ts` | `@usehercules/auth/react` |
| `src/lib/demo-hercules-convex.tsx` | `@usehercules/auth/convex-react` |
| `src/pages/auth/Callback.tsx` | OIDC callback handler |
| `src/pages/print/page.tsx` | auth check vía Hércules |
| `src/pages/admin/_components/FontManager.tsx` | `hercules-cdn.com` (fuentes) |
| `index.html` | `hercules-cdn.com` (preload de fuentes) |
| `vite.config.ts` | `@usehercules/vite` plugin |
| `package.json` | `@usehercules/auth`, `@usehercules/vite`, `oidc-client-ts`, `react-oidc-context` |

### Paquetes de Hércules en package.json
- `@usehercules/auth` ^1.0.42
- `@usehercules/vite` ^1.0.41
- `oidc-client-ts` ^3.5.0
- `react-oidc-context` ^3.3.1

---

## Cambios realizados en Task #272

### Esquema (`convex/schema.ts`)
- ✅ Conservadas todas las tablas existentes sin modificar ningún campo
- ✅ Añadida tabla `admins` para autenticación propia
- ✅ Añadida tabla `importLog` para importación reanudable

### Auth config (`convex/auth.config.ts`)
- ✅ Eliminada dependencia de `HERCULES_OIDC_AUTHORITY` y `HERCULES_OIDC_CLIENT_ID`
- ✅ Preparada para configurar el provider de auth propio en Task #273

### Secrets solicitados al usuario
- `CONVEX_DEPLOY_KEY` — clave de despliegue del nuevo proyecto Convex (el usuario la obtiene en dashboard.convex.dev)
- `AUTH_SECRET` — secret para firmar tokens JWT de auth propia
- `ADMIN_EMAIL` — email del administrador inicial
- `ADMIN_PASSWORD_HASH` — hash bcrypt de la contraseña del administrador

---

## Próximos pasos

- **Task #273**: Implementar autenticación email+contraseña con `@convex-dev/auth`
- **Task #274**: Construir scripts de importación reanudable
- **Task #275**: Eliminar paquetes y variables de Hércules, preparar capa compartida con TPV

---

## Variables de entorno nuevas (tras migración)

| Variable | Entorno | Descripción |
|----------|---------|-------------|
| `VITE_CONVEX_URL` | shared | URL del nuevo Convex de Piccolo (reemplaza la de Hércules) |
| `CONVEX_DEPLOY_KEY` | secret | Deploy key del nuevo proyecto |
| `AUTH_SECRET` | secret | Secret JWT para sesiones del panel admin |
| `ADMIN_EMAIL` | secret | Email del primer administrador |
| `ADMIN_PASSWORD_HASH` | secret | Hash bcrypt de la contraseña del admin |
| `APP_BASE_URL` | shared | URL pública del QR Menú (p.ej. https://piccolo.example.com/qr-menu) |

## Variables de entorno a eliminar (tras migración completa)

| Variable | Motivo |
|----------|--------|
| `VITE_HERCULES_OIDC_AUTHORITY` | Auth propia reemplaza OIDC |
| `VITE_HERCULES_OIDC_CLIENT_ID` | Auth propia reemplaza OIDC |
| `VITE_HERCULES_WEBSITE_ID` | Ya no se usa con auth propia |
