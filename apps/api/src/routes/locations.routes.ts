import { Router } from "express";
import { FilterQuery } from "@mikro-orm/core";
import { z } from "zod";
import {
  getOrm,
  Location,
  LocationRequirement,
  LocationStatusSummary,
  Question,
  Report,
  RtOfficial,
  RtSchedule,
  User,
} from "@cekdulu/db";
import {
  BlankoState,
  CATEGORY_LABELS,
  LocationCategory,
  NetworkState,
  OfficerState,
  SUMMARY_STATUS_LABELS,
  SummaryStatus,
  UserRole,
} from "@cekdulu/shared";
import { getLocationSummaryCache } from "../lib/redis";
import { requireAuth, requireRole } from "../middlewares/auth";
import { AppError, asyncHandler } from "../middlewares/error";
import { validateBody, validateQuery } from "../middlewares/validate";
import { serializeStatusSummary } from "../services/consensus.service";

export const locationsRouter = Router();

const listLocationsQuerySchema = z.object({
  category: z.nativeEnum(LocationCategory).optional(),
  status: z.nativeEnum(SummaryStatus).optional(),
  q: z.string().trim().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().positive().max(100).optional(),
});

const createLocationSchema = z.object({
  name: z.string().trim().min(3).max(150),
  category: z.nativeEnum(LocationCategory),
  address: z.string().trim().max(500).optional().nullable(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  openTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
  closeTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
  operationalDays: z.string().trim().max(50).optional().nullable(),
  isMobileUnit: z.boolean().optional(),
});

const updateLocationSchema = createLocationSchema.partial();

const requirementItemSchema = z.union([
  z.string().trim().min(1),
  z.object({
    label: z.string().trim().min(1),
    required: z.boolean().optional(),
    notes: z.string().optional(),
  }),
]);

const upsertRequirementSchema = z.object({
  serviceName: z.string().trim().min(2).max(100),
  checklistItems: z.array(requirementItemSchema).min(1),
});

const assignOfficialSchema = z.object({
  userId: z.string().uuid(),
  rtRwCode: z.string().trim().min(2).max(30),
  isActive: z.boolean().optional(),
});

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function buildHumanHeadline(
  loc: Location,
  summary?: LocationStatusSummary,
  todaySchedule?: RtSchedule,
): { headline: string; metaText: string } {
  if (todaySchedule && todaySchedule.isAvailable) {
    return {
      headline: `Tanda tangan surat ${todaySchedule.startTime.slice(0, 5)}–${todaySchedule.endTime.slice(0, 5)}`,
      metaText: "Jadwal resmi pengurus RT hari ini",
    };
  }

  if (!summary || summary.currentStatus === SummaryStatus.UNKNOWN) {
    return {
      headline: "Belum ada laporan kondisi terkini",
      metaText: "Jadilah warga pertama yang melapor",
    };
  }

  const parts: string[] = [];
  if (summary.blankoStatus === BlankoState.HABIS) {
    parts.push("Blanko habis");
  } else if (
    summary.blankoStatus === BlankoState.ADA &&
    (loc.category === LocationCategory.KELURAHAN ||
      loc.category === LocationCategory.SAMSAT)
  ) {
    parts.push("Blanko tersedia");
  }

  if (summary.networkStatus === NetworkState.OFFLINE) {
    parts.push("Sistem sedang offline");
  }
  if (summary.officerStatus === OfficerState.TIDAK_ADA) {
    parts.push("Petugas tidak di loket");
  }
  if (summary.queueEstimate) {
    parts.push(`Antre ${summary.queueEstimate} orang`);
  }

  if (parts.length === 0) {
    parts.push(
      `Layanan ${SUMMARY_STATUS_LABELS[summary.currentStatus as SummaryStatus].toLowerCase()}`,
    );
  }

  const diffMinutes = Math.max(
    1,
    Math.round((Date.now() - summary.lastUpdatedAt.getTime()) / 60000),
  );
  const timeText =
    diffMinutes < 60
      ? `${diffMinutes} mnt lalu`
      : `${Math.floor(diffMinutes / 60)} jam lalu`;

  return {
    headline: parts.join(" · "),
    metaText: `${summary.confirmationCount} warga konfirmasi · ${timeText}`,
  };
}

async function ensureCanManageLocation(
  userId: string,
  role: UserRole,
  locationId: string,
): Promise<void> {
  if (role === UserRole.ADMIN) return;
  const em = getOrm().em;
  const official = await em.findOne(RtOfficial, {
    user: userId,
    location: locationId,
    isActive: true,
  });
  if (!official) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "Hanya admin atau pengurus resmi lokasi ini yang dapat mengubah data",
    );
  }
}

locationsRouter.get(
  "/",
  validateQuery(listLocationsQuerySchema),
  asyncHandler(async (req, res) => {
    const em = getOrm().em;
    const { category, status, q, lat, lng, radiusKm } =
      req.query as unknown as z.infer<typeof listLocationsQuerySchema>;

    const where: FilterQuery<Location> = {};
    if (category) {
      where.category = category;
    }
    if (q) {
      where.$or = [
        { name: { $ilike: `%${q}%` } },
        { address: { $ilike: `%${q}%` } },
      ];
    }
    if (status) {
      where.statusSummary = { currentStatus: status };
    }

    const locations = await em.find(Location, where, {
      populate: ["statusSummary"],
      orderBy: { name: "ASC" },
    });

    const todayStr = new Date().toISOString().slice(0, 10);
    const todaySchedules = await em.find(RtSchedule, {
      scheduleDate: todayStr,
      isAvailable: true,
    });
    const scheduleMap = new Map<string, RtSchedule>();
    for (const s of todaySchedules) {
      scheduleMap.set(s.location.id, s);
    }

    let results = locations.map((loc) => {
      const distanceKm =
        lat !== undefined && lng !== undefined
          ? Number(haversineKm(lat, lng, loc.latitude, loc.longitude).toFixed(2))
          : null;

      const summary = loc.statusSummary;
      const { headline, metaText } = buildHumanHeadline(
        loc,
        summary,
        scheduleMap.get(loc.id),
      );

      return {
        id: loc.id,
        name: loc.name,
        category: loc.category,
        categoryLabel: CATEGORY_LABELS[loc.category],
        address: loc.address ?? null,
        latitude: loc.latitude,
        longitude: loc.longitude,
        openTime: loc.openTime ?? null,
        closeTime: loc.closeTime ?? null,
        operationalDays: loc.operationalDays ?? null,
        isMobileUnit: loc.isMobileUnit,
        distanceKm,
        headline,
        metaText,
        summary: summary
          ? serializeStatusSummary(summary)
          : {
              locationId: loc.id,
              currentStatus: SummaryStatus.UNKNOWN,
              statusLabel: SUMMARY_STATUS_LABELS[SummaryStatus.UNKNOWN],
              blankoStatus: null,
              queueEstimate: null,
              officerStatus: null,
              networkStatus: null,
              confirmationCount: 0,
              lastUpdatedAt: loc.createdAt,
              expiresAt: null,
            },
      };
    });

    if (radiusKm !== undefined && lat !== undefined && lng !== undefined) {
      results = results
        .filter((item) => item.distanceKm !== null && item.distanceKm <= radiusKm)
        .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
    }

    res.json({
      success: true,
      data: results,
    });
  }),
);

locationsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const em = getOrm().em;
    const loc = await em.findOne(
      Location,
      { id: req.params.id },
      { populate: ["statusSummary", "requirements", "requirements.updatedBy"] },
    );

    if (!loc) {
      throw new AppError(404, "LOCATION_NOT_FOUND", "Lokasi tidak ditemukan");
    }

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    const [schedules, activeReports, questions, officials] = await Promise.all([
      em.find(
        RtSchedule,
        { location: loc.id, scheduleDate: { $gte: todayStr } },
        { orderBy: { scheduleDate: "ASC", startTime: "ASC" } },
      ),
      em.find(
        Report,
        { location: loc.id, isHidden: false, expiresAt: { $gt: now } },
        {
          populate: ["user", "user.reputation"],
          orderBy: { createdAt: "DESC" },
          limit: 20,
        },
      ),
      em.find(
        Question,
        { location: loc.id },
        {
          populate: ["user", "answers", "answers.user"],
          orderBy: { createdAt: "DESC" },
          limit: 15,
        },
      ),
      em.find(
        RtOfficial,
        { location: loc.id, isActive: true },
        { populate: ["user"] },
      ),
    ]);

    const cachedSummary = await getLocationSummaryCache<
      ReturnType<typeof serializeStatusSummary>
    >(loc.id);

    const { headline, metaText } = buildHumanHeadline(
      loc,
      loc.statusSummary,
      schedules.find((s) => s.scheduleDate === todayStr && s.isAvailable),
    );

    res.json({
      success: true,
      data: {
        id: loc.id,
        name: loc.name,
        category: loc.category,
        categoryLabel: CATEGORY_LABELS[loc.category],
        address: loc.address ?? null,
        latitude: loc.latitude,
        longitude: loc.longitude,
        openTime: loc.openTime ?? null,
        closeTime: loc.closeTime ?? null,
        operationalDays: loc.operationalDays ?? null,
        isMobileUnit: loc.isMobileUnit,
        headline,
        metaText,
        summary:
          cachedSummary ??
          (loc.statusSummary ? serializeStatusSummary(loc.statusSummary) : null),
        schedules: schedules.map((s) => ({
          id: s.id,
          scheduleDate: s.scheduleDate,
          startTime: s.startTime,
          endTime: s.endTime,
          isAvailable: s.isAvailable,
          sourceChannel: s.sourceChannel,
        })),
        requirements: loc.requirements.getItems().map((r) => ({
          id: r.id,
          serviceName: r.serviceName,
          checklistItems: r.checklistItems,
          updatedAt: r.updatedAt,
          updatedByName: r.updatedBy?.fullName ?? null,
        })),
        officials: officials.map((o) => ({
          id: o.id,
          rtRwCode: o.rtRwCode,
          userName: o.user.fullName ?? "Pengurus RT",
        })),
        activeReports: activeReports.map((r) => ({
          id: r.id,
          conditionType: r.conditionType,
          queueRange: r.queueRange ?? null,
          notes: r.notes ?? null,
          sourceChannel: r.sourceChannel,
          validationStatus: r.validationStatus,
          weightScore: r.weightScore,
          createdAt: r.createdAt,
          expiresAt: r.expiresAt,
          reporter: {
            id: r.user.id,
            name: r.user.fullName ?? "Warga",
            role: r.user.role,
            isTrustedReporter: r.user.reputation?.isTrustedReporter ?? false,
          },
        })),
        questions: questions.map((q) => ({
          id: q.id,
          questionText: q.questionText,
          isAnswered: q.isAnswered,
          createdAt: q.createdAt,
          askedBy: q.user.fullName ?? "Warga",
          answers: q.answers.getItems().map((a) => ({
            id: a.id,
            answerText: a.answerText,
            isOfficialRt: a.isOfficialRt,
            createdAt: a.createdAt,
            answeredBy: a.user.fullName ?? (a.isOfficialRt ? "Pengurus RT" : "Warga"),
          })),
        })),
      },
    });
  }),
);

locationsRouter.post(
  "/",
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.PENGURUS_RT),
  validateBody(createLocationSchema),
  asyncHandler(async (req, res) => {
    const em = getOrm().em;
    const body = req.body as z.infer<typeof createLocationSchema>;

    const loc = em.create(Location, {
      name: body.name,
      category: body.category,
      address: body.address ?? null,
      latitude: body.latitude,
      longitude: body.longitude,
      openTime: body.openTime ?? null,
      closeTime: body.closeTime ?? null,
      operationalDays: body.operationalDays ?? null,
      isMobileUnit: body.isMobileUnit ?? false,
    });

    const summary = em.create(LocationStatusSummary, {
      location: loc,
      currentStatus: SummaryStatus.UNKNOWN,
    });

    await em.flush();

    res.status(201).json({
      success: true,
      data: {
        id: loc.id,
        name: loc.name,
        category: loc.category,
        latitude: loc.latitude,
        longitude: loc.longitude,
        summary: serializeStatusSummary(summary),
      },
    });
  }),
);

locationsRouter.patch(
  "/:id",
  requireAuth,
  validateBody(updateLocationSchema),
  asyncHandler(async (req, res) => {
    await ensureCanManageLocation(req.user!.id, req.user!.role, req.params.id);
    const em = getOrm().em;
    const loc = await em.findOne(Location, { id: req.params.id });
    if (!loc) {
      throw new AppError(404, "LOCATION_NOT_FOUND", "Lokasi tidak ditemukan");
    }

    em.assign(loc, req.body);
    await em.flush();

    res.json({
      success: true,
      data: {
        id: loc.id,
        name: loc.name,
        category: loc.category,
        address: loc.address ?? null,
        latitude: loc.latitude,
        longitude: loc.longitude,
        openTime: loc.openTime ?? null,
        closeTime: loc.closeTime ?? null,
        operationalDays: loc.operationalDays ?? null,
        isMobileUnit: loc.isMobileUnit,
      },
    });
  }),
);

locationsRouter.get(
  "/:id/requirements",
  asyncHandler(async (req, res) => {
    const em = getOrm().em;
    const requirements = await em.find(
      LocationRequirement,
      { location: req.params.id },
      { populate: ["updatedBy"], orderBy: { serviceName: "ASC" } },
    );

    res.json({
      success: true,
      data: requirements.map((r) => ({
        id: r.id,
        serviceName: r.serviceName,
        checklistItems: r.checklistItems,
        updatedAt: r.updatedAt,
        updatedByName: r.updatedBy?.fullName ?? null,
      })),
    });
  }),
);

locationsRouter.post(
  "/:id/requirements",
  requireAuth,
  validateBody(upsertRequirementSchema),
  asyncHandler(async (req, res) => {
    await ensureCanManageLocation(req.user!.id, req.user!.role, req.params.id);
    const em = getOrm().em;
    const loc = await em.findOne(Location, { id: req.params.id });
    if (!loc) {
      throw new AppError(404, "LOCATION_NOT_FOUND", "Lokasi tidak ditemukan");
    }

    const user = await em.findOneOrFail(User, { id: req.user!.id });
    const body = req.body as z.infer<typeof upsertRequirementSchema>;

    const requirement = em.create(LocationRequirement, {
      location: loc,
      serviceName: body.serviceName,
      checklistItems: body.checklistItems,
      updatedBy: user,
    });

    await em.flush();

    res.status(201).json({
      success: true,
      data: {
        id: requirement.id,
        serviceName: requirement.serviceName,
        checklistItems: requirement.checklistItems,
        updatedAt: requirement.updatedAt,
      },
    });
  }),
);

locationsRouter.put(
  "/:id/requirements/:reqId",
  requireAuth,
  validateBody(upsertRequirementSchema),
  asyncHandler(async (req, res) => {
    await ensureCanManageLocation(req.user!.id, req.user!.role, req.params.id);
    const em = getOrm().em;
    const requirement = await em.findOne(LocationRequirement, {
      id: req.params.reqId,
      location: req.params.id,
    });
    if (!requirement) {
      throw new AppError(404, "REQUIREMENT_NOT_FOUND", "Syarat layanan tidak ditemukan");
    }

    const user = await em.findOneOrFail(User, { id: req.user!.id });
    const body = req.body as z.infer<typeof upsertRequirementSchema>;

    requirement.serviceName = body.serviceName;
    requirement.checklistItems = body.checklistItems;
    requirement.updatedBy = user;

    await em.flush();

    res.json({
      success: true,
      data: {
        id: requirement.id,
        serviceName: requirement.serviceName,
        checklistItems: requirement.checklistItems,
        updatedAt: requirement.updatedAt,
      },
    });
  }),
);

locationsRouter.delete(
  "/:id/requirements/:reqId",
  requireAuth,
  asyncHandler(async (req, res) => {
    await ensureCanManageLocation(req.user!.id, req.user!.role, req.params.id);
    const em = getOrm().em;
    const requirement = await em.findOne(LocationRequirement, {
      id: req.params.reqId,
      location: req.params.id,
    });
    if (!requirement) {
      throw new AppError(404, "REQUIREMENT_NOT_FOUND", "Syarat layanan tidak ditemukan");
    }

    await em.removeAndFlush(requirement);
    res.json({ success: true, data: { deletedId: req.params.reqId } });
  }),
);

locationsRouter.post(
  "/:id/officials",
  requireAuth,
  requireRole(UserRole.ADMIN),
  validateBody(assignOfficialSchema),
  asyncHandler(async (req, res) => {
    const em = getOrm().em;
    const body = req.body as z.infer<typeof assignOfficialSchema>;

    const [loc, targetUser] = await Promise.all([
      em.findOne(Location, { id: req.params.id }),
      em.findOne(User, { id: body.userId }),
    ]);

    if (!loc) {
      throw new AppError(404, "LOCATION_NOT_FOUND", "Lokasi tidak ditemukan");
    }
    if (!targetUser) {
      throw new AppError(404, "USER_NOT_FOUND", "Pengguna tidak ditemukan");
    }

    if (targetUser.role === UserRole.WARGA) {
      targetUser.role = UserRole.PENGURUS_RT;
    }

    let official = await em.findOne(RtOfficial, {
      user: targetUser.id,
      location: loc.id,
    });

    if (official) {
      official.rtRwCode = body.rtRwCode;
      official.isActive = body.isActive ?? true;
    } else {
      official = em.create(RtOfficial, {
        user: targetUser,
        location: loc,
        rtRwCode: body.rtRwCode,
        isActive: body.isActive ?? true,
      });
    }

    await em.flush();

    res.status(201).json({
      success: true,
      data: {
        id: official.id,
        userId: targetUser.id,
        locationId: loc.id,
        rtRwCode: official.rtRwCode,
        isActive: official.isActive,
      },
    });
  }),
);
