import { describe, expect, it } from "vitest";
import { adaptTpvMenu, normalizeTpvAllergens } from "./tpv-menu-integration";

describe("TPV → QR Menu catalog integration", () => {
  it("normalizes Spanish, legacy English and accented allergen codes", () => {
    expect(
      normalizeTpvAllergens(
        "gluten, crustáceos, huevos, fish, frutos secos, sésamo, desconocido",
      ),
    ).toEqual([
      "gluten",
      "crustaceans",
      "eggs",
      "fish",
      "nuts",
      "sesame",
    ]);
  });

  it("adapts every shared catalog concern without a second data model", () => {
    const result = adaptTpvMenu([
      {
        id: "category-1",
        name: "Arroces",
        sortOrder: 3,
        translations: {
          en: { name: "Rice", description: "Rice dishes" },
        },
        subcategories: [
          { id: "subcategory-1", name: "Secos", sortOrder: 2 },
        ],
        products: [
          {
            id: "product-1",
            categoryId: "category-1",
            subcategoryId: "subcategory-1",
            name: "Paella vegetal",
            description: "  Para dos personas  ",
            price: "24.50",
            halfPortionPrice: "13.25",
            quantity: "500 g",
            allergens: "soja, leche",
            imageUrl: " https://cdn.example/paella.jpg ",
            outOfStock: true,
            isVegetariano: true,
            isVegano: true,
            isSinGluten: true,
            isPicante: false,
            translations: {
              en: { name: "Vegetable paella", description: "For two" },
            },
          },
        ],
      },
    ]);

    expect(result.categories).toEqual([
      {
        _id: "category-1",
        name: "Arroces",
        order: 3,
        available: true,
        translations: {
          en: { name: "Rice", description: "Rice dishes" },
        },
      },
      {
        _id: "subcategory-1",
        name: "Secos",
        order: 2,
        parentId: "category-1",
        available: true,
      },
    ]);
    expect(result.items).toEqual([
      {
        _id: "product-1",
        categoryId: "subcategory-1",
        name: "Paella vegetal",
        description: "Para dos personas",
        price: 24.5,
        imageUrl: "https://cdn.example/paella.jpg",
        videoUrl: undefined,
        quantity: "500 g",
        available: true,
        outOfStock: true,
        order: 0,
        tags: ["vegetarian", "vegan", "gluten-free"],
        halfPortionPrice: 13.25,
        allergens: ["soy", "milk"],
        translations: {
          en: { name: "Vegetable paella", description: "For two" },
        },
      },
    ]);
  });

  it("keeps zero prices and omits invalid optional values", () => {
    const result = adaptTpvMenu([
      {
        id: "category-1",
        name: "Promociones",
        products: [
          {
            id: "product-1",
            categoryId: "category-1",
            name: "Invitación",
            price: 0,
            halfPortionPrice: null,
            allergens: "",
          },
        ],
      },
    ]);

    expect(result.items[0]).toMatchObject({
      price: 0,
      halfPortionPrice: undefined,
      allergens: undefined,
      tags: undefined,
      outOfStock: false,
    });
  });
});
