import Redis from "ioredis";
import type { WaGatewayAdapter } from "../adapters/types";
import { env } from "../config/env";

const WA_OUTBOX_CHANNEL = "cekdulu:wa:outbox";

export class OutboxSubscriber {
  private sub: Redis | null = null;

  constructor(
    private readonly gateway: WaGatewayAdapter,
    private readonly redisUrl = env.REDIS_URL,
  ) {}

  async start(): Promise<void> {
    const client = new Redis(this.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      retryStrategy(times) {
        if (times > 5) return null;
        return Math.min(times * 500, 2000);
      },
    });
    this.sub = client;

    client.on("error", () => undefined);

    try {
      await client.connect();
      await client.subscribe(WA_OUTBOX_CHANNEL);
      client.on("message", (_channel, rawPayload) => {
        try {
          const msg = JSON.parse(rawPayload) as {
            toPhoneNumber: string;
            text: string;
          };
          if (msg.toPhoneNumber && msg.text) {
            void this.gateway.sendMessage(msg.toPhoneNumber, msg.text);
          }
        } catch (err) {
          console.warn("[bot:outbox] Payload tidak valid:", err);
        }
      });
      console.log(
        `[bot:outbox] Berlangganan channel Redis ${WA_OUTBOX_CHANNEL}`,
      );
    } catch {
      console.warn(
        `[bot:outbox] Redis tidak tersedia; subscriber outbox tidak aktif.`,
      );
    }
  }

  async stop(): Promise<void> {
    if (this.sub) {
      await this.sub.quit().catch(() => this.sub?.disconnect());
      this.sub = null;
    }
  }
}
