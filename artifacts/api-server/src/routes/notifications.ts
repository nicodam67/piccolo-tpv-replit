import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { waiterNotificationsTable } from "@workspace/db";
import { eq, and, isNull, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// GET /notifications/unread — get unread notifications for the authenticated employee
router.get("/notifications/unread", requireAuth, async (req, res): Promise<void> => {
  const employeeId = (req as any).user?.id as string;

  const notifications = await db
    .select()
    .from(waiterNotificationsTable)
    .where(
      and(
        eq(waiterNotificationsTable.employeeId, employeeId),
        isNull(waiterNotificationsTable.readAt),
      ),
    )
    .orderBy(desc(waiterNotificationsTable.createdAt))
    .limit(20);

  res.json(notifications);
});

// PATCH /notifications/:notificationId/read — mark a notification as read
router.patch("/notifications/:notificationId/read", requireAuth, async (req, res): Promise<void> => {
  const { notificationId } = req.params;
  const employeeId = (req as any).user?.id as string;

  const [notification] = await db
    .update(waiterNotificationsTable)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(waiterNotificationsTable.id, notificationId),
        eq(waiterNotificationsTable.employeeId, employeeId),
      ),
    )
    .returning();

  if (!notification) {
    res.status(404).json({ error: "Notificación no encontrada" });
    return;
  }

  res.json(notification);
});

export default router;
