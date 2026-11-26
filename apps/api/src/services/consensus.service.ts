import { EntityManager } from "@mikro-orm/postgresql";
import {
  Location,
  LocationStatusSummary,
  Report,
  UserReputation,
} from "@cekdulu/db";
import {
  computeLocationConsensus,
  evaluateTrustedReporter,
  NotifType,
  REPORT_TTL_SECONDS,
  SUMMARY_STATUS_LABELS,
  SummaryStatus,
  ValidationState,
} from "@cekdulu/shared";
import {
  invalidateLocationSummaryCache,
  setLocationSummaryCache,
} from "../lib/redis";
import { emitLocationStatusUpdate } from "../lib/socket";
import {
  createAndDispatchNotification,
  notifyLocationWatchers,
} from "./notification.service";

export function serializeStatusSummary(summary: LocationStatusSummary) {
  const statusKey = summary.currentStatus as SummaryStatus;
  return {
    locationId: summary.location.id,
    currentStatus: statusKey,
    statusLabel: SUMMARY_STATUS_LABELS[statusKey],
    blankoStatus: summary.blankoStatus ?? null,
    queueEstimate: summary.queueEstimate ?? null,
    officerStatus: summary.officerStatus ?? null,
    networkStatus: summary.networkStatus ?? null,
    confirmationCount: summary.confirmationCount,
    lastUpdatedAt: summary.lastUpdatedAt,
    expiresAt: summary.expiresAt ?? null,
  };
}

export async function recalculateLocationSummary(
  em: EntityManager,
  locationId: string,
  triggerReportId?: string,
) {
  const now = new Date();
  const location = await em.findOneOrFail(
    Location,
    { id: locationId },
    { populate: ["statusSummary"] },
  );

  // 1. Tandai laporan yang sudah lewat expires_at sebagai 'expired'
  const staleReports = await em.find(Report, {
    location: locationId,
    validationStatus: { $ne: ValidationState.EXPIRED },
    expiresAt: { $lte: now },
  });
  for (const stale of staleReports) {
    stale.validationStatus = ValidationState.EXPIRED;
  }

  // 2. Ambil semua laporan aktif & tidak disembunyikan
  const activeReports = await em.find(
    Report,
    {
      location: locationId,
      isHidden: false,
      expiresAt: { $gt: now },
    },
    { populate: ["user"], orderBy: { createdAt: "DESC" } },
  );

  // 3. Hitung konsensus (2-3 laporan atau bobot >= 2)
  const consensus = computeLocationConsensus(
    activeReports.map((r) => ({
      id: r.id,
      userId: r.user.id,
      conditionType: r.conditionType,
      queueRange: r.queueRange,
      weightScore: r.weightScore,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
    })),
  );

  const confirmedSet = new Set(consensus.confirmedReportIds);

  // 4. Update validationStatus laporan & reputasi pelapor yang baru terkonfirmasi
  for (const report of activeReports) {
    if (
      confirmedSet.has(report.id) &&
      report.validationStatus === ValidationState.PENDING
    ) {
      report.validationStatus = ValidationState.CONFIRMED;

      let rep = await em.findOne(UserReputation, { user: report.user.id });
      if (!rep) {
        rep = em.create(UserReputation, { user: report.user });
      }
      const wasTrusted = rep.isTrustedReporter;
      rep.matchedReports += 1;

      const evaluated = evaluateTrustedReporter(
        rep.totalReports,
        rep.matchedReports,
      );
      rep.isTrustedReporter = evaluated.isTrustedReporter;
      if (evaluated.voteWeight > rep.voteWeight) {
        rep.voteWeight = evaluated.voteWeight;
      }

      await createAndDispatchNotification(em, {
        user: report.user,
        type: NotifType.REPORT_CONFIRMED,
        title: "Laporanmu Terkonfirmasi!",
        body: `Laporanmu di ${location.name} telah dikonfirmasi oleh warga lain.`,
        referenceId: report.id,
        sendWhatsApp: false,
      });

      if (!wasTrusted && rep.isTrustedReporter) {
        await createAndDispatchNotification(em, {
          user: report.user,
          type: NotifType.BADGE_EARNED,
          title: "Selamat! Kamu jadi Trusted Reporter",
          body: "Akurasi laporanmu tinggi. Kini laporanmu memiliki bobot konfirmasi lebih besar!",
          referenceId: report.id,
          sendWhatsApp: true,
        });
      }
    }
  }

  // 5. Perbarui LocationStatusSummary
  let summary = location.statusSummary;
  const previousStatus = summary?.currentStatus ?? SummaryStatus.UNKNOWN;

  if (!summary) {
    summary = em.create(LocationStatusSummary, {
      location,
      currentStatus: consensus.currentStatus,
      blankoStatus: consensus.blankoStatus,
      queueEstimate: consensus.queueEstimate,
      officerStatus: consensus.officerStatus,
      networkStatus: consensus.networkStatus,
      confirmationCount: consensus.confirmationCount,
      lastUpdatedAt: now,
      expiresAt: consensus.expiresAt,
    });
  } else {
    summary.currentStatus = consensus.currentStatus;
    summary.blankoStatus = consensus.blankoStatus;
    summary.queueEstimate = consensus.queueEstimate;
    summary.officerStatus = consensus.officerStatus;
    summary.networkStatus = consensus.networkStatus;
    summary.confirmationCount = consensus.confirmationCount;
    summary.lastUpdatedAt = now;
    summary.expiresAt = consensus.expiresAt;
  }

  // 6. Jika status berubah & valid, kirim notifikasi ke warga yang memantau lokasi (watched_locations)
  if (
    previousStatus !== consensus.currentStatus &&
    consensus.currentStatus !== SummaryStatus.UNKNOWN
  ) {
    const label = SUMMARY_STATUS_LABELS[consensus.currentStatus];
    const queueInfo = consensus.queueEstimate
      ? ` (antrean ${consensus.queueEstimate} orang)`
      : "";
    await notifyLocationWatchers(em, {
      locationId: location.id,
      type: NotifType.STATUS_CHANGE,
      title: `Update Status: ${location.name}`,
      body: `Kondisi terkini berubah menjadi *${label}*${queueInfo}.`,
      referenceId: triggerReportId ?? null,
    });
  }

  await em.flush();

  const serialized = serializeStatusSummary(summary);
  if (consensus.isConfirmed && consensus.expiresAt) {
    const ttlSeconds = Math.min(
      REPORT_TTL_SECONDS,
      Math.max(1, Math.floor((consensus.expiresAt.getTime() - Date.now()) / 1000)),
    );
    await setLocationSummaryCache(locationId, serialized, ttlSeconds);
  } else {
    await invalidateLocationSummaryCache(locationId);
  }

  emitLocationStatusUpdate(locationId, serialized);
  return serialized;
}
