# Entrega 67 — Certificación física de hardware

## Estado

**LISTO PARA COMENZAR PRUEBAS REALES EN EL RESTAURANTE.**

No hay hardware certificado por esta entrega. Los 39 casos de `certification/entrega67-physical-certification.json` permanecen `PENDING_PHYSICAL_CERTIFICATION`.

## Herramientas preparadas

| Herramienta | Propósito | Seguridad |
|---|---|---|
| `pnpm certify:hardware-readiness` | Snapshot read-only de departments/KDS/printers y 7 clientes concurrentes | Token solo en env; IDs hasheados |
| `pnpm certify:physical-print` | Encola perfiles standard/charset/long/drawer/multiple y recoge cola/audit | Opt-in explícito; no IP/token en evidencia |
| `pnpm --filter @workspace/api-server certify:backup-destinations` | Round-trip A/B local/NAS/S3 y prueba de switch | Staging, dos configs externas, secretos redacted |
| `scripts/run-restore-staging-local.sh` | Restore real PostgreSQL, repetición y rollback | DB efímera/staging |

Salida predeterminada: `/tmp/piccolo-certification`, permisos `0700/0600`. No adjuntar artefactos cifrados, tokens, IP, certificados ni configs de destino.

## Impresoras

### Software validado

- CP858, CP437 y Windows-1252 seleccionables.
- Fuente Unicode convertida explícitamente a la página configurada; no se afirma modo UTF‑8 nativo.
- Perfiles largos, múltiples y drawer.
- TCP connect/write, refusal y timeout.
- Queue durable, prioridades, leases, backoff, fallback, saturation y recovery.
- Reintentos/reprints idempotentes y marcados.

### Prueba física pendiente

- Legibilidad de español/catalán/€ por modelo.
- Ticket largo sin truncado.
- Tres tickets consecutivos y simultáneos por departamentos.
- Apagado, red, papel, tapa y reconexión.
- Corte, cajón y fallback.
- Reinicio con pending/retrying/sending.

`printed` significa bytes aceptados por el socket, nunca confirmación de papel.

## KDS

Software: departamentos dinámicos, FSM, socket/polling, redispatch, idempotencia y siete órdenes concurrentes.

Pruebas físicas:

- una estación por departamento;
- varios pedidos simultáneos;
- corte de LAN con tarea creada durante desconexión;
- recuperación por polling ≤15 s;
- cambios standard/pizza/bar/pase;
- cero tareas duplicadas;
- KDS+printer simultáneo.

## Tablets D1–D7

La matriz JSON incluye siete casos individuales y uno de flota. Por dispositivo registrar únicamente referencias opacas:

- usuario/rol y zona Wi‑Fi;
- login/PIN y latencia;
- mesa/pedido/modificadores/envío;
- desconexión/reconexión;
- memoria inicial/final;
- logout/revocación;
- orientación y actualización PWA.

No certificar offline TPV: la shell puede cargar, pero pedidos offline no están cableados. Offline cash permanece fail-closed.

## Fichaje

Software validado: PIN, pairing, device token, proofs, revoke y auditoría.

PENDING:

- tablet física;
- pérdida de red;
- re-pair tras revoke;
- NFC conocido/desconocido/revocado/doble tap.

No se añade driver NFC; se usa Web NFC existente bajo HTTPS.

## Backup, NAS y S3

El runner de destinos:

1. carga dos configuraciones desde archivos externos;
2. cifra un artefacto de certificación;
3. upload/verify/download en A y B;
4. verifica que A sigue válido tras B;
5. descifra B;
6. purga solo sus artefactos de prueba;
7. guarda evidencia redacted.

Para NAS usar mount real dentro de `BACKUP_LOCAL_ROOTS`. Para S3 usar bucket de staging. Después ejecutar restore PostgreSQL separado. Cambiar destino productivo solo tras restore válido desde ambos.

## Seguridad

- No se reducen guards existentes.
- Harnesses requieren opt-in.
- Tokens/credenciales no se serializan.
- IDs de dispositivos se hashean.
- Evidencia sigue pending hasta attestation humana.
- Route audit, RBAC, sesiones, tablet proofs y secret masking permanecen gates obligatorios.

## Vulnerabilidades

- PostCSS se fija a 8.5.18, parche compatible de build.
- `brace-expansion` producción sigue abierto por cadena ExcelJS/archiver; no se fuerza major incompatible.
- React Router requiere major 8 y queda fuera de esta entrega.
- Esbuild tooling requiere resolución separada por restricciones de peer.

Ejecutar `pnpm audit` y `pnpm audit --prod` en cada run; registrar resultado real.

## Condición de aprobación

Solo cambiar el estado global cuando:

1. todos los casos críticos tengan evidencia física;
2. cero pruebas permanezcan inconclusas;
3. propietario y técnico firmen;
4. restore NAS/S3 se ejecute contra staging;
5. ninguna evidencia contenga secretos;
6. fallos se hayan repetido tras corrección.

Hasta entonces: **PENDING_PHYSICAL_CERTIFICATION**.
