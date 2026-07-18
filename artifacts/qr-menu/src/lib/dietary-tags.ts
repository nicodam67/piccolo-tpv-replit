export const DIETARY_TAGS = [
  { id: "vegetarian", label: "Vegetarian", icon: "🥦", color: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  { id: "vegan", label: "Vegan", icon: "🌿", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  { id: "gluten-free", label: "Gluten-Free", icon: "🚫🌾", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300" },
  { id: "spicy", label: "Spicy", icon: "🌶️", color: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
] as const;

export type DietaryTagId = (typeof DIETARY_TAGS)[number]["id"];

export function getTagMeta(id: string) {
  return DIETARY_TAGS.find((t) => t.id === id);
}
