# Manual del propietario — Piccolo TPV 0.9.0-rc.1

## Primer inicio

1. Instala `Piccolo-Server-Setup.exe`.
2. Completa el configurador de PostgreSQL y red.
3. Instala `Piccolo-TPV-Setup.exe`.
4. Abre `/setup`.
5. Abre `/admin/instalacion/asistente`.
6. Completa los 12 pasos, incluida la carta inicial si procede.

## Orden recomendado

1. Restaurante, dirección, fiscalidad, idioma y zona horaria.
2. PostgreSQL.
3. Carta inicial CSV/XLSX/QR.
4. Ordenador principal.
5. Impresoras.
6. Departamentos.
7. KDS.
8. Tablets D1–D7.
9. Tablet de fichaje.
10. NAS/S3.
11. Red.
12. Backup y restore.

## Operación diaria

- Comprueba que la pantalla de salud no muestra errores.
- No actualices durante caja abierta, impresiones o backups.
- No apagues el servidor desde el botón físico: usa el apagado de Windows.
- Revisa la copia verificada de las últimas 24 horas.
- Ante una impresión dudosa, consulta cola/auditoría antes de reenviar.

## Carta y QR

El TPV PostgreSQL es la única fuente del catálogo. La carta pública `/carta` se actualiza automáticamente. No edites el antiguo catálogo Convex.

## Estado de esta versión

Es una versión candidata para pruebas. Las 39 pruebas físicas deben completarse en el asistente antes del piloto. No está declarada como producción.
