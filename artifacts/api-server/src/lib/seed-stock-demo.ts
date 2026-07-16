/**
 * seed-stock-demo.ts
 * Creates realistic demo data for the stock/ingredients module.
 * Idempotent: skips creation if data already exists.
 */
import { db } from "@workspace/db";
import {
  ingredientCategoriesTable,
  storageLocationsTable,
  ingredientsTable,
  subrecipesTable,
  subrecipeItemsTable,
} from "@workspace/db";
import { eq, count } from "drizzle-orm";

export async function seedStockDemo() {
  // ── Skip if already seeded ─────────────────────────────────────────────────
  const [{ total }] = await db.select({ total: count() }).from(ingredientsTable);
  if ((total ?? 0) > 0) return;

  // ── 1. Categories ──────────────────────────────────────────────────────────
  const categories = await db
    .insert(ingredientCategoriesTable)
    .values([
      { name: "Carnes y aves", color: "#ef4444", icon: "🥩", sortOrder: 1 },
      { name: "Pescados y mariscos", color: "#3b82f6", icon: "🐟", sortOrder: 2 },
      { name: "Verduras y hortalizas", color: "#22c55e", icon: "🥬", sortOrder: 3 },
      { name: "Lácteos y huevos", color: "#f59e0b", icon: "🧀", sortOrder: 4 },
      { name: "Panadería y masas", color: "#f97316", icon: "🍞", sortOrder: 5 },
      { name: "Aceites y condimentos", color: "#84cc16", icon: "🫙", sortOrder: 6 },
      { name: "Bebidas", color: "#8b5cf6", icon: "🍷", sortOrder: 7 },
      { name: "Varios / Seco", color: "#6366f1", icon: "📦", sortOrder: 8 },
    ])
    .returning();

  const catMap = new Map(categories.map(c => [c.name, c.id]));

  // ── 2. Storage locations ───────────────────────────────────────────────────
  const locations = await db
    .insert(storageLocationsTable)
    .values([
      { name: "Cámara de carnes", temperature: "refrigerated", description: "2–4°C" },
      { name: "Cámara de pescados", temperature: "refrigerated", description: "0–2°C" },
      { name: "Cámara de verduras", temperature: "refrigerated", description: "4–8°C" },
      { name: "Cámara de lácteos", temperature: "refrigerated", description: "2–6°C" },
      { name: "Congelador principal", temperature: "frozen", description: "−18°C" },
      { name: "Almacén seco", temperature: "dry", description: "Temperatura ambiente" },
      { name: "Bodega de vinos", temperature: "ambient", description: "16–18°C, oscuridad" },
    ])
    .returning();

  const locMap = new Map(locations.map(l => [l.name, l.id]));

  // ── 3. Ingredients ─────────────────────────────────────────────────────────
  const ingredientData = [
    // Carnes
    { name: "Ternera (lomo bajo)", categoryId: catMap.get("Carnes y aves"), locationId: locMap.get("Cámara de carnes"), unit: "kg", purchaseUnit: "kg", consumptionUnit: "kg", conversionFactor: "1", purchaseCost: "18.50", averageCost: "18.50", lastPurchaseCost: "18.50", currentStock: "12.5", minStock: "3", optimalStock: "15", maxStock: "20", allergenTags: [] as string[] },
    { name: "Pollo (pechuga)", categoryId: catMap.get("Carnes y aves"), locationId: locMap.get("Cámara de carnes"), unit: "kg", purchaseUnit: "kg", consumptionUnit: "kg", conversionFactor: "1", purchaseCost: "6.80", averageCost: "6.80", lastPurchaseCost: "6.80", currentStock: "8", minStock: "2", optimalStock: "10", maxStock: "15", allergenTags: [] as string[] },
    { name: "Cerdo (secreto)", categoryId: catMap.get("Carnes y aves"), locationId: locMap.get("Cámara de carnes"), unit: "kg", purchaseUnit: "kg", consumptionUnit: "kg", conversionFactor: "1", purchaseCost: "12.40", averageCost: "12.40", lastPurchaseCost: "12.40", currentStock: "6", minStock: "2", optimalStock: "8", maxStock: "12", allergenTags: [] as string[] },
    // Pescados
    { name: "Salmón (filetes)", categoryId: catMap.get("Pescados y mariscos"), locationId: locMap.get("Cámara de pescados"), unit: "kg", purchaseUnit: "kg", consumptionUnit: "kg", conversionFactor: "1", purchaseCost: "16.00", averageCost: "16.00", lastPurchaseCost: "16.00", currentStock: "5.5", minStock: "2", optimalStock: "8", maxStock: "10", allergenTags: ["pescado"] },
    { name: "Bacalao desalado", categoryId: catMap.get("Pescados y mariscos"), locationId: locMap.get("Cámara de pescados"), unit: "kg", purchaseUnit: "kg", consumptionUnit: "kg", conversionFactor: "1", purchaseCost: "22.00", averageCost: "22.00", lastPurchaseCost: "22.00", currentStock: "3", minStock: "1", optimalStock: "5", maxStock: "8", allergenTags: ["pescado"] },
    // Verduras
    { name: "Tomate cherry", categoryId: catMap.get("Verduras y hortalizas"), locationId: locMap.get("Cámara de verduras"), unit: "kg", purchaseUnit: "caja", consumptionUnit: "kg", conversionFactor: "5", purchaseCost: "8.50", averageCost: "1.70", lastPurchaseCost: "8.50", currentStock: "4", minStock: "1", optimalStock: "6", maxStock: "10", allergenTags: [] as string[] },
    { name: "Lechuga romana", categoryId: catMap.get("Verduras y hortalizas"), locationId: locMap.get("Cámara de verduras"), unit: "ud", purchaseUnit: "caja", consumptionUnit: "ud", conversionFactor: "12", purchaseCost: "14.40", averageCost: "1.20", lastPurchaseCost: "14.40", currentStock: "10", minStock: "4", optimalStock: "15", maxStock: "24", allergenTags: [] as string[] },
    { name: "Cebolla", categoryId: catMap.get("Verduras y hortalizas"), locationId: locMap.get("Almacén seco"), unit: "kg", purchaseUnit: "saco", consumptionUnit: "kg", conversionFactor: "10", purchaseCost: "6.00", averageCost: "0.60", lastPurchaseCost: "6.00", currentStock: "8", minStock: "2", optimalStock: "10", maxStock: "15", allergenTags: [] as string[] },
    { name: "Ajo", categoryId: catMap.get("Verduras y hortalizas"), locationId: locMap.get("Almacén seco"), unit: "kg", purchaseUnit: "malla", consumptionUnit: "kg", conversionFactor: "1", purchaseCost: "3.50", averageCost: "3.50", lastPurchaseCost: "3.50", currentStock: "2.5", minStock: "0.5", optimalStock: "3", maxStock: "5", allergenTags: [] as string[] },
    // Lácteos
    { name: "Huevos (L)", categoryId: catMap.get("Lácteos y huevos"), locationId: locMap.get("Cámara de lácteos"), unit: "ud", purchaseUnit: "cartón 30", consumptionUnit: "ud", conversionFactor: "30", purchaseCost: "5.40", averageCost: "0.18", lastPurchaseCost: "5.40", currentStock: "60", minStock: "20", optimalStock: "90", maxStock: "120", allergenTags: ["huevo"] },
    { name: "Nata 35% M.G.", categoryId: catMap.get("Lácteos y huevos"), locationId: locMap.get("Cámara de lácteos"), unit: "L", purchaseUnit: "L", consumptionUnit: "L", conversionFactor: "1", purchaseCost: "2.80", averageCost: "2.80", lastPurchaseCost: "2.80", currentStock: "4", minStock: "1", optimalStock: "6", maxStock: "10", allergenTags: ["lacteo"] },
    { name: "Mantequilla", categoryId: catMap.get("Lácteos y huevos"), locationId: locMap.get("Cámara de lácteos"), unit: "kg", purchaseUnit: "kg", consumptionUnit: "kg", conversionFactor: "1", purchaseCost: "7.20", averageCost: "7.20", lastPurchaseCost: "7.20", currentStock: "3", minStock: "0.5", optimalStock: "4", maxStock: "6", allergenTags: ["lacteo"] },
    { name: "Parmesano (cuña)", categoryId: catMap.get("Lácteos y huevos"), locationId: locMap.get("Cámara de lácteos"), unit: "kg", purchaseUnit: "kg", consumptionUnit: "kg", conversionFactor: "1", purchaseCost: "18.00", averageCost: "18.00", lastPurchaseCost: "18.00", currentStock: "2", minStock: "0.5", optimalStock: "3", maxStock: "5", allergenTags: ["lacteo"] },
    // Panadería
    { name: "Harina de trigo (T55)", categoryId: catMap.get("Panadería y masas"), locationId: locMap.get("Almacén seco"), unit: "kg", purchaseUnit: "saco 25kg", consumptionUnit: "kg", conversionFactor: "25", purchaseCost: "18.50", averageCost: "0.74", lastPurchaseCost: "18.50", currentStock: "50", minStock: "10", optimalStock: "75", maxStock: "100", allergenTags: ["gluten"] },
    { name: "Pan de hamburguesa", categoryId: catMap.get("Panadería y masas"), locationId: locMap.get("Almacén seco"), unit: "ud", purchaseUnit: "bolsa 12", consumptionUnit: "ud", conversionFactor: "12", purchaseCost: "3.60", averageCost: "0.30", lastPurchaseCost: "3.60", currentStock: "36", minStock: "12", optimalStock: "48", maxStock: "60", allergenTags: ["gluten"] },
    // Aceites y condimentos
    { name: "Aceite de oliva virgen extra", categoryId: catMap.get("Aceites y condimentos"), locationId: locMap.get("Almacén seco"), unit: "L", purchaseUnit: "garrafa 5L", consumptionUnit: "L", conversionFactor: "5", purchaseCost: "30.00", averageCost: "6.00", lastPurchaseCost: "30.00", currentStock: "10", minStock: "2", optimalStock: "15", maxStock: "20", allergenTags: [] as string[] },
    { name: "Sal marina", categoryId: catMap.get("Aceites y condimentos"), locationId: locMap.get("Almacén seco"), unit: "kg", purchaseUnit: "saco 5kg", consumptionUnit: "kg", conversionFactor: "5", purchaseCost: "2.50", averageCost: "0.50", lastPurchaseCost: "2.50", currentStock: "5", minStock: "1", optimalStock: "8", maxStock: "10", allergenTags: [] as string[] },
    { name: "Pimienta negra (molida)", categoryId: catMap.get("Aceites y condimentos"), locationId: locMap.get("Almacén seco"), unit: "kg", purchaseUnit: "kg", consumptionUnit: "kg", conversionFactor: "1", purchaseCost: "12.00", averageCost: "12.00", lastPurchaseCost: "12.00", currentStock: "0.8", minStock: "0.2", optimalStock: "1", maxStock: "2", allergenTags: [] as string[] },
    // Bebidas
    { name: "Vino blanco (cocina)", categoryId: catMap.get("Bebidas"), locationId: locMap.get("Bodega de vinos"), unit: "L", purchaseUnit: "botella 75cl", consumptionUnit: "L", conversionFactor: "0.75", purchaseCost: "3.50", averageCost: "4.67", lastPurchaseCost: "3.50", currentStock: "3", minStock: "1", optimalStock: "5", maxStock: "8", allergenTags: ["sulfitos"] },
    { name: "Caldo de pollo (casero)", categoryId: catMap.get("Varios / Seco"), locationId: locMap.get("Congelador principal"), unit: "L", purchaseUnit: "L", consumptionUnit: "L", conversionFactor: "1", purchaseCost: "1.20", averageCost: "1.20", lastPurchaseCost: "1.20", currentStock: "8", minStock: "2", optimalStock: "10", maxStock: "15", allergenTags: [] as string[] },
  ];

  const ingredients = await db
    .insert(ingredientsTable)
    .values(ingredientData.map(d => ({
      ...d,
      supplierName: null,
      active: true,
    })))
    .returning();

  const ingMap = new Map(ingredients.map(i => [i.name, i.id]));

  // ── 4. Subrecetas demo ─────────────────────────────────────────────────────
  const [bechamel] = await db
    .insert(subrecipesTable)
    .values({
      name: "Bechamel base",
      unit: "L",
      yieldQuantity: "1",
      notes: "Bechamel clásica para gratinados y croquetas",
      active: true,
      cost: "0",
    })
    .returning();

  if (bechamel) {
    const mantequillaId = ingMap.get("Mantequilla");
    const harinaId = ingMap.get("Harina de trigo (T55)");
    const nataId = ingMap.get("Nata 35% M.G.");

    const items = [];
    if (mantequillaId) items.push({ subrecipeId: bechamel.id, ingredientId: mantequillaId, quantity: "0.080", unit: "kg", wastePercent: "0" });
    if (harinaId) items.push({ subrecipeId: bechamel.id, ingredientId: harinaId, quantity: "0.080", unit: "kg", wastePercent: "2" });
    if (nataId) items.push({ subrecipeId: bechamel.id, ingredientId: nataId, quantity: "1.000", unit: "L", wastePercent: "0" });
    if (items.length > 0) await db.insert(subrecipeItemsTable).values(items);
  }

  const [vinaigretteBase] = await db
    .insert(subrecipesTable)
    .values({
      name: "Vinagreta básica",
      unit: "L",
      yieldQuantity: "0.5",
      notes: "3 partes aceite / 1 parte vinagre. Base para ensaladas.",
      active: true,
      cost: "0",
    })
    .returning();

  if (vinaigretteBase) {
    const aceiteId = ingMap.get("Aceite de oliva virgen extra");
    const salId = ingMap.get("Sal marina");
    const items = [];
    if (aceiteId) items.push({ subrecipeId: vinaigretteBase.id, ingredientId: aceiteId, quantity: "0.375", unit: "L", wastePercent: "0" });
    if (salId) items.push({ subrecipeId: vinaigretteBase.id, ingredientId: salId, quantity: "0.005", unit: "kg", wastePercent: "0" });
    if (items.length > 0) await db.insert(subrecipeItemsTable).values(items);
  }
}
