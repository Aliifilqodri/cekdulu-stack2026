import Redis from "ioredis";
import { REPORT_COOLDOWN_SECONDS, REPORT_TTL_SECONDS } from "@cekdulu/shared";
import { env } from "../config/env";

let redisClient: Redis | null = null;
let subscriberClient: Redis | null = null;
let isRedisReady = false;

export const REDIS_KEYS = {
  expiryZSet: "cekdulu:reports:expiry_queue",
  summaryCachePrefix: "location:status:",
  summaryCache: (locationId: string) => `location:status:${locationId}`,
  reportCooldown: (userId: string, locationId: string) =>
    `cekdulu:cooldown:${userId}:${locationId}`,
  otpRateLimit: (phone: string) => `cekdulu:otp_rl:${phone}`,
  waOutboxChannel: "cekdulu:wa:outbox",
};

export function initRedis(): Redis {
  if (redisClient) return redisClient;

  redisClient = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    retryStrategy(times) {
      if (times > 5) {
        return null; // Jangan crash server lokal jika Redis belum nyala
      }
      return Math.min(times * 500, 2000);
    },
  });

  redisClient.on("ready", () => {
    isRedisReady = true;
    console.log("[redis] Terhubung ke Redis");
  });

  redisClient.on("error", (err) => {
    if (isRedisReady) {
      console.warn("[redis] Koneksi terganggu:", err.message);
    }
    isRedisReady = false;
  });

  redisClient.connect().catch((err) => {
    console.warn(
      `[redis] Tidak dapat terhubung (${err.message}). Berjalan dengan fallback PostgreSQL.`,
    );
  });

  return redisClient;
}

export function getRedis(): Redis | null {
  return isRedisReady ? redisClient : null;
}

export async function closeRedis(): Promise<void> {
  if (subscriberClient) {
    await subscriberClient.quit().catch(() => subscriberClient?.disconnect());
    subscriberClient = null;
  }
  if (redisClient) {
    await redisClient.quit().catch(() => redisClient?.disconnect());
    redisClient = null;
    isRedisReady = false;
  }
}

/**
 * Mengaktifkan Redis Keyspace Notifications (`Ex` -> expired events) pada channel `__keyevent@0__:expired`
 * untuk mereset status lokasi menjadi `unknown` tepat saat TTL 7200 detik `location:status:{location_id}` habis.
 */
export async function setupRedisKeyspaceExpiryListener(
  onLocationStatusExpired: (locationId: string) => Promise<void>,
): Promise<void> {
  if (!redisClient || subscriberClient) return;

  const attachListener = async () => {
    if (!redisClient || subscriberClient) return;

    try {
      // Aktifkan keyevent expired notifications (Ex); abaikan error jika managed Redis mengunci CONFIG
      await redisClient
        .config("SET", "notify-keyspace-events", "Ex")
        .catch(() => undefined);

      const sub = redisClient.duplicate();
      subscriberClient = sub;

      sub.on("error", (err) => {
        console.warn("[redis:keyspace] Koneksi subscriber terganggu:", err.message);
      });

      await sub.psubscribe("__keyevent@*__:expired");

      sub.on("pmessage", (_pattern, _channel, expiredKey) => {
        if (expiredKey.startsWith(REDIS_KEYS.summaryCachePrefix)) {
          const locationId = expiredKey.slice(
            REDIS_KEYS.summaryCachePrefix.length,
          );
          if (locationId) {
            void onLocationStatusExpired(locationId);
          }
        }
      });

      console.log(
        "[redis] Listener Keyspace Notifications (__keyevent@*__:expired) aktif",
      );
    } catch (err) {
      console.warn(
        "[redis] Gagal mengaktifkan listener keyspace expired:",
        err instanceof Error ? err.message : err,
      );
    }
  };

  if (isRedisReady) {
    await attachListener();
  } else {
    redisClient.once("ready", () => {
      void attachListener();
    });
  }
}

export async function scheduleReportExpiryInRedis(
  reportId: string,
  locationId: string,
  expiresAt: Date,
): Promise<void> {
  const r = getRedis();
  if (!r) return;
  await r.zadd(
    REDIS_KEYS.expiryZSet,
    expiresAt.getTime(),
    `${reportId}:${locationId}`,
  );
}

export async function setLocationSummaryCache(
  locationId: string,
  payload: unknown,
  ttlSeconds = REPORT_TTL_SECONDS,
): Promise<void> {
  const r = getRedis();
  if (!r) return;
  await r.set(
    REDIS_KEYS.summaryCache(locationId),
    JSON.stringify(payload),
    "EX",
    ttlSeconds,
  );
}

export async function getLocationSummaryCache<T>(
  locationId: string,
): Promise<T | null> {
  const r = getRedis();
  if (!r) return null;
  const raw = await r.get(REDIS_KEYS.summaryCache(locationId));
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function invalidateLocationSummaryCache(
  locationId: string,
): Promise<void> {
  const r = getRedis();
  if (!r) return;
  await r.del(REDIS_KEYS.summaryCache(locationId));
}

export async function checkAndSetReportCooldown(
  userId: string,
  locationId: string,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const r = getRedis();
  if (!r) return { allowed: true, retryAfterSeconds: 0 };

  const key = REDIS_KEYS.reportCooldown(userId, locationId);
  const ttl = await r.ttl(key);
  if (ttl > 0) {
    return { allowed: false, retryAfterSeconds: ttl };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export async function markReportCooldown(
  userId: string,
  locationId: string,
): Promise<void> {
  const r = getRedis();
  if (!r) return;
  await r.set(
    REDIS_KEYS.reportCooldown(userId, locationId),
    "1",
    "EX",
    REPORT_COOLDOWN_SECONDS,
  );
}
