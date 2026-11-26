import fs from "node:fs";
import path from "node:path";
import { env, type GatewayMode } from "../config/env";
import type {
  OutboundWaRecord,
  WaGatewayAdapter,
  WaGatewayStatus,
} from "./types";

/**
 * Adapter Simulasi & Webhook Testing:
 * Menyimpan riwayat pesan keluar di memori agar juri/tester dapat langsung melihat balasan bot
 * lewat HTTP `/webhook/simulate` maupun terminal CLI tanpa scan QR fisik.
 */
export class SimulationGatewayAdapter implements WaGatewayAdapter {
  public readonly mode: GatewayMode = "simulation";
  public readonly outbox: OutboundWaRecord[] = [];

  constructor(public readonly sessionId = env.WA_DEMO_SESSION_ID) {}

  async start(): Promise<void> {
    console.log(
      `[bot:gateway] Mode simulasi aktif (session: ${this.sessionId})`,
    );
  }

  async stop(): Promise<void> {}

  getStatus(): WaGatewayStatus {
    return {
      mode: this.mode,
      sessionId: this.sessionId,
      connected: true,
      notes: "Siap menerima simulasi pesan lewat POST /webhook/simulate & CLI",
    };
  }

  async sendMessage(toPhone: string, text: string): Promise<OutboundWaRecord> {
    const record: OutboundWaRecord = {
      toPhone,
      text,
      sessionId: this.sessionId,
      sentAt: new Date().toISOString(),
      deliveredVia: this.mode,
    };
    this.outbox.push(record);
    if (this.outbox.length > 200) {
      this.outbox.shift();
    }
    console.log(`[bot:sim -> ${toPhone}]\n${text}\n---`);
    return record;
  }
}

/**
 * Adapter Meta WhatsApp Cloud API resmi (`WA_PHONE_NUMBER_ID` & `WA_ACCESS_TOKEN`).
 */
export class CloudApiGatewayAdapter implements WaGatewayAdapter {
  public readonly mode: GatewayMode = "cloud_api";

  constructor(
    public readonly sessionId = env.WA_DEMO_SESSION_ID,
    private readonly phoneNumberId = env.WA_PHONE_NUMBER_ID,
    private readonly accessToken = env.WA_ACCESS_TOKEN,
  ) {}

  async start(): Promise<void> {
    console.log(
      `[bot:gateway] Mode WhatsApp Cloud API aktif (phoneNumberId: ${this.phoneNumberId || "unset"})`,
    );
  }

  async stop(): Promise<void> {}

  getStatus(): WaGatewayStatus {
    return {
      mode: this.mode,
      sessionId: this.sessionId,
      connected: Boolean(this.phoneNumberId && this.accessToken),
      notes: "Terhubung ke Meta Graph API v20.0",
    };
  }

  async sendMessage(toPhone: string, text: string): Promise<OutboundWaRecord> {
    if (this.phoneNumberId && this.accessToken) {
      const res = await fetch(
        `https://graph.facebook.com/v20.0/${this.phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: toPhone,
            type: "text",
            text: { body: text },
          }),
        },
      );
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        console.warn(`[bot:cloud_api] Gagal kirim (${res.status}): ${errBody}`);
      }
    } else {
      console.log(`[bot:cloud_api:dry-run -> ${toPhone}]\n${text}`);
    }

    return {
      toPhone,
      text,
      sessionId: this.sessionId,
      sentAt: new Date().toISOString(),
      deliveredVia: this.mode,
    };
  }
}

/**
 * Adapter Multi-Device Session untuk nomor demo kompetisi:
 * Mengelola direktori auth state per `sessionId` (mis. `cekdulu-demo-01`) sehingga beberapa nomor
 * demo dapat dipasangkan melalui bridge multi-device / QR pairing.
 */
export class MultiDeviceGatewayAdapter implements WaGatewayAdapter {
  public readonly mode: GatewayMode = "multi_device";
  private readonly sessionDir: string;
  private pairedPhone: string | null = null;
  private webhookRelayUrl = process.env.WA_MD_RELAY_URL || "";

  constructor(
    public readonly sessionId = env.WA_DEMO_SESSION_ID,
    baseDir = path.resolve(process.cwd(), "sessions"),
  ) {
    this.sessionDir = path.join(baseDir, sessionId);
  }

  async start(): Promise<void> {
    fs.mkdirSync(this.sessionDir, { recursive: true });
    const metaPath = path.join(this.sessionDir, "session.json");
    if (fs.existsSync(metaPath)) {
      const parsed = JSON.parse(fs.readFileSync(metaPath, "utf8")) as {
        pairedPhone?: string;
      };
      this.pairedPhone = parsed.pairedPhone ?? null;
    } else {
      fs.writeFileSync(
        metaPath,
        JSON.stringify(
          {
            sessionId: this.sessionId,
            createdAt: new Date().toISOString(),
            pairedPhone: null,
          },
          null,
          2,
        ),
      );
    }
    console.log(
      `[bot:gateway] Multi-device session siap di ${this.sessionDir}`,
    );
  }

  async stop(): Promise<void> {}

  pairDemoDevice(phoneNumber: string): void {
    this.pairedPhone = phoneNumber;
    const metaPath = path.join(this.sessionDir, "session.json");
    fs.writeFileSync(
      metaPath,
      JSON.stringify(
        {
          sessionId: this.sessionId,
          updatedAt: new Date().toISOString(),
          pairedPhone: phoneNumber,
        },
        null,
        2,
      ),
    );
  }

  getStatus(): WaGatewayStatus {
    return {
      mode: this.mode,
      sessionId: this.sessionId,
      connected: true,
      pairedPhone: this.pairedPhone,
      notes: `Multi-device session store: ${this.sessionDir}`,
    };
  }

  async sendMessage(toPhone: string, text: string): Promise<OutboundWaRecord> {
    if (this.webhookRelayUrl) {
      await fetch(this.webhookRelayUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: this.sessionId,
          to: toPhone,
          text,
        }),
      }).catch((err) => {
        console.warn("[bot:multi_device] Gagal kirim ke relay:", err);
      });
    } else {
      console.log(
        `[bot:md(${this.sessionId}) -> ${toPhone}]\n${text}\n---`,
      );
    }

    return {
      toPhone,
      text,
      sessionId: this.sessionId,
      sentAt: new Date().toISOString(),
      deliveredVia: this.mode,
    };
  }
}

export function createGatewayAdapter(
  mode: GatewayMode = env.WA_GATEWAY_MODE,
  sessionId = env.WA_DEMO_SESSION_ID,
): WaGatewayAdapter {
  switch (mode) {
    case "cloud_api":
      return new CloudApiGatewayAdapter(sessionId);
    case "multi_device":
      return new MultiDeviceGatewayAdapter(sessionId);
    default:
      return new SimulationGatewayAdapter(sessionId);
  }
}
