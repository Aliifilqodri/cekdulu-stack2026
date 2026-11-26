import { Router } from "express";
import { z } from "zod";
import { getOrm, Location, RtSchedule, User, UserReputation } from "@cekdulu/db";
import {
  CATEGORY_LABELS,
  ChannelSource,
  LocationCategory,
  normalizePhoneNumber,
  SUMMARY_STATUS_LABELS,
  SummaryStatus,
  UserRole,
} from "@cekdulu/shared";
import { getLocationSummaryCacheMap } from "../lib/redis";
import { requireBotApiKey, resolveSourceChannel } from "../middlewares/auth";
import { AppError, asyncHandler } from "../middlewares/error";
import { validateBody, validateQuery } from "../middlewares/validate";
import { serializeStatusSummary } from "../services/consensus.service";
import {
  createLocationQuestion,
  toggleWatchLocation,
} from "../services/qa-watch.service";

export const botRouter = Router();

const statusCheckQuerySchema = z.object({
  keyword: z.string().trim().min(1),
  category: z.nativeEnum(LocationCategory).optional(),
  source_channel: z.nativeEnum(ChannelSource).optional(),
  sourceChannel: z.nativeEnum(ChannelSource).optional(),
});

const botWebhookSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("check_status"),
    phoneNumber: z.string().min(9).max(20).optional(),
    keyword: z.string().trim().min(1),
    category: z.nativeEnum(LocationCategory).optional(),
    source_channel: z.nativeEnum(ChannelSource).optional(),
  }),
  z.object({
    action: z.literal("ask_question"),
    phoneNumber: z.string().min(9).max(20),
    locationId: z.string().uuid(),
    questionText: z.string().trim().min(5).max(1000),
    source_channel: z.nativeEnum(ChannelSource).optional(),
  }),
  z.object({
    action: z.literal("toggle_watch"),
    phoneNumber: z.string().min(9).max(20),
    locationId: z.string().uuid(),
    source_channel: z.nativeEnum(ChannelSource).optional(),
  }),
]);

async function buildCompactStatusCheck(keyword: string, category?: LocationCategory) {
  const em = getOrm().em;
  const locations = await em.find(
    Location,
    {
      ...(category ? { category } : {}),
      $or: [
        { name: { $ilike: `%${keyword}%` } },
        { address: { $ilike: `%${keyword}%` } },
        { requirements: { serviceName: { $ilike: `%${keyword}%` } } },
      ],
    },
    { populate: ["statusSummary"], limit: 5, orderBy: { name: "ASC" } },
  );

  const cachedMap = await getLocationSummaryCacheMap<
    ReturnType<typeof serializeStatusSummary>
  >(locations.map((l) => l.id));

  const todayStr = new Date().toISOString().slice(0, 10);
  return Promise.all(
    locations.map(async (loc) => {
      const schedule = await em.findOne(
        RtSchedule,
        { location: loc.id, scheduleDate: todayStr, isAvailable: true },
        { orderBy: { startTime: "ASC" } },
      );

      const summaryPayload =
        cachedMap.get(loc.id) ??
        (loc.statusSummary ? serializeStatusSummary(loc.statusSummary) : null);

      const status = (summaryPayload?.currentStatus ??
        SummaryStatus.UNKNOWN) as SummaryStatus;
      const statusLabel = SUMMARY_STATUS_LABELS[status];

      const lines = [
        `📍 *${loc.name}* (${CATEGORY_LABELS[loc.category]})`,
        `Status saat ini: *${statusLabel}*`,
      ];

      if (summaryPayload?.queueEstimate) {
        lines.push(`Estimasi antrean: *${summaryPayload.queueEstimate} orang*`);
      }
      if (summaryPayload?.blankoStatus) {
        lines.push(
          `Blanko: *${summaryPayload.blankoStatus === "ada" ? "Tersedia" : "Habis"}*`,
        );
      }
      if (schedule) {
        lines.push(
          `Jadwal TTD Pengurus hari ini: *${schedule.startTime.slice(0, 5)}–${schedule.endTime.slice(0, 5)}*`,
        );
      }
      if (summaryPayload && summaryPayload.confirmationCount > 0) {
        lines.push(`Dikonfirmasi oleh ${summaryPayload.confirmationCount} warga`);
      }

      return {
        id: loc.id,
        name: loc.name,
        category: loc.category,
        summary: summaryPayload,
        todaySchedule: schedule
          ? {
              startTime: schedule.startTime,
              endTime: schedule.endTime,
              isAvailable: schedule.isAvailable,
            }
          : null,
        waFormattedReply: lines.join("\n"),
      };
    }),
  );
}

async function resolveOrCreateBotUser(rawPhone: string): Promise<User> {
  const phoneNumber = normalizePhoneNumber(rawPhone);
  const em = getOrm().em;
  let user = await em.findOne(User, { phoneNumber });
  if (!user) {
    user = em.create(User, {
      phoneNumber,
      role: UserRole.WARGA,
      isVerified: true,
    });
    em.create(UserReputation, { user });
    await em.flush();
  }
  return user;
}

/**
 * Endpoint ringkas untuk WhatsApp Bot (`apps/bot`):
 * Mencari lokasi berdasarkan kata kunci dari chat warga dan mengembalikan data terstruktur +
 * teks balasan WhatsApp siap kirim.
 */
botRouter.get(
  "/status-check",
  validateQuery(statusCheckQuerySchema),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<
      typeof statusCheckQuerySchema
    >;
    const items = await buildCompactStatusCheck(query.keyword, query.category);
    const sourceChannel = resolveSourceChannel(
      req,
      query.source_channel ?? query.sourceChannel ?? ChannelSource.WA_BOT,
    );

    res.json({
      success: true,
      sourceChannel,
      data: items,
    });
  }),
);

/**
 * Webhook terpadu internal untuk WhatsApp Bot Gateway (`x-bot-api-key`).
 */
botRouter.post(
  "/webhook",
  requireBotApiKey,
  validateBody(botWebhookSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof botWebhookSchema>;
    const sourceChannel = body.source_channel ?? ChannelSource.WA_BOT;
    const em = getOrm().em;

    if (body.action === "check_status") {
      const items = await buildCompactStatusCheck(body.keyword, body.category);
      res.json({
        success: true,
        sourceChannel,
        data: items,
      });
      return;
    }

    const rawPhone = body.phoneNumber || req.header("x-user-phone");
    if (!rawPhone) {
      throw new AppError(400, "MISSING_PHONE", "phoneNumber wajib diisi");
    }
    const user = await resolveOrCreateBotUser(rawPhone);

    if (body.action === "ask_question") {
      const data = await createLocationQuestion(em, {
        locationId: body.locationId,
        userId: user.id,
        questionText: body.questionText,
        sourceChannel,
      });
      res.status(201).json({ success: true, sourceChannel, data });
      return;
    }

    const data = await toggleWatchLocation(em, {
      locationId: body.locationId,
      userId: user.id,
      sourceChannel,
    });
    res.status(data.isWatching ? 201 : 200).json({
      success: true,
      sourceChannel,
      data,
    });
  }),
);
