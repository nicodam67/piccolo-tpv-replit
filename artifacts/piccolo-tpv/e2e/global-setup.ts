import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { request, type FullConfig } from "@playwright/test";

export const ADMIN_STORAGE_STATE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  ".auth/admin.json",
);

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const employeeId = process.env.E2E_ADMIN_ID;
  if (!employeeId) return;

  const apiBase = process.env.API_BASE_URL ?? "http://localhost:3000/api";
  mkdirSync(dirname(ADMIN_STORAGE_STATE), { recursive: true });

  if (existsSync(ADMIN_STORAGE_STATE)) {
    const existing = await request.newContext({ storageState: ADMIN_STORAGE_STATE });
    const currentSession = await existing.get(`${apiBase}/auth/me`);
    const currentUser = currentSession.status() === 200
      ? await currentSession.json() as { id?: string; role?: string }
      : null;
    await existing.dispose();
    if (currentUser?.id === employeeId && currentUser.role === "admin") return;
  }

  const context = await request.newContext();
  const login = await context.post(`${apiBase}/auth/pin`, {
    data: {
      employeeId,
      pin: process.env.E2E_ADMIN_PIN ?? "1234",
    },
  });
  if (login.status() !== 200) {
    const retryAfter = login.headers()["retry-after"];
    await context.dispose();
    throw new Error(
      `Unable to bootstrap the E2E admin session: HTTP ${login.status()}`
      + (retryAfter ? ` (retry after ${retryAfter}s)` : ""),
    );
  }
  await context.storageState({ path: ADMIN_STORAGE_STATE });
  await context.dispose();
}
