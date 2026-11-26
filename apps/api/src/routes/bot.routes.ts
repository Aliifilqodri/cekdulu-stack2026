import { Router } from "express";
import { z } from "zod";
import { getOrm, Location, RtSchedule } from "@cekdulu/db";
import {
  CATEGORY_LABELS,
  LocationCategory,
  SUMMARY_STATUS_LABELS,
  SummaryStatus,
} from "@cekdulu/shared";
import { asyncHandler } from "../middlewares/error";
import { validateQuery } from "../middlewares/validate";
import { serializeStatusSummary } from "../services/consensus.service";

export const botRouter = Router();

const statusCheckQuerySchema = z.object({
  keyword: z.string().trim().min(1),
  category: z.nativeEnum(LocationCategory).optional(),
});

/**
 * Endpoint ringkas untuk WhatsApp Bot (`apps/bot`):
 * Mencari lokasi berdasarkan kata kunci dari chat warga dan mengembalikan data terstruktur +
 * teks balasan WhatsApp siap kirim.
 */
botRouter.get(
  "/status-check",
  validateQuery(statusCheckQuerySchema),
  asyncHandler(async (req, res) => {
    const em = getOrm().em;
    const { keyword, category } = req.query as unknown as z.infer<
      typeof statusCheckQuerySchema
    >;

    const locations = await em.find(
      Location,
      {
        ...(category ? { category } : {}),
        $or: [
          { name: { $ilike: `%${keyword}%` } },
          { address: { $ilike: `%${keyword}%` } },
        ],
      },
      { populate: ["statusSummary"], limit: 5, orderBy: { name: "ASC" } },
    );

    const todayStr = new Date().toISOString().slice(0, 10);
    const items = await Promise.all(
      locations.map(async (loc) => {
        const schedule = await em.findOne(
          RtSchedule,
          { location: loc.id, scheduleDate: todayStr, isAvailable: true },
          { orderBy: { startTime: "ASC" } },
        );

        const summary = loc.statusSummary;
        const status = (summary?.currentStatus ?? SummaryStatus.UNKNOWN) as SummaryStatus;
        const statusLabel = SUMMARY_STATUS_LABELS[status];

        const lines = [
          `📍 *${loc.name}* (${CATEGORY_LABELS[loc.category]})`,
          `Status saat ini: *${statusLabel}*`,
        ];

        if (summary?.queueEstimate) {
          lines.push(`Estimasi antrean: *${summary.queueEstimate} orang*`);
        }
        if (summary?.blankoStatus) {
          lines.push(
            `Blanko: *${summary.blankoStatus === "ada" ? "Tersedia" : "Habis"}*`,
          );
        }
        if (schedule) {
          lines.push(
            `Jadwal TTD Pengurus hari ini: *${schedule.startTime.slice(0, 5)}–${schedule.endTime.slice(0, 5)}*`,
          );
        }
        if (summary && summary.confirmationCount > 0) {
          lines.push(`Dikonfirmasi oleh ${summary.confirmationCount} warga`);
        }

        return {
          id: loc.id,
          name: loc.name,
          category: loc.category,
          summary: summary ? serializeStatusSummary(summary) : null,
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

    res.json({
      success: true,
      data: items,
    });
  }),
);
