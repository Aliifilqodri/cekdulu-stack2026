import "reflect-metadata";
import { EntityManager } from "@mikro-orm/postgresql";
import { Seeder } from "@mikro-orm/seeder";
import {
  BlankoState,
  ChannelSource,
  LocationCategory,
  NetworkState,
  OfficerState,
  QueueBucket,
  ReportCondition,
  SummaryStatus,
  UserRole,
  ValidationState,
} from "@cekdulu/shared";
import {
  Answer,
  Location,
  LocationRequirement,
  LocationStatusSummary,
  Question,
  Report,
  RtOfficial,
  RtSchedule,
  User,
  UserReputation,
} from "../entities";

export class DemoSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    const existingCount = await em.count(Location);
    if (existingCount > 0) {
      console.log("[seed] Data lokasi sudah tersedia, melewati demo seeder.");
      return;
    }

    const pakRt = em.create(User, {
      phoneNumber: "6281200000001",
      fullName: "Pak Hendra (Ketua RT 05)",
      role: UserRole.PENGURUS_RT,
      isVerified: true,
    });

    const wargaTrusted = em.create(User, {
      phoneNumber: "6281200000002",
      fullName: "Siti Rahma",
      role: UserRole.WARGA,
      isVerified: true,
    });

    const wargaBiasa = em.create(User, {
      phoneNumber: "6281200000003",
      fullName: "Budi Santoso",
      role: UserRole.WARGA,
      isVerified: true,
    });

    em.create(UserReputation, {
      user: pakRt,
      totalReports: 12,
      matchedReports: 12,
      isTrustedReporter: true,
      voteWeight: 3,
    });

    em.create(UserReputation, {
      user: wargaTrusted,
      totalReports: 8,
      matchedReports: 7,
      isTrustedReporter: true,
      voteWeight: 2,
    });

    em.create(UserReputation, {
      user: wargaBiasa,
      totalReports: 2,
      matchedReports: 2,
      isTrustedReporter: false,
      voteWeight: 1,
    });

    const kelSukamaju = em.create(Location, {
      name: "Kelurahan Kebon Jeruk",
      category: LocationCategory.KELURAHAN,
      address: "Jl. Raya Kebon Jeruk No. 2, Jakarta Barat",
      latitude: -6.1924,
      longitude: 106.7695,
      openTime: "07:30:00",
      closeTime: "16:00:00",
      operationalDays: "Senin - Jumat",
    });

    const rt05 = em.create(Location, {
      name: "Sekretariat RT 05 / RW 03 Kebon Jeruk",
      category: LocationCategory.KANTOR_RT,
      address: "Gg. Melati No. 14, Kebon Jeruk, Jakarta Barat",
      latitude: -6.1909,
      longitude: 106.7681,
      openTime: "19:00:00",
      closeTime: "21:00:00",
      operationalDays: "Senin - Sabtu",
    });

    const puskesmas = em.create(Location, {
      name: "Puskesmas Kecamatan Kebon Jeruk",
      category: LocationCategory.PUSKESMAS,
      address: "Jl. Raya Perjuangan No. 11, Jakarta Barat",
      latitude: -6.1938,
      longitude: 106.7668,
      openTime: "07:30:00",
      closeTime: "16:00:00",
      operationalDays: "Senin - Sabtu",
    });

    const samsat = em.create(Location, {
      name: "Gerai Samsat Keliling Kebon Jeruk",
      category: LocationCategory.SAMSAT,
      address: "Halaman Kantor Kecamatan Kebon Jeruk",
      latitude: -6.1895,
      longitude: 106.7712,
      openTime: "08:00:00",
      closeTime: "14:00:00",
      operationalDays: "Senin - Jumat",
      isMobileUnit: true,
    });

    const twoHoursLater = new Date(Date.now() + 2 * 60 * 60 * 1000);

    em.create(LocationStatusSummary, {
      location: kelSukamaju,
      currentStatus: SummaryStatus.ANTRE,
      blankoStatus: BlankoState.ADA,
      queueEstimate: QueueBucket.B_5_15,
      officerStatus: OfficerState.DI_LOKET,
      networkStatus: NetworkState.NORMAL,
      confirmationCount: 2,
      expiresAt: twoHoursLater,
    });

    em.create(LocationStatusSummary, {
      location: rt05,
      currentStatus: SummaryStatus.BUKA,
      officerStatus: OfficerState.DI_LOKET,
      confirmationCount: 1,
      expiresAt: twoHoursLater,
    });

    em.create(LocationStatusSummary, {
      location: puskesmas,
      currentStatus: SummaryStatus.BUKA,
      queueEstimate: QueueBucket.LT_5,
      officerStatus: OfficerState.DI_LOKET,
      networkStatus: NetworkState.NORMAL,
      confirmationCount: 2,
      expiresAt: twoHoursLater,
    });

    em.create(LocationStatusSummary, {
      location: samsat,
      currentStatus: SummaryStatus.TUTUP,
      officerStatus: OfficerState.TIDAK_ADA,
      confirmationCount: 2,
      expiresAt: twoHoursLater,
    });

    em.create(RtOfficial, {
      user: pakRt,
      location: rt05,
      rtRwCode: "RT 05 / RW 03",
      isActive: true,
    });

    em.create(RtSchedule, {
      location: rt05,
      createdBy: pakRt,
      startTime: "19:00:00",
      endTime: "20:30:00",
      isAvailable: true,
      sourceChannel: ChannelSource.WA_BOT,
    });

    em.create(LocationRequirement, {
      location: kelSukamaju,
      serviceName: "Perekaman & Cetak e-KTP Baru / Rusak",
      checklistItems: [
        { label: "Fotokopi Kartu Keluarga (KK) terbaru", required: true },
        { label: "e-KTP lama asli (jika rusak) atau Surat Kehilangan Kepolisian", required: true },
        { label: "Pengantar RT/RW sudah tidak wajib untuk cetak ulang data sama", required: false },
      ],
      updatedBy: wargaTrusted,
    });

    em.create(LocationRequirement, {
      location: rt05,
      serviceName: "Surat Pengantar Domisili / SKTM",
      checklistItems: [
        { label: "KTP asli & fotokopi pemohon", required: true },
        { label: "Kartu Keluarga (KK) fotokopi", required: true },
      ],
      updatedBy: pakRt,
    });

    em.create(Report, {
      user: wargaTrusted,
      location: kelSukamaju,
      conditionType: ReportCondition.ANTRE,
      queueRange: QueueBucket.B_5_15,
      notes: "Blanko e-KTP masih aman, antrean sekitar 12 orang di loket.",
      sourceChannel: ChannelSource.WEB,
      validationStatus: ValidationState.CONFIRMED,
      weightScore: 2,
      expiresAt: twoHoursLater,
    });

    em.create(Report, {
      user: wargaBiasa,
      location: kelSukamaju,
      conditionType: ReportCondition.ANTRE,
      queueRange: QueueBucket.B_5_15,
      notes: "Loket dukcapil buka, sistem normal.",
      sourceChannel: ChannelSource.WA_BOT,
      validationStatus: ValidationState.CONFIRMED,
      weightScore: 1,
      expiresAt: twoHoursLater,
    });

    const q1 = em.create(Question, {
      location: rt05,
      user: wargaBiasa,
      questionText: "Pak RT malam ini bisa minta tanda tangan pengantar nikah jam 8?",
      isAnswered: true,
    });

    em.create(Answer, {
      question: q1,
      user: pakRt,
      answerText: "Bisa Mas Budi, saya di rumah dari jam 19.00 sampai 20.30 ya.",
      isOfficialRt: true,
    });

    await em.flush();
    console.log("[seed] Demo data berhasil dimasukkan.");
  }
}
