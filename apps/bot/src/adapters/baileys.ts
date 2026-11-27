import path from "node:path";
import { env, type GatewayMode } from "../config/env";
import type {
  IncomingWaMessage,
  OutboundWaRecord,
  WaGatewayAdapter,
  WaGatewayStatus,
} from "./types";

type IncomingHandler = (msg: IncomingWaMessage) => Promise<unknown>;

const esmImport = new Function("m", "return import(m)") as (
  m: string,
) => Promise<any>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Nyambung ke WhatsApp beneran lewat Baileys (scan QR pakai nomor demo).
 * Cocok buat demo lomba. Buat produksi tetap pakai Cloud API resmi.
 */
export class BaileysGatewayAdapter implements WaGatewayAdapter {
  public readonly mode: GatewayMode = "baileys";
  private sock: any = null;
  private connected = false;
  private pairedPhone: string | null = null;
  private handler: IncomingHandler | null = null;
  private stopping = false;
  private retries = 0;
  private readonly jidByPhone = new Map<string, string>();
  private readonly authDir: string;

  constructor(
    public readonly sessionId = env.WA_DEMO_SESSION_ID,
    baseDir = path.resolve(process.cwd(), "sessions"),
  ) {
    this.authDir = path.join(baseDir, sessionId);
  }

  setIncomingHandler(handler: IncomingHandler): void {
    this.handler = handler;
  }

  async start(): Promise<void> {
    this.stopping = false;
    await this.connect();
  }

  private async connect(): Promise<void> {
    const baileys = await esmImport("@whiskeysockets/baileys");
    const makeWASocket = baileys.makeWASocket ?? baileys.default;
    const { useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } = baileys;
    const pino = (await esmImport("pino")).default;
    const qrcode = (await esmImport("qrcode-terminal")).default;

    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));

    const sock = makeWASocket({
      auth: state,
      version,
      browser: Browsers.ubuntu("CekDulu Bot"),
      logger: pino({ level: "silent" }),
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });
    this.sock = sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update: any) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        console.log("\n[bot:wa] Scan QR ini pakai WhatsApp nomor demo:");
        console.log("[bot:wa] WhatsApp > Perangkat tertaut > Tautkan perangkat\n");
        qrcode.generate(qr, { small: true });
      }
      if (connection === "open") {
        this.connected = true;
        this.retries = 0;
        const me = sock.user?.id ? String(sock.user.id).split(":")[0].split("@")[0] : null;
        this.pairedPhone = me;
        console.log(`[bot:wa] Tersambung ke WhatsApp sebagai ${me ?? "-"}`);
      }
      if (connection === "close") {
        this.connected = false;
        const code = lastDisconnect?.error?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) {
          console.warn(
            `[bot:wa] Sesi logout. Hapus folder ${this.authDir} lalu jalankan ulang buat scan QR baru.`,
          );
          return;
        }
        if (!this.stopping) {
          this.retries += 1;
          const wait = Math.min(30000, 2000 * this.retries);
          console.warn(`[bot:wa] Koneksi putus (kode ${code ?? "-"}), nyambung ulang dalam ${wait / 1000} detik...`);
          setTimeout(() => void this.connect(), wait);
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }: any) => {
      if (type !== "notify") return;
      for (const m of messages) {
        try {
          await this.handleRaw(m);
        } catch (err) {
          console.error("[bot:wa] Gagal proses pesan:", err);
        }
      }
    });
  }

  private async handleRaw(m: any): Promise<void> {
    const key = m?.key;
    if (!key || key.fromMe || !m.message) return;
    const jid: string = key.remoteJid ?? "";
    if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast" || jid.endsWith("@newsletter")) return;

    const pnJid: string =
      [key.remoteJidAlt, key.senderPn, jid].find(
        (j: unknown) => typeof j === "string" && j.endsWith("@s.whatsapp.net"),
      ) ?? jid;
    const phone = pnJid.split("@")[0].split(":")[0];
    this.jidByPhone.set(phone, jid);

    const msg = m.message.ephemeralMessage?.message ?? m.message;
    const text: string | undefined =
      msg.conversation ??
      msg.extendedTextMessage?.text ??
      msg.buttonsResponseMessage?.selectedDisplayText ??
      msg.listResponseMessage?.title ??
      msg.templateButtonReplyMessage?.selectedDisplayText ??
      undefined;
    const locMsg = msg.locationMessage ?? msg.liveLocationMessage;
    const location = locMsg
      ? {
          latitude: Number(locMsg.degreesLatitude),
          longitude: Number(locMsg.degreesLongitude),
          name: locMsg.name ?? undefined,
        }
      : undefined;

    if (!text && !location) return;
    if (!this.handler) {
      console.warn("[bot:wa] Pesan masuk tapi handler belum dipasang");
      return;
    }

    await this.sock?.readMessages?.([key]).catch(() => undefined);
    await this.handler({ fromPhone: phone, text, location, sessionId: this.sessionId });
  }

  async stop(): Promise<void> {
    this.stopping = true;
    try {
      this.sock?.end?.(undefined);
    } catch {
      // abaikan
    }
    this.connected = false;
  }

  getStatus(): WaGatewayStatus {
    return {
      mode: this.mode,
      sessionId: this.sessionId,
      connected: this.connected,
      pairedPhone: this.pairedPhone,
      notes: this.connected
        ? "Tersambung ke WhatsApp (Baileys)"
        : `Belum tersambung. Cek terminal buat scan QR. Sesi disimpan di ${this.authDir}`,
    };
  }

  async sendMessage(toPhone: string, text: string): Promise<OutboundWaRecord> {
    const digits = toPhone.replace(/\D/g, "");
    const jid = this.jidByPhone.get(digits) ?? `${digits}@s.whatsapp.net`;
    if (this.sock && this.connected) {
      try {
        await this.sock.sendPresenceUpdate?.("composing", jid).catch(() => undefined);
        await sleep(Math.min(1500, 400 + text.length * 8));
        await this.sock.sendMessage(jid, { text });
        await this.sock.sendPresenceUpdate?.("paused", jid).catch(() => undefined);
      } catch (err) {
        console.warn(`[bot:wa] Gagal kirim ke ${digits}:`, err);
      }
    } else {
      console.log(`[bot:wa:offline -> ${digits}]\n${text}\n---`);
    }
    return {
      toPhone: digits,
      text,
      sessionId: this.sessionId,
      sentAt: new Date().toISOString(),
      deliveredVia: this.mode,
    };
  }
}
