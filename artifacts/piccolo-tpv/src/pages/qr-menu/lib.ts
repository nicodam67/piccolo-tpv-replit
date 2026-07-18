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

export async function patchCategory(id: string, patch: Record<string, unknown>): Promise<void> {
  const r = await fetch(`${BASE}/api/admin/categories/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error('Error actualizando categoría');
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
