import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import profitabilityRouter, { computeProductCost } from './profitability';
import { db } from '@workspace/db';

// ─── Mock @workspace/db ───────────────────────────────────────────────────────
vi.mock('@workspace/db', () => {
  const mockDb: any = {};
  let selectResults: any[] = [];
  let insertResults: any[] = [];
  let updateResults: any[] = [];

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

  mockDb.__setSelectResults = (...results: any[]) => { selectResults = results; };
  mockDb.__setInsertResults = (...results: any[]) => { insertResults = results; };
  mockDb.__setUpdateResults = (...results: any[]) => { updateResults = results; };
  mockDb.__insertValues = vi.fn();
  mockDb.select = vi.fn(() => chain(selectResults.shift() ?? []));
  mockDb.insert = vi.fn(() => ({
    values: (values: any) => {
      mockDb.__insertValues(values);
      return {
        returning: () => Promise.resolve(insertResults.shift() ?? [{ id: 'test-id' }]),
      };
    },
  }));
  mockDb.update = vi.fn(() => ({
    set: () => ({
      where: () => {
        const result = updateResults.shift() ?? [{}];
        return {
          returning: () => Promise.resolve(result),
          then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
        };
      },
    }),
  }));
  mockDb.delete = vi.fn(() => ({ where: () => Promise.resolve([]) }));
  mockDb.transaction = vi.fn(async (cb: any) => cb(mockDb));

  return {
    db: mockDb,
    productsTable: { id: 'id', name: 'name', price: 'price', taxRate: 'tax_rate', cost: 'cost', categoryId: 'category_id', active: 'active' },
    productFormatsTable: { id: 'id', cost: 'cost' },
    categoriesTable: { id: 'id', name: 'name' },
    recipeItemsTable: { id: 'id', productId: 'product_id', formatId: 'format_id', ingredientId: 'ingredient_id', subrecipeId: 'subrecipe_id', quantity: 'quantity', unit: 'unit', wastePercent: 'waste_percent', packagingCost: 'packaging_cost', additionalCost: 'additional_cost' },
    ingredientsTable: { id: 'id', name: 'name', purchaseCost: 'purchase_cost', consumptionUnit: 'consumption_unit', conversionFactor: 'conversion_factor' },
    subrecipesTable: { id: 'id', name: 'name', cost: 'cost', unit: 'unit' },
    stockMovementsTable: { id: 'id', ingredientId: 'ingredient_id', movementType: 'movement_type', quantity: 'quantity', unitCost: 'unit_cost', orderItemId: 'order_item_id', createdAt: 'created_at' },
    ingredientCostHistoryTable: { id: 'id', ingredientId: 'ingredient_id', previousCost: 'previous_cost', newCost: 'new_cost', supplierName: 'supplier_name', reason: 'reason', employeeId: 'employee_id', createdAt: 'created_at' },
    profitabilitySettingsTable: { id: 'id', defaultTargetMarginPct: 'default_target_margin_pct', warningGapPct: 'warning_gap_pct', allocationMethod: 'allocation_method' },
    operatingExpensesTable: { id: 'id', name: 'name', active: 'active', amount: 'amount' },
    channelCommissionsTable: { id: 'id', channel: 'channel', active: 'active', percent: 'percent', fixedAmount: 'fixed_amount' },
    profitabilityTargetsTable: { id: 'id', active: 'active', updatedAt: 'updated_at' },
    priceChangeProposalsTable: { id: 'id', status: 'status' },
    ordersTable: { id: 'id', status: 'status', isDemo: 'is_demo', createdAt: 'created_at', channel: 'channel', deliveryType: 'delivery_type' },
    orderItemsTable: { id: 'id', orderId: 'order_id', productId: 'product_id', quantity: 'quantity', unitPrice: 'unit_price', taxRate: 'tax_rate', isInvitation: 'is_invitation' },
    ticketsTable: { orderId: 'order_id', issuedAt: 'issued_at', isDemo: 'is_demo' },
    discountsTable: { orderId: 'order_id', orderItemId: 'order_item_id' },
    paymentsTable: { id: 'id', orderId: 'order_id', amount: 'amount' },
    paymentVoidsTable: { id: 'id', originalPaymentId: 'original_payment_id', createdAt: 'created_at' },
    cashMachineTransactionsTable: { id: 'id', orderId: 'order_id', transactionType: 'transaction_type', status: 'status', amountRequested: 'amount_requested', changeDispensed: 'change_dispensed', splitRef: 'split_ref', completedAt: 'completed_at' },
    paymentAttemptsTable: { id: 'id', orderId: 'order_id', status: 'status', amountCents: 'amount_cents', refundedAt: 'refunded_at' },
    splitGroupItemsTable: { splitGroupId: 'split_group_id', orderItemId: 'order_item_id', quantity: 'quantity' },
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
    (db as any).__setSelectResults();
    (db as any).__setInsertResults();
    (db as any).__setUpdateResults();
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

  it('weights dashboard metrics with sold quantity and historical COGS snapshots', async () => {
    (db as any).__setSelectResults(
      [{
        id: 'product-1',
        name: 'Pizza',
        price: '11.00',
        taxRate: 10,
        categoryId: 'category-1',
        categoryName: 'Pizzas',
      }],
      [],
      [],
      [],
      [],
      [{
        orderId: 'order-1',
        orderItemId: 'item-1',
        productId: 'product-1',
        quantity: 2,
        unitPrice: '11.00',
        taxRate: 10,
        isInvitation: false,
        channel: 'tpv',
        deliveryType: 'table',
        createdAt: new Date('2026-01-15T12:00:00Z'),
      }],
      [],
      [{ orderItemId: 'item-1', quantity: '-2', unitCost: '1.50' }],
      [],
      [],
      [],
      [],
    );
    const res = await request(app)
      .get('/admin/profitability/reports')
      .query({ from: '2026-01-01', to: '2026-02-01' });
    expect(res.status).toBe(200);
    expect(res.body.sales).toBe('22.00');
    expect(res.body.netSales).toBe('20.00');
    expect(res.body.costOfGoodsSold).toBe('3.00');
    expect(res.body.contributionMargin).toBe('17.00');
    expect(res.body.avgFoodCostPct).toBe('15.00');
    expect(res.body.avgMarginPct).toBe('85.00');
    expect(res.body.historicalCogsCoveragePct).toBe('100.00');
    expect(res.body.salesProducts[0].unitsSold).toBe(2);
  });

  it('normalizes direct and subrecipe units in analytical product cost', async () => {
    (db as any).__setSelectResults([
      {
        ingredientId: 'flour',
        subrecipeId: null,
        quantity: '500.0000',
        unit: 'g',
        wastePercent: '10.00',
        packagingCost: '0',
        additionalCost: '0',
        ingredientCost: '4.0000',
        ingredientConsumptionUnit: 'kg',
        ingredientConversionFactor: '1',
        subrecipeCost: null,
        subrecipeUnit: null,
      },
      {
        ingredientId: null,
        subrecipeId: 'oil-subrecipe',
        quantity: '250.0000',
        unit: 'ml',
        wastePercent: '0',
        packagingCost: '0',
        additionalCost: '0',
        ingredientCost: null,
        ingredientConsumptionUnit: null,
        ingredientConversionFactor: null,
        subrecipeCost: '2.0000',
        subrecipeUnit: 'l',
      },
    ]);

    const result = await computeProductCost('product-1');

    expect(result.theoreticalCost).toBeCloseTo(2.5);
    expect(result.wasteCost).toBeCloseTo(0.2);
    expect(result.totalCost).toBeCloseTo(2.7);
  });

  it('nets a later payment void from dashboard revenue, units and historical COGS', async () => {
    const saleRow = {
      orderId: 'order-1',
      orderItemId: 'item-1',
      productId: 'product-1',
      quantity: 2,
      unitPrice: '11.00',
      taxRate: 10,
      isInvitation: false,
      channel: 'tpv',
      deliveryType: 'table',
      createdAt: new Date('2026-01-15T12:00:00Z'),
    };
    (db as any).__setSelectResults(
      [{
        id: 'product-1',
        name: 'Pizza',
        price: '11.00',
        taxRate: 10,
        categoryId: 'category-1',
        categoryName: 'Pizzas',
      }],
      [],
      [{
        id: 'void-1',
        orderId: 'order-1',
        amount: '22.00',
        occurredAt: new Date('2026-01-16T12:00:00Z'),
      }],
      [],
      [],
      [saleRow],
      [],
      [{ orderItemId: 'item-1', quantity: '-2', unitCost: '1.50' }],
      [],
      [],
      [],
      [],
    );

    const res = await request(app)
      .get('/admin/profitability/reports')
      .query({ from: '2026-01-01', to: '2026-02-01' });
    expect(res.status).toBe(200);
    expect(res.body.sales).toBe('0.00');
    expect(res.body.netSales).toBe('0.00');
    expect(res.body.costOfGoodsSold).toBe('0.00');
    expect(res.body.contributionMargin).toBe('0.00');
    expect(res.body.salesProducts[0].unitsSold).toBe(0);
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

  it('POST /admin/profitability/scenario is read-only', async () => {
    (db as any).__setSelectResults(
      [{
        id: 'product-1',
        name: 'Pizza',
        categoryId: 'category-1',
        categoryName: 'Pizzas',
        price: '11.00',
        taxRate: 10,
      }],
      [],
      [],
      [{ defaultTargetMarginPct: '65', warningGapPct: '10' }],
      [],
      [],
      [],
    );
    const res = await request(app)
      .post('/admin/profitability/scenario')
      .send({ channel: 'delivery', commissionPercent: 30 });
    expect(res.status).toBe(200);
    expect(res.body.persisted).toBe(false);
    expect(res.body.products).toHaveLength(1);
    expect((db as any).insert).not.toHaveBeenCalled();
    expect((db as any).update).not.toHaveBeenCalled();
    expect((db as any).delete).not.toHaveBeenCalled();
  });

  it('PATCH /admin/profitability/config rejects unknown allocation methods', async () => {
    const res = await request(app)
      .patch('/admin/profitability/config')
      .send({ allocationMethod: 'invented_precision' });
    expect(res.status).toBe(400);
  });

  it('POST /admin/profitability/price-proposals requires a real product and reason', async () => {
    const res = await request(app)
      .post('/admin/profitability/price-proposals')
      .send({ productId: 'missing', proposedPrice: 12, reason: '' });
    expect(res.status).toBe(400);
  });

  it('creates a price proposal without changing the product price', async () => {
    (db as any).__setSelectResults([{ id: 'product-1', price: '10.00' }]);
    (db as any).__setInsertResults([{
      id: 'proposal-1',
      productId: 'product-1',
      oldPrice: '10.00',
      proposedPrice: '12.00',
      reason: 'Objetivo de margen',
      status: 'pending',
    }]);
    const res = await request(app)
      .post('/admin/profitability/price-proposals')
      .send({ productId: 'product-1', proposedPrice: 12, reason: 'Objetivo de margen' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect((db as any).update).not.toHaveBeenCalled();
    expect((db as any).__insertValues).toHaveBeenCalledWith(expect.objectContaining({
      productId: 'product-1',
      oldPrice: '10.00',
      proposedPrice: '12',
      reason: 'Objetivo de margen',
    }));
  });

  it('approves and applies a current price proposal exactly once', async () => {
    const proposal = {
      id: 'proposal-1',
      productId: 'product-1',
      oldPrice: '10.00',
      proposedPrice: '12.00',
      status: 'pending',
    };
    (db as any).__setSelectResults([proposal]);
    (db as any).__setUpdateResults(
      [{ id: 'product-1', price: '12.00' }],
      [{ ...proposal, status: 'applied' }],
    );
    const res = await request(app)
      .post('/admin/profitability/price-proposals/proposal-1/approve');
    expect(res.status).toBe(200);
    expect(res.body.product.price).toBe('12.00');
    expect(res.body.proposal.status).toBe('applied');
    expect((db as any).update).toHaveBeenCalledTimes(2);
  });

  it('rejects double approval without writing again', async () => {
    (db as any).__setSelectResults([{
      id: 'proposal-1',
      productId: 'product-1',
      oldPrice: '10.00',
      proposedPrice: '12.00',
      status: 'applied',
    }]);
    const res = await request(app)
      .post('/admin/profitability/price-proposals/proposal-1/approve');
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('proposal_not_pending');
    expect((db as any).update).not.toHaveBeenCalled();
  });

  it('rejects an obsolete proposal if another user changed the price', async () => {
    (db as any).__setSelectResults([{
      id: 'proposal-1',
      productId: 'product-1',
      oldPrice: '10.00',
      proposedPrice: '12.00',
      status: 'pending',
    }]);
    (db as any).__setUpdateResults([]);
    const res = await request(app)
      .post('/admin/profitability/price-proposals/proposal-1/approve');
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('price_changed_concurrently');
    expect((db as any).update).toHaveBeenCalledTimes(1);
  });
});
