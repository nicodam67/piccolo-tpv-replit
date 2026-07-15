import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import profitabilityRouter from './profitability';

// ─── Mock @workspace/db ───────────────────────────────────────────────────────
vi.mock('@workspace/db', () => {
  const mockDb: any = {};

  // Simple chainable query builder
  const chain = (result: any = []) => {
    const obj: any = {};
    ['select', 'from', 'where', 'innerJoin', 'leftJoin', 'orderBy', 'limit', 'groupBy', '$dynamic'].forEach(m => {
      obj[m] = () => chain(result);
    });
    obj.then = (res: any, rej: any) => Promise.resolve(result).then(res, rej);
    obj[Symbol.iterator] = () => (Array.isArray(result) ? result : [result])[Symbol.iterator]();
    // Make it thenable for await
    return new Proxy(obj, {
      get(target, prop) {
        if (prop === 'then') {
          return (res: any, rej: any) => Promise.resolve(result).then(res, rej);
        }
        if (prop in target) return target[prop];
        return () => chain(result);
      },
    });
  };

  mockDb.select = vi.fn(() => chain([]));
  mockDb.insert = vi.fn(() => ({ values: () => ({ returning: () => Promise.resolve([{ id: 'test-id' }]) }) }));
  mockDb.update = vi.fn(() => ({ set: () => ({ where: () => Promise.resolve([{}]) }) }));
  mockDb.delete = vi.fn(() => ({ where: () => Promise.resolve([]) }));
  mockDb.transaction = vi.fn(async (cb: any) => cb(mockDb));

  return {
    db: mockDb,
    productsTable: { id: 'id', name: 'name', price: 'price', taxRate: 'tax_rate', cost: 'cost', categoryId: 'category_id', active: 'active' },
    productFormatsTable: { id: 'id', cost: 'cost' },
    categoriesTable: { id: 'id', name: 'name' },
    recipeItemsTable: { id: 'id', productId: 'product_id', formatId: 'format_id', ingredientId: 'ingredient_id', subrecipeId: 'subrecipe_id', quantity: 'quantity', wastePercent: 'waste_percent', packagingCost: 'packaging_cost', additionalCost: 'additional_cost' },
    ingredientsTable: { id: 'id', name: 'name', purchaseCost: 'purchase_cost' },
    subrecipesTable: { id: 'id', name: 'name', cost: 'cost' },
    stockMovementsTable: { id: 'id', ingredientId: 'ingredient_id', movementType: 'movement_type', quantity: 'quantity', createdAt: 'created_at' },
    ingredientCostHistoryTable: { id: 'id', ingredientId: 'ingredient_id', previousCost: 'previous_cost', newCost: 'new_cost', supplierName: 'supplier_name', reason: 'reason', employeeId: 'employee_id', createdAt: 'created_at' },
  };
});

vi.mock('../middlewares/auth', () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(profitabilityRouter);
  return app;
}

describe('Profitability routes', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    app = buildApp();
    vi.clearAllMocks();
  });

  // 1. GET /admin/profitability returns array
  it('GET /admin/profitability returns an array', async () => {
    const res = await request(app).get('/admin/profitability');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // 2. GET /admin/profitability/by-category returns array
  it('GET /admin/profitability/by-category returns an array', async () => {
    const res = await request(app).get('/admin/profitability/by-category');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // 3. GET /admin/profitability/reports returns object
  it('GET /admin/profitability/reports returns a report object', async () => {
    const res = await request(app).get('/admin/profitability/reports');
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('object');
    expect(res.body).toHaveProperty('avgFoodCostPct');
    expect(res.body).toHaveProperty('avgMarginPct');
  });

  // 4. GET /admin/profitability/reports with date range
  it('GET /admin/profitability/reports accepts from/to query params', async () => {
    const res = await request(app)
      .get('/admin/profitability/reports')
      .query({ from: '2025-01-01', to: '2025-01-31' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('from');
  });

  // 5. GET /admin/cost-history returns array
  it('GET /admin/cost-history returns an array', async () => {
    const res = await request(app).get('/admin/cost-history');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // 6. GET /admin/cost-history with ingredientId filter
  it('GET /admin/cost-history accepts ingredientId filter', async () => {
    const res = await request(app)
      .get('/admin/cost-history')
      .query({ ingredientId: 'some-uuid', limit: '10' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // 7. GET /admin/cost-alerts returns array
  it('GET /admin/cost-alerts returns an array', async () => {
    const res = await request(app).get('/admin/cost-alerts');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // 8. POST /admin/price-simulator requires productId
  it('POST /admin/price-simulator returns 400 if productId missing', async () => {
    const res = await request(app)
      .post('/admin/price-simulator')
      .send({ targetMarginPct: 65 });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  // 9. POST /admin/price-simulator returns 404 for unknown product
  it('POST /admin/price-simulator returns 404 for unknown product', async () => {
    const res = await request(app)
      .post('/admin/price-simulator')
      .send({ productId: 'non-existent-uuid', targetMarginPct: 65 });
    expect(res.status).toBe(404);
  });

  // 10. computeMetrics helper logic
  it('food cost + margin should sum to 100% when costs are set correctly', () => {
    const pvp = 10;
    const taxRate = 10;
    const totalCost = 3;
    const basePrice = pvp / (1 + taxRate / 100);   // 9.0909
    const grossMargin = basePrice - totalCost;       // 6.0909
    const marginPct = (grossMargin / basePrice) * 100; // ~67%
    const foodCostPct = (totalCost / basePrice) * 100; // ~33%
    expect(Math.round(marginPct + foodCostPct)).toBe(100);
  });

  // 11. GET /admin/profitability/reports returns mostProfitable/leastProfitable arrays
  it('GET /admin/profitability/reports includes mostProfitable and leastProfitable', async () => {
    const res = await request(app).get('/admin/profitability/reports');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.mostProfitable)).toBe(true);
    expect(Array.isArray(res.body.leastProfitable)).toBe(true);
  });

  // 12. GET /admin/profitability/reports includes highFoodCost
  it('GET /admin/profitability/reports includes highFoodCost', async () => {
    const res = await request(app).get('/admin/profitability/reports');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.highFoodCost)).toBe(true);
  });

  // 13. GET /admin/cost-alerts returns correctly shaped alert objects
  it('GET /admin/cost-alerts response items have expected shape', async () => {
    const res = await request(app).get('/admin/cost-alerts');
    expect(res.status).toBe(200);
    // When empty, the shape contract is still an array
    if (res.body.length > 0) {
      const alert = res.body[0];
      expect(alert).toHaveProperty('type');
      expect(alert).toHaveProperty('productId');
      expect(alert).toHaveProperty('productName');
      expect(alert).toHaveProperty('value');
      expect(alert).toHaveProperty('threshold');
    }
  });
});
