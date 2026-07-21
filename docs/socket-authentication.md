# Autenticación y aislamiento de Socket.IO

## Handshake

`artifacts/api-server/src/lib/socket.ts` acepta:

- cookie HttpOnly `piccolo_session` para navegador;
- `auth.token` o `Authorization: Bearer` para clientes no web.

El token se valida mediante la misma función que REST:

- firma y expiración JWT;
- `jti` no revocado;
- fallo cerrado si no puede consultarse la revocación;
- rol conocido.

No se acepta `restaurantId` del cliente. `RESTAURANT_ID` se normaliza desde el
entorno del servidor.

## Rooms

Cada conexión autenticada entra en:

- `restaurant:<id>`;
- `restaurant:<id>:employee:<employeeId>`;
- uno o más rooms funcionales: `floor`, `kds`, `cash`, `inventory`, `admin`.

La asignación funcional se deriva exclusivamente del rol. Los eventos de
negocio se emiten mediante `socket-events.ts` al room mínimo necesario; no se
usa broadcast global. Los eventos entrantes distintos del heartbeat `ping`
reciben `socket:error`.

## Roles

| Rol | Rooms |
|---|---|
| admin, manager | todos |
| encargado | floor, kds, cash, inventory |
| waiter | floor |
| cashier | cash |
| kitchen | kds |
| desconocido/anónimo | handshake rechazado |

## Cliente

`connectAuthenticatedSocket()` activa `withCredentials`; JavaScript no accede
a la cookie. La reconexión repite el handshake y, por tanto, vuelve a comprobar
expiración y revocación.

## Pruebas

`socket-reconnect.test.ts` demuestra rechazo anónimo, expirado, revocado y por
rol; rooms resueltos por servidor; aislamiento floor/KDS; reconexión y rechazo
de eventos entrantes no autorizados.
