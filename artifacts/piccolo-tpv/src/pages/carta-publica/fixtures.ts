/**
 * fixtures.ts — datos estáticos de prueba para la primera fase del QR Menú.
 *
 * ⚠️  ESTOS DATOS SON ÚNICAMENTE PARA VALIDAR EL DISEÑO.
 *     No entran en la base de datos del TPV.
 *     Cuando se conecte Convex / la BD real, este archivo se sustituye.
 */

// ─── Branding ─────────────────────────────────────────────────────────────────

export const FIXTURE_BRANDING = {
  restaurantName:  "Piccolo la Ràpita",
  tagline:         "cocina con sabor italiano",
  establishedYear: "2007",
  address:         "Avinguda del Port, s/n",
  postalCode:      "43560",
  city:            "La Ràpita",
  province:        "Tarragona",
  country:         "España",
  phone:           "+34 977 744 000",
  heroImageUrl:
    "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1400&q=80",
  schedule: [
    { day: "Lunes",     hours: "Cerrado" },
    { day: "Martes",    hours: "13:00 – 15:30 · 20:00 – 23:00" },
    { day: "Miércoles", hours: "13:00 – 15:30 · 20:00 – 23:00" },
    { day: "Jueves",    hours: "13:00 – 15:30 · 20:00 – 23:00" },
    { day: "Viernes",   hours: "13:00 – 15:30 · 20:00 – 23:30" },
    { day: "Sábado",    hours: "13:00 – 16:00 · 20:00 – 23:30" },
    { day: "Domingo",   hours: "13:00 – 16:00" },
  ],
} as const;

// ─── Idiomas ──────────────────────────────────────────────────────────────────

export const FIXTURE_IDIOMAS = [
  { code: "es", label: "ES", flag: "🇪🇸" },
  { code: "en", label: "EN", flag: "🇬🇧" },
  { code: "it", label: "IT", flag: "🇮🇹" },
  { code: "fr", label: "FR", flag: "🇫🇷" },
  { code: "de", label: "DE", flag: "🇩🇪" },
  { code: "ru", label: "RU", flag: "🇷🇺" },
  { code: "ca", label: "CA", flag: "🏳️" },
  { code: "zh", label: "ZH", flag: "🇨🇳" },
] as const;

export type IdiomaCode = (typeof FIXTURE_IDIOMAS)[number]["code"];

// ─── Alérgenos (EU 14, Reglamento 1169/2011) ─────────────────────────────────

export const FIXTURE_ALLERGENS = [
  { id: "gluten",      label: "Gluten",      icon: "🌾" },
  { id: "crustaceans", label: "Crustáceos",  icon: "🦞" },
  { id: "eggs",        label: "Huevos",      icon: "🥚" },
  { id: "fish",        label: "Pescado",     icon: "🐟" },
  { id: "peanuts",     label: "Cacahuetes",  icon: "🥜" },
  { id: "soy",         label: "Soja",        icon: "🫘" },
  { id: "milk",        label: "Lácteos",     icon: "🥛" },
  { id: "nuts",        label: "Frutos secos",icon: "🌰" },
  { id: "celery",      label: "Apio",        icon: "🥬" },
  { id: "mustard",     label: "Mostaza",     icon: "🌿" },
  { id: "sesame",      label: "Sésamo",      icon: "🌱" },
  { id: "sulphites",   label: "Sulfitos",    icon: "🍷" },
  { id: "lupin",       label: "Altramuces",  icon: "🌻" },
  { id: "molluscs",    label: "Moluscos",    icon: "🦑" },
] as const;

export type AllergenId = (typeof FIXTURE_ALLERGENS)[number]["id"];

// ─── Etiquetas dietéticas ─────────────────────────────────────────────────────

export const FIXTURE_DIETARY_TAGS = [
  { id: "vegetarian", label: "Vegetariano", icon: "🥦" },
  { id: "vegan",      label: "Vegano",      icon: "🌿" },
  { id: "gluten_free",label: "Sin gluten",  icon: "🚫🌾" },
  { id: "spicy",      label: "Picante",     icon: "🌶️" },
] as const;

export type DietaryTagId = (typeof FIXTURE_DIETARY_TAGS)[number]["id"];

// ─── Categorías ───────────────────────────────────────────────────────────────

export interface FixtureCategory {
  id:          string;
  name:        string;
  description: string;
  emoji:       string;
  order:       number;
}

export const FIXTURE_CATEGORIES: FixtureCategory[] = [
  { id: "entrantes",  name: "Entrantes",  description: "Para compartir y empezar",              emoji: "🫒", order: 1 },
  { id: "ensaladas",  name: "Ensaladas",  description: "Frescas y de temporada",                emoji: "🥗", order: 2 },
  { id: "pasta",      name: "Pasta",      description: "Elaboradas al momento · pasta fresca",   emoji: "🍝", order: 3 },
  { id: "pizza",      name: "Pizza",      description: "Masa fina · horno de leña",              emoji: "🍕", order: 4 },
  { id: "carnes",     name: "Carnes",     description: "Carnes seleccionadas a la brasa",        emoji: "🥩", order: 5 },
  { id: "postres",    name: "Postres",    description: "Caseros · dulces italianos",             emoji: "🍮", order: 6 },
  { id: "bebidas",    name: "Bebidas",    description: "Vinos, cervezas y refrescos",            emoji: "🍷", order: 7 },
  { id: "cafes",      name: "Cafés",      description: "Espresso italiano · infusiones",         emoji: "☕", order: 8 },
];

// ─── Productos ────────────────────────────────────────────────────────────────

export interface FixtureProduct {
  id:           string;
  categoryId:   string;
  name:         string;
  description:  string;
  price:        number;
  halfPrice?:   number;
  imageUrl?:    string;
  allergens:    AllergenId[];
  tags:         DietaryTagId[];
  available:    boolean;
}

export const FIXTURE_PRODUCTS: FixtureProduct[] = [
  // ── Entrantes ────────────────────────────────────────────────────────────
  {
    id: "e1", categoryId: "entrantes",
    name: "Burrata con Tomate",
    description: "Burrata cremosa con tomates cherry asados, albahaca fresca y aceite de oliva virgen extra.",
    price: 14.50, allergens: ["milk"], tags: ["vegetarian"],
    imageUrl: "https://images.unsplash.com/photo-1607532941433-304659e8198a?w=600&q=80",
    available: true,
  },
  {
    id: "e2", categoryId: "entrantes",
    name: "Tabla de Embutidos Italianos",
    description: "Selección de prosciutto crudo, salami Milanese, bresaola y mortadela con grissini.",
    price: 18.00, allergens: ["gluten"], tags: [],
    imageUrl: "https://images.unsplash.com/photo-1544025162-d76694265947?w=600&q=80",
    available: true,
  },
  {
    id: "e3", categoryId: "entrantes",
    name: "Arancini di Riso",
    description: "Croquetas de arroz rellenas de mozzarella y ragú de ternera. Crujientes por fuera, cremosas por dentro.",
    price: 11.00, allergens: ["gluten", "milk", "eggs"], tags: [],
    imageUrl: "https://images.unsplash.com/photo-1543339520-3fc521bf92e9?w=600&q=80",
    available: true,
  },
  {
    id: "e4", categoryId: "entrantes",
    name: "Bruschetta al Pomodoro",
    description: "Pan de hogaza tostado con tomate fresco, ajo, albahaca y AOVE.",
    price: 8.50, allergens: ["gluten"], tags: ["vegetarian", "vegan"],
    available: true,
  },

  // ── Ensaladas ─────────────────────────────────────────────────────────────
  {
    id: "s1", categoryId: "ensaladas",
    name: "Ensalada Caprese",
    description: "Mozzarella de búfala, tomate de temporada, albahaca y reducción de vinagre balsámico de Módena.",
    price: 13.50, allergens: ["milk"], tags: ["vegetarian", "gluten_free"],
    imageUrl: "https://images.unsplash.com/photo-1608897013039-887f21d8c804?w=600&q=80",
    available: true,
  },
  {
    id: "s2", categoryId: "ensaladas",
    name: "Ensalada Mixta de Temporada",
    description: "Mezclum, tomate cherry, zanahoria, olivas negras, pepino y aderezo de limón.",
    price: 9.50, allergens: [], tags: ["vegetarian", "vegan", "gluten_free"],
    available: true,
  },
  {
    id: "s3", categoryId: "ensaladas",
    name: "Insalata di Rucola",
    description: "Rúcula, parmigiano reggiano en lascas, nueces, pera y vinagreta de miel.",
    price: 12.00, allergens: ["milk", "nuts"], tags: ["vegetarian", "gluten_free"],
    available: true,
  },

  // ── Pasta ─────────────────────────────────────────────────────────────────
  {
    id: "p1", categoryId: "pasta",
    name: "Spaghetti alla Carbonara",
    description: "Pasta artesanal con guanciale, yema de huevo, pecorino romano y pimienta negra. Receta original romana.",
    price: 15.00, halfPrice: 9.50, allergens: ["gluten", "eggs", "milk"], tags: [],
    imageUrl: "https://images.unsplash.com/photo-1612874742237-6526221588e3?w=600&q=80",
    available: true,
  },
  {
    id: "p2", categoryId: "pasta",
    name: "Tagliatelle al Ragú Bolognese",
    description: "Pasta fresca al huevo con ragú de ternera y cerdo cocido a fuego lento durante 4 horas.",
    price: 16.50, halfPrice: 10.00, allergens: ["gluten", "eggs", "milk"], tags: [],
    imageUrl: "https://images.unsplash.com/photo-1555949258-eb67b1ef0ceb?w=600&q=80",
    available: true,
  },
  {
    id: "p3", categoryId: "pasta",
    name: "Penne all'Arrabbiata",
    description: "Penne con salsa de tomate, guindilla, ajo y albahaca. Receta vegetariana.",
    price: 13.00, halfPrice: 8.50, allergens: ["gluten"], tags: ["vegetarian", "vegan"],
    available: true,
  },
  {
    id: "p4", categoryId: "pasta",
    name: "Gnocchi al Pesto Genovese",
    description: "Ñoquis de patata con pesto de albahaca, piñones tostados y parmigiano.",
    price: 14.50, halfPrice: 9.00, allergens: ["gluten", "milk", "nuts"], tags: ["vegetarian"],
    imageUrl: "https://images.unsplash.com/photo-1556761223-4c4282610caf?w=600&q=80",
    available: true,
  },

  // ── Pizza ─────────────────────────────────────────────────────────────────
  {
    id: "pz1", categoryId: "pizza",
    name: "Pizza Margherita",
    description: "Salsa de tomate San Marzano, mozzarella fior di latte y albahaca fresca. La clásica napolitana.",
    price: 13.00, allergens: ["gluten", "milk"], tags: ["vegetarian"],
    imageUrl: "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600&q=80",
    available: true,
  },
  {
    id: "pz2", categoryId: "pizza",
    name: "Pizza Quattro Stagioni",
    description: "Mozzarella, champiñones, alcachofas, jamón cocido y olivas negras. Dividida en cuatro secciones.",
    price: 16.00, allergens: ["gluten", "milk"], tags: [],
    available: true,
  },
  {
    id: "pz3", categoryId: "pizza",
    name: "Pizza Diavola",
    description: "Salsa de tomate, mozzarella, salami picante Calabrese y guindilla.",
    price: 15.00, allergens: ["gluten", "milk"], tags: ["spicy"],
    imageUrl: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&q=80",
    available: true,
  },
  {
    id: "pz4", categoryId: "pizza",
    name: "Pizza del Día",
    description: "Pregunta a nuestro personal por la pizza especial del día, elaborada con ingredientes de temporada.",
    price: 15.50, allergens: ["gluten", "milk"], tags: [],
    available: true,
  },

  // ── Carnes ────────────────────────────────────────────────────────────────
  {
    id: "c1", categoryId: "carnes",
    name: "Entrecot a la Brasa",
    description: "Entrecot de ternera (300 g) a la brasa con guarnición de patatas y ensalada mixta.",
    price: 24.00, allergens: [], tags: ["gluten_free"],
    imageUrl: "https://images.unsplash.com/photo-1558030137-a56c1b004fa3?w=600&q=80",
    available: true,
  },
  {
    id: "c2", categoryId: "carnes",
    name: "Carrillada de Ternera Estofada",
    description: "Carrillada estofada a fuego lento con vino tinto, verduras de raíz y puré de patatas trufado.",
    price: 22.00, allergens: ["milk", "celery"], tags: ["gluten_free"],
    available: true,
  },
  {
    id: "c3", categoryId: "carnes",
    name: "Pollo a la Marsala",
    description: "Suprema de pollo con salsa Marsala, champiñones porcini y polenta cremosa.",
    price: 19.00, allergens: ["milk"], tags: ["gluten_free"],
    available: true,
  },

  // ── Postres ───────────────────────────────────────────────────────────────
  {
    id: "d1", categoryId: "postres",
    name: "Tiramisú Casero",
    description: "El clásico italiano. Bizcochos savoiardi, mascarpone, espresso y cacao amargo. Receta de la casa.",
    price: 7.50, allergens: ["gluten", "eggs", "milk"], tags: ["vegetarian"],
    imageUrl: "https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=600&q=80",
    available: true,
  },
  {
    id: "d2", categoryId: "postres",
    name: "Panna Cotta di Vaniglia",
    description: "Panna cotta con vainilla de Madagascar y coulis de frutos rojos.",
    price: 6.50, allergens: ["milk"], tags: ["vegetarian", "gluten_free"],
    imageUrl: "https://images.unsplash.com/photo-1488477181946-6428a0291777?w=600&q=80",
    available: true,
  },
  {
    id: "d3", categoryId: "postres",
    name: "Tartaleta de Limón y Merengue",
    description: "Base crujiente de pasta brisa, crema de limón siciliano y merengue italiano tostado.",
    price: 7.00, allergens: ["gluten", "eggs", "milk"], tags: ["vegetarian"],
    available: true,
  },

  // ── Bebidas ───────────────────────────────────────────────────────────────
  {
    id: "b1", categoryId: "bebidas",
    name: "Vino Tinto de la Casa",
    description: "Vino tinto joven de la Terra Alta. Copa o jarra.",
    price: 3.50, allergens: ["sulphites"], tags: [],
    available: true,
  },
  {
    id: "b2", categoryId: "bebidas",
    name: "Agua Mineral",
    description: "Agua mineral natural o con gas. 50 cl.",
    price: 2.00, allergens: [], tags: ["vegan", "gluten_free"],
    available: true,
  },
  {
    id: "b3", categoryId: "bebidas",
    name: "Cerveza Artesanal",
    description: "Cerveza artesanal local de barril. Pregunta la variedad del día.",
    price: 3.50, allergens: ["gluten"], tags: [],
    available: true,
  },
  {
    id: "b4", categoryId: "bebidas",
    name: "Refrescos",
    description: "Coca-Cola, Fanta naranja, Fanta limón, Aquarius naranja.",
    price: 2.50, allergens: [], tags: [],
    available: true,
  },

  // ── Cafés ─────────────────────────────────────────────────────────────────
  {
    id: "k1", categoryId: "cafes",
    name: "Espresso Italiano",
    description: "Café de especialidad tostado en Italia. Servido en taza caliente.",
    price: 1.50, allergens: [], tags: ["vegan", "gluten_free"],
    available: true,
  },
  {
    id: "k2", categoryId: "cafes",
    name: "Cappuccino",
    description: "Espresso, leche vaporizada y espuma de leche. Esencia del café italiano.",
    price: 2.50, allergens: ["milk"], tags: ["vegetarian"],
    available: true,
  },
  {
    id: "k3", categoryId: "cafes",
    name: "Café con Leche",
    description: "Café solo con leche caliente a partes iguales.",
    price: 2.00, allergens: ["milk"], tags: ["vegetarian"],
    available: true,
  },
];
