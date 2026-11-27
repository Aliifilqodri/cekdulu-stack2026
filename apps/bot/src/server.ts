import { createGatewayAdapter } from "./adapters/gateway";
import { createBotApp } from "./app";
import { env } from "./config/env";
import { HttpCekduluApiClient } from "./lib/api-client";
import { RedisSessionStore } from "./lib/session";
import { BotConversationEngine } from "./services/conversation.engine";
import { OutboxSubscriber } from "./services/outbox.subscriber";

async function bootstrap() {
  const sessionStore = new RedisSessionStore(env.REDIS_URL);
  await sessionStore.connect();

  const gateway = createGatewayAdapter(
    env.WA_GATEWAY_MODE,
    env.WA_DEMO_SESSION_ID,
  );
  await gateway.start();

  const apiClient = new HttpCekduluApiClient(env.API_BASE_URL, env.BOT_API_KEY);
  const engine = new BotConversationEngine(sessionStore, apiClient, gateway);
  gateway.setIncomingHandler?.((msg) => engine.handleIncomingMessage(msg));

  const outboxSubscriber = new OutboxSubscriber(gateway, env.REDIS_URL);
  await outboxSubscriber.start();

  const app = createBotApp({ engine, gateway, sessionStore });
  const server = app.listen(env.PORT, () => {
    console.log(
      `[bot] WhatsApp Bot Gateway berjalan di http://localhost:${env.PORT} (mode: ${gateway.mode})`,
    );
  });

  const shutdown = async (signal: string) => {
    console.log(`\n[bot] Menerima sinyal ${signal}, menutup koneksi...`);
    server.close();
    await Promise.allSettled([
      outboxSubscriber.stop(),
      gateway.stop(),
      sessionStore.close(),
    ]);
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

bootstrap().catch((err) => {
  console.error("[bot] Gagal menjalankan WhatsApp Bot Gateway:", err);
  process.exit(1);
});
