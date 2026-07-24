// ── QR Menu — API helpers ─────────────────────────────────────────────────────
// Uses customFetch (from @workspace/api-client-react) which automatically
// reads the JWT from localStorage and sends it as Authorization: Bearer.
// Do NOT use plain fetch() here — it won't include the auth token.

import type { QrBranding } from './types';
import {
  getAdminQrBranding,
  putAdminQrBranding,
  customFetch,
  ApiError,
} from '@workspace/api-client-react';
import type { UpdateQrBrandingInput } from '@workspace/api-client-react';

// ── Branding ──────────────────────────────────────────────────────────────────

export async function fetchQrBranding(): Promise<QrBranding> {
  const data = await getAdminQrBranding();
  return (data ?? {}) as QrBranding;
}

export async function saveQrBranding(data: Partial<QrBranding>): Promise<void> {
  await putAdminQrBranding(data as UpdateQrBrandingInput);
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QrCategory {
  id: string;
  name: string;
  sortOrder: number;
  active: boolean;
  color?: string | null;
  icon?: string | null;
  description?: string | null;
  translations?: Record<string, { name?: string; description?: string }>;
}

export interface QrProduct {
  id: string;
  name: string;
  description?: string | null;
  price: string;
  categoryId: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  allergens?: string;
  halfPortionPrice?: string | null;
  quantity?: string | null;
  isVegetariano?: boolean;
  isVegano?: boolean;
  isSinGluten?: boolean;
  isPicante?: boolean;
  qrVisible?: boolean;
  outOfStock?: boolean;
  sortOrder?: number;
  translations?: Record<string, { name?: string; description?: string }>;
}

export interface PublicMenuCategory {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  products: QrProduct[];
  subcategories?: { id: string; name: string; products: QrProduct[] }[];
  translations?: Record<string, { name?: string; description?: string }>;
}

// ── Categories ────────────────────────────────────────────────────────────────

export async function fetchQrCategories(): Promise<QrCategory[]> {
  const data = await customFetch<unknown>('/api/admin/categories');
  if (!data) return [];
  return Array.isArray(data) ? (data as QrCategory[]) : ((data as any).categories ?? []);
}

export async function patchCategory(id: string, patch: Record<string, unknown>): Promise<void> {
  await customFetch(`/api/admin/categories/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export async function createCategory(data: {
  name: string;
  icon?: string;
  color?: string;
  sortOrder?: number;
  translations?: Record<string, { name?: string; description?: string }>;
}): Promise<QrCategory> {
  return customFetch<QrCategory>('/api/admin/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteCategory(id: string): Promise<void> {
  await customFetch(`/api/admin/categories/${id}`, { method: 'DELETE' });
}

// ── Products ──────────────────────────────────────────────────────────────────

export async function fetchQrProducts(): Promise<QrProduct[]> {
  const data = await customFetch<unknown>('/api/admin/products');
  if (!data) return [];
  return Array.isArray(data) ? (data as QrProduct[]) : ((data as any).products ?? []);
}

export async function patchProduct(id: string, patch: Record<string, unknown>): Promise<void> {
  await customFetch(`/api/admin/products/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export async function createProduct(data: {
  categoryId: string;
  name: string;
  price: string;
  description?: string;
  allergens?: string;
  halfPortionPrice?: string | null;
  quantity?: string;
  imageUrl?: string;
  isVegetariano?: boolean;
  isVegano?: boolean;
  isSinGluten?: boolean;
  isPicante?: boolean;
  sortOrder?: number;
}): Promise<QrProduct> {
  try {
    return await customFetch<QrProduct>('/api/admin/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch (e) {
    if (e instanceof ApiError) {
      throw new Error((e.data as { error?: string } | null)?.error ?? e.message);
    }
    throw e;
  }
}

export async function deleteProduct(id: string): Promise<void> {
  await customFetch(`/api/admin/products/${id}`, { method: 'DELETE' });
}

// ── Public menu ───────────────────────────────────────────────────────────────

export async function fetchPublicMenu(): Promise<PublicMenuCategory[]> {
  const data = await customFetch<unknown>('/api/public/menu');
  if (!data) return [];
  return Array.isArray(data) ? (data as PublicMenuCategory[]) : [];
}

// ── Theme helpers ─────────────────────────────────────────────────────────────

/** Apply themeColors/themeFonts as CSS custom vars on :root */
export function applyThemeVars(
  themeColors: Record<string, string> | null,
  themeFonts: { heading?: string; body?: string; headingColor?: string; bodyColor?: string } | null,
): void {
  const root = document.documentElement;
  const colors = themeColors ?? {};
  if (colors.primary) root.style.setProperty('--primary', colors.primary);
  if (colors.background) root.style.setProperty('--background', colors.background);
  if (colors.accent) root.style.setProperty('--accent', colors.accent);
  const fonts = themeFonts ?? {};
  if (fonts.heading) root.style.setProperty('--font-display', `"${fonts.heading}", serif`);
  if (fonts.body) root.style.setProperty('--font-sans', `"${fonts.body}", sans-serif`);
  if (fonts.headingColor) root.style.setProperty('--heading-color', fonts.headingColor);
  if (fonts.bodyColor) root.style.setProperty('--body-color', fonts.bodyColor);
}

/** Load a Google Font if it doesn't look like a custom font */
export function loadGoogleFont(fontName: string): void {
  if (!fontName || fontName.includes('__custom')) return;
  const id = `gfont-${fontName.replace(/\s+/g, '-')}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:ital,wght@0,400;0,700;1,400&display=swap`;
  document.head.appendChild(link);
}

/** Load a custom CDN font */
export function loadCustomFont(name: string, cdnUrl: string): void {
  const id = `custom-font-${name.replace(/\s+/g, '-')}`;
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = `@font-face { font-family: "${name}"; src: url("${cdnUrl}") format("woff2"), url("${cdnUrl}") format("woff"); font-weight: normal; font-style: normal; font-display: swap; }`;
  document.head.appendChild(style);
}
