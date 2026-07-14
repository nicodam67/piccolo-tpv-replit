import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { canvasElementsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

const VALID_TYPES = ["wall", "door", "bar", "column"];
const VALID_LAYOUTS = ["normal", "verano", "invierno", "eventos"];
const CANVAS_W = 1600;
const CANVAS_H = 900;

function elementShape(e: typeof canvasElementsTable.$inferSelect) {
  return {
    id:       e.id,
    zoneId:   e.zoneId,
    layout:   e.layout,
    type:     e.type,
    x:        e.x,
    y:        e.y,
    width:    e.width,
    height:   e.height,
    rotation: e.rotation,
    color:    e.color ?? null,
    label:    e.label ?? null,
    active:   e.active,
  };
}

// ── GET /zones/:zoneId/elements ────────────────────────────────────────────────

router.get("/zones/:zoneId/elements", requireAuth, async (req, res): Promise<void> => {
  const zoneId = req.params.zoneId as string;
  const layout = typeof req.query.layout === "string" && VALID_LAYOUTS.includes(req.query.layout)
    ? req.query.layout
    : "normal";

  const elements = await db
    .select()
    .from(canvasElementsTable)
    .where(
      and(
        eq(canvasElementsTable.zoneId, zoneId),
        eq(canvasElementsTable.layout, layout),
        eq(canvasElementsTable.active, true)
      )
    );

  res.json(elements.map(elementShape));
});

// ── POST /zones/:zoneId/elements — create element (admin) ─────────────────────

router.post("/zones/:zoneId/elements", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const zoneId = req.params.zoneId as string;
  const b = req.body ?? {};

  const type   = VALID_TYPES.includes(b.type)   ? b.type   : "wall";
  const layout = VALID_LAYOUTS.includes(b.layout) ? b.layout : "normal";
  const x      = Number.isFinite(b.x) ? Math.floor(b.x) : 0;
  const y      = Number.isFinite(b.y) ? Math.floor(b.y) : 0;

  // Defaults per type
  const defaultW = type === "column" ? 40 : type === "bar" ? 200 : 160;
  const defaultH = type === "column" ? 40 : type === "bar" ? 60  : 20;

  const width    = Number.isFinite(b.width)  && b.width  >= 10 ? Math.floor(b.width)  : defaultW;
  const height   = Number.isFinite(b.height) && b.height >= 10 ? Math.floor(b.height) : defaultH;
  const rotation = Number.isFinite(b.rotation) ? Math.round(b.rotation) % 360 : 0;
  const color    = typeof b.color  === "string" ? b.color  : null;
  const label    = typeof b.label  === "string" ? b.label  : null;

  const [element] = await db
    .insert(canvasElementsTable)
    .values({ zoneId, layout, type, x, y, width, height, rotation, color, label })
    .returning();

  res.status(201).json(elementShape(element));
});

// ── PATCH /elements/:elementId — update element (admin) ───────────────────────

router.patch("/elements/:elementId", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const elementId = req.params.elementId as string;
  const b = req.body ?? {};
  const updates: Record<string, unknown> = {};

  if (Number.isFinite(b.x))                                   updates.x        = Math.floor(b.x);
  if (Number.isFinite(b.y))                                   updates.y        = Math.floor(b.y);
  if (Number.isFinite(b.width)  && b.width  >= 10)            updates.width    = Math.min(Math.floor(b.width),  CANVAS_W);
  if (Number.isFinite(b.height) && b.height >= 10)            updates.height   = Math.min(Math.floor(b.height), CANVAS_H);
  if (Number.isFinite(b.rotation))                             updates.rotation = Math.round(b.rotation) % 360;
  if (typeof b.color === "string")                             updates.color    = b.color || null;
  if (typeof b.label === "string")                             updates.label    = b.label || null;

  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "Sin cambios" }); return; }

  const [element] = await db
    .update(canvasElementsTable)
    .set(updates as Partial<typeof canvasElementsTable.$inferInsert>)
    .where(and(eq(canvasElementsTable.id, elementId), eq(canvasElementsTable.active, true)))
    .returning();

  if (!element) { res.status(404).json({ error: "Elemento no encontrado" }); return; }
  res.json(elementShape(element));
});

// ── DELETE /elements/:elementId — soft-delete element (admin) ─────────────────

router.delete("/elements/:elementId", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const elementId = req.params.elementId as string;

  const [element] = await db
    .update(canvasElementsTable)
    .set({ active: false })
    .where(and(eq(canvasElementsTable.id, elementId), eq(canvasElementsTable.active, true)))
    .returning();

  if (!element) { res.status(404).json({ error: "Elemento no encontrado" }); return; }
  res.status(204).send();
});

export default router;
