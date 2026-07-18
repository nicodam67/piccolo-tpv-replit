// ── QR Menu — API helpers ─────────────────────────────────────────────────────

import type { QrBranding } from './types';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export async function fetchQrBranding(): Promise<QrBranding> {
  const r = await fetch(`${BASE}/api/admin/qr-branding`, { credentials: 'include' });
  if (!r.ok) throw new Error('Error cargando branding');
  return r.json();
}

export async function saveQrBranding(data: Partial<QrBranding>): Promise<void> {
  const r = await fetch(`${BASE}/api/admin/qr-branding`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error('Error guardando branding');
}

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

export async function fetchQrCategories(): Promise<QrCategory[]> {
  const r = await fetch(`${BASE}/api/admin/categories`, { credentials: 'include' });
  if (!r.ok) throw new Error('Error cargando categorías');
  const data = await r.json();
  return Array.isArray(data) ? data : (data.categories ?? []);
}

export async function fetchQrProducts(): Promise<QrProduct[]> {
  const r = await fetch(`${BASE}/api/admin/products`, { credentials: 'include' });
  if (!r.ok) throw new Error('Error cargando productos');
  const data = await r.json();
  return Array.isArray(data) ? data : (data.products ?? []);
}

export async function fetchPublicMenu(): Promise<PublicMenuCategory[]> {
  const r = await fetch(`${BASE}/api/public/menu`);
  if (!r.ok) throw new Error('Error cargando menú público');
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

export async function patchCategory(id: string, patch: Record<string, unknown>): Promise<void> {
  const r = await fetch(`${BASE}/api/admin/categories/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error('Error actualizando categoría');
}

export async function createCategory(data: {
  name: string;
  icon?: string;
  color?: string;
  sortOrder?: number;
  translations?: Record<string, { name?: string; description?: string }>;
}): Promise<QrCategory> {
  const r = await fetch(`${BASE}/api/admin/categories`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error('Error creando categoría');
  return r.json();
}

export async function deleteCategory(id: string): Promise<void> {
  const r = await fetch(`${BASE}/api/admin/categories/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!r.ok) throw new Error('Error eliminando categoría');
}

export async function patchProduct(id: string, patch: Record<string, unknown>): Promise<void> {
  const r = await fetch(`${BASE}/api/admin/products/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error('Error actualizando producto');
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
  const r = await fetch(`${BASE}/api/admin/products`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? 'Error creando producto');
  }
  return r.json();
}

export async function deleteProduct(id: string): Promise<void> {
  const r = await fetch(`${BASE}/api/admin/products/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!r.ok) throw new Error('Error archivando producto');
}

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
