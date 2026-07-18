/**
 * Demo data for the QR Menu when VITE_CONVEX_URL is not configured.
 * Derived from convex/seed.ts — same structure as real Convex documents.
 */

export const DEMO_CATEGORIES = [
  { _id: "cat_appetizers", _creationTime: 0, name: "Appetizers", description: "Small plates to start your meal", order: 1 },
  { _id: "cat_mains",      _creationTime: 0, name: "Mains",      description: "Hearty dishes crafted with care",  order: 2 },
  { _id: "cat_desserts",   _creationTime: 0, name: "Desserts",   description: "Sweet endings to your experience", order: 3 },
  { _id: "cat_drinks",     _creationTime: 0, name: "Drinks",     description: "Curated beverages and cocktails",  order: 4 },
];

export const DEMO_ITEMS = [
  // Appetizers
  { _id: "item_01", _creationTime: 0, categoryId: "cat_appetizers", name: "Burrata & Heirloom Tomato",  description: "Creamy burrata with vine-ripened heirloom tomatoes, fresh basil, and aged balsamic.", price: 16, imageUrl: "https://images.unsplash.com/photo-1607532941433-304659e8198a?w=600&q=80", available: true, order: 1 },
  { _id: "item_02", _creationTime: 0, categoryId: "cat_appetizers", name: "Seared Scallops",           description: "Pan-seared scallops with cauliflower purée, crispy capers, and lemon butter.",             price: 22, imageUrl: "https://images.unsplash.com/photo-1519984388953-d2406bc725e1?w=600&q=80", available: true, order: 2 },
  { _id: "item_03", _creationTime: 0, categoryId: "cat_appetizers", name: "Truffle Arancini",          description: "Crispy risotto balls filled with black truffle and fontina cheese.",                       price: 14, imageUrl: "https://images.unsplash.com/photo-1543339520-3fc521bf92e9?w=600&q=80", available: true, order: 3 },
  // Mains
  { _id: "item_04", _creationTime: 0, categoryId: "cat_mains",      name: "Filet Mignon",              description: "8oz center-cut tenderloin with potato gratin, haricots verts, and red wine reduction.",    price: 58, imageUrl: "https://images.unsplash.com/photo-1558030137-a56c1b004fa3?w=600&q=80", available: true, order: 1 },
  { _id: "item_05", _creationTime: 0, categoryId: "cat_mains",      name: "Pan-Roasted Salmon",        description: "Atlantic salmon with wild mushroom risotto, asparagus, and dill cream.",                   price: 38, imageUrl: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=600&q=80", available: true, order: 2 },
  { _id: "item_06", _creationTime: 0, categoryId: "cat_mains",      name: "Wild Mushroom Tagliatelle", description: "House-made pasta with porcini, shiitake, and truffle oil. Vegetarian.",                    price: 28, imageUrl: "https://images.unsplash.com/photo-1556761223-4c4282610caf?w=600&q=80", available: true, order: 3 },
  { _id: "item_07", _creationTime: 0, categoryId: "cat_mains",      name: "Braised Short Rib",         description: "48-hour braised beef short rib, celery root purée, glazed carrots.",                       price: 46, imageUrl: "https://images.unsplash.com/photo-1544025162-d76694265947?w=600&q=80", available: false, order: 4 },
  // Desserts
  { _id: "item_08", _creationTime: 0, categoryId: "cat_desserts",   name: "Chocolate Fondant",         description: "Warm dark chocolate lava cake with vanilla bean ice cream and raspberry coulis.",          price: 14, imageUrl: "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&q=80", available: true, order: 1 },
  { _id: "item_09", _creationTime: 0, categoryId: "cat_desserts",   name: "Crème Brûlée",              description: "Classic Tahitian vanilla custard with a caramelized sugar crust.",                        price: 12, imageUrl: "https://images.unsplash.com/photo-1470124182917-cc6e71b22ecc?w=600&q=80", available: true, order: 2 },
  // Drinks
  { _id: "item_10", _creationTime: 0, categoryId: "cat_drinks",     name: "Aperol Spritz",             description: "Aperol, prosecco, and a splash of soda. Light and refreshing.",                           price: 14, imageUrl: "https://images.unsplash.com/photo-1560508180-03f285f67ded?w=600&q=80", available: true, order: 1 },
  { _id: "item_11", _creationTime: 0, categoryId: "cat_drinks",     name: "Old Fashioned",             description: "Bourbon, Angostura bitters, demerara sugar, and orange peel.",                            price: 18, imageUrl: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=600&q=80", available: true, order: 2 },
  { _id: "item_12", _creationTime: 0, categoryId: "cat_drinks",     name: "Sparkling Water",           description: "San Pellegrino, served chilled.",                                                        price:  5, imageUrl: "https://images.unsplash.com/photo-1603394151492-5e9b974b090b?w=600&q=80", available: true, order: 3 },
];

export const DEMO_BRANDING = {
  _id: "branding_01",
  _creationTime: 0,
  restaurantName: "Piccolo la Ràpita",
  tagline: "Cocina mediterránea de temporada",
  address: "Av. del Port, s/n, la Ràpita, Tarragona",
  phone: "+34 977 744 000",
  city: "la Ràpita",
  province: "Tarragona",
  country: "España",
  establishedYear: "2010",
  heroImageUrl: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1200&q=80",
  themeColors: {
    primary: "oklch(35% 0.12 30)",
    background: "oklch(98% 0.01 60)",
    accent: "oklch(65% 0.18 80)",
  },
};
