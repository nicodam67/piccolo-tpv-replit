# Desinstalación

## Conservar datos

Panel de control → Aplicaciones → Piccolo TPV Server → Desinstalar.

Se eliminan aplicación y tareas automáticas. Permanecen:

- PostgreSQL;
- `%ProgramData%\PiccoloTPV`;
- backups;
- uploads;
- secretos.

## Eliminación completa

Menú Inicio → Piccolo TPV Server → **Desinstalación completa (PELIGRO)**.

El proceso:

1. exige la frase `ELIMINAR PICCOLO Y TODOS LOS DATOS`;
2. crea un dump final y checksum en el Escritorio;
3. exige `ELIMINAR BASE DE DATOS`;
4. elimina la base, aplicación y datos locales.

Si falta `pg_dump` o falla la copia, no se borra nada.
