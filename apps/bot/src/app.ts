import express, { Express } from "express";
import cors from "cors";
import { z } from "zod";
import { MultiDeviceGatewayAdapter } from "./adapters/gateway";
import type { WaGatewayAdapter } from "./adapters/types";
import { env } from "./config/env";
import type { SessionStore } from "./lib/session";
import { BotConversationEngine } from "./services/conversation.engine";

const simulateMessageSchema = z.object({
  fromPhone: z.string().min(9).max(20),
  text: z.string().optional(),
  location: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      name: z.string().optional(),
    })
    .optional(),
  sessionId: z.string().optional(),
});

export function createBotApp(deps: {
  engine: BotConversationEngine;
  gateway: WaGatewayAdapter;
  sessionStore: SessionStore;
}): Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({
      success: true,
      data: {
        service: "cekdulu-bot",
        apiBaseUrl: env.API_BASE_URL,
        gateway: deps.gateway.getStatus(),
        timestamp: new Date().toISOString(),
      },
    });
  });

  app.get("/sessions/wa", (_req, res) => {
    res.json({
      success: true,
      data: deps.gateway.getStatus(),
    });
  });

  app.post("/sessions/wa/pair", (req, res) => {
    if (!(deps.gateway instanceof MultiDeviceGatewayAdapter)) {
      res.status(400).json({
        success: false,
        error: {
          code: "UNSUPPORTED_MODE",
          message: "Pairing device hanya tersedia di mode WA_GATEWAY_MODE=multi_device",
        },
      });
      return;
    }
    const phone = String(req.body?.phoneNumber || "").trim();
    if (!phone) {
      res.status(400).json({
        success: false,
        error: { code: "INVALID_PHONE", message: "phoneNumber wajib diisi" },
      });
      return;
    }
    deps.gateway.pairDemoDevice(phone);
    res.json({ success: true, data: deps.gateway.getStatus() });
  });

  /**
   * Endpoint Simulasi / Testing untuk demo juri atau curl/Postman
   */
  app.post("/webhook/simulate", async (req, res) => {
    const parsed = simulateMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Payload simulasi tidak valid",
          details: parsed.error.flatten().fieldErrors,
        },
      });
      return;
    }

    const result = await deps.engine.handleIncomingMessage(parsed.data);
    res.json({
      success: true,
      data: {
        phoneNumber: result.phoneNumber,
        replies: result.replies,
        reply: result.replies.join("\n\n"),
        sessionStep: result.session?.step ?? "IDLE",
      },
    });
  });

  /**
   * Webhook Verifikasi Meta WhatsApp Cloud API
   */
  app.get("/webhook/whatsapp", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === env.WA_WEBHOOK_VERIFY_TOKEN) {
      res.status(200).send(String(challenge || ""));
      return;
    }
    res.sendStatus(403);
  });

  /**
   * Webhook Incoming Message dari Meta WhatsApp Cloud API maupun Multi-Device Bridge
   */
  app.post("/webhook/whatsapp", async (req, res) => {
    try {
      // 1. Format Meta Cloud API
      const entry = req.body?.entry?.[0];
      const change = entry?.changes?.[0]?.value;
      const waMsg = change?.messages?.[0];

      if (waMsg && waMsg.from) {
        const text =
          waMsg.text?.body ??
          waMsg.interactive?.button_reply?.title ??
          waMsg.interactive?.list_reply?.title;
        const loc = waMsg.location
          ? {
              latitude: Number(waMsg.location.latitude),
              longitude: Number(waMsg.location.longitude),
              name: waMsg.location.name,
            }
          : undefined;

        await deps.engine.handleIncomingMessage({
          fromPhone: String(waMsg.from),
          text,
          location: loc,
        });

        res.sendStatus(200);
        return;
      }

      // 2. Format Bridge Multi-Device sederhana ({ fromPhone, text, location })
      if (req.body?.fromPhone) {
        const result = await deps.engine.handleIncomingMessage(req.body);
        res.status(200).json({ success: true, data: result });
        return;
      }

      res.sendStatus(200);
    } catch (err) {
      console.error("[bot:webhook] Gagal memproses webhook:", err);
      res.sendStatus(500);
    }
  });

  return app;
}
