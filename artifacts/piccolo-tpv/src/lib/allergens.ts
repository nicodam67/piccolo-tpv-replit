// 14 EU allergens per Regulation 1169/2011

export const EU_ALLERGENS = [
  { code: 'gluten',      label: 'Gluten',         short: 'GL', color: '#c47d1e', bg: 'rgba(196,125,30,0.15)' },
  { code: 'crustaceans', label: 'Crustáceos',     short: 'CR', color: '#d05030', bg: 'rgba(208,80,48,0.15)'  },
  { code: 'eggs',        label: 'Huevo',           short: 'HU', color: '#c8a000', bg: 'rgba(200,160,0,0.15)'  },
  { code: 'fish',        label: 'Pescado',         short: 'PE', color: '#2878c0', bg: 'rgba(40,120,192,0.15)' },
  { code: 'peanuts',     label: 'Cacahuete',       short: 'CA', color: '#a05828', bg: 'rgba(160,88,40,0.15)'  },
  { code: 'soya',        label: 'Soja',            short: 'SO', color: '#3a9040', bg: 'rgba(58,144,64,0.15)'  },
  { code: 'milk',        label: 'Lácteos',         short: 'LA', color: '#5888d0', bg: 'rgba(88,136,208,0.15)' },
  { code: 'nuts',        label: 'Frutos secos',    short: 'FS', color: '#b84030', bg: 'rgba(184,64,48,0.15)'  },
  { code: 'celery',      label: 'Apio',            short: 'AP', color: '#2a9060', bg: 'rgba(42,144,96,0.15)'  },
  { code: 'mustard',     label: 'Mostaza',         short: 'MO', color: '#b09010', bg: 'rgba(176,144,16,0.15)' },
  { code: 'sesame',      label: 'Sésamo',          short: 'SE', color: '#d07010', bg: 'rgba(208,112,16,0.15)' },
  { code: 'sulphites',   label: 'Sulfitos',        short: 'SU', color: '#a030a0', bg: 'rgba(160,48,160,0.15)' },
  { code: 'lupin',       label: 'Altramuces',      short: 'AL', color: '#c07830', bg: 'rgba(192,120,48,0.15)' },
  { code: 'molluscs',    label: 'Moluscos',        short: 'ML', color: '#2070b0', bg: 'rgba(32,112,176,0.15)' },
] as const;

export type AllergenCode = typeof EU_ALLERGENS[number]['code'];

export const ALLERGEN_MAP = new Map(EU_ALLERGENS.map(a => [a.code, a]));

/** Parse the comma-separated allergens string into an array of known codes */
export function parseAllergens(allergens: string | undefined | null): AllergenCode[] {
  if (!allergens) return [];
  return allergens
    .split(',')
    .map(s => s.trim())
    .filter((s): s is AllergenCode => ALLERGEN_MAP.has(s as AllergenCode));
}
