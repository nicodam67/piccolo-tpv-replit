import { db, productionDepartmentsTable, type ProductionDepartment } from "@workspace/db";
import { eq } from "drizzle-orm";

export const WORKFLOW_TRANSITIONS: Record<string, Record<string, string[]>> = {
  standard: {
    new: ["preparing", "cancelled"],
    preparing: ["ready", "cancelled"],
    ready: ["collected"],
    collected: [],
    cancelled: [],
  },
  pizza: {
    new: ["preparing", "cancelled"],
    preparing: ["in_oven", "ready", "cancelled"],
    in_oven: ["ready", "preparing", "cancelled"],
    ready: ["collected"],
    collected: [],
    cancelled: [],
  },
  bar: {
    new: ["preparing", "cancelled"],
    preparing: ["ready", "cancelled"],
    ready: ["collected"],
    collected: [],
    cancelled: [],
  },
  pase: {
    new: [],
    preparing: [],
    in_oven: [],
    ready: ["collected", "served"],
    collected: [],
    served: [],
    cancelled: [],
  },
  none: {
    new: [],
    preparing: [],
    in_oven: [],
    ready: [],
    collected: [],
    served: [],
    cancelled: [],
  },
};

export async function loadProductionDepartments(options?: {
  includeInactive?: boolean;
  executor?: any;
}): Promise<ProductionDepartment[]> {
  const executor = options?.executor ?? db;
  const query = executor.select().from(productionDepartmentsTable);
  const rows = options?.includeInactive
    ? await query.orderBy(productionDepartmentsTable.sortOrder)
    : await query.where(eq(productionDepartmentsTable.active, true))
      .orderBy(productionDepartmentsTable.sortOrder);
  return rows;
}

export async function loadDepartmentByCode(
  code: string,
  options?: { includeInactive?: boolean },
): Promise<ProductionDepartment | null> {
  const [department] = await db.select().from(productionDepartmentsTable)
    .where(eq(productionDepartmentsTable.code, code))
    .limit(1);
  if (!department || (!options?.includeInactive && !department.active)) return null;
  return department;
}

export function resolveEffectiveChannels(
  department: Pick<ProductionDepartment, "outputMode" | "workflowProfile">,
  globalMode: "kds_only" | "printers_only" | "both",
): { kds: boolean; printer: boolean } {
  const allowKds = globalMode !== "printers_only";
  const allowPrinter = globalMode !== "kds_only";
  switch (department.outputMode) {
    case "none":
      return { kds: false, printer: false };
    case "kds":
      return { kds: allowKds && department.workflowProfile !== "none", printer: false };
    case "printer":
      return { kds: false, printer: allowPrinter };
    case "both":
      return {
        kds: allowKds && department.workflowProfile !== "none",
        printer: allowPrinter,
      };
  }
}

export function transitionsForDepartment(
  department: Pick<ProductionDepartment, "workflowProfile"> | null,
) {
  return WORKFLOW_TRANSITIONS[department?.workflowProfile ?? "standard"]
    ?? WORKFLOW_TRANSITIONS.standard;
}
