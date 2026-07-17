# API Client — Piccolo TPV

> How to make authenticated requests from the frontend, handle errors, and use advanced features (idempotency keys, manager authorization tokens).

---

## Base Setup

The frontend uses a thin wrapper around `fetch` exported from
`artifacts/piccolo-tpv/src/lib/api.ts`. It automatically:

- Prepends `BASE_URL` (Vite's `import.meta.env.BASE_URL`) to every path.
- Attaches the JWT from `localStorage` as `Authorization: Bearer <token>`.
- Throws on non-2xx responses so callers can `catch` errors.

```typescript
import { api } from "@/lib/api";

// GET
const zones = await api.get("/zones");

// POST
const order  = await api.post("/orders", { tableId: "..." });

// PATCH
const updated = await api.patch(`/order-items/${itemId}`, { quantity: 2 });

// DELETE
await api.delete(`/zones/${zoneId}`);
```

---

## Authentication

### Login

```typescript
const { token, employee } = await api.post("/auth/pin", {
  employeeId: "...",
  pin: "1234",
});
localStorage.setItem("token", token);
// The api client picks it up automatically on the next request
```

### Logout

Always await the 200 before clearing state. Do NOT clear if 503.

```typescript
try {
  await api.post("/auth/logout");
  localStorage.removeItem("token");
  navigate("/login");
} catch (err) {
  if (err?.status === 503) {
    toast.error("No se pudo cerrar sesión. Inténtalo de nuevo.");
    // Keep token in localStorage — the session is NOT closed server-side
  }
}
```

### Current user

```typescript
const me = await api.get("/auth/me");
// { id, name, role, expiresAt }
```

---

## Error Handling

The `api` client throws an error object with `{ status, body }` for all non-2xx responses.

```typescript
try {
  await api.post("/orders/:id/payments", payload);
} catch (err) {
  if (err.status === 401) redirect("/login");
  if (err.status === 403) toast.error("Sin permiso para esta acción");
  if (err.status === 429) toast.error("Demasiadas peticiones. Espera un momento.");
  if (err.status === 503) toast.error("Servicio no disponible. Reintenta.");
}
```

---

## Idempotency Keys

Attach an `Idempotency-Key` header to any **POST, PATCH, or DELETE** request you want to make safe to retry.

**Rules:**
- Generate a fresh UUID for each *logical* operation (not each HTTP attempt).
- If the first attempt times out, retry with the **same** key.
- The server returns the same response for up to 24 hours.
- Replayed responses include `Idempotency-Replayed: true` in the response headers.

**Endpoints with idempotency support:**
- `POST /api/orders/:id/send` — enviar comanda a KDS
- `POST /api/orders/:id/payments` — cobrar pedido
- `POST /api/cash-sessions/:id/close` — cerrar caja
- `POST /api/fichaje/public/clock` — fichaje de entrada/salida

```typescript
import { v4 as uuidv4 } from "uuid";

// Generate key once per user action
const idempotencyKey = uuidv4();

// First attempt
try {
  await api.post(`/orders/${orderId}/payments`, payload, {
    headers: { "Idempotency-Key": idempotencyKey },
  });
} catch (networkError) {
  // Retry with the SAME key — server will deduplicate
  await api.post(`/orders/${orderId}/payments`, payload, {
    headers: { "Idempotency-Key": idempotencyKey },
  });
}
```

Only **successful (2xx) responses** are cached. If the first attempt returns 4xx (e.g. validation error), the key is not stored and the next attempt is processed fresh.

---

## Manager Authorization

For high-privilege actions (large discounts, void, cash open), the backend requires a short-lived manager token. The frontend uses `useManagerAuth()` to collect manager credentials via a PIN modal.

```typescript
import { useManagerAuth } from "@/hooks/use-manager-auth";
import { ManagerPinModal } from "@/components/auth/ManagerPinModal";

function DiscountButton({ orderId }) {
  const { authRequest, requestAuth, closeAuth } = useManagerAuth();

  async function applyLargeDiscount(managerToken: string) {
    await api.post(`/orders/${orderId}/discounts`, {
      type: "percentage",
      value: 30,
      managerToken,  // ← backend reads X-Manager-Auth header set by api client
    });
  }

  return (
    <>
      <button onClick={() => requestAuth("discount.apply")}>
        Descuento 30 %
      </button>

      {authRequest && (
        <ManagerPinModal
          operation={authRequest.operation}
          onAuthorized={applyLargeDiscount}
          onClose={closeAuth}
        />
      )}
    </>
  );
}
```

**Manager token lifetime:** 60 seconds. If the cashier takes longer than 60 seconds between PIN entry and action completion, the backend will reject the token and the frontend must re-trigger the modal.

---

## React Query Integration

The generated hooks in `lib/api-client-react` are the preferred way to interact with the API from React components. They handle caching, background refetch, and optimistic updates.

```typescript
// Reading data
import { useGetZones } from "@workspace/api-client-react";
const { data: zones, isLoading } = useGetZones();

// Mutations
import { useAddOrderItem } from "@workspace/api-client-react";
const { mutate: addItem, isPending } = useAddOrderItem();
addItem({ orderId, body: { productId, quantity: 1 } });
```

For endpoints not yet covered by codegen, use `api.post(...)` directly from `@/lib/api`.

---

## TypeScript Types

All request/response shapes are defined in `lib/api-zod` (Zod schemas) and exported from `@workspace/api-zod`. Import them for manual `fetch` calls or form validation:

```typescript
import { AuthWithPinBody } from "@workspace/api-zod";

const parsed = AuthWithPinBody.safeParse(formData);
if (!parsed.success) { /* show errors */ }
await api.post("/auth/pin", parsed.data);
```
