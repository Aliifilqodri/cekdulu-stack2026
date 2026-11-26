import { env } from "../config/env";
import { getRedis, REDIS_KEYS } from "./redis";

export interface OutboundWhatsAppMessage {
  toPhoneNumber: string;
  text: string;
  category: "otp" | "notification";
}

/**
 * Mengirim pesan WhatsApp melalui:
 * 1. Redis Pub/Sub `cekdulu:wa:outbox` (agar service `apps/bot` bisa meneruskan pesan)
 * 2. Meta WhatsApp Cloud API jika `WA_PHONE_NUMBER_ID` & `WA_ACCESS_TOKEN` diisi
 * 3. Log konsol di mode development untuk kemudahan demo/testing
 */
export async function dispatchWhatsAppMessage(
  msg: OutboundWhatsAppMessage,
): Promise<boolean> {
  let delivered = false;

  const redis = getRedis();
  if (redis) {
    await redis
      .publish(REDIS_KEYS.waOutboxChannel, JSON.stringify(msg))
      .catch(() => undefined);
  }

  if (env.WA_PHONE_NUMBER_ID && env.WA_ACCESS_TOKEN) {
    try {
      const res = await fetch(
        `https://graph.facebook.com/v20.0/${env.WA_PHONE_NUMBER_ID}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.WA_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: msg.toPhoneNumber,
            type: "text",
            text: { body: msg.text },
          }),
        },
      );
      delivered = res.ok;
    } catch (err) {
      console.warn("[whatsapp] Gagal mengirim via Cloud API:", err);
    }
  } else if (env.NODE_ENV !== "production") {
    console.log(
      `[whatsapp:dev] -> ${msg.toPhoneNumber} (${msg.category}): ${msg.text}`,
    );
    delivered = true;
  }

  return delivered;
}
