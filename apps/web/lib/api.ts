import { io, type Socket } from "socket.io-client";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const TOKEN_STORAGE_KEY = "cekdulu_jwt_token";

export type LocationCategory =
  | "kantor_rt"
  | "kelurahan"
  | "puskesmas"
  | "samsat";

export type Kategori = "Kantor RT" | "Kelurahan" | "Puskesmas" | "Samsat";

export type SummaryStatus = "buka" | "antre" | "tutup" | "habis" | "unknown";
export type UiStatus = "open" | "queue" | "closed" | "unknown";

export type BlankoState = "ada" | "habis";
export type OfficerState = "di_loket" | "tidak_ada";
export type NetworkState = "normal" | "offline";
export type QueueBucket = "< 5" | "5-15" | "15-30" | "> 30";

export type ReportCondition =
  | "buka"
  | "antre"
  | "tutup"
  | "blanko_habis"
  | "sistem_offline"
  | "petugas_tidak_ada";

export type ValidationState = "pending" | "confirmed" | "expired";
export type ChannelSource = "web" | "wa_bot";

export interface LocationSummary {
  locationId: string;
  currentStatus: SummaryStatus;
  statusLabel: string;
  blankoStatus: BlankoState | null;
  queueEstimate: QueueBucket | null;
  officerStatus: OfficerState | null;
  networkStatus: NetworkState | null;
  confirmationCount: number;
  lastUpdatedAt: string;
  expiresAt: string | null;
}

export interface LocationItem {
  id: string;
  name: string;
  category: LocationCategory;
  categoryLabel: Kategori;
  address: string | null;
  latitude: number;
  longitude: number;
  openTime: string | null;
  closeTime: string | null;
  operationalDays: string | null;
  isMobileUnit: boolean;
  distanceKm: number | null;
  headline: string;
  metaText: string;
  summary: LocationSummary;
}

export interface RequirementChecklistItem {
  label: string;
  required?: boolean;
  notes?: string;
}

export interface LocationDetail {
  id: string;
  name: string;
  category: LocationCategory;
  categoryLabel: Kategori;
  address: string | null;
  latitude: number;
  longitude: number;
  openTime: string | null;
  closeTime: string | null;
  operationalDays: string | null;
  isMobileUnit: boolean;
  headline: string;
  metaText: string;
  summary: LocationSummary | null;
  schedules: Array<{
    id: string;
    scheduleDate: string;
    startTime: string;
    endTime: string;
    isAvailable: boolean;
    sourceChannel: ChannelSource;
  }>;
  requirements: Array<{
    id: string;
    serviceName: string;
    checklistItems: Array<RequirementChecklistItem | string>;
    updatedAt: string;
    updatedByName: string | null;
  }>;
  officials: Array<{
    id: string;
    rtRwCode: string;
    userName: string;
  }>;
  activeReports: Array<{
    id: string;
    conditionType: ReportCondition;
    queueRange: QueueBucket | null;
    notes: string | null;
    sourceChannel: ChannelSource;
    validationStatus: ValidationState;
    weightScore: number;
    createdAt: string;
    expiresAt: string;
    reporter: {
      id: string;
      name: string;
      role: string;
      isTrustedReporter: boolean;
    };
  }>;
  questions: Array<{
    id: string;
    questionText: string;
    isAnswered: boolean;
    createdAt: string;
    askedBy: string;
    answers: Array<{
      id: string;
      answerText: string;
      isOfficialRt: boolean;
      createdAt: string;
      answeredBy: string;
    }>;
  }>;
}

export interface ReportFeedItem {
  id: string;
  locationId: string;
  locationName: string;
  conditionType: ReportCondition;
  queueRange: QueueBucket | null;
  notes: string | null;
  sourceChannel: ChannelSource;
  validationStatus: ValidationState;
  weightScore: number;
  createdAt: string;
  expiresAt: string;
  reporter: {
    id: string;
    name: string;
    role: string;
    isTrustedReporter: boolean;
  };
}

export interface UserReputation {
  totalReports: number;
  matchedReports: number;
  isTrustedReporter: boolean;
  voteWeight: number;
}

export interface AuthUserProfile {
  id: string;
  phoneNumber: string;
  fullName: string | null;
  role: "warga" | "pengurus_rt" | "admin";
  isVerified: boolean;
  waNotifEnabled: boolean;
  createdAt?: string;
  reputation: UserReputation | null;
  rtOfficialAssignments?: Array<{
    id: string;
    rtRwCode: string;
    locationId: string;
    locationName: string;
  }>;
}

export interface WatchlistItem {
  locationId: string;
  name: string;
  category: LocationCategory;
  categoryLabel: Kategori;
  address: string | null;
  watchedAt: string;
  summary: LocationSummary | null;
}

export interface NotificationItem {
  id: string;
  type: "status_change" | "question_answered" | "report_confirmed" | "badge_earned";
  title: string;
  body: string;
  referenceId: string | null;
  isRead: boolean;
  sentViaWa: boolean;
  createdAt: string;
}

export const CONDITION_OPTIONS: Array<{
  value: ReportCondition;
  label: string;
  supportsQueue: boolean;
}> = [
  { value: "buka", label: "Buka normal", supportsQueue: true },
  { value: "antre", label: "Antre panjang", supportsQueue: true },
  { value: "tutup", label: "Tutup", supportsQueue: false },
  { value: "blanko_habis", label: "Blanko habis", supportsQueue: false },
  { value: "sistem_offline", label: "Sistem offline", supportsQueue: false },
  { value: "petugas_tidak_ada", label: "Petugas nggak ada", supportsQueue: false },
];

export const QUEUE_OPTIONS: QueueBucket[] = ["< 5", "5-15", "15-30", "> 30"];

export const CATEGORY_TO_API: Record<Kategori, LocationCategory> = {
  "Kantor RT": "kantor_rt",
  Kelurahan: "kelurahan",
  Puskesmas: "puskesmas",
  Samsat: "samsat",
};

export function toUiStatus(status?: SummaryStatus | null): UiStatus {
  switch (status) {
    case "buka":
      return "open";
    case "antre":
      return "queue";
    case "tutup":
    case "habis":
      return "closed";
    default:
      return "unknown";
  }
}

export function formatRelativeMinutes(isoDate?: string | null): string {
  if (!isoDate) return "baru saja";
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const mins = Math.max(1, Math.round(diffMs / 60000));
  if (mins < 60) return `${mins} mnt lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.floor(hours / 24)} hari lalu`;
}

export function formatExpiresCountdown(expiresAt?: string | null): string | null {
  if (!expiresAt) return null;
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return "segera berakhir";
  const totalMins = Math.ceil(diffMs / 60000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours > 0) return `hilang dalam ${hours}j ${mins}m`;
  return `hilang dalam ${mins} mnt`;
}

export function maskPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return phone;
  const prefix = digits.startsWith("62")
    ? `+62 ${digits.slice(2, 5)}`
    : digits.slice(0, 4);
  const suffix = digits.slice(-4);
  return `${prefix}-••••-${suffix}`;
}

export function getInitials(name?: string | null, fallback = "WG"): string {
  if (!name?.trim()) return fallback;
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearStoredToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export class ApiRequestError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function apiRequest<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, headers, ...rest } = options;
  const reqHeaders = new Headers(headers);
  if (!reqHeaders.has("Content-Type") && rest.body) {
    reqHeaders.set("Content-Type", "application/json");
  }
  if (token) {
    reqHeaders.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE_URL}/api/v1${path}`, {
    ...rest,
    headers: reqHeaders,
    cache: "no-store",
  });

  const payload = (await res.json().catch(() => null)) as
    | { success: true; data: T }
    | { success: false; error?: { code?: string; message?: string } }
    | null;

  if (!res.ok || !payload || !payload.success) {
    const errCode =
      payload && !payload.success && payload.error?.code
        ? payload.error.code
        : "API_ERROR";
    const errMessage =
      payload && !payload.success && payload.error?.message
        ? payload.error.message
        : `Permintaan gagal (${res.status})`;
    throw new ApiRequestError(res.status, errCode, errMessage);
  }

  return payload.data;
}

export function fetchLocations(params?: {
  category?: LocationCategory;
  status?: SummaryStatus;
  q?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
}): Promise<LocationItem[]> {
  const search = new URLSearchParams();
  if (params?.category) search.set("category", params.category);
  if (params?.status) search.set("status", params.status);
  if (params?.q?.trim()) search.set("q", params.q.trim());
  if (params?.lat !== undefined && params?.lng !== undefined) {
    search.set("lat", String(params.lat));
    search.set("lng", String(params.lng));
  }
  if (params?.radiusKm !== undefined) {
    search.set("radiusKm", String(params.radiusKm));
  }
  const qs = search.toString();
  return apiRequest<LocationItem[]>(`/locations${qs ? `?${qs}` : ""}`);
}

export function fetchLocationDetail(id: string): Promise<LocationDetail> {
  return apiRequest<LocationDetail>(`/locations/${encodeURIComponent(id)}`);
}

export function fetchReports(locationId?: string): Promise<ReportFeedItem[]> {
  const qs = locationId ? `?locationId=${encodeURIComponent(locationId)}` : "";
  return apiRequest<ReportFeedItem[]>(`/reports${qs}`);
}

export function createReport(
  token: string,
  body: {
    locationId: string;
    conditionType: ReportCondition;
    queueRange?: QueueBucket | null;
    notes?: string | null;
  },
): Promise<{ report: { id: string }; locationSummary: LocationSummary }> {
  return apiRequest("/reports", {
    method: "POST",
    token,
    body: JSON.stringify({ ...body, sourceChannel: "web" }),
  });
}

export function createSchedule(
  token: string,
  body: {
    locationId: string;
    scheduleDate?: string;
    startTime: string;
    endTime: string;
    isAvailable?: boolean;
  },
): Promise<{
  id: string;
  locationId: string;
  scheduleDate: string;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}> {
  return apiRequest("/schedules", {
    method: "POST",
    token,
    body: JSON.stringify({ ...body, sourceChannel: "web" }),
  });
}

export function updateSchedule(
  token: string,
  scheduleId: string,
  body: { startTime?: string; endTime?: string; isAvailable?: boolean },
): Promise<{ id: string; isAvailable: boolean }> {
  return apiRequest(`/schedules/${encodeURIComponent(scheduleId)}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(body),
  });
}

export function createRequirement(
  token: string,
  locationId: string,
  body: {
    serviceName: string;
    checklistItems: Array<RequirementChecklistItem | string>;
  },
): Promise<{ id: string; serviceName: string }> {
  return apiRequest(`/locations/${encodeURIComponent(locationId)}/requirements`, {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
}

export function updateRequirement(
  token: string,
  locationId: string,
  reqId: string,
  body: {
    serviceName: string;
    checklistItems: Array<RequirementChecklistItem | string>;
  },
): Promise<{ id: string; serviceName: string }> {
  return apiRequest(
    `/locations/${encodeURIComponent(locationId)}/requirements/${encodeURIComponent(reqId)}`,
    {
      method: "PUT",
      token,
      body: JSON.stringify(body),
    },
  );
}

export function createQuestion(
  token: string,
  body: { locationId: string; questionText: string },
): Promise<{ id: string; questionText: string }> {
  return apiRequest("/questions", {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
}

export function createAnswer(
  token: string,
  questionId: string,
  answerText: string,
): Promise<{ id: string; answerText: string; isOfficialRt: boolean }> {
  return apiRequest(`/questions/${encodeURIComponent(questionId)}/answers`, {
    method: "POST",
    token,
    body: JSON.stringify({ answerText }),
  });
}

export function requestOtp(phoneNumber: string): Promise<{
  phoneNumber: string;
  expiresInSeconds: number;
  devOtp?: string;
}> {
  return apiRequest("/auth/otp/request", {
    method: "POST",
    body: JSON.stringify({ phoneNumber }),
  });
}

export function verifyOtp(
  phoneNumber: string,
  otpCode: string,
  fullName?: string,
): Promise<{ token: string; user: AuthUserProfile }> {
  return apiRequest("/auth/otp/verify", {
    method: "POST",
    body: JSON.stringify({
      phoneNumber,
      otpCode,
      ...(fullName?.trim() ? { fullName: fullName.trim() } : {}),
    }),
  });
}

export function fetchMe(token: string): Promise<AuthUserProfile> {
  return apiRequest<AuthUserProfile>("/auth/me", { token });
}

export function updateMe(
  token: string,
  body: { fullName?: string | null; waNotifEnabled?: boolean },
): Promise<AuthUserProfile> {
  return apiRequest<AuthUserProfile>("/auth/me", {
    method: "PATCH",
    token,
    body: JSON.stringify(body),
  });
}

export function fetchWatchlist(token: string): Promise<WatchlistItem[]> {
  return apiRequest<WatchlistItem[]>("/watchlist", { token });
}

export function watchLocation(
  token: string,
  locationId: string,
): Promise<{ locationId: string }> {
  return apiRequest(`/watchlist/${encodeURIComponent(locationId)}`, {
    method: "POST",
    token,
  });
}

export function unwatchLocation(
  token: string,
  locationId: string,
): Promise<{ unwatchedLocationId: string }> {
  return apiRequest(`/watchlist/${encodeURIComponent(locationId)}`, {
    method: "DELETE",
    token,
  });
}

export function fetchNotifications(token: string): Promise<{
  unreadCount: number;
  items: NotificationItem[];
}> {
  return apiRequest("/notifications", { token });
}

export function markNotificationRead(
  token: string,
  id: string,
): Promise<{ id: string; isRead: boolean }> {
  return apiRequest(`/notifications/${encodeURIComponent(id)}/read`, {
    method: "PATCH",
    token,
  });
}

export function markAllNotificationsRead(
  token: string,
): Promise<{ updatedCount: number }> {
  return apiRequest("/notifications/read-all", {
    method: "POST",
    token,
  });
}

export function createRealtimeSocket(): Socket {
  return io(API_BASE_URL, {
    transports: ["websocket", "polling"],
    autoConnect: true,
  });
}
