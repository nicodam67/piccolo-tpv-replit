// ── EU 14 major allergens (Regulation EU 1169/2011) ──────────────────────────
// Canonical IDs use the Spanish tokens stored in the database.
// `code` mirrors `id` for backward-compat with menu.tsx / order.tsx / ingredientes.tsx
// consumers that do `EU_ALLERGENS.find(x => x.code === code)`.
// `short`, `color`, `bg` are kept for legacy chip-rendering in those pages.

export const EU_ALLERGENS = [
  { id: 'gluten',         code: 'gluten',         label: 'Gluten',        short: 'Gluten',    icon: '🌾', color: '#a16207', bg: '#fef9c3' },
  { id: 'crustaceos',     code: 'crustaceos',     label: 'Crustáceos',    short: 'Crustác.',  icon: '🦞', color: '#b45309', bg: '#fef3c7' },
  { id: 'huevos',         code: 'huevos',         label: 'Huevos',        short: 'Huevos',    icon: '🥚', color: '#d97706', bg: '#fffbeb' },
  { id: 'pescado',        code: 'pescado',        label: 'Pescado',       short: 'Pescado',   icon: '🐟', color: '#0369a1', bg: '#e0f2fe' },
  { id: 'cacahuetes',     code: 'cacahuetes',     label: 'Cacahuetes',    short: 'Cacah.',    icon: '🥜', color: '#92400e', bg: '#fef3c7' },
  { id: 'soja',           code: 'soja',           label: 'Soja',          short: 'Soja',      icon: '🫘', color: '#166534', bg: '#dcfce7' },
  { id: 'leche',          code: 'leche',          label: 'Leche',         short: 'Leche',     icon: '🥛', color: '#1d4ed8', bg: '#dbeafe' },
  { id: 'frutos_cascara', code: 'frutos_cascara', label: 'Frutos secos',  short: 'F.secos',   icon: '🌰', color: '#7c2d12', bg: '#fff7ed' },
  { id: 'apio',           code: 'apio',           label: 'Apio',          short: 'Apio',      icon: '🥬', color: '#15803d', bg: '#dcfce7' },
  { id: 'mostaza',        code: 'mostaza',        label: 'Mostaza',       short: 'Mostaza',   icon: '🌿', color: '#65a30d', bg: '#f7fee7' },
  { id: 'sesamo',         code: 'sesamo',         label: 'Sésamo',        short: 'Sésamo',    icon: '🌱', color: '#4d7c0f', bg: '#f7fee7' },
  { id: 'sulfitos',       code: 'sulfitos',       label: 'Sulfitos',      short: 'Sulfitos',  icon: '🍷', color: '#7e22ce', bg: '#f3e8ff' },
  { id: 'altramuces',     code: 'altramuces',     label: 'Altramuces',    short: 'Altram.',   icon: '🌻', color: '#b45309', bg: '#fef9c3' },
  { id: 'moluscos',       code: 'moluscos',       label: 'Moluscos',      short: 'Moluscos',  icon: '🦑', color: '#0e7490', bg: '#e0f2fe' },
] as const;

export type AllergenId = typeof EU_ALLERGENS[number]['id'];

/** All known canonical codes as a set for O(1) lookup. */
const KNOWN_CODES = new Set<string>(EU_ALLERGENS.map((a) => a.id));

/**
 * Maps legacy/alternative tokens → canonical Spanish ID.
 * Covers:
 *   - English IDs used by the previous version of this file
 *     (crustaceans, eggs, fish, peanuts, soy, milk, nuts, celery, mustard,
 *      sesame, sulphites, lupin, molluscs)
 *   - Spanish spelling variants (soya, frutos_secos, crustáceos, etc.)
 *
 * New tokens that don't appear here are silently dropped so that
 * non-null assertions in menu.tsx / order.tsx remain safe.
 */
const LEGACY_MAP: Record<string, string> = {
  // English → Spanish (from previous allergens.ts revision)
  crustaceans:  'crustaceos',
  eggs:         'huevos',
  fish:         'pescado',
  peanuts:      'cacahuetes',
  soy:          'soja',
  milk:         'leche',
  nuts:         'frutos_cascara',
  celery:       'apio',
  mustard:      'mostaza',
  sesame:       'sesamo',
  sulphites:    'sulfitos',
  lupin:        'altramuces',
  molluscs:     'moluscos',
  // Spanish spelling variants
  soya:         'soja',
  frutos_secos: 'frutos_cascara',
  'crustáceos': 'crustaceos',
  'sésamo':     'sesamo',
};

export function getAllergenMeta(id: string) {
  return EU_ALLERGENS.find((a) => a.id === id);
}

/**
 * Parse a comma-separated allergen string like "gluten,soja,leche" → canonical ID array.
 *
 * - Normalizes legacy English tokens and Spanish spelling variants via LEGACY_MAP.
 * - Drops any token that cannot be resolved to a known canonical code so that
 *   consumers using non-null assertion (`EU_ALLERGENS.find(…)!`) never receive undefined.
 */
export function parseAllergens(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => {
      const token = s.trim().toLowerCase();
      const canonical = LEGACY_MAP[token] ?? token;
      return KNOWN_CODES.has(canonical) ? canonical : null;
    })
    .filter((v): v is string => v !== null);
}
