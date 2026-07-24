import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../../..");
const legacy = fs.readFileSync(path.join(root, "lib/api-client-react/src/generated/api.ts"), "utf8");
const generated = fs.readFileSync(path.join(root, "lib/api-client-react/src/reservations-generated/api.ts"), "utf8");
const compatibility = fs.readFileSync(path.join(root, "lib/api-client-react/src/reservations-compat.ts"), "utf8");
const reservationsPage = fs.readFileSync(path.join(root, "artifacts/piccolo-tpv/src/pages/reservations.tsx"), "utf8");
const dashboardPage = fs.readFileSync(path.join(root, "artifacts/piccolo-tpv/src/pages/admin-dashboard.tsx"), "utf8");
const hooks = [
  "useGetReservations", "useCreateReservation", "usePatchReservation",
  "useDeleteReservation", "useArriveReservation",
];

describe("Reservations generated client compatibility", () => {
  it("replaces all five manual hooks with generated exports", () => {
    for (const hook of hooks) {
      expect(legacy).not.toMatch(new RegExp(`export (?:const|function) ${hook}\\b`));
      expect(generated).toMatch(new RegExp(`export (?:const|function) ${hook}\\b`));
      expect(compatibility).toMatch(
        hook === "useArriveReservation"
          ? /export function useArriveReservation\b/
          : new RegExp(`\\b${hook},`),
      );
    }
  });

  it("removes manual HTTP for the five migrated operations from direct consumers", () => {
    const source = `${reservationsPage}\n${dashboardPage}`;
    expect(source).not.toMatch(/api\.(?:get|post|patch|delete)[^(]*\([^)]*\/api\/reservations(?:\?|["'`])/);
    expect(source).not.toMatch(/customFetch\([^)]*\/api\/reservations/);
    expect(source).toContain("/api/reservations/suggest-table");
  });

  it("keeps unrelated manual domains intact", () => {
    expect(legacy).toContain("useGetAdminCategories");
    expect(legacy).toContain("useGetBusinessConfig");
  });
});
