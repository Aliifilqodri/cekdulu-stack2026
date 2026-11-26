import { getOrm, Report } from "@cekdulu/db";
import { ValidationState } from "@cekdulu/shared";
import { getRedis, REDIS_KEYS } from "../lib/redis";
import { recalculateLocationSummary } from "./consensus.service";

let timer: NodeJS.Timeout | null = null;

/**
 * Worker berkala untuk memproses laporan yang sudah melewati batas 2 jam:
 * - Mengambil entry yang jatuh tempo dari Redis Sorted Set `cekdulu:reports:expiry_queue`
 * - Fallback sweep ke PostgreSQL agar tetap konsisten walau Redis sempat restart
 * - Menghitung ulang `location_status_summaries` dan memancarkan event Socket.io live map
 */
export async function processExpiredReportsTick(): Promise<void> {
  const orm = getOrm();
  const em = orm.em.fork();
  const now = new Date();
  const affectedLocationIds = new Set<string>();

  try {
    const redis = getRedis();
    if (redis) {
      const dueEntries = await redis.zrangebyscore(
        REDIS_KEYS.expiryZSet,
        0,
        now.getTime(),
      );
      if (dueEntries.length > 0) {
        await redis.zrem(REDIS_KEYS.expiryZSet, ...dueEntries);
        for (const entry of dueEntries) {
          const [, locationId] = entry.split(":");
          if (locationId) {
            affectedLocationIds.add(locationId);
          }
        }
      }
    }

    const dbDueReports = await em.find(Report, {
      validationStatus: { $ne: ValidationState.EXPIRED },
      expiresAt: { $lte: now },
    });

    for (const rep of dbDueReports) {
      rep.validationStatus = ValidationState.EXPIRED;
      affectedLocationIds.add(rep.location.id);
    }

    if (dbDueReports.length > 0) {
      await em.flush();
    }

    for (const locationId of affectedLocationIds) {
      await recalculateLocationSummary(em.fork(), locationId);
    }
  } catch (err) {
    console.error("[worker:expiry] Gagal memproses laporan expired:", err);
  }
}

export function startExpiryWorker(intervalMs = 30_000): void {
  if (timer) return;
  timer = setInterval(() => {
    void processExpiredReportsTick();
  }, intervalMs);
  timer.unref();
}

export function stopExpiryWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
