import "reflect-metadata";
import http from "node:http";
import { closeDb, initDb } from "@cekdulu/db";
import { createApp } from "./app";
import { env } from "./config/env";
import { closeRedis, initRedis } from "./lib/redis";
import { initSocket } from "./lib/socket";
import { startExpiryWorker, stopExpiryWorker } from "./services/expiry.worker";

async function bootstrap() {
  await initDb();
  console.log("[db] Terhubung ke PostgreSQL via MikroORM");

  initRedis();

  const app = createApp();
  const server = http.createServer(app);

  initSocket(server);
  startExpiryWorker();

  server.listen(env.PORT, () => {
    console.log(
      `[api] Server Express + Socket.io berjalan di http://localhost:${env.PORT}`,
    );
  });

  const shutdown = async (signal: string) => {
    console.log(`\n[api] Menerima sinyal ${signal}, menutup koneksi...`);
    stopExpiryWorker();
    server.close();
    await Promise.allSettled([closeRedis(), closeDb()]);
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

bootstrap().catch((err) => {
  console.error("[api] Gagal menjalankan server:", err);
  process.exit(1);
});
