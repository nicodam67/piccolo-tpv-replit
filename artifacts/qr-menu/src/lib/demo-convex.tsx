/**
 * Mock replacement for `convex/react` used when VITE_CONVEX_URL is not set.
 *
 * Vite aliases `convex/react` → this file in demo mode.
 * All exports match the real convex/react public API surface used by this app.
 */
import React, { useCallback } from "react";
import { makeFunctionReference } from "convex/server";
import { DEMO_BRANDING, DEMO_CATEGORIES, DEMO_ITEMS } from "./demo-data";

// ── Resolve the private Symbol(functionName) that Convex uses to tag FunctionReferences ──
// anyApi returns Proxy objects whose path is stored under this symbol.
const _probe = makeFunctionReference("_probe");
const _fnSym = Object.getOwnPropertySymbols(_probe)[0]; // Symbol(functionName)

function getPath(fnRef: unknown): string {
  if (!fnRef || typeof fnRef !== "object") return "";
  return (fnRef as Record<symbol, string>)[_fnSym] ?? "";
}

// ── Static mock data resolvers ────────────────────────────────────────────────

function resolveQuery(path: string, args: Record<string, unknown>): unknown {
  switch (path) {
    case "menu:listCategories":
      return DEMO_CATEGORIES;

    case "menu:listAvailableItems": {
      const catId = args?.categoryId as string | undefined;
      const items = DEMO_ITEMS.filter((i) => i.available);
      return catId ? items.filter((i) => i.categoryId === catId) : items;
    }

    case "menu:listAllItems": {
      const catId = args?.categoryId as string | undefined;
      return catId ? DEMO_ITEMS.filter((i) => i.categoryId === catId) : DEMO_ITEMS;
    }

    case "branding:get":
      return DEMO_BRANDING;

    case "menu:getCategory": {
      const id = args?.id as string | undefined;
      return DEMO_CATEGORIES.find((c) => c._id === id) ?? null;
    }

    case "menu:getItem": {
      const id = args?.id as string | undefined;
      return DEMO_ITEMS.find((i) => i._id === id) ?? null;
    }

    // Any unrecognised query returns undefined (loading state in real Convex)
    default:
      return undefined;
  }
}

// ── Hook mocks ────────────────────────────────────────────────────────────────

export function useQuery<T>(
  query: unknown,
  args?: Record<string, unknown>,
): T | undefined {
  const path = getPath(query);
  // Return undefined for mutations/actions passed by mistake
  return resolveQuery(path, args ?? {}) as T | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useMutation(_mutation: unknown): (...args: any[]) => Promise<any> {
  return useCallback(async (..._args: unknown[]) => {
    console.info("[DEMO] useMutation called — no-op in demo mode");
  }, []);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useAction(_action: unknown): (...args: any[]) => Promise<any> {
  return useCallback(async (..._args: unknown[]) => {
    console.info("[DEMO] useAction called — no-op in demo mode");
  }, []);
}

export function useConvexAuth() {
  return { isLoading: false, isAuthenticated: false };
}

// ── Auth-gating components ────────────────────────────────────────────────────
// In demo mode the user is always unauthenticated (no admin access).

export function Authenticated({ children }: { children: React.ReactNode }) {
  return null; // never render admin-only content
}

export function Unauthenticated({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function AuthLoading({ children }: { children: React.ReactNode }) {
  return null; // never in loading state
}

// ── Provider & client stubs ───────────────────────────────────────────────────

export function ConvexProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export class ConvexReactClient {
  // Minimal stub — provider above doesn't use it
}
