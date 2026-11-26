import {
  BlankoState,
  NetworkState,
  OfficerState,
  QueueBucket,
  ReportCondition,
  SummaryStatus,
  UserRole,
} from "./enums";

export const REPORT_TTL_SECONDS = 2 * 60 * 60; // 2 jam (7200 detik)
export const REPORT_COOLDOWN_SECONDS = 10 * 60; // Cooldown anti-spam 10 menit per user per lokasi
export const OTP_TTL_SECONDS = 5 * 60; // 5 menit
export const MAX_OTP_ATTEMPTS = 5;

/**
 * Ambang batas bobot suara agar laporan berstatus 'confirmed'
 * (misal: 2 warga biasa @1 poin, atau 1 trusted reporter @2 poin, atau 1 pengurus RT @3 poin)
 */
export const CONFIRMATION_WEIGHT_THRESHOLD = 2;

export const TRUSTED_MIN_MATCHED_REPORTS = 5;
export const TRUSTED_MIN_ACCURACY_RATIO = 0.7;

export interface ActiveReportInput {
  id: string;
  userId: string;
  conditionType: ReportCondition;
  queueRange?: QueueBucket | null;
  weightScore: number;
  createdAt: Date;
  expiresAt: Date;
}

export interface ComputedSummaryResult {
  currentStatus: SummaryStatus;
  blankoStatus: BlankoState | null;
  queueEstimate: QueueBucket | null;
  officerStatus: OfficerState | null;
  networkStatus: NetworkState | null;
  confirmationCount: number;
  expiresAt: Date | null;
  winningCondition: ReportCondition | null;
  isConfirmed: boolean;
  confirmedReportIds: string[];
}

/**
 * Normalisasi nomor telepon Indonesia menjadi format standar `628xxxxxxxxxx`
 * agar 1 nomor WhatsApp selalu memetakan ke 1 akun baik dari Web maupun WA Bot.
 */
export function normalizePhoneNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("08")) {
    return "62" + digits.slice(1);
  }
  if (digits.startsWith("8")) {
    return "62" + digits;
  }
  return digits;
}

/**
 * Hitung bobot vote berdasarkan role & reputasi user.
 */
export function resolveVoteWeight(
  role: UserRole,
  reputationVoteWeight = 1,
  isOfficialForLocation = false,
): number {
  if (role === UserRole.ADMIN || isOfficialForLocation) {
    return Math.max(3, reputationVoteWeight);
  }
  if (role === UserRole.PENGURUS_RT) {
    return Math.max(2, reputationVoteWeight);
  }
  return Math.max(1, reputationVoteWeight);
}

/**
 * Evaluasi apakah user berhak mendapat badge Trusted Reporter.
 */
export function evaluateTrustedReporter(
  totalReports: number,
  matchedReports: number,
): { isTrustedReporter: boolean; voteWeight: number } {
  if (totalReports < TRUSTED_MIN_MATCHED_REPORTS) {
    return { isTrustedReporter: false, voteWeight: 1 };
  }
  const accuracy = matchedReports / totalReports;
  const trusted =
    matchedReports >= TRUSTED_MIN_MATCHED_REPORTS &&
    accuracy >= TRUSTED_MIN_ACCURACY_RATIO;

  return {
    isTrustedReporter: trusted,
    voteWeight: trusted ? 2 : 1,
  };
}

/**
 * Agregasi laporan aktif (belum expired & tidak di-hide) pada suatu lokasi
 * menjadi ringkasan status lokasi + daftar laporan yang terkonfirmasi (2-3 laporan / bobot >= 2).
 */
export function computeLocationConsensus(
  activeReports: ActiveReportInput[],
): ComputedSummaryResult {
  if (activeReports.length === 0) {
    return {
      currentStatus: SummaryStatus.UNKNOWN,
      blankoStatus: null,
      queueEstimate: null,
      officerStatus: null,
      networkStatus: null,
      confirmationCount: 0,
      expiresAt: null,
      winningCondition: null,
      isConfirmed: false,
      confirmedReportIds: [],
    };
  }

  // Deduplikasi suara per user per conditionType (ambil laporan terbaru dari user yang sama)
  const sortedDesc = [...activeReports].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );

  const buckets = new Map<
    ReportCondition,
    {
      totalWeight: number;
      uniqueUsers: Set<string>;
      reports: ActiveReportInput[];
      latestCreatedAt: number;
      maxExpiresAt: number;
    }
  >();

  for (const report of sortedDesc) {
    let bucket = buckets.get(report.conditionType);
    if (!bucket) {
      bucket = {
        totalWeight: 0,
        uniqueUsers: new Set<string>(),
        reports: [],
        latestCreatedAt: report.createdAt.getTime(),
        maxExpiresAt: report.expiresAt.getTime(),
      };
      buckets.set(report.conditionType, bucket);
    }

    bucket.reports.push(report);
    if (report.expiresAt.getTime() > bucket.maxExpiresAt) {
      bucket.maxExpiresAt = report.expiresAt.getTime();
    }
    if (!bucket.uniqueUsers.has(report.userId)) {
      bucket.uniqueUsers.add(report.userId);
      bucket.totalWeight += report.weightScore;
    }
  }

  // Pilih kondisi dengan totalWeight tertinggi (tie-breaker: laporan paling baru)
  let winningCondition: ReportCondition | null = null;
  let winningBucket:
    | {
        totalWeight: number;
        uniqueUsers: Set<string>;
        reports: ActiveReportInput[];
        latestCreatedAt: number;
        maxExpiresAt: number;
      }
    | undefined;

  for (const [condition, bucket] of buckets.entries()) {
    if (
      !winningBucket ||
      bucket.totalWeight > winningBucket.totalWeight ||
      (bucket.totalWeight === winningBucket.totalWeight &&
        bucket.latestCreatedAt > winningBucket.latestCreatedAt)
    ) {
      winningCondition = condition;
      winningBucket = bucket;
    }
  }

  if (!winningCondition || !winningBucket) {
    return {
      currentStatus: SummaryStatus.UNKNOWN,
      blankoStatus: null,
      queueEstimate: null,
      officerStatus: null,
      networkStatus: null,
      confirmationCount: 0,
      expiresAt: null,
      winningCondition: null,
      isConfirmed: false,
      confirmedReportIds: [],
    };
  }

  const isConfirmed =
    winningBucket.totalWeight >= CONFIRMATION_WEIGHT_THRESHOLD;

  // Sub-status agregat dari kondisi-kondisi spesifik yang juga memenuhi threshold (atau minimal dilaporkan)
  const hasBlankoHabis =
    (buckets.get(ReportCondition.BLANKO_HABIS)?.totalWeight ?? 0) >=
    CONFIRMATION_WEIGHT_THRESHOLD;
  const hasOffline =
    (buckets.get(ReportCondition.SISTEM_OFFLINE)?.totalWeight ?? 0) >=
    CONFIRMATION_WEIGHT_THRESHOLD;
  const hasNoOfficer =
    (buckets.get(ReportCondition.PETUGAS_TIDAK_ADA)?.totalWeight ?? 0) >=
    CONFIRMATION_WEIGHT_THRESHOLD;

  let currentStatus = SummaryStatus.UNKNOWN;
  let blankoStatus: BlankoState | null = null;
  let officerStatus: OfficerState | null = null;
  let networkStatus: NetworkState | null = null;
  let queueEstimate: QueueBucket | null = null;

  // Ambil estimasi antrean terbaru dari laporan yang menyertakan queueRange
  const latestWithQueue = sortedDesc.find((r) => r.queueRange != null);
  if (latestWithQueue?.queueRange) {
    queueEstimate = latestWithQueue.queueRange;
  }

  if (isConfirmed) {
    switch (winningCondition) {
      case ReportCondition.BUKA:
        currentStatus = SummaryStatus.BUKA;
        officerStatus = OfficerState.DI_LOKET;
        networkStatus = NetworkState.NORMAL;
        blankoStatus = hasBlankoHabis ? BlankoState.HABIS : BlankoState.ADA;
        break;
      case ReportCondition.ANTRE:
        currentStatus = SummaryStatus.ANTRE;
        officerStatus = OfficerState.DI_LOKET;
        networkStatus = NetworkState.NORMAL;
        blankoStatus = hasBlankoHabis ? BlankoState.HABIS : BlankoState.ADA;
        break;
      case ReportCondition.TUTUP:
        currentStatus = SummaryStatus.TUTUP;
        queueEstimate = null;
        break;
      case ReportCondition.BLANKO_HABIS:
        currentStatus = SummaryStatus.HABIS;
        blankoStatus = BlankoState.HABIS;
        break;
      case ReportCondition.SISTEM_OFFLINE:
        currentStatus = SummaryStatus.TUTUP;
        networkStatus = NetworkState.OFFLINE;
        break;
      case ReportCondition.PETUGAS_TIDAK_ADA:
        currentStatus = SummaryStatus.TUTUP;
        officerStatus = OfficerState.TIDAK_ADA;
        break;
    }

    if (hasOffline) networkStatus = NetworkState.OFFLINE;
    if (hasNoOfficer) officerStatus = OfficerState.TIDAK_ADA;
    if (hasBlankoHabis) blankoStatus = BlankoState.HABIS;
  }

  const confirmedReportIds: string[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.totalWeight >= CONFIRMATION_WEIGHT_THRESHOLD) {
      for (const r of bucket.reports) {
        confirmedReportIds.push(r.id);
      }
    }
  }

  return {
    currentStatus,
    blankoStatus,
    queueEstimate,
    officerStatus,
    networkStatus,
    confirmationCount: winningBucket.uniqueUsers.size,
    expiresAt: isConfirmed ? new Date(winningBucket.maxExpiresAt) : null,
    winningCondition,
    isConfirmed,
    confirmedReportIds,
  };
}
