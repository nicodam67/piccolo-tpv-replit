import { useQuery } from "@tanstack/react-query";

export type MenuTranslations = Record<
  string,
  { name?: string; description?: string }
>;

export type MenuCategory = {
  _id: string;
  name: string;
  description?: string;
  order: number;
  parentId?: string;
  available: boolean;
  translations?: MenuTranslations;
};

export type MenuItem = {
  _id: string;
  categoryId: string;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
  videoUrl?: string;
  quantity?: string;
  available: boolean;
  outOfStock: boolean;
  order: number;
  tags?: string[];
  halfPortionPrice?: number;
  allergens?: string[];
  translations?: MenuTranslations;
};

export type TpvBranding = {
  restaurantName?: string;
  tagline?: string;
  heroImageUrl?: string;
  heroVideoUrl?: string;
  address?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
  establishedYear?: string | number | null;
  logoUrl?: string;
  themeColors?: Record<string, string> | null;
  themeFonts?: {
    heading?: string;
    body?: string;
    headingColor?: string;
    bodyColor?: string;
  } | null;
  cardSettings?: {
    showImage?: boolean;
    showDescription?: boolean;
    showTags?: boolean;
    showAllergens?: boolean;
    showPrice?: boolean;
    showHalfPortion?: boolean;
    showQuantity?: boolean;
    layout?: string;
  } | null;
  schedule?: Array<{
    day: string;
    shift1: { open: boolean; openTime: string; closeTime: string };
    shift2: { open: boolean; openTime: string; closeTime: string };
  }> | null;
};

type TpvProduct = {
  id: string;
  categoryId: string;
  subcategoryId?: string | null;
  name: string;
  description?: string | null;
  price: string | number;
  allergens?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  outOfStock?: boolean;
  halfPortionPrice?: string | number | null;
  quantity?: string | null;
  isVegetariano?: boolean;
  isVegano?: boolean;
  isSinGluten?: boolean;
  isPicante?: boolean;
  translations?: MenuTranslations;
};

type TpvSubcategory = {
  id: string;
  name: string;
  sortOrder?: number;
};

type TpvCategory = {
  id: string;
  name: string;
  sortOrder?: number;
  translations?: MenuTranslations;
  subcategories?: TpvSubcategory[];
  products?: TpvProduct[];
};

export type TpvMenuSnapshot = {
  categories: MenuCategory[];
  items: MenuItem[];
  branding: TpvBranding;
};

const ALLERGEN_TO_QR_ID: Record<string, string> = {
  gluten: "gluten",
  crustaceos: "crustaceans",
  crustaceans: "crustaceans",
  huevos: "eggs",
  eggs: "eggs",
  pescado: "fish",
  fish: "fish",
  cacahuetes: "peanuts",
  peanuts: "peanuts",
  soja: "soy",
  soya: "soy",
  soy: "soy",
  leche: "milk",
  milk: "milk",
  frutos_cascara: "nuts",
  frutos_secos: "nuts",
  nuts: "nuts",
  apio: "celery",
  celery: "celery",
  mostaza: "mustard",
  mustard: "mustard",
  sesamo: "sesame",
  sesame: "sesame",
  sulfitos: "sulphites",
  sulphites: "sulphites",
  altramuces: "lupin",
  lupin: "lupin",
  moluscos: "molluscs",
  molluscs: "molluscs",
};

function normalizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
}

export function normalizeTpvAllergens(raw?: string | null): string[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((value) => ALLERGEN_TO_QR_ID[normalizeToken(value)])
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}

function optionalString(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function priceNumber(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function dietaryTags(product: TpvProduct): string[] | undefined {
  const tags = [
    product.isVegetariano ? "vegetarian" : null,
    product.isVegano ? "vegan" : null,
    product.isSinGluten ? "gluten-free" : null,
    product.isPicante ? "spicy" : null,
  ].filter((tag): tag is string => tag !== null);
  return tags.length ? tags : undefined;
}

export function adaptTpvMenu(categories: TpvCategory[]): {
  categories: MenuCategory[];
  items: MenuItem[];
} {
  const menuCategories: MenuCategory[] = [];
  const menuItems: MenuItem[] = [];

  categories.forEach((category, categoryIndex) => {
    menuCategories.push({
      _id: category.id,
      name: category.name,
      order: category.sortOrder ?? categoryIndex,
      available: true,
      translations: category.translations,
    });

    (category.subcategories ?? []).forEach((subcategory, subcategoryIndex) => {
      menuCategories.push({
        _id: subcategory.id,
        name: subcategory.name,
        order: subcategory.sortOrder ?? subcategoryIndex,
        parentId: category.id,
        available: true,
      });
    });

    (category.products ?? []).forEach((product, productIndex) => {
      const allergens = normalizeTpvAllergens(product.allergens);
      const tags = dietaryTags(product);
      menuItems.push({
        _id: product.id,
        categoryId: product.subcategoryId || product.categoryId,
        name: product.name,
        description: optionalString(product.description),
        price: priceNumber(product.price) ?? 0,
        imageUrl: optionalString(product.imageUrl),
        videoUrl: optionalString(product.videoUrl),
        quantity: optionalString(product.quantity),
        available: true,
        outOfStock: product.outOfStock === true,
        order: productIndex,
        tags,
        halfPortionPrice: priceNumber(product.halfPortionPrice),
        allergens: allergens.length ? allergens : undefined,
        translations: product.translations,
      });
    });
  });

  return { categories: menuCategories, items: menuItems };
}

function apiPath(path: string): string {
  const configuredBase = (import.meta.env.VITE_TPV_API_URL ?? "").replace(/\/+$/, "");
  const apiBase = configuredBase.endsWith("/api")
    ? configuredBase
    : `${configuredBase}/api`;
  return `${apiBase}${path}`;
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(apiPath(path), {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`TPV API ${path} returned ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchTpvMenuSnapshot(): Promise<TpvMenuSnapshot> {
  const [rawMenu, branding] = await Promise.all([
    fetchJson<TpvCategory[]>("/public/menu"),
    fetchJson<TpvBranding>("/public/branding"),
  ]);
  const menu = adaptTpvMenu(Array.isArray(rawMenu) ? rawMenu : []);
  return { ...menu, branding: branding ?? {} };
}

const SNAPSHOT_QUERY_KEY = ["tpv-public-menu-snapshot"] as const;

/**
 * Public QR Menu integration boundary.
 *
 * PostgreSQL/Express remains the sole catalog authority. Polling keeps already
 * open anonymous menus current without adding a second write model or requiring
 * authenticated sockets; focus/reconnect refreshes cover tablets after sleep.
 */
export function useTpvMenuSnapshot(): {
  categories: MenuCategory[] | undefined;
  items: MenuItem[] | undefined;
  branding: TpvBranding | undefined;
  error: Error | null;
} {
  const query = useQuery({
    queryKey: SNAPSHOT_QUERY_KEY,
    queryFn: fetchTpvMenuSnapshot,
    refetchInterval: 10_000,
    refetchOnReconnect: "always",
    refetchOnWindowFocus: "always",
    staleTime: 0,
  });

  return {
    categories: query.data?.categories,
    items: query.data?.items,
    branding: query.data?.branding,
    error: query.error,
  };
}
