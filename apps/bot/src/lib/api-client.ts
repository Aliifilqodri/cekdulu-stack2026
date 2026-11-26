import {
  ChannelSource,
  LocationCategory,
  QueueBucket,
  ReportCondition,
  SummaryStatus,
  UserRole,
} from "@cekdulu/shared";
import { env } from "../config/env";

export interface BotUserIdentity {
  id: string;
  phoneNumber: string;
  fullName: string | null;
  role: UserRole;
  rtOfficialAssignments: Array<{
    id: string;
    rtRwCode: string;
    locationId: string;
    locationName: string;
  }>;
}

export interface ApiLocationListItem {
  id: string;
  name: string;
  category: LocationCategory;
  categoryLabel: string;
  address: string | null;
  distanceKm: number | null;
  headline: string;
  metaText: string;
  summary: {
    currentStatus: SummaryStatus;
    statusLabel: string;
    blankoStatus: "ada" | "habis" | null;
    queueEstimate: QueueBucket | null;
    officerStatus: "di_loket" | "tidak_ada" | null;
    networkStatus: "normal" | "offline" | null;
    confirmationCount: number;
    lastUpdatedAt: string;
  };
}

export interface ApiLocationDetail extends ApiLocationListItem {
  openTime: string | null;
  closeTime: string | null;
  operationalDays: string | null;
  schedules: Array<{
    id: string;
    scheduleDate: string;
    startTime: string;
    endTime: string;
    isAvailable: boolean;
  }>;
  requirements: Array<{
    id: string;
    serviceName: string;
    checklistItems: Array<string | { label: string; required?: boolean }>;
  }>;
}

export interface ApiQuestionItem {
  id: string;
  locationId: string;
  questionText: string;
  isAnswered: boolean;
  askedBy: { id: string; name: string };
}

export interface CekduluApiClient {
  identifyUser(phoneNumber: string): Promise<BotUserIdentity>;
  searchLocations(
    phoneNumber: string,
    params: { q?: string; lat?: number; lng?: number; radius?: number },
  ): Promise<ApiLocationListItem[]>;
  getLocationDetail(
    phoneNumber: string,
    locationId: string,
  ): Promise<ApiLocationDetail>;
  submitReport(
    phoneNumber: string,
    body: {
      locationId: string;
      conditionType: ReportCondition;
      queueRange?: QueueBucket | null;
      notes?: string | null;
    },
  ): Promise<{
    report: { id: string; validationStatus: string; weightScore: number };
    locationSummary: { statusLabel: string; confirmationCount: number };
  }>;
  createRtSchedule(
    phoneNumber: string,
    body: {
      locationId: string;
      startTime: string;
      endTime: string;
      isAvailable: boolean;
    },
  ): Promise<{
    id: string;
    scheduleDate: string;
    startTime: string;
    endTime: string;
    isAvailable: boolean;
  }>;
  getUnansweredQuestions(
    phoneNumber: string,
    locationId: string,
  ): Promise<ApiQuestionItem[]>;
  answerQuestion(
    phoneNumber: string,
    questionId: string,
    answerText: string,
  ): Promise<{ id: string; isOfficialRt: boolean }>;
}

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class HttpCekduluApiClient implements CekduluApiClient {
  constructor(
    private readonly baseUrl = env.API_BASE_URL,
    private readonly botApiKey = env.BOT_API_KEY,
  ) {}

  private async request<T>(
    phoneNumber: string,
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const headers = new Headers(options.headers);
    headers.set("x-bot-api-key", this.botApiKey);
    headers.set("x-user-phone", phoneNumber);
    if (options.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const res = await fetch(`${this.baseUrl}/api/v1${path}`, {
      ...options,
      headers,
    });

    const json = (await res.json().catch(() => null)) as
      | { success: true; data: T }
      | { success: false; error?: { code?: string; message?: string } }
      | null;

    if (!res.ok || !json || !json.success) {
      const code =
        json && !json.success && json.error?.code ? json.error.code : "API_ERR";
      const message =
        json && !json.success && json.error?.message
          ? json.error.message
          : `Backend error (${res.status})`;
      throw new ApiClientError(res.status, code, message);
    }

    return json.data;
  }

  identifyUser(phoneNumber: string): Promise<BotUserIdentity> {
    return this.request<BotUserIdentity>(phoneNumber, "/auth/me");
  }

  searchLocations(
    phoneNumber: string,
    params: { q?: string; lat?: number; lng?: number; radius?: number },
  ): Promise<ApiLocationListItem[]> {
    const qs = new URLSearchParams({ source_channel: ChannelSource.WA_BOT });
    if (params.q?.trim()) qs.set("q", params.q.trim());
    if (params.lat !== undefined && params.lng !== undefined) {
      qs.set("lat", String(params.lat));
      qs.set("lng", String(params.lng));
      qs.set("radius", String(params.radius ?? 5));
    }
    return this.request<ApiLocationListItem[]>(
      phoneNumber,
      `/locations?${qs.toString()}`,
    );
  }

  getLocationDetail(
    phoneNumber: string,
    locationId: string,
  ): Promise<ApiLocationDetail> {
    return this.request<ApiLocationDetail>(
      phoneNumber,
      `/locations/${encodeURIComponent(locationId)}?source_channel=${ChannelSource.WA_BOT}`,
    );
  }

  submitReport(
    phoneNumber: string,
    body: {
      locationId: string;
      conditionType: ReportCondition;
      queueRange?: QueueBucket | null;
      notes?: string | null;
    },
  ) {
    return this.request<{
      report: { id: string; validationStatus: string; weightScore: number };
      locationSummary: { statusLabel: string; confirmationCount: number };
    }>(phoneNumber, "/reports", {
      method: "POST",
      body: JSON.stringify({
        ...body,
        source_channel: ChannelSource.WA_BOT,
      }),
    });
  }

  createRtSchedule(
    phoneNumber: string,
    body: {
      locationId: string;
      startTime: string;
      endTime: string;
      isAvailable: boolean;
    },
  ) {
    return this.request<{
      id: string;
      scheduleDate: string;
      startTime: string;
      endTime: string;
      isAvailable: boolean;
    }>(phoneNumber, "/schedules", {
      method: "POST",
      body: JSON.stringify({
        ...body,
        source_channel: ChannelSource.WA_BOT,
      }),
    });
  }

  getUnansweredQuestions(
    phoneNumber: string,
    locationId: string,
  ): Promise<ApiQuestionItem[]> {
    return this.request<ApiQuestionItem[]>(
      phoneNumber,
      `/questions?locationId=${encodeURIComponent(locationId)}&unansweredOnly=true`,
    );
  }

  answerQuestion(
    phoneNumber: string,
    questionId: string,
    answerText: string,
  ) {
    return this.request<{ id: string; isOfficialRt: boolean }>(
      phoneNumber,
      `/questions/${encodeURIComponent(questionId)}/answers`,
      {
        method: "POST",
        body: JSON.stringify({
          answerText,
          source_channel: ChannelSource.WA_BOT,
        }),
      },
    );
  }
}
