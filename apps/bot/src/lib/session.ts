import Redis from "ioredis";
import type { QueueBucket, ReportCondition } from "@cekdulu/shared";
import { env } from "../config/env";

export const BOT_SESSION_TTL_SECONDS = 15 * 60; // 15 menit (900 detik)

export type ConversationStep =
  | "IDLE"
  | "CEK_PICK_LOCATION"
  | "LAPOR_FIND_LOCATION"
  | "LAPOR_PICK_LOCATION"
  | "LAPOR_PICK_CONDITION"
  | "LAPOR_PICK_QUEUE"
  | "LAPOR_NOTES"
  | "RT_PICK_LOCATION"
  | "RT_MENU"
  | "RT_INPUT_SLOT"
  | "RT_PICK_QUESTION"
  | "RT_ANSWER_TEXT";

export interface SessionLocationCandidate {
  id: string;
  name: string;
  categoryLabel: string;
  distanceKm?: number | null;
}

export interface SessionQuestionCandidate {
  id: string;
  questionText: string;
  askedBy: string;
}

export interface BotSessionState {
  step: ConversationStep;
  updatedAt: number;
  locationCandidates?: SessionLocationCandidate[];
  selectedLocation?: SessionLocationCandidate;
  reportCondition?: ReportCondition;
  reportQueue?: QueueBucket | null;
  rtAssignments?: Array<{
    locationId: string;
    locationName: string;
    rtRwCode: string;
  }>;
  rtQuestions?: SessionQuestionCandidate[];
  selectedQuestion?: SessionQuestionCandidate;
}

export interface SessionStore {
  get(phoneNumber: string): Promise<BotSessionState | null>;
  set(
    phoneNumber: string,
    state: BotSessionState,
    ttlSeconds?: number,
  ): Promise<void>;
  clear(phoneNumber: string): Promise<void>;
}

export class InMemorySessionStore implements SessionStore {
  private readonly store = new Map<
    string,
    { state: BotSessionState; expiresAt: number }
  >();

  async get(phoneNumber: string): Promise<BotSessionState | null> {
    const entry = this.store.get(phoneNumber);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(phoneNumber);
      return null;
    }
    return entry.state;
  }

  async set(
    phoneNumber: string,
    state: BotSessionState,
    ttlSeconds = BOT_SESSION_TTL_SECONDS,
  ): Promise<void> {
    this.store.set(phoneNumber, {
      state,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async clear(phoneNumber: string): Promise<void> {
    this.store.delete(phoneNumber);
  }
}

export class RedisSessionStore implements SessionStore {
  private readonly fallback = new InMemorySessionStore();
  private ready = false;
  public readonly client: Redis;

  constructor(redisUrl = env.REDIS_URL) {
    this.client = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      retryStrategy(times) {
        if (times > 5) return null;
        return Math.min(times * 500, 2000);
      },
    });

    this.client.on("ready", () => {
      this.ready = true;
      console.log("[bot:redis] Terhubung ke Redis untuk session TTL 15 menit");
    });

    this.client.on("error", () => {
      this.ready = false;
    });
  }

  async connect(): Promise<void> {
    await this.client.connect().catch((err) => {
      console.warn(
        `[bot:redis] Tidak terhubung (${err.message}), menggunakan InMemory fallback.`,
      );
    });
  }

  async close(): Promise<void> {
    await this.client.quit().catch(() => this.client.disconnect());
    this.ready = false;
  }

  private key(phoneNumber: string): string {
    return `bot:session:${phoneNumber}`;
  }

  async get(phoneNumber: string): Promise<BotSessionState | null> {
    if (!this.ready) {
      return this.fallback.get(phoneNumber);
    }
    const raw = await this.client.get(this.key(phoneNumber));
    if (!raw) return null;
    return JSON.parse(raw) as BotSessionState;
  }

  async set(
    phoneNumber: string,
    state: BotSessionState,
    ttlSeconds = BOT_SESSION_TTL_SECONDS,
  ): Promise<void> {
    if (!this.ready) {
      await this.fallback.set(phoneNumber, state, ttlSeconds);
      return;
    }
    await this.client.set(
      this.key(phoneNumber),
      JSON.stringify(state),
      "EX",
      ttlSeconds,
    );
  }

  async clear(phoneNumber: string): Promise<void> {
    if (!this.ready) {
      await this.fallback.clear(phoneNumber);
      return;
    }
    await this.client.del(this.key(phoneNumber));
  }
}
