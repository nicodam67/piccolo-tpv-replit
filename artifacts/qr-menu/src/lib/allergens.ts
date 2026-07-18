// EU 14 major allergens (Regulation EU 1169/2011)
export const ALLERGENS = [
  { id: "gluten",      label: "Gluten",         icon: "🌾" },
  { id: "crustaceans", label: "Crustaceans",     icon: "🦞" },
  { id: "eggs",        label: "Eggs",            icon: "🥚" },
  { id: "fish",        label: "Fish",            icon: "🐟" },
  { id: "peanuts",     label: "Peanuts",         icon: "🥜" },
  { id: "soy",         label: "Soy",             icon: "🫘" },
  { id: "milk",        label: "Milk",            icon: "🥛" },
  { id: "nuts",        label: "Nuts",            icon: "🌰" },
  { id: "celery",      label: "Celery",          icon: "🥬" },
  { id: "mustard",     label: "Mustard",         icon: "🌿" },
  { id: "sesame",      label: "Sesame",          icon: "🌱" },
  { id: "sulphites",   label: "Sulphites",       icon: "🍷" },
  { id: "lupin",       label: "Lupin",           icon: "🌻" },
  { id: "molluscs",    label: "Molluscs",        icon: "🦑" },
] as const;

export type AllergenId = (typeof ALLERGENS)[number]["id"];

export function getAllergenMeta(id: string) {
  return ALLERGENS.find((a) => a.id === id);
}
