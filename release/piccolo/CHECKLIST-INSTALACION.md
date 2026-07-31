# Checklist de instalación

## Antes

- [ ] Windows 10/11 x64, 8 GB RAM recomendados, 20 GB libres.
- [ ] IP/hostname del servidor reservado.
- [ ] PostgreSQL 16 disponible o instalador oficial aceptado.
- [ ] Puertos 443, 5432 y 8080 libres según arquitectura.
- [ ] Red privada activa; impresoras accesibles por TCP 9100.
- [ ] Ubicación NAS/S3 y credenciales preparadas fuera de este documento.

## Servidor

- [ ] Checksum de `Piccolo-Server-Setup.exe` verificado.
- [ ] Configurador finaliza sin editar `.env`.
- [ ] PostgreSQL detectado y migraciones verificadas.
- [ ] `PiccoloTPVServer` y `PiccoloTPVCaddy` registrados al arranque.
- [ ] `https://piccolo.local/api/healthz` responde.
- [ ] CA pública de Caddy instalada en dispositivos.

## Asistente — 12 pasos

- [ ] Restaurante/datos fiscales.
- [ ] PostgreSQL.
- [ ] Carta inicial opcional importada/revisada.
- [ ] Ordenador principal.
- [ ] Impresoras.
- [ ] Departamentos.
- [ ] KDS.
- [ ] Tablets D1–D7.
- [ ] Tablet de fichaje.
- [ ] NAS/S3.
- [ ] Red local.
- [ ] Backup verificado y restore staging.

## Clientes

- [ ] TPV Windows abre desde escritorio.
- [ ] PWA camarero instalada en siete dispositivos.
- [ ] PWA fichaje instalada/emparejada.
- [ ] KDS kiosco abre departamento correcto.
- [ ] Versión visible `0.9.0-rc.1 — Solo para pruebas`.
