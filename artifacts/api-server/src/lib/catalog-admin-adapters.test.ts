import { describe, expect, it } from "vitest";
import {
  allergenCodesForLegacyTextField,
  buildTranslationsPatchFromFormEdit,
  mergeTranslationsPatch,
  parseProductAllergensResponse,
  pruneTranslations,
  translationsToLegacyForm,
} from "../../../../lib/api-client-react/src/catalog-admin-adapters";

describe("catalog-admin adapters", () => {
  it("parses allergen response without flattening cache and overrides", () => {
    const view = parseProductAllergensResponse({
      cache: [{ allergenCode: "gluten", type: "contains", source: "recipe", needsReview: false }],
      overrides: [{ allergenCode: "milk", type: "traces", allergenName: "Leche" }],
      needsReview: true,
    });
    expect(view.cache).toHaveLength(1);
    expect(view.overrides).toHaveLength(1);
    expect(view.needsReview).toBe(true);
  });

  it("builds legacy allergen text from EU codes only", () => {
    const text = allergenCodesForLegacyTextField({
      cache: [{ allergenCode: "gluten", type: "contains" }],
      overrides: [{ allergenCode: "milk", type: "traces" }],
      needsReview: false,
    });
    expect(text.split(", ").sort()).toEqual(["gluten", "milk"]);
  });

  it("preserves untouched locales when editing one translation", () => {
    const existing = { en: { name: "Beer" }, fr: { name: "Bière" } };
    const patch = buildTranslationsPatchFromFormEdit(existing, ["en", "fr"], "en", { name: "Craft beer" });
    expect(patch).toEqual({ en: { name: "Craft beer" }, fr: { name: "Bière" } });
  });

  it("round-trips translations through form without dropping partial locales", () => {
    const backend = { en: { name: "Water", description: "Still" } };
    const form = translationsToLegacyForm(backend, ["en", "fr"]);
    const merged = mergeTranslationsPatch(backend, { ...form, fr: { name: "Eau" } });
    expect(merged).toEqual({ en: { name: "Water", description: "Still" }, fr: { name: "Eau" } });
  });

  it("prunes empty translation entries", () => {
    expect(pruneTranslations({ en: { name: "", description: "" }, fr: { name: "Eau" } })).toEqual({ fr: { name: "Eau" } });
  });
});
