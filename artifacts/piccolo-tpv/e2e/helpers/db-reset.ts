/**
 * E2E DB-Reset Fixture
 * Creates a clean test session by purging all is_demo=true rows
 * and returning a clean starting state before each test suite.
 *
 * Uses the POST /api/admin/demo-data/purge endpoint (requires admin token).
 */

import { APIRequestContext, expect } from "@playwright/test";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3000/api";

/**
 * Purge all demo data from the running server.
 * Call once before each test suite that creates demo rows.
 */
export async function purgeDemo(
  request: APIRequestContext,
  adminToken: string,
): Promise<void> {
  const res = await request.post(`${API_BASE}/admin/demo-data/purge`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { confirm: "PURGE_DEMO" },
  });
  // 200 or 204 = success; 404 = endpoint not wired yet — log but don't fail
  if (res.status() === 404) {
    console.warn("[db-reset] demo-data purge endpoint not found — skipping cleanup");
    return;
  }
  expect(res.status()).toBeLessThan(400);
}

/**
 * Build a helper that prefixes all API calls with the bearer token.
 */
export function apiWithAuth(request: APIRequestContext, token: string) {
  const headers = { Authorization: `Bearer ${token}` };
  return {
    get: (path: string) => request.get(`${API_BASE}${path}`, { headers }),
    post: (path: string, data?: unknown) =>
      request.post(`${API_BASE}${path}`, { headers, data }),
    patch: (path: string, data?: unknown) =>
      request.patch(`${API_BASE}${path}`, { headers, data }),
    delete: (path: string) =>
      request.delete(`${API_BASE}${path}`, { headers }),
  };
}
