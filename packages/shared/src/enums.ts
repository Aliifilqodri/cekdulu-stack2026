export enum UserRole {
  WARGA = "warga",
  PENGURUS_RT = "pengurus_rt",
  ADMIN = "admin",
}

export enum LocationCategory {
  KANTOR_RT = "kantor_rt",
  KELURAHAN = "kelurahan",
  PUSKESMAS = "puskesmas",
  SAMSAT = "samsat",
}

export enum SummaryStatus {
  BUKA = "buka",
  ANTRE = "antre",
  TUTUP = "tutup",
  HABIS = "habis",
  UNKNOWN = "unknown",
}

export enum BlankoState {
  ADA = "ada",
  HABIS = "habis",
}

export enum OfficerState {
  DI_LOKET = "di_loket",
  TIDAK_ADA = "tidak_ada",
}

export enum NetworkState {
  NORMAL = "normal",
  OFFLINE = "offline",
}

export enum QueueBucket {
  LT_5 = "< 5",
  B_5_15 = "5-15",
  B_15_30 = "15-30",
  GT_30 = "> 30",
}

export enum ReportCondition {
  BUKA = "buka",
  ANTRE = "antre",
  TUTUP = "tutup",
  BLANKO_HABIS = "blanko_habis",
  SISTEM_OFFLINE = "sistem_offline",
  PETUGAS_TIDAK_ADA = "petugas_tidak_ada",
}

export enum ValidationState {
  PENDING = "pending",
  CONFIRMED = "confirmed",
  EXPIRED = "expired",
}

export enum ChannelSource {
  WEB = "web",
  WA_BOT = "wa_bot",
}

export enum NotifType {
  STATUS_CHANGE = "status_change",
  QUESTION_ANSWERED = "question_answered",
  REPORT_CONFIRMED = "report_confirmed",
  BADGE_EARNED = "badge_earned",
}

export const CATEGORY_LABELS: Record<LocationCategory, string> = {
  [LocationCategory.KANTOR_RT]: "Kantor RT",
  [LocationCategory.KELURAHAN]: "Kelurahan",
  [LocationCategory.PUSKESMAS]: "Puskesmas",
  [LocationCategory.SAMSAT]: "Samsat",
};

export const SUMMARY_STATUS_LABELS: Record<SummaryStatus, string> = {
  [SummaryStatus.BUKA]: "Buka",
  [SummaryStatus.ANTRE]: "Antre",
  [SummaryStatus.TUTUP]: "Tutup",
  [SummaryStatus.HABIS]: "Blanko Habis",
  [SummaryStatus.UNKNOWN]: "Belum Dicek",
};

export const CONDITION_LABELS: Record<ReportCondition, string> = {
  [ReportCondition.BUKA]: "Layanan Buka & Lancar",
  [ReportCondition.ANTRE]: "Sedang Antre",
  [ReportCondition.TUTUP]: "Layanan Tutup",
  [ReportCondition.BLANKO_HABIS]: "Blanko Habis",
  [ReportCondition.SISTEM_OFFLINE]: "Sistem / Jaringan Offline",
  [ReportCondition.PETUGAS_TIDAK_ADA]: "Petugas Tidak di Loket",
};
