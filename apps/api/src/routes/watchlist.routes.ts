import { Router } from "express";
import { getOrm, Location, User, WatchedLocation } from "@cekdulu/db";
import { CATEGORY_LABELS } from "@cekdulu/shared";
import { requireAuth } from "../middlewares/auth";
import { AppError, asyncHandler } from "../middlewares/error";
import { serializeStatusSummary } from "../services/consensus.service";

export const watchlistRouter = Router();

watchlistRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const em = getOrm().em;
    const watches = await em.find(
      WatchedLocation,
      { user: req.user!.id },
      {
        populate: ["location", "location.statusSummary"],
        orderBy: { createdAt: "DESC" },
      },
    );

    res.json({
      success: true,
      data: watches.map((w) => ({
        locationId: w.location.id,
        name: w.location.name,
        category: w.location.category,
        categoryLabel: CATEGORY_LABELS[w.location.category],
        address: w.location.address ?? null,
        watchedAt: w.createdAt,
        summary: w.location.statusSummary
          ? serializeStatusSummary(w.location.statusSummary)
          : null,
      })),
    });
  }),
);

watchlistRouter.post(
  "/:locationId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const em = getOrm().em;
    const [location, user] = await Promise.all([
      em.findOne(Location, { id: req.params.locationId }),
      em.findOneOrFail(User, { id: req.user!.id }),
    ]);

    if (!location) {
      throw new AppError(404, "LOCATION_NOT_FOUND", "Lokasi tidak ditemukan");
    }

    let existing = await em.findOne(WatchedLocation, {
      user: user.id,
      location: location.id,
    });

    if (!existing) {
      existing = em.create(WatchedLocation, {
        user,
        location,
      });
      await em.flush();
    }

    res.status(201).json({
      success: true,
      data: {
        userId: user.id,
        locationId: location.id,
        watchedAt: existing.createdAt,
      },
    });
  }),
);

watchlistRouter.delete(
  "/:locationId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const em = getOrm().em;
    const existing = await em.findOne(WatchedLocation, {
      user: req.user!.id,
      location: req.params.locationId,
    });

    if (existing) {
      await em.removeAndFlush(existing);
    }

    res.json({
      success: true,
      data: {
        unwatchedLocationId: req.params.locationId,
      },
    });
  }),
);
