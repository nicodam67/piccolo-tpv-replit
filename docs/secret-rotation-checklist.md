# Rotación de secretos

Este repositorio no debe contener valores reales en archivos `.env*`, snapshots,
fixtures ni documentación. Los secretos se inyectan desde el gestor del entorno.

## Incidente heredado pendiente

La rama eliminó un `CONVEX_IMPORT_SECRET` y un snapshot de usuario que estaban
versionados. El historial Git **no se ha reescrito**, porque no existe
autorización para alterar commits publicados. Por ello, el valor expuesto debe
considerarse comprometido aunque ya no aparezca en el árbol actual.

Acciones operativas pendientes:

- [ ] Revocar y regenerar `CONVEX_IMPORT_SECRET` en el despliegue Convex heredado.
- [ ] Revisar los logs de importación desde la primera exposición del secreto.
- [ ] Invalidar sesiones asociadas al identificador de usuario expuesto.
- [ ] Confirmar que los backups externos también fueron redactados.
- [ ] Autorizar explícitamente una limpieza de historial si la política del
      repositorio exige eliminar datos personales de objetos Git antiguos.

## Procedimiento de rotación

1. Generar el reemplazo con un CSPRNG y guardarlo únicamente en el gestor de
   secretos.
2. Desplegar consumidores compatibles con el valor nuevo.
3. Revocar el valor anterior.
4. Invalidar sesiones o credenciales derivadas.
5. Verificar que logs, URLs, snapshots y artefactos no contienen el valor.
6. Ejecutar la búsqueda de secretos y las pruebas de autenticación.
7. Registrar fecha, responsable, alcance y resultado fuera del repositorio.

## Inventario

| Secreto | Efecto al rotar | Verificación mínima |
|---|---|---|
| `SESSION_SECRET` | Invalida JWT y proofs firmados | Login, logout y rechazo de tokens antiguos |
| `BOOTSTRAP_SECRET` | Protege el primer administrador | Retirarlo tras bootstrap; endpoint cerrado |
| `CONVEX_IMPORT_SECRET` | Autoriza importaciones QR heredadas | Importación rechaza el valor antiguo |
| `STRIPE_SECRET_KEY` | Acceso API Stripe | Pago de prueba y webhook válido |
| `STRIPE_WEBHOOK_SECRET` | Firma de webhooks | Firma antigua rechazada |
| `SIMULATOR_WEBHOOK_SECRET` | Webhook de simulación | Secreto incorrecto devuelve 403 |
| `DATABASE_URL` | Acceso PostgreSQL | Migraciones, arranque y health check |

Nunca registrar valores, hashes reversibles, tokens completos ni URLs con
credenciales. La evidencia de rotación debe usar identificadores o fingerprints.
