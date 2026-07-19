# Piccolo QR — Shared API for Piccolo TPV

This document describes how **Piccolo TPV** (or any other Convex client) can
subscribe to the Piccolo QR Menú data in real time, without requiring admin
credentials.

---

## Connection setup

### 1. Install the Convex client

```bash
pnpm add convex
```

### 2. Initialise the client

```typescript
import { ConvexClient } from "convex/browser";

const client = new ConvexClient(CONVEX_URL); // see §Credentials below
```

Or, in a React app:

```tsx
import { ConvexProvider, ConvexReactClient } from "convex/react";

const convex = new ConvexReactClient(CONVEX_URL);

function App() {
  return (
    <ConvexProvider client={convex}>
      <YourApp />
    </ConvexProvider>
  );
}
```

### Credentials

| Variable | Where to get it |
|----------|-----------------|
| `CONVEX_URL` | Convex dashboard → your project → Settings → URL & Deploy Key |

The shared queries are **public** — no authentication token required.

---

## Available queries

### `api.shared.getMenuSnapshot`

Returns the complete menu in a single call: all categories, all available
items (with resolved image URLs from Convex Storage), and restaurant branding.

**Args:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `includeUnavailable` | `boolean` | `false` | Include hidden categories/items |

**Returns:**

```typescript
{
  categories: Category[];   // sorted by `order`
  items: MenuItem[];        // sorted by `order`, imageUrl resolved
  branding: Branding | null;
  fetchedAt: number;        // ms since epoch (server time)
}
```

**React hook (live subscription):**

```tsx
import { useQuery } from "convex/react";
import { api } from "../path/to/qr-menu/convex/_generated/api";

function MenuProvider() {
  const snapshot = useQuery(api.shared.getMenuSnapshot, {});
  // snapshot is undefined while loading, then auto-updates on any change
  if (!snapshot) return <Loading />;
  return <Menu categories={snapshot.categories} items={snapshot.items} />;
}
```

**One-shot fetch (non-React):**

```typescript
const snapshot = await client.query(api.shared.getMenuSnapshot, {});
console.log(snapshot.categories.length, "categories");
console.log(snapshot.items.length, "items");
```

---

### `api.shared.getCategoryWithItems`

Returns a single category and its available items. Useful for TPV screens
that display one section at a time.

**Args:**

| Field | Type | Description |
|-------|------|-------------|
| `categoryId` | `Id<"categories">` | Convex ID of the category |
| `includeUnavailable` | `boolean` | Include hidden items |

**Returns:**

```typescript
{
  category: Category;
  items: MenuItem[];
} | null
```

---

## Data types

### `Category`

```typescript
{
  _id: Id<"categories">;
  _creationTime: number;
  name: string;
  description?: string;
  order: number;
  parentId?: Id<"categories">;  // present for sub-categories
  available?: boolean;
  translations?: Record<string, { name?: string; description?: string }>;
}
```

### `MenuItem`

```typescript
{
  _id: Id<"menuItems">;
  _creationTime: number;
  categoryId: Id<"categories">;
  name: string;
  description?: string;
  price: number;             // euros, e.g. 12.5
  halfPortionPrice?: number;
  quantity?: string;         // e.g. "250g", "1L"
  available: boolean;
  order: number;
  imageUrl?: string;         // resolved Convex Storage URL
  videoUrl?: string;         // resolved Convex Storage URL
  tags?: string[];
  allergens?: string[];
  translations?: Record<string, { name?: string; description?: string }>;
}
```

### `Branding`

Key fields used by TPV:

```typescript
{
  restaurantName: string;
  tagline?: string;
  heroImageUrl?: string;     // resolved from Convex Storage
  themeColors?: {
    primary?: string;        // CSS color string
    background?: string;
    accent?: string;
  };
  themeFonts?: {
    heading?: string;
    body?: string;
  };
  schedule?: Array<{
    day: string;
    shift1: { open: boolean; openTime: string; closeTime: string };
    shift2: { open: boolean; openTime: string; closeTime: string };
  }>;
}
```

---

## Real-time updates

Convex queries are **reactive by default**. When using `useQuery`, your
component re-renders automatically whenever a category is added, an item's
price changes, or an item is toggled available/unavailable in the QR admin
panel — with no polling and no WebSocket management on your side.

For non-React environments, use `client.onUpdate`:

```typescript
const unsubscribe = client.onUpdate(
  api.shared.getMenuSnapshot,
  {},
  (snapshot) => {
    console.log("Menu updated:", snapshot.fetchedAt);
    rebuildTPVMenu(snapshot);
  },
);

// Later, when TPV closes:
unsubscribe();
```

---

## Locale / translations

Each category and menu item carries a `translations` map keyed by locale
code (`"en"`, `"fr"`, `"de"`, `"ca"`, `"es"`, `"it"`, `"nl"`, `"ro"`).

```typescript
function getLocalizedName(item: MenuItem, locale: string): string {
  return item.translations?.[locale]?.name ?? item.name;
}
```

The TPV can use this to show items in the customer's language without a
separate API call.

---

## Caching recommendations for TPV

| Scenario | Recommendation |
|----------|----------------|
| TPV always connected | Use `useQuery` / `onUpdate` for live subscriptions |
| TPV occasionally offline | Cache last snapshot in localStorage; use `fetchedAt` to detect staleness |
| KDS / kitchen display | Subscribe to `getMenuSnapshot` with `includeUnavailable: true` |

---

## Contact

Questions about this API: raise a task in the shared project board.
