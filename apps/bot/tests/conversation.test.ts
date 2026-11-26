import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LocationCategory,
  QueueBucket,
  ReportCondition,
  SummaryStatus,
  UserRole,
} from "@cekdulu/shared";
import { SimulationGatewayAdapter } from "../src/adapters/gateway";
import type {
  ApiLocationDetail,
  ApiLocationListItem,
  ApiQuestionItem,
  BotUserIdentity,
  CekduluApiClient,
} from "../src/lib/api-client";
import {
  BOT_SESSION_TTL_SECONDS,
  InMemorySessionStore,
} from "../src/lib/session";
import {
  BotConversationEngine,
  parseTimeSlotRange,
} from "../src/services/conversation.engine";

function createMockApiClient() {
  const submittedReports: Array<{
    phoneNumber: string;
    locationId: string;
    conditionType: ReportCondition;
    queueRange?: QueueBucket | null;
    notes?: string | null;
  }> = [];
  const createdSchedules: Array<{
    phoneNumber: string;
    locationId: string;
    startTime: string;
    endTime: string;
    isAvailable: boolean;
  }> = [];
  const answeredQuestions: Array<{
    phoneNumber: string;
    questionId: string;
    answerText: string;
  }> = [];

  const kelSukamaju: ApiLocationListItem = {
    id: "loc-kel-1",
    name: "Kelurahan Sukamaju",
    category: LocationCategory.KELURAHAN,
    categoryLabel: "Kelurahan",
    address: "Jl. Melati No. 12",
    distanceKm: 0.4,
    headline: "Blanko ada · Antre 5-15",
    metaText: "4 warga konfirmasi · 5 mnt lalu",
    summary: {
      currentStatus: SummaryStatus.ANTRE,
      statusLabel: "Antre",
      blankoStatus: "ada",
      queueEstimate: QueueBucket.B_5_15,
      officerStatus: "di_loket",
      networkStatus: "normal",
      confirmationCount: 4,
      lastUpdatedAt: new Date(Date.now() - 5 * 60000).toISOString(),
    },
  };

  const rt05: ApiLocationListItem = {
    id: "loc-rt-05",
    name: "Sekretariat RT 05 / RW 03",
    category: LocationCategory.KANTOR_RT,
    categoryLabel: "Kantor RT",
    address: "Balai Warga RW 03",
    distanceKm: 0.2,
    headline: "Tanda tangan surat 19.00–20.30",
    metaText: "Jadwal resmi pengurus RT",
    summary: {
      currentStatus: SummaryStatus.BUKA,
      statusLabel: "Buka",
      blankoStatus: null,
      queueEstimate: null,
      officerStatus: "di_loket",
      networkStatus: null,
      confirmationCount: 1,
      lastUpdatedAt: new Date().toISOString(),
    },
  };

  const client: CekduluApiClient = {
    async identifyUser(phoneNumber): Promise<BotUserIdentity> {
      if (phoneNumber === "6281200000001") {
        return {
          id: "user-rt-1",
          phoneNumber,
          fullName: "Pak Hendra",
          role: UserRole.PENGURUS_RT,
          rtOfficialAssignments: [
            {
              id: "off-1",
              rtRwCode: "RT 05 / RW 03",
              locationId: "loc-rt-05",
              locationName: "Sekretariat RT 05 / RW 03",
            },
          ],
        };
      }
      return {
        id: "user-warga-1",
        phoneNumber,
        fullName: "Budi",
        role: UserRole.WARGA,
        rtOfficialAssignments: [],
      };
    },

    async searchLocations(_phone, params) {
      if (params.lat !== undefined && params.lng !== undefined) {
        return [rt05, kelSukamaju];
      }
      if (!params.q) return [kelSukamaju, rt05];
      const q = params.q.toLowerCase();
      return [kelSukamaju, rt05].filter((l) =>
        l.name.toLowerCase().includes(q),
      );
    },

    async getLocationDetail(_phone, locationId): Promise<ApiLocationDetail> {
      const base = locationId === "loc-rt-05" ? rt05 : kelSukamaju;
      return {
        ...base,
        openTime: "08:00:00",
        closeTime: "15:00:00",
        operationalDays: "Senin - Jumat",
        schedules: [],
        requirements: [
          {
            id: "req-1",
            serviceName: "Cetak e-KTP",
            checklistItems: [
              { label: "Fotokopi Kartu Keluarga", required: true },
              { label: "e-KTP lama atau surat kehilangan", required: true },
            ],
          },
        ],
      };
    },

    async submitReport(phoneNumber, body) {
      submittedReports.push({ phoneNumber, ...body });
      return {
        report: {
          id: "rep-new-1",
          validationStatus: "pending",
          weightScore: 1,
        },
        locationSummary: {
          statusLabel: "Antre",
          confirmationCount: 4,
        },
      };
    },

    async createRtSchedule(phoneNumber, body) {
      createdSchedules.push({ phoneNumber, ...body });
      return {
        id: "sch-1",
        scheduleDate: new Date().toISOString().slice(0, 10),
        ...body,
      };
    },

    async getUnansweredQuestions(): Promise<ApiQuestionItem[]> {
      return [
        {
          id: "q-1",
          locationId: "loc-rt-05",
          questionText: "Pengantar SKCK bisa malam ini?",
          isAnswered: false,
          askedBy: { id: "u-2", name: "Andi" },
        },
      ];
    },

    async answerQuestion(phoneNumber, questionId, answerText) {
      answeredQuestions.push({ phoneNumber, questionId, answerText });
      return { id: "ans-1", isOfficialRt: true };
    },
  };

  return {
    client,
    submittedReports,
    createdSchedules,
    answeredQuestions,
  };
}

describe("WhatsApp Bot Gateway & State Machine", () => {
  it("parseTimeSlotRange memvalidasi format 19.00-20.30 dan menolak rentang terbalik", () => {
    assert.deepEqual(parseTimeSlotRange("19.00-20.30"), {
      startTime: "19:00:00",
      endTime: "20:30:00",
    });
    assert.deepEqual(parseTimeSlotRange("08:00 - 11:30"), {
      startTime: "08:00:00",
      endTime: "11:30:00",
    });
    assert.equal(parseTimeSlotRange("21.00-19.00"), null);
    assert.equal(parseTimeSlotRange("asal"), null);
  });

  it("SessionStore menghormati TTL 15 menit (900 detik)", async () => {
    const store = new InMemorySessionStore();
    assert.equal(BOT_SESSION_TTL_SECONDS, 900);
    await store.set("628123", { step: "CEK_PICK_LOCATION", updatedAt: Date.now() }, 0.01);
    await new Promise((r) => setTimeout(r, 25));
    const expired = await store.get("628123");
    assert.equal(expired, null);
  });

  it("Alur Cek Status (Menu 1 / keyword CEK & Share Live Location)", async () => {
    const store = new InMemorySessionStore();
    const mock = createMockApiClient();
    const gateway = new SimulationGatewayAdapter("demo");
    const engine = new BotConversationEngine(store, mock.client, gateway);

    // 1. Cek langsung pakai keyword "Cek Kelurahan Sukamaju"
    const res1 = await engine.handleIncomingMessage({
      fromPhone: "081200000003",
      text: "Cek Kelurahan Sukamaju",
    });
    assert.match(res1.replies[0], /Kelurahan Sukamaju/);
    assert.match(res1.replies[0], /Antre/);
    assert.match(res1.replies[0], /5-15 orang/);
    assert.match(res1.replies[0], /Tersedia/);
    assert.match(res1.replies[0], /Fotokopi Kartu Keluarga/);

    // 2. Share Live Location menghasilkan daftar terdekat lalu user pilih angka 2
    const resLoc = await engine.handleIncomingMessage({
      fromPhone: "081200000003",
      location: { latitude: -6.17, longitude: 106.79 },
    });
    assert.equal(resLoc.session?.step, "CEK_PICK_LOCATION");
    assert.match(resLoc.replies[0], /1\. \*Sekretariat RT 05/);
    assert.match(resLoc.replies[0], /2\. \*Kelurahan Sukamaju/);

    const resPick = await engine.handleIncomingMessage({
      fromPhone: "081200000003",
      text: "2",
    });
    assert.equal(resPick.session, null);
    assert.match(resPick.replies[0], /Kelurahan Sukamaju/);
  });

  it("Alur Lapor Kondisi Warga (Menu 2 / LAPOR -> lokasi -> kondisi -> antrean -> catatan)", async () => {
    const store = new InMemorySessionStore();
    const mock = createMockApiClient();
    const engine = new BotConversationEngine(store, mock.client);
    const phone = "081200000003";

    const s1 = await engine.handleIncomingMessage({ fromPhone: phone, text: "2" });
    assert.equal(s1.session?.step, "LAPOR_PICK_LOCATION");

    const s2 = await engine.handleIncomingMessage({ fromPhone: phone, text: "1" });
    assert.equal(s2.session?.step, "LAPOR_PICK_CONDITION");

    const s3 = await engine.handleIncomingMessage({ fromPhone: phone, text: "2" });
    assert.equal(s3.session?.step, "LAPOR_PICK_QUEUE");

    const s4 = await engine.handleIncomingMessage({ fromPhone: phone, text: "2" });
    assert.equal(s4.session?.step, "LAPOR_NOTES");

    const s5 = await engine.handleIncomingMessage({
      fromPhone: phone,
      text: "Nomor antrean 47",
    });
    assert.equal(s5.session, null);
    assert.equal(mock.submittedReports.length, 1);
    assert.deepEqual(mock.submittedReports[0], {
      phoneNumber: "6281200000003",
      locationId: "loc-kel-1",
      conditionType: ReportCondition.ANTRE,
      queueRange: QueueBucket.B_5_15,
      notes: "Nomor antrean 47",
    });
    assert.match(s5.replies[0], /Laporan berhasil dicatat/);
  });

  it("Alur Pengurus RT: tolak warga biasa, terima pengurus di rt_officials untuk atur slot, libur, & balas tanya warga", async () => {
    const store = new InMemorySessionStore();
    const mock = createMockApiClient();
    const engine = new BotConversationEngine(store, mock.client);

    // Warga biasa mencoba JADWAL RT -> ditolak
    const denied = await engine.handleIncomingMessage({
      fromPhone: "081200000003",
      text: "JADWAL RT",
    });
    assert.match(denied.replies[0], /belum terdaftar aktif sebagai Pengurus RT/);

    // Pengurus RT aktif: atur slot 19.00-20.30
    const rtPhone = "081200000001";
    const rtMenu1 = await engine.handleIncomingMessage({
      fromPhone: rtPhone,
      text: "ATUR SLOT",
    });
    assert.equal(rtMenu1.session?.step, "RT_MENU");

    await engine.handleIncomingMessage({ fromPhone: rtPhone, text: "1" });
    const slotDone = await engine.handleIncomingMessage({
      fromPhone: rtPhone,
      text: "19.00-20.30",
    });
    assert.equal(slotDone.session, null);
    assert.equal(mock.createdSchedules[0].isAvailable, true);
    assert.equal(mock.createdSchedules[0].startTime, "19:00:00");
    assert.equal(mock.createdSchedules[0].endTime, "20:30:00");

    // Tandai libur hari ini
    await engine.handleIncomingMessage({ fromPhone: rtPhone, text: "JADWAL RT" });
    const holidayDone = await engine.handleIncomingMessage({
      fromPhone: rtPhone,
      text: "2",
    });
    assert.equal(holidayDone.session, null);
    assert.equal(mock.createdSchedules[1].isAvailable, false);

    // Balas pertanyaan warga
    await engine.handleIncomingMessage({ fromPhone: rtPhone, text: "JADWAL RT" });
    const pickQ = await engine.handleIncomingMessage({
      fromPhone: rtPhone,
      text: "3",
    });
    assert.equal(pickQ.session?.step, "RT_PICK_QUESTION");

    await engine.handleIncomingMessage({ fromPhone: rtPhone, text: "1" });
    const ansDone = await engine.handleIncomingMessage({
      fromPhone: rtPhone,
      text: "Bisa, bawa fotokopi KTP sama KK ya",
    });
    assert.equal(ansDone.session, null);
    assert.equal(mock.answeredQuestions.length, 1);
    assert.equal(mock.answeredQuestions[0].questionId, "q-1");
  });
});
