/**
 * E2E Auth Helpers
 * Obtain JWT tokens for different roles to use in tests.
 */

import { APIRequestContext, expect } from "@playwright/test";

export interface AuthToken {
  token: string;
  employee: {
    id: string;
    name: string;
    role: string;
  };
}

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3000/api";

/**
 * Authenticate with a PIN and return the JWT token.
 * Requires a test employee to exist in the DB.
 */
export async function loginWithPin(
  request: APIRequestContext,
  employeeId: string,
  pin: string,
): Promise<AuthToken> {
  const res = await request.post(`${API_BASE}/auth/pin`, {
    data: { employeeId, pin },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.token).toBeTruthy();
  return body as AuthToken;
}

/**
 * Return Authorization header for a given token.
 */
export function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Fetch the employee login list and return all employees.
 */
export async function getLoginList(request: APIRequestContext) {
  const res = await request.get(`${API_BASE}/employees/login-list`);
  expect(res.status()).toBe(200);
  return res.json() as Promise<Array<{ id: string; name: string }>>;
}

/**
 * Find the first employee with the given role and login.
 */
export async function loginAs(
  request: APIRequestContext,
  role: string,
  pin = "1234",
): Promise<AuthToken> {
  const employeeIds: Record<string, string | undefined> = {
    admin: process.env.E2E_ADMIN_ID ?? "26000000-0000-4000-8000-000000000011",
    waiter: process.env.E2E_WAITER_ID ?? "26000000-0000-4000-8000-000000000012",
  };
  const employeeId = employeeIds[role];
  if (!employeeId) throw new Error(`No E2E employee configured for role '${role}'`);
  return loginWithPin(request, employeeId, pin);
}
