# Entrega 68 — Asistente de instalación y certificación física

## Objetivo

La ruta `/admin/instalacion/asistente` reúne la puesta en marcha sin duplicar los módulos existentes. Cada paso muestra detección actual, configuración correcta, faltas, errores, correcciones y enlace al editor autorizado.

## Pasos

1. Ordenador principal — inventario administrativo.
2. Impresoras — configuración TCP y último estado del worker.
3. KDS — estaciones y último ping HTTP.
4. Tablets — inventario D1–D7 y `lastSeen` TPV/fichaje.
5. NAS/S3 — destinos y schedules persistidos.
6. Red local — registro, conflictos y equipos inalcanzables.
7. Backups — schedule y copia válida/verificada menor de 24 horas.

PostgreSQL se comprueba con `SELECT 1` y latencia real. La pantalla actualiza cada 10 segundos. Los estados indican el método de detección y no convierten conectividad TCP en certificación física.

## Checklist

El catálogo canónico sigue siendo `certification/entrega67-physical-certification.json`.

Los 39 estados operativos se guardan como eventos append-only en `installation_tests`:

```text
test_type = entrega67:<caseId>
result = pending | in_progress | passed | failed | not_applicable
performed_by = identidad de sesión
performed_at = fecha/hora del servidor
notes = observaciones redacted
metadata = área y referencias de evidencia redacted
```

No se modifica el JSON canónico y ninguna automatización marca una prueba como superada. La identidad enviada por el navegador se ignora.

## Exportación PDF

`GET /api/admin/installation/certification/export?format=html&print=1` genera un documento A4 autocontenido y abre el diálogo del navegador para guardar como PDF.

Incluye:

- configuración y versión;
- diagnóstico de los siete pasos;
- resumen de dispositivos;
- 39 pruebas con operador, fecha/hora y observaciones;
- incidencias abiertas;
- estado global y límite de certificación física.

El mismo snapshot está disponible en JSON para administradores. El informe elimina tokens, secretos, IPv4/IPv6 y MAC. No contiene configuración sensible de destinos.

## Seguridad

- Vista y checklist: `admin`, `manager`, `encargado`.
- Exportación completa: solo `admin`.
- Mutaciones: idempotencia obligatoria.
- Auditoría: `installation_tests` y `tech_events`.
- Fallos requieren observaciones.
- Evidencia y texto libre se redacted en servidor.
- RBAC, fail-closed y recuperación existentes no se modifican.

## Persistencia

No se añade migración. Se reutilizan:

- `installation_tests`;
- `installation_devices`;
- `network_registry`;
- `tech_events`;
- `printers`, `kds_stations`, `offline_devices`, `tablet_devices`;
- `backup_destinations`, `backup_schedules`, `backup_records`.

El seed inicial pasa de cinco a siete tablets para coincidir con D1–D7.

## Límites honestos

- Estado de impresora: estado pasivo/TCP; no confirma papel.
- KDS: último ping HTTP; no confirma visualización de tareas.
- Tablet: `lastSeen` menor de cinco minutos; no mide cobertura Wi‑Fi.
- NAS/S3: configuración detectada; el round-trip requiere harness.
- Backup: copia válida/verificada; restore real sigue siendo una prueba separada.
- PDF: HTML A4 + diálogo de impresión, patrón ya usado por informes X/Z; no se añade dependencia PDF.

## Validación

- 28 migraciones aplicadas en PostgreSQL limpio; Entrega 68 no añade migración.
- 74 archivos / 813 tests API aprobados.
- 28/28 E2E aprobados.
- Cobertura focalizada nueva: 4 casos unitarios, 5 integraciones PostgreSQL y 2 escenarios E2E.
- TypeScript, ESLint y builds API/TPV aprobados.
- Route audit: 64 archivos, cero rutas sin guard.
- Performance: 250 requests, cero errores; printing p95 9,2 ms.
- Walkthrough UI: persistencia `En progreso`, refresco del resumen y preview PDF verificados.
- Dependencias: 4 high en árbol completo y 2 high productivas, sin cambio respecto a Entrega 67.
