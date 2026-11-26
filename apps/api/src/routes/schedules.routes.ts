import { Router } from "express";
import { FilterQuery } from "@mikro-orm/core";
import { z } from "zod";
import {
  getOrm,
  Location,
  RtOfficial,
  RtSchedule,
  User,
} from "@cekdulu/db";
import { ChannelSource, NotifType, UserRole } from "@cekdulu/shared";
import { emitLocationEvent } from "../lib/socket";
import {
  requireAuth,
  requireRole,
  resolveSourceChannel,
} from "../middlewares/auth";
import { AppError, asyncHandler } from "../middlewares/error";
import { validateBody, validateQuery } from "../middlewares/validate";
import { notifyLocationWatchers } from "../services/notification.service";

export const schedulesRouter = Router();

const listSchedulesQuerySchema = z.object({
  locationId: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const createScheduleSchema = z.object({
  locationId: z.string().uuid(),
  scheduleDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  isAvailable: z.boolean().optional(),
  source_channel: z.nativeEnum(ChannelSource).optional(),
  sourceChannel: z.nativeEnum(ChannelSource).optional(),
});

const updateScheduleSchema = z.object({
  startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  isAvailable: z.boolean().optional(),
});

schedulesRouter.get(
  "/",
  validateQuery(listSchedulesQuerySchema),
  asyncHandler(async (req, res) => {
    const em = getOrm().em;
    const { locationId, date } = req.query as unknown as z.infer<
      typeof listSchedulesQuerySchema
    >;

    const where: FilterQuery<RtSchedule> = {
      scheduleDate: date ?? new Date().toISOString().slice(0, 10),
    };
    if (locationId) {
      where.location = locationId;
    }

    const schedules = await em.find(RtSchedule, where, {
      populate: ["location", "createdBy"],
      orderBy: { startTime: "ASC" },
    });

    res.json({
      success: true,
      data: schedules.map((s) => ({
        id: s.id,
        locationId: s.location.id,
        locationName: s.location.name,
        scheduleDate: s.scheduleDate,
        startTime: s.startTime,
        endTime: s.endTime,
        isAvailable: s.isAvailable,
        sourceChannel: s.sourceChannel,
        createdByName: s.createdBy?.fullName ?? "Pengurus RT",
        createdAt: s.createdAt,
      })),
    });
  }),
);

schedulesRouter.post(
  "/",
  requireAuth,
  requireRole(UserRole.PENGURUS_RT, UserRole.ADMIN),
  validateBody(createScheduleSchema),
  asyncHandler(async (req, res) => {
    const em = getOrm().em;
    const body = req.body as z.infer<typeof createScheduleSchema>;
    const authUser = req.user!;

    const [location, user] = await Promise.all([
      em.findOne(Location, { id: body.locationId }),
      em.findOneOrFail(User, { id: authUser.id }),
    ]);

    if (!location) {
      throw new AppError(404, "LOCATION_NOT_FOUND", "Lokasi tidak ditemukan");
    }

    if (authUser.role !== UserRole.ADMIN) {
      const official = await em.findOne(RtOfficial, {
        user: authUser.id,
        location: location.id,
        isActive: true,
      });
      if (!official) {
        throw new AppError(
          403,
          "FORBIDDEN",
          "Anda bukan pengurus resmi untuk lokasi RT ini",
        );
      }
    }

    const scheduleDate =
      body.scheduleDate ?? new Date().toISOString().slice(0, 10);

    const schedule = em.create(RtSchedule, {
      location,
      createdBy: user,
      scheduleDate,
      startTime: body.startTime,
      endTime: body.endTime,
      isAvailable: body.isAvailable ?? true,
      sourceChannel: resolveSourceChannel(
        req,
        body.source_channel ?? body.sourceChannel,
      ),
    });

    await notifyLocationWatchers(em, {
      locationId: location.id,
      excludeUserId: user.id,
      type: NotifType.STATUS_CHANGE,
      title: `Jadwal Layanan ${location.name}`,
      body: schedule.isAvailable
        ? `Pengurus tersedia tanggal ${scheduleDate} pukul ${body.startTime.slice(0, 5)}–${body.endTime.slice(0, 5)}.`
        : `Pengurus menginformasikan sedang berhalangan pada ${scheduleDate}.`,
      referenceId: schedule.id,
    });

    await em.flush();

    const payload = {
      id: schedule.id,
      locationId: location.id,
      scheduleDate: schedule.scheduleDate,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      isAvailable: schedule.isAvailable,
      sourceChannel: schedule.sourceChannel,
    };

    emitLocationEvent(location.id, "schedule:updated", payload);

    res.status(201).json({
      success: true,
      data: payload,
    });
  }),
);

schedulesRouter.patch(
  "/:id",
  requireAuth,
  requireRole(UserRole.PENGURUS_RT, UserRole.ADMIN),
  validateBody(updateScheduleSchema),
  asyncHandler(async (req, res) => {
    const em = getOrm().em;
    const schedule = await em.findOne(
      RtSchedule,
      { id: req.params.id },
      { populate: ["location"] },
    );

    if (!schedule) {
      throw new AppError(404, "SCHEDULE_NOT_FOUND", "Jadwal tidak ditemukan");
    }

    if (req.user!.role !== UserRole.ADMIN) {
      const official = await em.findOne(RtOfficial, {
        user: req.user!.id,
        location: schedule.location.id,
        isActive: true,
      });
      if (!official) {
        throw new AppError(
          403,
          "FORBIDDEN",
          "Anda bukan pengurus resmi untuk lokasi RT ini",
        );
      }
    }

    em.assign(schedule, req.body);
    await em.flush();

    const payload = {
      id: schedule.id,
      locationId: schedule.location.id,
      scheduleDate: schedule.scheduleDate,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      isAvailable: schedule.isAvailable,
    };

    emitLocationEvent(schedule.location.id, "schedule:updated", payload);

    res.json({
      success: true,
      data: payload,
    });
  }),
);
