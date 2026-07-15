import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import subrecipesRouter from './subrecipes';

// ─── Mock @workspace/db ───────────────────────────────────────────────────────
const mockSubrecipe = {
  id: 'sr-001',
  name: 'Salsa de tomate',
  unit: 'L',
  yieldQuantity: '2.0000',
  notes: null,
  active: true,
  cost: '0.5000',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockIngredient = {
  id: 'ing-001',
  name: 'Tomate triturado',
  unit: 'kg',
  purchaseCost: '1.2000',
};

const mockSubrecipeItem = {
  id: 'item-001',
  subrecipeId: 'sr-001',
  ingredientId: 'ing-001',
  quantity: '1.0000',
  unit: 'kg',
  wastePercent: '5.00',
};

vi.mock('@workspace/db', () => {
  const make = (result: any = []) => {
    const proxy: any = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'then') return (res: any, rej: any) => Promise.resolve(result).then(res, rej);
        return () => proxy;
      },
    });
    return proxy;
  };

  const db: any = {
    select: vi.fn(() => make([mockSubrecipe])),
    insert: vi.fn(() => ({
      values: () => ({ returning: () => Promise.resolve([mockSubrecipeItem]) }),
    })),
    update: vi.fn(() => ({
      set: () => ({ where: () => Promise.resolve([mockSubrecipe]) }),
    })),
    delete: vi.fn(() => ({ where: () => Promise.resolve([]) })),
    transaction: vi.fn(async (cb: any) => cb(db)),
  };

  return {
    db,
    subrecipesTable: { id: 's.id', name: 's.name', unit: 's.unit', yieldQuantity: 's.yq', cost: 's.cost', active: 's.active' },
    subrecipeItemsTable: { id: 'si.id', subrecipeId: 'si.subrecipe_id', ingredientId: 'si.ingredient_id', quantity: 'si.quantity', unit: 'si.unit', wastePercent: 'si.wp' },
    ingredientsTable: { id: 'i.id', name: 'i.name', unit: 'i.unit', purchaseCost: 'i.purchase_cost' },
    recipeItemsTable: { id: 'ri.id', productId: 'ri.product_id', formatId: 'ri.format_id', subrecipeId: 'ri.subrecipe_id', ingredientId: 'ri.ingredient_id', quantity: 'ri.quantity', wastePercent: 'ri.wp', packagingCost: 'ri.pkg_cost', additionalCost: 'ri.add_cost' },
    productFormatsTable: { id: 'pf.id', cost: 'pf.cost' },
    productsTable: { id: 'p.id', cost: 'p.cost' },
  };
});

vi.mock('../middlewares/auth', () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(subrecipesRouter);
  return app;
}

describe('Subrecipes routes', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    app = buildApp();
    vi.clearAllMocks();
  });

  // GET /admin/subrecipes
  it('GET /admin/subrecipes returns 200', async () => {
    const res = await request(app).get('/admin/subrecipes');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // POST /admin/subrecipes — missing name
  it('POST /admin/subrecipes returns 400 when name is missing', async () => {
    const res = await request(app).post('/admin/subrecipes').send({ unit: 'kg' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/obligatorio/i);
  });

  // POST /admin/subrecipes — valid
  it('POST /admin/subrecipes creates a subrecipe', async () => {
    const { db } = await import('@workspace/db');
    (db.insert as any).mockReturnValue({
      values: () => ({ returning: () => Promise.resolve([mockSubrecipe]) }),
    });

    const res = await request(app)
      .post('/admin/subrecipes')
      .send({ name: 'Salsa de tomate', unit: 'L', yieldQuantity: '2' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });

  // GET /admin/subrecipes/:id — not found
  it('GET /admin/subrecipes/:id returns 404 when not found', async () => {
    const { db } = await import('@workspace/db');
    const emptyProxy: any = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'then') return (res: any) => Promise.resolve([]).then(res);
        return () => emptyProxy;
      },
    });
    (db.select as any).mockReturnValue(emptyProxy);
    const res = await request(app).get('/admin/subrecipes/non-existent');
    expect(res.status).toBe(404);
  });

  // PATCH /admin/subrecipes/:id — not found
  it('PATCH /admin/subrecipes/:id returns 404 when not found', async () => {
    const { db } = await import('@workspace/db');
    const emptyProxy: any = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'then') return (res: any) => Promise.resolve([]).then(res);
        return () => emptyProxy;
      },
    });
    (db.select as any).mockReturnValue(emptyProxy);
    const res = await request(app).patch('/admin/subrecipes/non-existent').send({ name: 'X' });
    expect(res.status).toBe(404);
  });

  // DELETE /admin/subrecipes/:id — archives (returns ok)
  it('DELETE /admin/subrecipes/:id returns ok', async () => {
    const res = await request(app).delete('/admin/subrecipes/sr-001');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok', true);
  });

  // POST /admin/subrecipes/:id/items — missing fields
  it('POST /admin/subrecipes/:id/items returns 400 when fields missing', async () => {
    const res = await request(app)
      .post('/admin/subrecipes/sr-001/items')
      .send({});
    expect(res.status).toBe(400);
  });

  // PATCH /admin/subrecipe-items/:itemId — empty body
  it('PATCH /admin/subrecipe-items/:itemId returns 400 with no changes', async () => {
    const { db } = await import('@workspace/db');
    const existingProxy: any = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'then') return (res: any) => Promise.resolve([mockSubrecipeItem]).then(res);
        return () => existingProxy;
      },
    });
    (db.select as any).mockReturnValue(existingProxy);
    const res = await request(app)
      .patch('/admin/subrecipe-items/item-001')
      .send({});
    expect(res.status).toBe(400);
  });

  // DELETE /admin/subrecipe-items/:itemId
  it('DELETE /admin/subrecipe-items/:itemId returns ok', async () => {
    const { db } = await import('@workspace/db');
    const itemProxy: any = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'then') return (res: any) => Promise.resolve([{ subrecipeId: 'sr-001' }]).then(res);
        return () => itemProxy;
      },
    });
    (db.select as any).mockReturnValue(itemProxy);
    const res = await request(app).delete('/admin/subrecipe-items/item-001');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok', true);
  });
});
