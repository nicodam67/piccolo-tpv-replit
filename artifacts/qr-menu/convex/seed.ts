import { mutation } from "./_generated/server";
import { v } from "convex/values";

// Seeds the database with sample menu data if empty
export const seedIfEmpty = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("categories").first();
    if (existing) return; // already seeded

    const appetizersId = await ctx.db.insert("categories", {
      name: "Appetizers",
      description: "Small plates to start your meal",
      order: 1,
    });
    const mainsId = await ctx.db.insert("categories", {
      name: "Mains",
      description: "Hearty dishes crafted with care",
      order: 2,
    });
    const dessertsId = await ctx.db.insert("categories", {
      name: "Desserts",
      description: "Sweet endings to your experience",
      order: 3,
    });
    const drinksId = await ctx.db.insert("categories", {
      name: "Drinks",
      description: "Curated beverages and cocktails",
      order: 4,
    });

    // Appetizers
    const appetizers: Array<{
      categoryId: typeof appetizersId;
      name: string;
      description: string;
      price: number;
      imageUrl: string;
      available: boolean;
      order: number;
    }> = [
      {
        categoryId: appetizersId,
        name: "Burrata & Heirloom Tomato",
        description: "Creamy burrata with vine-ripened heirloom tomatoes, fresh basil, and aged balsamic.",
        price: 16,
        imageUrl: "https://images.unsplash.com/photo-1607532941433-304659e8198a?w=600&q=80",
        available: true,
        order: 1,
      },
      {
        categoryId: appetizersId,
        name: "Seared Scallops",
        description: "Pan-seared scallops with cauliflower purée, crispy capers, and lemon butter.",
        price: 22,
        imageUrl: "https://images.unsplash.com/photo-1519984388953-d2406bc725e1?w=600&q=80",
        available: true,
        order: 2,
      },
      {
        categoryId: appetizersId,
        name: "Truffle Arancini",
        description: "Crispy risotto balls filled with black truffle and fontina cheese.",
        price: 14,
        imageUrl: "https://images.unsplash.com/photo-1543339520-3fc521bf92e9?w=600&q=80",
        available: true,
        order: 3,
      },
    ];

    for (const item of appetizers) {
      await ctx.db.insert("menuItems", item);
    }

    // Mains
    const mains: Array<{
      categoryId: typeof mainsId;
      name: string;
      description: string;
      price: number;
      imageUrl: string;
      available: boolean;
      order: number;
    }> = [
      {
        categoryId: mainsId,
        name: "Filet Mignon",
        description: "8oz center-cut tenderloin with potato gratin, haricots verts, and red wine reduction.",
        price: 58,
        imageUrl: "https://images.unsplash.com/photo-1558030137-a56c1b004fa3?w=600&q=80",
        available: true,
        order: 1,
      },
      {
        categoryId: mainsId,
        name: "Pan-Roasted Salmon",
        description: "Atlantic salmon with wild mushroom risotto, asparagus, and dill cream.",
        price: 38,
        imageUrl: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=600&q=80",
        available: true,
        order: 2,
      },
      {
        categoryId: mainsId,
        name: "Wild Mushroom Tagliatelle",
        description: "House-made pasta with porcini, shiitake, and truffle oil. Vegetarian.",
        price: 28,
        imageUrl: "https://images.unsplash.com/photo-1556761223-4c4282610caf?w=600&q=80",
        available: true,
        order: 3,
      },
      {
        categoryId: mainsId,
        name: "Braised Short Rib",
        description: "48-hour braised beef short rib, celery root purée, glazed carrots.",
        price: 46,
        imageUrl: "https://images.unsplash.com/photo-1544025162-d76694265947?w=600&q=80",
        available: false,
        order: 4,
      },
    ];

    for (const item of mains) {
      await ctx.db.insert("menuItems", item);
    }

    // Desserts
    const desserts: Array<{
      categoryId: typeof dessertsId;
      name: string;
      description: string;
      price: number;
      imageUrl: string;
      available: boolean;
      order: number;
    }> = [
      {
        categoryId: dessertsId,
        name: "Chocolate Fondant",
        description: "Warm dark chocolate lava cake with vanilla bean ice cream and raspberry coulis.",
        price: 14,
        imageUrl: "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&q=80",
        available: true,
        order: 1,
      },
      {
        categoryId: dessertsId,
        name: "Crème Brûlée",
        description: "Classic Tahitian vanilla custard with a caramelized sugar crust.",
        price: 12,
        imageUrl: "https://images.unsplash.com/photo-1470124182917-cc6e71b22ecc?w=600&q=80",
        available: true,
        order: 2,
      },
    ];

    for (const item of desserts) {
      await ctx.db.insert("menuItems", item);
    }

    // Drinks
    const drinks: Array<{
      categoryId: typeof drinksId;
      name: string;
      description: string;
      price: number;
      imageUrl: string;
      available: boolean;
      order: number;
    }> = [
      {
        categoryId: drinksId,
        name: "Aperol Spritz",
        description: "Aperol, prosecco, and a splash of soda. Light and refreshing.",
        price: 14,
        imageUrl: "https://images.unsplash.com/photo-1560508180-03f285f67ded?w=600&q=80",
        available: true,
        order: 1,
      },
      {
        categoryId: drinksId,
        name: "Old Fashioned",
        description: "Bourbon, Angostura bitters, demerara sugar, and orange peel.",
        price: 18,
        imageUrl: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=600&q=80",
        available: true,
        order: 2,
      },
      {
        categoryId: drinksId,
        name: "Sparkling Water",
        description: "San Pellegrino, served chilled.",
        price: 5,
        imageUrl: "https://images.unsplash.com/photo-1603394151492-5e9b974b090b?w=600&q=80",
        available: true,
        order: 3,
      },
    ];

    for (const item of drinks) {
      await ctx.db.insert("menuItems", item);
    }
  },
});

// Public seed (no auth required) for initial setup
export const publicSeedIfEmpty = mutation({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    // Simple guard — not a real secret, just prevents accidental calls
    if (args.secret !== "init") return;
    const existing = await ctx.db.query("categories").first();
    if (existing) return;
    // Reuse the same logic — we call inner mutations via ctx.db directly
    const appetizersId = await ctx.db.insert("categories", { name: "Appetizers", description: "Small plates to start your meal", order: 1 });
    const mainsId = await ctx.db.insert("categories", { name: "Mains", description: "Hearty dishes crafted with care", order: 2 });
    const dessertsId = await ctx.db.insert("categories", { name: "Desserts", description: "Sweet endings to your experience", order: 3 });
    const drinksId = await ctx.db.insert("categories", { name: "Drinks", description: "Curated beverages and cocktails", order: 4 });

    const items: Array<{
      categoryId: typeof appetizersId | typeof mainsId | typeof dessertsId | typeof drinksId;
      name: string;
      description: string;
      price: number;
      imageUrl: string;
      available: boolean;
      order: number;
    }> = [
      { categoryId: appetizersId, name: "Burrata & Heirloom Tomato", description: "Creamy burrata with vine-ripened heirloom tomatoes, fresh basil, and aged balsamic.", price: 16, imageUrl: "https://images.unsplash.com/photo-1607532941433-304659e8198a?w=600&q=80", available: true, order: 1 },
      { categoryId: appetizersId, name: "Seared Scallops", description: "Pan-seared scallops with cauliflower purée, crispy capers, and lemon butter.", price: 22, imageUrl: "https://images.unsplash.com/photo-1519984388953-d2406bc725e1?w=600&q=80", available: true, order: 2 },
      { categoryId: appetizersId, name: "Truffle Arancini", description: "Crispy risotto balls filled with black truffle and fontina cheese.", price: 14, imageUrl: "https://images.unsplash.com/photo-1543339520-3fc521bf92e9?w=600&q=80", available: true, order: 3 },
      { categoryId: mainsId, name: "Filet Mignon", description: "8oz center-cut tenderloin with potato gratin, haricots verts, and red wine reduction.", price: 58, imageUrl: "https://images.unsplash.com/photo-1558030137-a56c1b004fa3?w=600&q=80", available: true, order: 1 },
      { categoryId: mainsId, name: "Pan-Roasted Salmon", description: "Atlantic salmon with wild mushroom risotto, asparagus, and dill cream.", price: 38, imageUrl: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=600&q=80", available: true, order: 2 },
      { categoryId: mainsId, name: "Wild Mushroom Tagliatelle", description: "House-made pasta with porcini, shiitake, and truffle oil. Vegetarian.", price: 28, imageUrl: "https://images.unsplash.com/photo-1556761223-4c4282610caf?w=600&q=80", available: true, order: 3 },
      { categoryId: dessertsId, name: "Chocolate Fondant", description: "Warm dark chocolate lava cake with vanilla bean ice cream and raspberry coulis.", price: 14, imageUrl: "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&q=80", available: true, order: 1 },
      { categoryId: dessertsId, name: "Crème Brûlée", description: "Classic Tahitian vanilla custard with a caramelized sugar crust.", price: 12, imageUrl: "https://images.unsplash.com/photo-1470124182917-cc6e71b22ecc?w=600&q=80", available: true, order: 2 },
      { categoryId: drinksId, name: "Aperol Spritz", description: "Aperol, prosecco, and a splash of soda. Light and refreshing.", price: 14, imageUrl: "https://images.unsplash.com/photo-1560508180-03f285f67ded?w=600&q=80", available: true, order: 1 },
      { categoryId: drinksId, name: "Old Fashioned", description: "Bourbon, Angostura bitters, demerara sugar, and orange peel.", price: 18, imageUrl: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=600&q=80", available: true, order: 2 },
      { categoryId: drinksId, name: "Sparkling Water", description: "San Pellegrino, served chilled.", price: 5, imageUrl: "https://images.unsplash.com/photo-1603394151492-5e9b974b090b?w=600&q=80", available: true, order: 3 },
    ];
    for (const item of items) {
      await ctx.db.insert("menuItems", item);
    }
  },
});
