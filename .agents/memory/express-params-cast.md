---
name: Express params cast pattern
description: Express req.params fields must be explicitly cast to `string` to avoid TS2769 errors with drizzle ORM.
---

## Rule
In all api-server Express route handlers, extract params like:
```ts
const orderId = req.params.orderId as string;
const itemId = req.params.itemId as string;
```
Never use `const { orderId } = req.params` — TypeScript may infer `string | string[]` depending on Express version, which breaks drizzle `eq()`, `inArray()`, and other calls.

**Why:** Drizzle `eq(table.col, value)` requires `string`, but Express params can be typed as `string | string[]`. The existing working routes in tables.ts all use `as string` casts — new routes must do the same.

**How to apply:** Any time writing a new Express route handler with path params.
