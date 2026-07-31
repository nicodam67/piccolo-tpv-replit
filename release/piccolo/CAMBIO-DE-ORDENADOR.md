# Cambio del ordenador principal

## Preparación en el ordenador antiguo

1. Cierra caja y confirma cola de impresión vacía.
2. Ejecuta backup completo y verifica checksum.
3. Copia también `%ProgramData%\PiccoloTPV\uploads`, `secrets.env` y certificado CA.
4. Conserva el ordenador antiguo apagado, sin desinstalar, hasta finalizar.

## Ordenador nuevo

1. Reserva la misma IP/hostname o planifica el cambio DNS.
2. Instala PostgreSQL 16.
3. Ejecuta `Piccolo-Server-Setup.exe`.
4. Elige **Restaurar** y selecciona el dump con su `.sha256`.
5. Restaura uploads y secretos con permisos SYSTEM/Administrators.
6. Inicia servicios y verifica health/version.

## Reconfiguración de red

1. Actualiza DNS/reserva DHCP si cambia el servidor.
2. Verifica HTTPS y CA en tablets/KDS.
3. Comprueba TCP 9100 desde servidor a cada impresora.
4. Ejecuta ticket de prueba sin afirmar papel hasta observación.

## Aceptación

- [ ] Mesas/pedidos/caja visibles.
- [ ] KDS recibe una comanda.
- [ ] Impresoras responden.
- [ ] Fichaje reconoce tablet.
- [ ] Backup nuevo y restore staging válidos.
- [ ] Ordenador antiguo permanece disponible para rollback.
