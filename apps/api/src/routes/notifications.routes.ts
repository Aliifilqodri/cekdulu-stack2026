import { Router } from "express";
import { FilterQuery } from "@mikro-orm/core";
import { z } from "zod";
import { getOrm, Notification } from "@cekdulu/db";
import { requireAuth } from "../middlewares/auth";
import { AppError, asyncHandler } from "../middlewares/error";
import { validateQuery } from "../middlewares/validate";

export const notificationsRouter = Router();

const listNotifQuerySchema = z.object({
  unreadOnly: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

notificationsRouter.get(
  "/",
  requireAuth,
  validateQuery(listNotifQuerySchema),
  asyncHandler(async (req, res) => {
    const em = getOrm().em;
    const { unreadOnly, limit } = req.query as unknown as z.infer<
      typeof listNotifQuerySchema
    >;

    const where: FilterQuery<Notification> = { user: req.user!.id };
    if (unreadOnly) {
      where.isRead = false;
    }

    const [items, unreadCount] = await Promise.all([
      em.find(Notification, where, {
        orderBy: { createdAt: "DESC" },
        limit,
      }),
      em.count(Notification, { user: req.user!.id, isRead: false }),
    ]);

    res.json({
      success: true,
      data: {
        unreadCount,
        items: items.map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          body: n.body,
          referenceId: n.referenceId ?? null,
          isRead: n.isRead,
          sentViaWa: n.sentViaWa,
          createdAt: n.createdAt,
        })),
      },
    });
  }),
);

notificationsRouter.patch(
  "/:id/read",
  requireAuth,
  asyncHandler(async (req, res) => {
    const em = getOrm().em;
    const notif = await em.findOne(Notification, {
      id: req.params.id,
      user: req.user!.id,
    });

    if (!notif) {
      throw new AppError(404, "NOTIFICATION_NOT_FOUND", "Notifikasi tidak ditemukan");
    }

    notif.isRead = true;
    await em.flush();

    res.json({
      success: true,
      data: {
        id: notif.id,
        isRead: notif.isRead,
      },
    });
  }),
);

notificationsRouter.post(
  "/read-all",
  requireAuth,
  asyncHandler(async (req, res) => {
    const em = getOrm().em;
    const unread = await em.find(Notification, {
      user: req.user!.id,
      isRead: false,
    });

    for (const item of unread) {
      item.isRead = true;
    }
    await em.flush();

    res.json({
      success: true,
      data: {
        updatedCount: unread.length,
      },
    });
  }),
);
