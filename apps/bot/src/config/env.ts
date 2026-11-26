import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });
dotenv.config();

export type GatewayMode = "simulation" | "cloud_api" | "multi_device";

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.BOT_PORT || 4001),
  API_BASE_URL: (
    process.env.API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:4000"
  ).replace(/\/+$/, ""),
  BOT_API_KEY: process.env.BOT_API_KEY || "cekdulu-bot-internal-key",
  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
  WA_GATEWAY_MODE: (process.env.WA_GATEWAY_MODE ||
    (process.env.WA_PHONE_NUMBER_ID && process.env.WA_ACCESS_TOKEN
      ? "cloud_api"
      : "simulation")) as GatewayMode,
  WA_DEMO_SESSION_ID: process.env.WA_DEMO_SESSION_ID || "cekdulu-demo-01",
  WA_PHONE_NUMBER_ID: process.env.WA_PHONE_NUMBER_ID || "",
  WA_ACCESS_TOKEN: process.env.WA_ACCESS_TOKEN || "",
  WA_WEBHOOK_VERIFY_TOKEN:
    process.env.WA_WEBHOOK_VERIFY_TOKEN || "cekdulu-wa-verify-token",
  CORS_ORIGIN: process.env.CORS_ORIGIN || "*",
} as const;
