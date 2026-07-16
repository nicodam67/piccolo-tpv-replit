/**
 * Import a Convex snapshot export into the PostgreSQL database.
 *
 * Usage:
 *   node scripts/import-convex-snapshot.mjs [--dry-run] [--clear]
 *
 * --dry-run : Print what would be inserted without touching the DB.
 * --clear   : DELETE all existing categories/products/business_config before importing.
 *
 * Expected files (from the extracted Convex snapshot):
 *   /tmp/convex_export/categories/documents.jsonl
 *   /tmp/convex_export/menuItems/documents.jsonl
 *   /tmp/convex_export/branding/documents.jsonl
 *   /tmp/convex_export/_storage/documents.jsonl
 */

import { readFileSync } from "fs";
import pg from "pg";
import { randomUUID } from "crypto";
import "dotenv/config";

const { Pool } = pg;
const DRY_RUN = process.argv.includes("--dry-run");
const CLEAR   = process.argv.includes("--clear");

const EXPORT_DIR = "/tmp/convex_export";
const CONVEX_CDN = "https://kindhearted-viper-426.convex.cloud/api/storage";

// ── helpers ───────────────────────────────────────────────────────────────────

function readJsonl(file) {
  return readFileSync(`${EXPORT_DIR}/${file}`, "utf-8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(JSON.parse);
}

// Convex allergen code → our comma-separated string token
const ALLERGEN_MAP = {
  gluten:      "gluten",
  eggs:        "huevos",
  milk:        "leche",
  celery:      "apio",
  sulphites:   "sulfitos",
  soy:         "soja",
  peanuts:     "cacahuetes",
  nuts:        "frutos_cascara",
  fish:        "pescado",
  molluscs:    "moluscos",
  mustard:     "mostaza",
  crustaceans: "crustaceos",
  sesame:      "sesamo",
  lupin:       "altramuces",
};

function mapAllergens(arr = []) {
  return arr.map((a) => ALLERGEN_MAP[a] ?? a).join(", ");
}

function hasTags(tags = [], ...keys) {
  return keys.some((k) => tags.includes(k));
}

// Convex schedule → our opening_hours JSONB structure
const DAY_MAP = {
  monday: "mon", tuesday: "tue", wednesday: "wed", thursday: "thu",
  friday: "fri", saturday: "sat", sunday: "sun",
};

function mapSchedule(schedule = []) {
  const result = {};
  for (const entry of schedule) {
    const key = DAY_MAP[entry.day];
    if (!key) continue;
    const s1 = entry.shift1;
    const s2 = entry.shift2;
    if (!s1?.open && !s2?.open) continue; // closed all day — omit key
    const slot = {};
    if (s1?.open) {
      slot.open  = s1.openTime;
      slot.close = s1.closeTime;
    }
    if (s2?.open) {
      slot.open2  = s2.openTime;
      slot.close2 = s2.closeTime;
      // If shift1 was closed, shift2 becomes the primary slot
      if (!s1?.open) {
        slot.open  = s2.openTime;
        slot.close = s2.closeTime;
        delete slot.open2;
        delete slot.close2;
      }
    }
    result[key] = slot;
  }
  return result;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    // ── 0. Load source data ────────────────────────────────────────────────────
    const convexCats    = readJsonl("categories/documents.jsonl");
    const convexItems   = readJsonl("menuItems/documents.jsonl");
    const convexBrand   = readJsonl("branding/documents.jsonl");
    const convexStorage = readJsonl("_storage/documents.jsonl");

    // Build storage ID → CDN URL
    const storageUrl = new Map(
      convexStorage.map((s) => [s._id, `${CONVEX_CDN}/${s.internalId}`])
    );

    // ── 1. Separate top-level vs sub-categories ────────────────────────────────
    const topCats  = convexCats.filter((c) => !c.parentId).sort((a, b) => a.order - b.order);
    const subCats  = convexCats.filter((c) =>  c.parentId).sort((a, b) => a.order - b.order);

    console.log(`Categories: ${topCats.length} top-level, ${subCats.length} sub-categories`);
    console.log(`Products: ${convexItems.length}`);

    // ── 2. Optionally clear existing data ──────────────────────────────────────
    if (CLEAR && !DRY_RUN) {
      console.log("\n⚠️  Clearing existing categories, subcategories, products…");
      await client.query("DELETE FROM order_items");
      await client.query("DELETE FROM orders");
      await client.query("DELETE FROM product_formats");
      await client.query("DELETE FROM products");
      await client.query("DELETE FROM subcategories");
      await client.query("DELETE FROM categories");
      await client.query("DELETE FROM business_config");
      console.log("   Done.\n");
    }

    await client.query("BEGIN");

    // ── 3. Insert top-level categories ─────────────────────────────────────────
    // convexId → postgres UUID
    const catIdMap = new Map();

    for (const [i, cat] of topCats.entries()) {
      const id = randomUUID();
      catIdMap.set(cat._id, id);

      const active = cat.available !== false;
      const sortOrder = Math.round(cat.order ?? i);

      console.log(`  [cat] ${cat.name}  active=${active}  order=${sortOrder}`);
      if (!DRY_RUN) {
        await client.query(
          `INSERT INTO categories (id, name, sort_order, active)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT DO NOTHING`,
          [id, cat.name, sortOrder, active]
        );
      }
    }

    // ── 4. Insert sub-categories ───────────────────────────────────────────────
    // convexSubId → { pgId, pgParentId }
    const subIdMap = new Map();

    for (const [i, sub] of subCats.entries()) {
      const pgParentId = catIdMap.get(sub.parentId);
      if (!pgParentId) {
        console.warn(`  [sub] ⚠️  parent not found for sub-category "${sub.name}", skipping`);
        continue;
      }
      const id = randomUUID();
      subIdMap.set(sub._id, { pgId: id, pgParentId });

      const active = sub.available !== false;
      const sortOrder = Math.round(sub.order ?? i);

      console.log(`  [sub] ${sub.name}  parent=${pgParentId.slice(0,8)}…  order=${sortOrder}`);
      if (!DRY_RUN) {
        await client.query(
          `INSERT INTO subcategories (id, category_id, name, sort_order, active)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT DO NOTHING`,
          [id, pgParentId, sub.name, sortOrder, active]
        );
      }
    }

    // ── 5. Insert products ─────────────────────────────────────────────────────
    let inserted = 0, skipped = 0;

    for (const item of convexItems.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
      // Resolve category
      let categoryId   = catIdMap.get(item.categoryId);
      let subcategoryId = null;

      if (!categoryId) {
        // Maybe it references a sub-category
        const sub = subIdMap.get(item.categoryId);
        if (sub) {
          categoryId    = sub.pgParentId;
          subcategoryId = sub.pgId;
        } else {
          console.warn(`  [item] ⚠️  no category for "${item.name}" (${item.categoryId}), skipping`);
          skipped++;
          continue;
        }
      }

      const id          = randomUUID();
      const name        = item.name;
      const description = item.description || null;
      const price       = String(item.price ?? 0);
      const halfPortionPrice = item.halfPortionPrice != null ? String(item.halfPortionPrice) : null;
      const quantity    = item.quantity || null;
      const allergens   = mapAllergens(item.allergens);
      const sortOrder   = Math.round(item.order ?? 0);
      const active      = item.available !== false;

      // Dietary tags
      const tags = item.tags ?? [];
      const isVegetariano = hasTags(tags, "vegetariana", "vegetarian");
      const isVegano      = hasTags(tags, "vegana", "vegan");
      const isSinGluten   = hasTags(tags, "gluten-free");
      const isPicante     = hasTags(tags, "picante", "spicy");

      // Image URL
      const imageUrl = item.imageStorageId
        ? (storageUrl.get(item.imageStorageId) ?? null)
        : null;

      console.log(`  [item] ${name}  ${price}€  cat=${categoryId.slice(0,8)}…`);
      if (!DRY_RUN) {
        await client.query(
          `INSERT INTO products (
             id, category_id, subcategory_id, name, description, price,
             half_portion_price, quantity, allergens, sort_order, active,
             is_vegetariano, is_vegano, is_sin_gluten, is_picante,
             image_url, tpv_visible, qr_visible, delivery_visible,
             prep_zone, tax_rate
           ) VALUES (
             $1,$2,$3,$4,$5,$6,
             $7,$8,$9,$10,$11,
             $12,$13,$14,$15,
             $16,$17,$18,$19,
             $20,$21
           ) ON CONFLICT DO NOTHING`,
          [
            id, categoryId, subcategoryId, name, description, price,
            halfPortionPrice, quantity, allergens, sortOrder, active,
            isVegetariano, isVegano, isSinGluten, isPicante,
            imageUrl, true, true, false,
            "cocina", 10,
          ]
        );
      }
      inserted++;
    }

    // ── 6. Upsert business_config (branding) ───────────────────────────────────
    const brand = convexBrand[0];
    if (brand) {
      const openingHours  = mapSchedule(brand.schedule ?? []);
      const accentColor   = brand.themeColors?.primary ?? "#ef4444";
      const cardLayout    = brand.cardSettings?.layout ?? "grid";
      const foundedYear   = brand.establishedYear ? parseInt(brand.establishedYear, 10) : null;
      const heroImageUrl  = brand.heroImageUrl ?? "";
      const restaurantName = (brand.restaurantName ?? "").trim();
      const tagline       = (brand.tagline ?? "").trim();
      const phone         = (brand.phone ?? "").trim();
      const address       = [
        brand.address, brand.city, brand.postalCode, brand.province
      ].filter(Boolean).map(s => s.trim()).join(", ");

      console.log(`\n  [branding] ${restaurantName}  ${phone}  accent=${accentColor}`);
      console.log(`  [branding] opening_hours keys: ${Object.keys(openingHours).join(", ")}`);

      if (!DRY_RUN) {
        // Check if a row exists
        const { rows } = await client.query("SELECT id FROM business_config LIMIT 1");
        if (rows.length > 0) {
          await client.query(
            `UPDATE business_config SET
               nombre_comercial=$1, tagline=$2, hero_image_url=$3,
               address=$4, phone=$5, founded_year=$6,
               opening_hours=$7, card_layout=$8, accent_color=$9,
               telefono=$10, updated_at=NOW()
             WHERE id=$11`,
            [
              restaurantName, tagline, heroImageUrl,
              address, phone, foundedYear,
              JSON.stringify(openingHours), cardLayout, accentColor,
              phone, rows[0].id,
            ]
          );
        } else {
          await client.query(
            `INSERT INTO business_config (
               nombre_comercial, tagline, hero_image_url,
               address, phone, founded_year,
               opening_hours, card_layout, accent_color, telefono
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
              restaurantName, tagline, heroImageUrl,
              address, phone, foundedYear,
              JSON.stringify(openingHours), cardLayout, accentColor,
              phone,
            ]
          );
        }
      }
    }

    if (!DRY_RUN) await client.query("COMMIT");
    console.log(`\n✅  Done. Inserted ${inserted} products, ${skipped} skipped.`);
    console.log(`   Categories: ${catIdMap.size} top-level, ${subIdMap.size} sub-categories.`);
    if (DRY_RUN) console.log("   (DRY RUN — nothing was written to the database)");
  } catch (err) {
    if (!DRY_RUN) await client.query("ROLLBACK");
    console.error("❌ Import failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
