import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, it } from "node:test";
import jwt from "jsonwebtoken";
import { OTP_TTL_SECONDS, UserRole } from "@cekdulu/shared";
import { env } from "../src/config/env";
import { AppError } from "../src/middlewares/error";
import {
  AuthOtpService,
  AuthPersistence,
  AuthUserRecord,
  hashOtpSha256,
  OtpRecord,
  requestOtpSchema,
  verifyOtpSchema,
  WhatsAppGatewayAdapter,
} from "../src/services/auth.service";

function createInMemoryAuthFixture(initialTimeMs = Date.UTC(2026, 10, 26, 10, 0, 0)) {
  let currentTimeMs = initialTimeMs;
  const otps: OtpRecord[] = [];
  const users = new Map<string, AuthUserRecord>();
  const sentMessages: Array<{ phoneNumber: string; otpCode: string }> = [];

  const persistence: AuthPersistence = {
    async findUnusedOtps(phoneNumber) {
      return otps.filter((o) => o.phoneNumber === phoneNumber && !o.isUsed);
    },
    async findLatestOtp(phoneNumber) {
      const list = otps
        .filter((o) => o.phoneNumber === phoneNumber)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return list[0] ?? null;
    },
    createOtp(data) {
      const record: OtpRecord = {
        id: crypto.randomUUID(),
        phoneNumber: data.phoneNumber,
        otpHash: data.otpHash,
        attempts: data.attempts,
        expiresAt: data.expiresAt,
        isUsed: data.isUsed,
        createdAt: new Date(currentTimeMs),
      };
      otps.push(record);
      return record;
    },
    async findUserByPhone(phoneNumber) {
      return users.get(phoneNumber) ?? null;
    },
    async createUserWithReputation(data) {
      const user: AuthUserRecord = {
        id: crypto.randomUUID(),
        phoneNumber: data.phoneNumber,
        fullName: data.fullName,
        role: data.role,
        isVerified: data.isVerified,
        waNotifEnabled: data.waNotifEnabled,
        reputation: {
          totalReports: 0,
          matchedReports: 0,
          isTrustedReporter: false,
          voteWeight: 1,
        },
      };
      users.set(data.phoneNumber, user);
      return user;
    },
    ensureUserReputation(user) {
      const rep = {
        totalReports: 0,
        matchedReports: 0,
        isTrustedReporter: false,
        voteWeight: 1,
      };
      user.reputation = rep;
      return rep;
    },
    async flush() {},
  };

  const whatsapp: WhatsAppGatewayAdapter = {
    async sendOtp(phoneNumber, otpCode) {
      sentMessages.push({ phoneNumber, otpCode });
      return true;
    },
  };

  const service = new AuthOtpService(
    persistence,
    whatsapp,
    undefined,
    () => new Date(currentTimeMs),
  );

  return {
    service,
    otps,
    users,
    sentMessages,
    advanceSeconds(sec: number) {
      currentTimeMs += sec * 1000;
    },
  };
}

describe("WhatsApp OTP Auth Module", () => {
  it("validasi Zod menolak nomor telepon pendek dan OTP non-6 digit", () => {
    assert.equal(requestOtpSchema.safeParse({ phoneNumber: "08123" }).success, false);
    assert.equal(requestOtpSchema.safeParse({ phoneNumber: "081234567890" }).success, true);

    assert.equal(
      verifyOtpSchema.safeParse({ phoneNumber: "081234567890", otpCode: "12345" }).success,
      false,
    );
    assert.equal(
      verifyOtpSchema.safeParse({ phoneNumber: "081234567890", otpCode: "abcdef" }).success,
      false,
    );
    assert.equal(
      verifyOtpSchema.safeParse({ phoneNumber: "081234567890", otpCode: "012345" }).success,
      true,
    );
  });

  it("skenario OTP valid: simpan hash SHA-256, buat 1 akun + reputasi, kembalikan JWT", async () => {
    const fx = createInMemoryAuthFixture();

    const reqRes = await fx.service.requestOtp("0812-3456-7890");
    assert.equal(reqRes.phoneNumber, "6281234567890");
    assert.equal(reqRes.expiresInSeconds, OTP_TTL_SECONDS);
    assert.equal(fx.sentMessages.length, 1);
    assert.match(fx.sentMessages[0].otpCode, /^\d{6}$/);

    // Pastikan yang tersimpan adalah SHA-256 hex (64 karakter), bukan kode mentah
    assert.equal(fx.otps.length, 1);
    assert.equal(fx.otps[0].otpHash, hashOtpSha256(reqRes.otpCode));
    assert.notEqual(fx.otps[0].otpHash, reqRes.otpCode);

    // Terapkan cooldown jika langsung minta lagi sebelum 60 detik
    await assert.rejects(
      () => fx.service.requestOtp("081234567890"),
      (err: unknown) =>
        err instanceof AppError &&
        err.statusCode === 429 &&
        err.code === "OTP_RATE_LIMITED",
    );

    const verifyRes = await fx.service.verifyOtp({
      phoneNumber: "+62 812 3456 7890",
      otpCode: reqRes.otpCode,
      fullName: "Warga Satu",
    });

    assert.equal(fx.otps[0].isUsed, true);
    assert.equal(verifyRes.user.phoneNumber, "6281234567890");
    assert.equal(verifyRes.user.role, UserRole.WARGA);
    assert.equal(verifyRes.user.isVerified, true);
    assert.deepEqual(verifyRes.user.reputation, {
      totalReports: 0,
      matchedReports: 0,
      isTrustedReporter: false,
      voteWeight: 1,
    });

    const decoded = jwt.verify(verifyRes.token, env.JWT_SECRET) as {
      sub: string;
      phone: string;
      role: string;
    };
    assert.equal(decoded.sub, verifyRes.user.id);
    assert.equal(decoded.phone, "6281234567890");

    // Login ulang setelah cooldown selesai tetap menggunakan akun yang sama (1 nomor = 1 akun)
    fx.advanceSeconds(61);
    const secondReq = await fx.service.requestOtp("081234567890");
    const secondVerify = await fx.service.verifyOtp({
      phoneNumber: "6281234567890",
      otpCode: secondReq.otpCode,
    });
    assert.equal(secondVerify.user.id, verifyRes.user.id);
    assert.equal(fx.users.size, 1);
  });

  it("skenario OTP expired: gagal setelah melewati 5 menit", async () => {
    const fx = createInMemoryAuthFixture();
    const reqRes = await fx.service.requestOtp("081299998888");

    // Majukan waktu melewati 5 menit (301 detik)
    fx.advanceSeconds(301);

    await assert.rejects(
      () =>
        fx.service.verifyOtp({
          phoneNumber: "081299998888",
          otpCode: reqRes.otpCode,
        }),
      (err: unknown) =>
        err instanceof AppError &&
        err.statusCode === 400 &&
        err.code === "OTP_EXPIRED",
    );
    assert.equal(fx.users.size, 0);
  });

  it("skenario OTP salah >= 5 kali: increment attempts dan hanguskan OTP otomatis (isUsed = true)", async () => {
    const fx = createInMemoryAuthFixture();
    const reqRes = await fx.service.requestOtp("081377776666");
    const wrongOtp = reqRes.otpCode === "000000" ? "999999" : "000000";

    // Percobaan salah ke-1 hingga ke-4
    for (let attempt = 1; attempt <= 4; attempt++) {
      await assert.rejects(
        () =>
          fx.service.verifyOtp({
            phoneNumber: "081377776666",
            otpCode: wrongOtp,
          }),
        (err: unknown) =>
          err instanceof AppError &&
          err.statusCode === 400 &&
          err.code === "OTP_MISMATCH",
      );
      assert.equal(fx.otps[0].attempts, attempt);
      assert.equal(fx.otps[0].isUsed, false);
    }

    // Percobaan salah ke-5 -> hangus otomatis
    await assert.rejects(
      () =>
        fx.service.verifyOtp({
          phoneNumber: "081377776666",
          otpCode: wrongOtp,
        }),
      (err: unknown) =>
        err instanceof AppError &&
        err.statusCode === 429 &&
        err.code === "OTP_MAX_ATTEMPTS",
    );
    assert.equal(fx.otps[0].attempts, 5);
    assert.equal(fx.otps[0].isUsed, true);

    // Meski selanjutnya memasukkan OTP yang benar, tetap ditolak karena sudah hangus
    await assert.rejects(
      () =>
        fx.service.verifyOtp({
          phoneNumber: "081377776666",
          otpCode: reqRes.otpCode,
        }),
      (err: unknown) =>
        err instanceof AppError &&
        err.statusCode === 400 &&
        err.code === "OTP_INVALID_OR_EXPIRED",
    );
  });
});
