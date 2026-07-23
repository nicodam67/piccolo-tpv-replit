export const ENV_CLASSIFICATION = {
  productionRequired: ["DATABASE_URL", "SESSION_SECRET", "PORT", "NODE_ENV", "RESTAURANT_ID"],
  optional: [
    "ALLOWED_ORIGINS", "LOG_LEVEL", "BOOTSTRAP_SECRET",
    "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "OCR_PROVIDER",
  ],
  developmentOnly: [
    "CASH_MACHINE_SCENARIO",
    "SIMULATOR_WEBHOOK_SECRET",
    "QR_MENU_DEMO",
    "VITE_QR_FIXTURES",
  ],
  testOnly: ["RUN_DB_INTEGRATION_TESTS", "E2E_ADMIN_ID", "E2E_WAITER_ID"],
} as const;

export interface EnvironmentValidationResult {
  environment: "production" | "development" | "test";
  warnings: string[];
}

export function validateApiEnvironment(
  source: Record<string, string | undefined>,
): EnvironmentValidationResult {
  const environment = source.NODE_ENV === "production"
    ? "production"
    : source.NODE_ENV === "test"
      ? "test"
      : "development";
  const issues: string[] = [];
  const warnings: string[] = [];

  if (environment === "production") {
    for (const key of ENV_CLASSIFICATION.productionRequired) {
      if (!source[key]?.trim()) issues.push(`${key} es obligatoria en producción`);
    }
    if ((source.SESSION_SECRET?.length ?? 0) < 32) {
      issues.push("SESSION_SECRET debe tener al menos 32 caracteres");
    }
    const port = Number(source.PORT);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      issues.push("PORT no es válido");
    }
    for (const key of ENV_CLASSIFICATION.developmentOnly) {
      if (source[key]?.trim()) issues.push(`${key} solo puede usarse en desarrollo`);
    }
    if (source.OCR_PROVIDER === "simulator") {
      issues.push("OCR_PROVIDER=simulator no puede usarse en producción");
    }
    if (source.STRIPE_SECRET_KEY || source.STRIPE_WEBHOOK_SECRET) {
      warnings.push("Stripe permanece desactivado aunque existan credenciales");
    }
  } else if (!source.DATABASE_URL) {
    warnings.push("DATABASE_URL no configurada");
  }

  if (issues.length > 0) {
    throw new Error(`Configuración de entorno inválida: ${issues.join("; ")}`);
  }
  return { environment, warnings };
}

export function productionConnectorAvailable(configured: boolean): boolean {
  return process.env.NODE_ENV !== "production" || configured;
}
