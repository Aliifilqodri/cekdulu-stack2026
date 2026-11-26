import { Router } from "express";
import { FilterQuery } from "@mikro-orm/core";
import { z } from "zod";
import {
  getOrm,
  Location,
  Report,
  RtOfficial,
  User,
  UserReputation,
} from "@cekdulu/db";
import {
  ChannelSource,
  QueueBucket,
  REPORT_COOLDOWN_SECONDS,
  REPORT_TTL_SECONDS,
  ReportCondition,
  resolveVoteWeight,
  UserRole,
  ValidationState,
} from "@cekdulu/shared";
import {
  checkAndSetReportCooldown,
  markReportCooldown,
  scheduleReportExpiryInRedis,
} from "../lib/redis";
import { emitLocationEvent } from "../lib/socket";
import {
  requireAuth,
  requireRole,
  resolveSourceChannel,
} from "../middlewares/auth";
import { AppError, asyncHandler } from "../middlewares/error";
import { validateBody, validateQuery } from "../middlewares/validate";
import { recalculateLocationSummary } from "../services/consensus.service";

export const reportsRouter = Router();

const listReportsQuerySchema = z.object({
  locationId: z.string().uuid().optional(),
  includeExpired: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

const createReportSchema = z.object({
  locationId: z.string().uuid(),
  conditionType: z.nativeEnum(ReportCondition),
  queueRange: z.nativeEnum(QueueBucket).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  source_channel: z.nativeEnum(ChannelSource).optional(),
  sourceChannel: z.nativeEnum(ChannelSource).optional(),
});

const moderateReportSchema = z.object({
  isHidden: z.boolean(),
});

reportsRouter.get(
  "/",
  validateQuery(listReportsQuerySchema),
  asyncHandler(async (req, res) => {
    const em = getOrm().em;
    const { locationId, includeExpired, limit } =
      req.query as unknown as z.infer<typeof listReportsQuerySchema>;

    const where: FilterQuery<Report> = { isHidden: false };
    if (locationId) {
      where.location = locationId;
    }
    if (!includeExpired) {
      where.expiresAt = { $gt: new Date() };
    }

    const reports = await em.find(Report, where, {
      populate: ["user", "user.reputation", "location"],
      orderBy: { createdAt: "DESC" },
      limit,
    });

    res.json({
      success: true,
      data: reports.map((r) => ({
        id: r.id,
        locationId: r.location.id,
        locationName: r.location.name,
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
    });
  }),
);

reportsRouter.post(
  "/",
  requireAuth,
  validateBody(createReportSchema),
  asyncHandler(async (req, res) => {
    const em = getOrm().em;
    const body = req.body as z.infer<typeof createReportSchema>;
    const authUser = req.user!;

    const [location, user] = await Promise.all([
      em.findOne(Location, { id: body.locationId }),
      em.findOne(User, { id: authUser.id }, { populate: ["reputation"] }),
    ]);

    if (!location) {
      throw new AppError(404, "LOCATION_NOT_FOUND", "Lokasi tidak ditemukan");
    }
    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "Pengguna tidak ditemukan");
    }

    // 1. Cek anti-spam cooldown di Redis + fallback DB (10 menit per user per lokasi)
    const cooldown = await checkAndSetReportCooldown(user.id, location.id);
    if (!cooldown.allowed) {
      throw new AppError(
        429,
        "REPORT_COOLDOWN",
        `Kamu baru saja melapor di lokasi ini. Tunggu ${Math.ceil(cooldown.retryAfterSeconds / 60)} menit lagi.`,
        { retryAfterSeconds: cooldown.retryAfterSeconds },
      );
    }

    const cooldownCutoff = new Date(Date.now() - REPORT_COOLDOWN_SECONDS * 1000);
    const recentReport = await em.findOne(Report, {
      user: user.id,
      location: location.id,
      createdAt: { $gt: cooldownCutoff },
    });
    if (recentReport) {
      throw new AppError(
        429,
        "REPORT_COOLDOWN",
        "Kamu baru saja mengirim laporan untuk lokasi ini. Silakan tunggu beberapa menit.",
      );
    }

    // 2. Hitung bobot suara berdasarkan reputasi & status pengurus RT lokasi
    let reputation = user.reputation;
    if (!reputation) {
      reputation = em.create(UserReputation, { user });
    }

    const officialAssignment = await em.findOne(RtOfficial, {
      user: user.id,
      location: location.id,
      isActive: true,
    });

    const weightScore = resolveVoteWeight(
      user.role,
      reputation.isTrustedReporter,
      officialAssignment !== null,
    );

    const now = new Date();
    const expiresAt = new Date(now.getTime() + REPORT_TTL_SECONDS * 1000);

    const report = em.create(Report, {
      user,
      location,
      conditionType: body.conditionType,
      queueRange: body.queueRange ?? null,
      notes: body.notes ?? null,
      sourceChannel: resolveSourceChannel(
        req,
        body.source_channel ?? body.sourceChannel,
      ),
      validationStatus: ValidationState.PENDING,
      weightScore,
      isHidden: false,
      createdAt: now,
      expiresAt,
    });

    reputation.totalReports += 1;
    await em.flush();

    // 3. Jadwalkan auto-expired 2 jam di Redis & pasang cooldown
    await Promise.all([
      scheduleReportExpiryInRedis(report.id, location.id, expiresAt),
      markReportCooldown(user.id, location.id),
    ]);

    // 4. Evaluasi konsensus & perbarui ringkasan lokasi + kirim event live Socket.io
    const updatedSummary = await recalculateLocationSummary(
      em,
      location.id,
      report.id,
    );

    await em.refresh(report);

    emitLocationEvent(location.id, "report:created", {
      id: report.id,
      locationId: location.id,
      conditionType: report.conditionType,
      queueRange: report.queueRange ?? null,
      notes: report.notes ?? null,
      validationStatus: report.validationStatus,
      createdAt: report.createdAt,
      expiresAt: report.expiresAt,
    });

    res.status(201).json({
      success: true,
      data: {
        report: {
          id: report.id,
          locationId: location.id,
          conditionType: report.conditionType,
          queueRange: report.queueRange ?? null,
          notes: report.notes ?? null,
          sourceChannel: report.sourceChannel,
          validationStatus: report.validationStatus,
          weightScore: report.weightScore,
          createdAt: report.createdAt,
          expiresAt: report.expiresAt,
        },
        locationSummary: updatedSummary,
      },
    });
  }),
);

reportsRouter.patch(
  "/:id/moderate",
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.PENGURUS_RT),
  validateBody(moderateReportSchema),
  asyncHandler(async (req, res) => {
    const em = getOrm().em;
    const report = await em.findOne(
      Report,
      { id: req.params.id },
      { populate: ["location"] },
    );

    if (!report) {
      throw new AppError(404, "REPORT_NOT_FOUND", "Laporan tidak ditemukan");
    }

    if (req.user!.role === UserRole.PENGURUS_RT) {
      const official = await em.findOne(RtOfficial, {
        user: req.user!.id,
        location: report.location.id,
        isActive: true,
      });
      if (!official) {
        throw new AppError(
          403,
          "FORBIDDEN",
          "Anda hanya dapat memoderasi laporan di wilayah RT Anda",
        );
      }
    }

    report.isHidden = (req.body as z.infer<typeof moderateReportSchema>).isHidden;
    await em.flush();

    const updatedSummary = await recalculateLocationSummary(
      em,
      report.location.id,
    );

    res.json({
      success: true,
      data: {
        id: report.id,
        isHidden: report.isHidden,
        locationSummary: updatedSummary,
      },
    });
  }),
);
