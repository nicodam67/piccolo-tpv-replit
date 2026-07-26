# Entrega 70 — Preparación final para instalación y pruebas reales

## Resultado objetivo

El propietario recibe un único ZIP con:

- instalador TPV Windows;
- instalador/configurador del servidor;
- guía rápida;
- manual del propietario;
- manuales de actualización, recuperación y cambio de ordenador;
- checklist de instalación;
- checklist de 39 pruebas físicas;
- checksums internos.

Versión: **Piccolo TPV 0.9.0-rc.1 — Solo para pruebas**.

## Asistente

Doce pasos guiados:

1. restaurante/fiscalidad;
2. PostgreSQL;
3. carta inicial opcional;
4. ordenador principal;
5. impresoras;
6. departamentos;
7. KDS;
8. tablets D1–D7;
9. tablet de fichaje;
10. NAS/S3;
11. red;
12. backups/restore.

Cada paso detecta estado, faltas, errores y enlace de corrección.

## Carta inicial

- CSV, XLSX y JSON QR compatible.
- Preview sin escritura.
- Corrección inline y revalidación.
- Precio, IVA, categoría, departamento, alérgenos e imagen HTTPS.
- Duplicados por código y nombre/categoría.
- Default create-only; overwrite solo con autorización admin explícita.
- Confirmación transaccional e idempotente.
- Auditoría de upload/validación/confirmación/descarte.
- Informe por fila y totales.

## TPV → QR

PostgreSQL es el único catálogo:

- import y CRUD escriben las tablas TPV;
- `/carta` lee `/api/public/menu`;
- refresco automático cada 30 segundos y al volver a la app;
- traducciones, precios, media ración, visibilidad, agotados, etiquetas, alérgenos e imágenes URL salen del mismo registro;
- el artefacto Convex antiguo no se distribuye ni se convierte en segundo catálogo.

## Límites

- Los instaladores son RC.
- La firma Authenticode sigue ausente.
- La ejecución Windows física y el power-cycle se validan mediante CI Windows y jornada real.
- Impresoras, KDS, siete tablets, NFC y NAS/S3 siguen pendientes de certificación física.
- No se declara producción.
