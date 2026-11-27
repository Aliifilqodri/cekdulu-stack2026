import {
  normalizePhoneNumber,
  QueueBucket,
  ReportCondition,
  UserRole,
} from "@cekdulu/shared";
import type { IncomingWaMessage, WaGatewayAdapter } from "../adapters/types";
import {
  ApiClientError,
  type ApiLocationDetail,
  type ApiLocationListItem,
  type BotUserIdentity,
  type CekduluApiClient,
} from "../lib/api-client";
import {
  BOT_SESSION_TTL_SECONDS,
  type BotSessionState,
  type SessionLocationCandidate,
  type SessionStore,
} from "../lib/session";

const CONDITION_MENU: Array<{
  key: string;
  value: ReportCondition;
  label: string;
  needsQueue: boolean;
}> = [
  { key: "1", value: ReportCondition.BUKA, label: "Buka Normal", needsQueue: true },
  { key: "2", value: ReportCondition.ANTRE, label: "Antre Panjang", needsQueue: true },
  { key: "3", value: ReportCondition.TUTUP, label: "Tutup", needsQueue: false },
  { key: "4", value: ReportCondition.BLANKO_HABIS, label: "Blanko Habis", needsQueue: false },
  { key: "5", value: ReportCondition.SISTEM_OFFLINE, label: "Sistem Offline", needsQueue: false },
  { key: "6", value: ReportCondition.PETUGAS_TIDAK_ADA, label: "Petugas Kosong", needsQueue: false },
];

const QUEUE_MENU: Array<{ key: string; value: QueueBucket }> = [
  { key: "1", value: QueueBucket.LT_5 },
  { key: "2", value: QueueBucket.B_5_15 },
  { key: "3", value: QueueBucket.B_15_30 },
  { key: "4", value: QueueBucket.GT_30 },
];

const GREETINGS = new Set([
  "MENU", "HALO", "HALLO", "HALOO", "HAI", "HAY", "HI", "HELLO", "HELO", "START",
  "MULAI", "P", "PING", "TES", "TEST", "ASSALAMUALAIKUM", "ASSALAMUALAIKUM WR WB",
  "PAGI", "SIANG", "SORE", "MALAM", "SELAMAT PAGI", "SELAMAT SIANG", "SELAMAT SORE",
  "SELAMAT MALAM", "BATAL", "KEMBALI", "BALIK", "0",
]);

const THANKS = /^(MAKASIH|MAKASI|MAKASSIH|TERIMA ?KASIH|TERIMAKASIH|THANKS|THANK YOU|THX|TQ|TENGKYU|MKSH|OKE MAKASIH|OK MAKASIH)\b/;

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

export function normalizeCommand(upper: string): string {
  const t = upper.replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  if (GREETINGS.has(t)) return "MENU";
  for (const cmd of ["MENU", "LAPOR", "BATAL"]) {
    if (t.length >= 3 && editDistance(t, cmd) <= 1) return cmd === "BATAL" ? "MENU" : cmd;
  }
  if (["CEKK", "CK", "CHEK", "CHECK", "CEKKK"].includes(t)) return "CEK";
  return upper;
}

function similarity(query: string, name: string): number {
  const q = query.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length >= 3);
  const words = name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  let score = 0;
  for (const w of q) {
    let best = 0;
    for (const n of words) {
      if (n.startsWith(w) || w.startsWith(n)) best = Math.max(best, 1);
      else {
        const d = editDistance(w, n);
        if (d <= Math.max(1, Math.floor(w.length / 4))) best = Math.max(best, 0.7);
      }
    }
    score += best;
  }
  return score;
}

function formatRelativeTime(isoDate?: string | null): string {
  if (!isoDate) return "baru saja";
  const mins = Math.max(
    1,
    Math.round((Date.now() - new Date(isoDate).getTime()) / 60000),
  );
  if (mins < 60) return `${mins} mnt lalu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} jam lalu`;
  return `${Math.floor(hrs / 24)} hari lalu`;
}

export function parseTimeSlotRange(
  raw: string,
): { startTime: string; endTime: string } | null {
  const match = raw
    .trim()
    .match(/^(\d{1,2})[.:](\d{2})\s*[-–]\s*(\d{1,2})[.:](\d{2})$/);
  if (!match) return null;

  const sh = Number(match[1]);
  const sm = Number(match[2]);
  const eh = Number(match[3]);
  const em = Number(match[4]);

  if (
    sh < 0 ||
    sh > 23 ||
    eh < 0 ||
    eh > 23 ||
    sm < 0 ||
    sm > 59 ||
    em < 0 ||
    em > 59
  ) {
    return null;
  }
  if (sh * 60 + sm >= eh * 60 + em) {
    return null;
  }

  return {
    startTime: `${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}:00`,
    endTime: `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}:00`,
  };
}

function formatLocationDetailReply(detail: ApiLocationDetail): string {
  const summary = detail.summary;
  const lines = [
    `📍 *${detail.name}* (${detail.categoryLabel})`,
    `Status terkini: *${summary?.statusLabel || "Belum Dicek"}*`,
  ];

  if (summary?.queueEstimate) {
    lines.push(`Estimasi antrean: *${summary.queueEstimate} orang*`);
  }
  if (summary?.blankoStatus) {
    lines.push(
      `Kondisi blanko: *${summary.blankoStatus === "ada" ? "Tersedia" : "Habis"}*`,
    );
  }
  if (summary?.officerStatus) {
    lines.push(
      `Petugas loket: *${summary.officerStatus === "di_loket" ? "Di loket" : "Tidak ada"}*`,
    );
  }
  if (summary?.networkStatus === "offline") {
    lines.push(`Jaringan/Sistem: *Offline*`);
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const todaySchedule = detail.schedules.find(
    (s) => s.scheduleDate === todayStr,
  );
  if (todaySchedule) {
    lines.push(
      todaySchedule.isAvailable
        ? `Jadwal TTD RT hari ini: *${todaySchedule.startTime.slice(0, 5)}–${todaySchedule.endTime.slice(0, 5)}*`
        : `Jadwal RT hari ini: *Libur / Tutup*`,
    );
  }

  if (summary?.lastUpdatedAt) {
    lines.push(
      `Update terakhir: ${formatRelativeTime(summary.lastUpdatedAt)} (${summary.confirmationCount} warga konfirmasi)`,
    );
  }

  const mainReq = detail.requirements[0];
  if (mainReq) {
    lines.push("");
    lines.push(`📋 *Syarat (${mainReq.serviceName}):*`);
    for (const item of mainReq.checklistItems.slice(0, 5)) {
      const label = typeof item === "string" ? item : item.label;
      lines.push(`• ${label}`);
    }
  }

  lines.push("");
  lines.push("Ketik *LAPOR* untuk kirim update terbaru, atau *MENU* untuk kembali.");
  return lines.join("\n");
}

function formatCandidateList(
  title: string,
  candidates: SessionLocationCandidate[],
): string {
  const lines = [title, ""];
  candidates.forEach((loc, idx) => {
    const dist =
      loc.distanceKm !== null && loc.distanceKm !== undefined
        ? ` (${loc.distanceKm} km)`
        : "";
    lines.push(`${idx + 1}. *${loc.name}* · ${loc.categoryLabel}${dist}`);
  });
  lines.push("");
  lines.push("Balas dengan *angka pilihan* (contoh: *1*), atau ketik *BATAL*.");
  return lines.join("\n");
}

function toCandidates(
  items: ApiLocationListItem[],
): SessionLocationCandidate[] {
  return items.slice(0, 5).map((item) => ({
    id: item.id,
    name: item.name,
    categoryLabel: item.categoryLabel,
    distanceKm: item.distanceKm,
  }));
}

export class BotConversationEngine {
  constructor(
    private readonly sessionStore: SessionStore,
    private readonly apiClient: CekduluApiClient,
    private readonly gateway?: WaGatewayAdapter,
  ) {}

  async handleIncomingMessage(msg: IncomingWaMessage): Promise<{
    phoneNumber: string;
    replies: string[];
    session: BotSessionState | null;
  }> {
    const phoneNumber = normalizePhoneNumber(msg.fromPhone);
    const text = (msg.text || "")
      .replace(/[_*~`]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const upper = text.toUpperCase();
    const replies: string[] = [];

    const reply = async (body: string) => {
      replies.push(body);
      if (this.gateway) {
        await this.gateway.sendMessage(phoneNumber, body);
      }
    };

    try {
      const user = await this.apiClient.identifyUser(phoneNumber);
      const isOfficial =
        user.rtOfficialAssignments.length > 0 ||
        user.role === UserRole.PENGURUS_RT ||
        user.role === UserRole.ADMIN;

      const buildMainMenu = () => {
        const lines = [
          `Halo${user.fullName ? ` *${user.fullName}*` : ""}! 👋`,
          "Aku *CekDulu Bot*. Aku bantu kamu tahu kondisi layanan RT & kelurahan *sebelum berangkat*, biar nggak bolak-balik.",
          "",
          "*Mau ngapain?*",
          "1️⃣ *Cek status* tempat layanan",
          "2️⃣ *Lapor* kondisi yang kamu lihat sekarang",
        ];
        if (isOfficial) {
          lines.push("3️⃣ *Panel pengurus RT* (atur jam TTD & jawab warga)");
        }
        lines.push("");
        lines.push("Balas *angkanya* aja, atau langsung ketik:");
        lines.push("• _cek kebon jeruk_");
        lines.push("• 📎 kirim *lokasi* buat lihat yang terdekat");
        lines.push("");
        lines.push("_Ketik *menu* kapan aja buat balik ke sini._");
        return lines.join("\n");
      };

      // Perintah global untuk reset atau keluar dari sesi
      if (THANKS.test(upper.replace(/[^A-Z ]/g, "").trim())) {
        await reply("Sama-sama! 🙌 Semoga urusannya lancar. Ketik *menu* kalau butuh lagi.");
        return { phoneNumber, replies, session: await this.sessionStore.get(phoneNumber) };
      }

      const command = normalizeCommand(upper);
      if (command === "MENU") {
        await this.sessionStore.clear(phoneNumber);
        await reply(buildMainMenu());
        return { phoneNumber, replies, session: null };
      }

      // Pintasan keyword global agar warga & pengurus bisa langsung melompat
      if (upper === "JADWAL RT" || upper === "ATUR SLOT") {
        const nextSession = await this.enterRtFlow(phoneNumber, user, reply);
        return { phoneNumber, replies, session: nextSession };
      }

      if (command === "CEK" || upper === "CEK" || upper.startsWith("CEK ")) {
        const keyword = command === "CEK" ? "" : text.slice(3).trim();
        if (!keyword && !msg.location) {
          const s: BotSessionState = {
            step: "CEK_PICK_LOCATION",
            updatedAt: Date.now(),
          };
          await this.sessionStore.set(phoneNumber, s, BOT_SESSION_TTL_SECONDS);
          await reply(
            "Ketik *nama lokasi/kelurahan* yang ingin dicek (contoh: _Kebon Jeruk_), atau kirim *Share Live Location* 📍.",
          );
          return { phoneNumber, replies, session: s };
        }
        const nextSession = await this.runStatusCheck(
          phoneNumber,
          keyword ? { q: keyword } : { lat: msg.location!.latitude, lng: msg.location!.longitude },
          reply,
        );
        return { phoneNumber, replies, session: nextSession };
      }

      if (command === "LAPOR" || upper === "LAPOR" || upper.startsWith("LAPOR ")) {
        const keyword = command === "LAPOR" && upper !== "LAPOR" && !upper.startsWith("LAPOR ") ? "" : text.slice(5).trim();
        const nextSession = await this.startReportFlow(
          phoneNumber,
          keyword,
          msg.location,
          reply,
        );
        return { phoneNumber, replies, session: nextSession };
      }

      // Baca session aktif di Redis (TTL 15 menit)
      const session = await this.sessionStore.get(phoneNumber);

      // Jika user langsung Share Live Location tanpa sedang di alur LAPOR -> langsung cek lokasi terdekat!
      if (
        msg.location &&
        (!session ||
          session.step === "IDLE" ||
          session.step === "CEK_PICK_LOCATION")
      ) {
        const nextSession = await this.runStatusCheck(
          phoneNumber,
          { lat: msg.location.latitude, lng: msg.location.longitude, radius: 5 },
          reply,
        );
        return { phoneNumber, replies, session: nextSession };
      }

      if (!session || session.step === "IDLE") {
        if (text === "1") {
          const s: BotSessionState = {
            step: "CEK_PICK_LOCATION",
            updatedAt: Date.now(),
          };
          await this.sessionStore.set(phoneNumber, s, BOT_SESSION_TTL_SECONDS);
          await reply(
            "Ketik *nama lokasi/kelurahan* yang ingin dicek (contoh: _Kebon Jeruk_), atau kirim *Share Live Location* 📍.",
          );
          return { phoneNumber, replies, session: s };
        }
        if (text === "2") {
          const nextSession = await this.startReportFlow(
            phoneNumber,
            "",
            undefined,
            reply,
          );
          return { phoneNumber, replies, session: nextSession };
        }
        if (text === "3" && isOfficial) {
          const nextSession = await this.enterRtFlow(phoneNumber, user, reply);
          return { phoneNumber, replies, session: nextSession };
        }

        // Default bila warga mengetik kalimat langsung saat IDLE -> perlakukan sebagai pencarian CEK atau tampilkan menu
        if (text.length >= 3) {
          const nextSession = await this.runStatusCheck(
            phoneNumber,
            { q: text },
            reply,
            buildMainMenu(),
          );
          return { phoneNumber, replies, session: nextSession };
        }

        await reply(buildMainMenu());
        return { phoneNumber, replies, session: null };
      }

      // Tangani state percakapan aktif
      const nextSession = await this.handleSessionStep(
        phoneNumber,
        user,
        session,
        msg,
        reply,
      );
      return { phoneNumber, replies, session: nextSession };
    } catch (err) {
      const message =
        err instanceof ApiClientError
          ? err.message
          : "Maaf, terjadi gangguan saat memproses permintaan. Ketik *MENU* untuk mencoba lagi.";
      await reply(`⚠️ ${message}`);
      return { phoneNumber, replies, session: null };
    }
  }

  private async runStatusCheck(
    phoneNumber: string,
    params: { q?: string; lat?: number; lng?: number; radius?: number },
    reply: (msg: string) => Promise<void>,
    fallbackHint?: string,
  ): Promise<BotSessionState | null> {
    const matches = await this.apiClient.searchLocations(phoneNumber, params);
    if (matches.length === 0) {
      if (params.q) {
        const all = await this.apiClient.searchLocations(phoneNumber, {}).catch(() => []);
        const suggestions = all
          .map((item) => ({ item, score: similarity(params.q!, item.name) }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .map((x) => x.item);
        if (suggestions.length > 0) {
          const candidates = toCandidates(suggestions).slice(0, 3);
          const nextSession: BotSessionState = {
            step: "CEK_PICK_LOCATION",
            locationCandidates: candidates,
            updatedAt: Date.now(),
          };
          await this.sessionStore.set(phoneNumber, nextSession, BOT_SESSION_TTL_SECONDS);
          await reply(
            formatCandidateList(
              `Hmm, aku belum nemu tempat bernama "${params.q}" 🤔\nMungkin maksudnya:`,
              candidates,
            ),
          );
          return nextSession;
        }
        await reply(
          fallbackHint
            ? `Hmm, aku belum ngerti "${params.q}" 🤔\n\n${fallbackHint}`
            : `Aku belum nemu tempat bernama "${params.q}". Coba ketik nama kelurahan atau RT lain, atau kirim lokasi 📎.`,
        );
        return null;
      }
      await reply(
        fallbackHint ??
          "Belum ada tempat layanan yang terdaftar di sekitar lokasimu. Coba ketik nama kelurahan atau RT-nya ya.",
      );
      return null;
    }

    if (matches.length === 1) {
      const detail = await this.apiClient.getLocationDetail(
        phoneNumber,
        matches[0].id,
      );
      await this.sessionStore.clear(phoneNumber);
      await reply(formatLocationDetailReply(detail));
      return null;
    }

    const candidates = toCandidates(matches);
    const nextSession: BotSessionState = {
      step: "CEK_PICK_LOCATION",
      locationCandidates: candidates,
      updatedAt: Date.now(),
    };
    await this.sessionStore.set(
      phoneNumber,
      nextSession,
      BOT_SESSION_TTL_SECONDS,
    );
    await reply(
      formatCandidateList(
        "Ditemukan beberapa lokasi. Pilih lokasi yang ingin dicek:",
        candidates,
      ),
    );
    return nextSession;
  }

  private async startReportFlow(
    phoneNumber: string,
    keyword: string,
    location: IncomingWaMessage["location"] | undefined,
    reply: (msg: string) => Promise<void>,
  ): Promise<BotSessionState> {
    const matches = await this.apiClient.searchLocations(
      phoneNumber,
      location
        ? { lat: location.latitude, lng: location.longitude, radius: 5 }
        : keyword
          ? { q: keyword }
          : {},
    );

    if (matches.length === 0) {
      const nextSession: BotSessionState = {
        step: "LAPOR_FIND_LOCATION",
        updatedAt: Date.now(),
      };
      await this.sessionStore.set(
        phoneNumber,
        nextSession,
        BOT_SESSION_TTL_SECONDS,
      );
      await reply(
        "Lokasi belum ditemukan. Ketik *nama lokasi* atau kirim *Share Location* tempat kamu berada sekarang.",
      );
      return nextSession;
    }

    if (matches.length === 1 && (keyword || location)) {
      const picked = toCandidates(matches)[0];
      const nextSession: BotSessionState = {
        step: "LAPOR_PICK_CONDITION",
        selectedLocation: picked,
        updatedAt: Date.now(),
      };
      await this.sessionStore.set(
        phoneNumber,
        nextSession,
        BOT_SESSION_TTL_SECONDS,
      );
      await reply(this.formatConditionPrompt(picked.name));
      return nextSession;
    }

    const candidates = toCandidates(matches);
    const nextSession: BotSessionState = {
      step: "LAPOR_PICK_LOCATION",
      locationCandidates: candidates,
      updatedAt: Date.now(),
    };
    await this.sessionStore.set(
      phoneNumber,
      nextSession,
      BOT_SESSION_TTL_SECONDS,
    );
    await reply(
      formatCandidateList(
        "Pilih lokasi layanan yang ingin kamu laporkan:",
        candidates,
      ),
    );
    return nextSession;
  }

  private formatConditionPrompt(locationName: string): string {
    const lines = [
      `📍 Lokasi dipilih: *${locationName}*`,
      "",
      "Pilih kondisi layanan saat ini (balas angka 1–6):",
      ...CONDITION_MENU.map((c) => `${c.key}. ${c.label}`),
    ];
    return lines.join("\n");
  }

  private formatQueuePrompt(): string {
    return [
      "Kira-kira antre berapa orang? (balas angka 1–4):",
      "1. < 5 orang",
      "2. 5-15 orang",
      "3. 15-30 orang",
      "4. > 30 orang",
    ].join("\n");
  }

  private async enterRtFlow(
    phoneNumber: string,
    user: BotUserIdentity,
    reply: (msg: string) => Promise<void>,
  ): Promise<BotSessionState | null> {
    if (user.rtOfficialAssignments.length === 0) {
      await this.sessionStore.clear(phoneNumber);
      await reply(
        "⛔ Nomor WhatsApp ini belum terdaftar aktif sebagai Pengurus RT pada tabel `rt_officials`. Hubungi admin wilayah untuk aktivasi akun RT.",
      );
      return null;
    }

    if (user.rtOfficialAssignments.length === 1) {
      const assigned = user.rtOfficialAssignments[0];
      const nextSession: BotSessionState = {
        step: "RT_MENU",
        selectedLocation: {
          id: assigned.locationId,
          name: assigned.locationName,
          categoryLabel: "Kantor RT",
        },
        rtAssignments: user.rtOfficialAssignments.map((a) => ({
          locationId: a.locationId,
          locationName: a.locationName,
          rtRwCode: a.rtRwCode,
        })),
        updatedAt: Date.now(),
      };
      await this.sessionStore.set(
        phoneNumber,
        nextSession,
        BOT_SESSION_TTL_SECONDS,
      );
      await reply(this.formatRtMenu(assigned.rtRwCode, assigned.locationName));
      return nextSession;
    }

    const candidates: SessionLocationCandidate[] = user.rtOfficialAssignments.map(
      (a) => ({
        id: a.locationId,
        name: `${a.rtRwCode} · ${a.locationName}`,
        categoryLabel: "Kantor RT",
      }),
    );
    const nextSession: BotSessionState = {
      step: "RT_PICK_LOCATION",
      locationCandidates: candidates,
      rtAssignments: user.rtOfficialAssignments.map((a) => ({
        locationId: a.locationId,
        locationName: a.locationName,
        rtRwCode: a.rtRwCode,
      })),
      updatedAt: Date.now(),
    };
    await this.sessionStore.set(
      phoneNumber,
      nextSession,
      BOT_SESSION_TTL_SECONDS,
    );
    await reply(
      formatCandidateList("Pilih wilayah RT yang ingin dikelola:", candidates),
    );
    return nextSession;
  }

  private formatRtMenu(rtCode: string, locationName: string): string {
    return [
      `🛡️ *Panel Pengurus ${rtCode}*`,
      `📍 ${locationName}`,
      "",
      "Pilih menu (balas angka 1–3):",
      "1. Atur slot jam tanda tangan surat hari ini",
      "2. Tandai layanan RT hari ini *libur / tutup*",
      "3. Lihat & balas pertanyaan warga yang masuk",
      "",
      "Ketik *BATAL* untuk keluar.",
    ].join("\n");
  }

  private async handleSessionStep(
    phoneNumber: string,
    _user: BotUserIdentity,
    session: BotSessionState,
    msg: IncomingWaMessage,
    reply: (msg: string) => Promise<void>,
  ): Promise<BotSessionState | null> {
    const text = (msg.text || "").trim();

    switch (session.step) {
      case "CEK_PICK_LOCATION": {
        if (session.locationCandidates && session.locationCandidates.length > 0) {
          const idx = Number(text) - 1;
          if (
            Number.isInteger(idx) &&
            idx >= 0 &&
            idx < session.locationCandidates.length
          ) {
            const chosen = session.locationCandidates[idx];
            const detail = await this.apiClient.getLocationDetail(
              phoneNumber,
              chosen.id,
            );
            await this.sessionStore.clear(phoneNumber);
            await reply(formatLocationDetailReply(detail));
            return null;
          }
        }
        return this.runStatusCheck(
          phoneNumber,
          msg.location
            ? { lat: msg.location.latitude, lng: msg.location.longitude, radius: 5 }
            : { q: text.replace(/^cek\s+/i, "") },
          reply,
        );
      }

      case "LAPOR_FIND_LOCATION": {
        return this.startReportFlow(
          phoneNumber,
          text,
          msg.location,
          reply,
        );
      }

      case "LAPOR_PICK_LOCATION": {
        const candidates = session.locationCandidates || [];
        const idx = Number(text) - 1;
        if (!Number.isInteger(idx) || idx < 0 || idx >= candidates.length) {
          return this.startReportFlow(phoneNumber, text, msg.location, reply);
        }
        const chosen = candidates[idx];
        const next: BotSessionState = {
          step: "LAPOR_PICK_CONDITION",
          selectedLocation: chosen,
          updatedAt: Date.now(),
        };
        await this.sessionStore.set(phoneNumber, next, BOT_SESSION_TTL_SECONDS);
        await reply(this.formatConditionPrompt(chosen.name));
        return next;
      }

      case "LAPOR_PICK_CONDITION": {
        const chosen = CONDITION_MENU.find(
          (c) =>
            c.key === text ||
            c.label.toLowerCase() === text.toLowerCase(),
        );
        if (!chosen) {
          await reply(
            "Pilihan tidak valid. Balas angka *1 sampai 6* sesuai kondisi layanan.",
          );
          return session;
        }

        if (chosen.needsQueue) {
          const next: BotSessionState = {
            ...session,
            step: "LAPOR_PICK_QUEUE",
            reportCondition: chosen.value,
            updatedAt: Date.now(),
          };
          await this.sessionStore.set(
            phoneNumber,
            next,
            BOT_SESSION_TTL_SECONDS,
          );
          await reply(this.formatQueuePrompt());
          return next;
        }

        const next: BotSessionState = {
          ...session,
          step: "LAPOR_NOTES",
          reportCondition: chosen.value,
          reportQueue: null,
          updatedAt: Date.now(),
        };
        await this.sessionStore.set(phoneNumber, next, BOT_SESSION_TTL_SECONDS);
        await reply(
          "Tambahkan *catatan singkat* (opsional, mis. _Loket pindah ke aula_), atau ketik *-* untuk langsung kirim.",
        );
        return next;
      }

      case "LAPOR_PICK_QUEUE": {
        const chosen = QUEUE_MENU.find(
          (q) => q.key === text || q.value === text,
        );
        if (!chosen) {
          await reply("Pilihan antrean tidak valid. Balas angka *1–4*.");
          return session;
        }
        const next: BotSessionState = {
          ...session,
          step: "LAPOR_NOTES",
          reportQueue: chosen.value,
          updatedAt: Date.now(),
        };
        await this.sessionStore.set(phoneNumber, next, BOT_SESSION_TTL_SECONDS);
        await reply(
          "Tambahkan *catatan singkat* (opsional, mis. _Nomor antrean 47_), atau ketik *-* untuk langsung kirim.",
        );
        return next;
      }

      case "LAPOR_NOTES": {
        if (!session.selectedLocation || !session.reportCondition) {
          await this.sessionStore.clear(phoneNumber);
          await reply("Sesi laporan tidak lengkap. Ketik *LAPOR* untuk mulai ulang.");
          return null;
        }

        const skipNotes =
          text === "-" ||
          text.toLowerCase() === "lewati" ||
          text.toLowerCase() === "skip";

        const res = await this.apiClient.submitReport(phoneNumber, {
          locationId: session.selectedLocation.id,
          conditionType: session.reportCondition,
          queueRange: session.reportQueue ?? null,
          notes: skipNotes || !text ? null : text.slice(0, 500),
        });

        await this.sessionStore.clear(phoneNumber);

        const isConfirmed = res.report.validationStatus === "confirmed";
        await reply(
          [
            `✅ *Laporan berhasil dicatat!*`,
            `📍 ${session.selectedLocation.name}`,
            `Status laporanmu: *${isConfirmed ? "Terkonfirmasi" : "Menunggu Konfirmasi Warga"}* (bobot ${res.report.weightScore})`,
            `Status lokasi saat ini: *${res.locationSummary.statusLabel}* (${res.locationSummary.confirmationCount} warga konfirmasi)`,
            "",
            "Laporan aktif selama 2 jam. Terima kasih sudah membantu warga sekitar!",
          ].join("\n"),
        );
        return null;
      }

      case "RT_PICK_LOCATION": {
        const candidates = session.locationCandidates || [];
        const idx = Number(text) - 1;
        if (!Number.isInteger(idx) || idx < 0 || idx >= candidates.length) {
          await reply("Pilih nomor wilayah RT yang valid.");
          return session;
        }
        const chosen = candidates[idx];
        const next: BotSessionState = {
          ...session,
          step: "RT_MENU",
          selectedLocation: chosen,
          updatedAt: Date.now(),
        };
        await this.sessionStore.set(phoneNumber, next, BOT_SESSION_TTL_SECONDS);
        await reply(this.formatRtMenu("Pengurus RT", chosen.name));
        return next;
      }

      case "RT_MENU": {
        const loc = session.selectedLocation;
        if (!loc) {
          await this.sessionStore.clear(phoneNumber);
          return null;
        }
        const choice = text.toLowerCase();

        if (choice === "1" || choice === "a") {
          const next: BotSessionState = {
            ...session,
            step: "RT_INPUT_SLOT",
            updatedAt: Date.now(),
          };
          await this.sessionStore.set(
            phoneNumber,
            next,
            BOT_SESSION_TTL_SECONDS,
          );
          await reply(
            "Masukkan jam layanan tanda tangan hari ini dengan format *JJ.MM-JJ.MM* (contoh: *19.00-20.30*).",
          );
          return next;
        }

        if (choice === "2" || choice === "b") {
          await this.apiClient.createRtSchedule(phoneNumber, {
            locationId: loc.id,
            startTime: "00:00:00",
            endTime: "23:59:00",
            isAvailable: false,
          });
          await this.sessionStore.clear(phoneNumber);
          await reply(
            `✅ Layanan *${loc.name}* hari ini telah ditandai *LIBUR / TUTUP* dan disiarkan ke warga pemantau.`,
          );
          return null;
        }

        if (choice === "3" || choice === "c") {
          const questions = await this.apiClient.getUnansweredQuestions(
            phoneNumber,
            loc.id,
          );
          if (questions.length === 0) {
            await this.sessionStore.clear(phoneNumber);
            await reply(
              `✨ Tidak ada pertanyaan warga yang belum terjawab di *${loc.name}*.`,
            );
            return null;
          }
          const list = questions.slice(0, 5).map((q) => ({
            id: q.id,
            questionText: q.questionText,
            askedBy: q.askedBy.name,
          }));
          const next: BotSessionState = {
            ...session,
            step: "RT_PICK_QUESTION",
            rtQuestions: list,
            updatedAt: Date.now(),
          };
          await this.sessionStore.set(
            phoneNumber,
            next,
            BOT_SESSION_TTL_SECONDS,
          );
          const lines = [
            `💬 *Pertanyaan Warga (${list.length} belum terjawab):*`,
            "",
            ...list.map(
              (q, i) => `${i + 1}. _"${q.questionText}"_ · ${q.askedBy}`,
            ),
            "",
            "Balas angka pertanyaan yang ingin dijawab:",
          ];
          await reply(lines.join("\n"));
          return next;
        }

        await reply("Pilihan tidak dikenali. Balas angka *1*, *2*, atau *3*.");
        return session;
      }

      case "RT_INPUT_SLOT": {
        const loc = session.selectedLocation;
        if (!loc) {
          await this.sessionStore.clear(phoneNumber);
          return null;
        }
        const parsed = parseTimeSlotRange(text);
        if (!parsed) {
          await reply(
            "Format jam tidak valid. Contoh yang benar: *19.00-20.30* (jam selesai harus lebih akhir dari jam mulai).",
          );
          return session;
        }
        await this.apiClient.createRtSchedule(phoneNumber, {
          locationId: loc.id,
          startTime: parsed.startTime,
          endTime: parsed.endTime,
          isAvailable: true,
        });
        await this.sessionStore.clear(phoneNumber);
        await reply(
          `✅ Siap! Slot tanda tangan hari ini pukul *${parsed.startTime.slice(0, 5)}–${parsed.endTime.slice(0, 5)}* di *${loc.name}* sudah tampil di peta & disiarkan ke warga pemantau.`,
        );
        return null;
      }

      case "RT_PICK_QUESTION": {
        const list = session.rtQuestions || [];
        const idx = Number(text) - 1;
        if (!Number.isInteger(idx) || idx < 0 || idx >= list.length) {
          await reply(`Pilih angka pertanyaan antara 1 sampai ${list.length}.`);
          return session;
        }
        const chosen = list[idx];
        const next: BotSessionState = {
          ...session,
          step: "RT_ANSWER_TEXT",
          selectedQuestion: chosen,
          updatedAt: Date.now(),
        };
        await this.sessionStore.set(phoneNumber, next, BOT_SESSION_TTL_SECONDS);
        await reply(
          `Pertanyaan dari *${chosen.askedBy}*:\n_"${chosen.questionText}"_\n\nBalas pesan ini dengan jawaban Bapak/Ibu:`,
        );
        return next;
      }

      case "RT_ANSWER_TEXT": {
        const q = session.selectedQuestion;
        const loc = session.selectedLocation;
        if (!q || !loc) {
          await this.sessionStore.clear(phoneNumber);
          return null;
        }
        if (text.length < 2) {
          await reply("Jawaban minimal 2 karakter.");
          return session;
        }
        await this.apiClient.answerQuestion(phoneNumber, q.id, text);
        await this.sessionStore.clear(phoneNumber);
        await reply(
          `✅ Jawaban resmi Pengurus RT berhasil dikirim dan tampil di halaman *${loc.name}*!`,
        );
        return null;
      }

      default: {
        await this.sessionStore.clear(phoneNumber);
        return null;
      }
    }
  }
}
