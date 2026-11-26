import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  MAX_OTP_ATTEMPTS,
  normalizePhoneNumber,
  OTP_TTL_SECONDS,
  UserRole,
} from "@cekdulu/shared";
import { AppError } from "../middlewares/error";
import { signAccessToken } from "../middlewares/auth";

export const OTP_COOLDOWN_SECONDS = 60;

export const requestOtpSchema = z.object({
  phoneNumber: z
    .string()
    .trim()
    .min(9, "Nomor WhatsApp minimal 9 digit")
    .max(20, "Nomor WhatsApp maksimal 20 karakter"),
});

export const verifyOtpSchema = z.object({
  phoneNumber: z.string().trim().min(9).max(20),
  otpCode: z.string().regex(/^\d{6}$/, "Kode OTP harus 6 digit angka"),
  fullName: z.string().trim().min(2).max(100).optional(),
});

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(100).nullable().optional(),
  waNotifEnabled: z.boolean().optional(),
});

export interface OtpRecord {
  id: string;
  phoneNumber: string;
  otpHash: string;
  attempts: number;
  expiresAt: Date;
  isUsed: boolean;
  createdAt: Date;
}

export interface ReputationRecord {
  totalReports: number;
  matchedReports: number;
  isTrustedReporter: boolean;
  voteWeight: number;
}

export interface AuthUserRecord {
  id: string;
  phoneNumber: string;
  fullName?: string | null;
  role: UserRole;
  isVerified: boolean;
  waNotifEnabled: boolean;
  reputation?: ReputationRecord | null;
}

export interface AuthPersistence {
  findUnusedOtps(phoneNumber: string): Promise<OtpRecord[]>;
  findLatestOtp(phoneNumber: string): Promise<OtpRecord | null>;
  createOtp(data: {
    phoneNumber: string;
    otpHash: string;
    attempts: number;
    expiresAt: Date;
    isUsed: boolean;
  }): OtpRecord;
  findUserByPhone(phoneNumber: string): Promise<AuthUserRecord | null>;
  createUserWithReputation(data: {
    phoneNumber: string;
    fullName: string | null;
    role: UserRole;
    isVerified: boolean;
    waNotifEnabled: boolean;
  }): Promise<AuthUserRecord>;
  ensureUserReputation(user: AuthUserRecord): ReputationRecord;
  flush(): Promise<void>;
}

export interface OtpRateLimiter {
  getRemainingSeconds(phoneNumber: string): Promise<number>;
  markSent(phoneNumber: string, cooldownSeconds: number): Promise<void>;
}

export interface WhatsAppGatewayAdapter {
  sendOtp(phoneNumber: string, otpCode: string): Promise<boolean>;
}

export function hashOtpSha256(otpCode: string): string {
  return crypto.createHash("sha256").update(otpCode, "utf8").digest("hex");
}

export async function verifyOtpHash(
  otpCode: string,
  storedHash: string,
): Promise<boolean> {
  // Kompatibilitas mundur apabila ada record lama berformat bcrypt
  if (storedHash.startsWith("$2")) {
    return bcrypt.compare(otpCode, storedHash);
  }
  const candidateHash = hashOtpSha256(otpCode);
  const a = Buffer.from(candidateHash, "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length === 0 || a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

export class AuthOtpService {
  constructor(
    private readonly persistence: AuthPersistence,
    private readonly whatsapp: WhatsAppGatewayAdapter,
    private readonly rateLimiter?: OtpRateLimiter,
    private readonly nowProvider: () => Date = () => new Date(),
  ) {}

  async requestOtp(rawPhoneNumber: string): Promise<{
    phoneNumber: string;
    expiresInSeconds: number;
    otpCode: string;
  }> {
    const phoneNumber = normalizePhoneNumber(rawPhoneNumber);
    if (phoneNumber.length < 10 || phoneNumber.length > 16) {
      throw new AppError(400, "INVALID_PHONE", "Format nomor WhatsApp tidak valid");
    }

    const now = this.nowProvider();

    if (this.rateLimiter) {
      const remaining = await this.rateLimiter.getRemainingSeconds(phoneNumber);
      if (remaining > 0) {
        throw new AppError(
          429,
          "OTP_RATE_LIMITED",
          `Tunggu ${remaining} detik sebelum meminta kode OTP baru`,
          { retryAfterSeconds: remaining },
        );
      }
    }

    // Fallback cooldown berbasis PostgreSQL agar tetap aktif walau Redis offline
    const latestOtp = await this.persistence.findLatestOtp(phoneNumber);
    if (latestOtp) {
      const elapsedSec = Math.floor(
        (now.getTime() - latestOtp.createdAt.getTime()) / 1000,
      );
      if (elapsedSec >= 0 && elapsedSec < OTP_COOLDOWN_SECONDS) {
        const retryAfterSeconds = OTP_COOLDOWN_SECONDS - elapsedSec;
        throw new AppError(
          429,
          "OTP_RATE_LIMITED",
          `Tunggu ${retryAfterSeconds} detik sebelum meminta kode OTP baru`,
          { retryAfterSeconds },
        );
      }
    }

    // Hanguskan seluruh OTP lama yang belum dipakai untuk nomor ini
    const previousOtps = await this.persistence.findUnusedOtps(phoneNumber);
    for (const old of previousOtps) {
      old.isUsed = true;
    }

    const otpCode = crypto.randomInt(100000, 1000000).toString();
    const otpHash = hashOtpSha256(otpCode);
    const expiresAt = new Date(now.getTime() + OTP_TTL_SECONDS * 1000);

    this.persistence.createOtp({
      phoneNumber,
      otpHash,
      attempts: 0,
      expiresAt,
      isUsed: false,
    });

    await this.persistence.flush();

    if (this.rateLimiter) {
      await this.rateLimiter.markSent(phoneNumber, OTP_COOLDOWN_SECONDS);
    }

    await this.whatsapp.sendOtp(phoneNumber, otpCode);

    return {
      phoneNumber,
      expiresInSeconds: OTP_TTL_SECONDS,
      otpCode,
    };
  }

  async verifyOtp(input: {
    phoneNumber: string;
    otpCode: string;
    fullName?: string;
  }) {
    const phoneNumber = normalizePhoneNumber(input.phoneNumber);
    const now = this.nowProvider();

    const unusedOtps = await this.persistence.findUnusedOtps(phoneNumber);
    const activeOtp = unusedOtps
      .filter((o) => o.expiresAt.getTime() > now.getTime())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    if (!activeOtp) {
      const hasExpired = unusedOtps.some(
        (o) => o.expiresAt.getTime() <= now.getTime(),
      );
      throw new AppError(
        400,
        hasExpired ? "OTP_EXPIRED" : "OTP_INVALID_OR_EXPIRED",
        hasExpired
          ? "Kode OTP sudah kedaluwarsa. Silakan minta kode baru."
          : "Kode OTP tidak ditemukan atau sudah digunakan.",
      );
    }

    if (activeOtp.attempts >= MAX_OTP_ATTEMPTS) {
      activeOtp.isUsed = true;
      await this.persistence.flush();
      throw new AppError(
        429,
        "OTP_MAX_ATTEMPTS",
        "Batas percobaan OTP habis. Silakan minta kode baru.",
      );
    }

    const isMatch = await verifyOtpHash(input.otpCode, activeOtp.otpHash);
    if (!isMatch) {
      activeOtp.attempts = Math.min(MAX_OTP_ATTEMPTS, activeOtp.attempts + 1);
      const exhausted = activeOtp.attempts >= MAX_OTP_ATTEMPTS;
      if (exhausted) {
        activeOtp.isUsed = true;
      }
      await this.persistence.flush();

      if (exhausted) {
        throw new AppError(
          429,
          "OTP_MAX_ATTEMPTS",
          "Kode OTP salah 5 kali dan otomatis hangus. Silakan minta kode baru.",
          { remainingAttempts: 0, invalidated: true },
        );
      }

      throw new AppError(400, "OTP_MISMATCH", "Kode OTP salah", {
        remainingAttempts: Math.max(0, MAX_OTP_ATTEMPTS - activeOtp.attempts),
      });
    }

    activeOtp.isUsed = true;

    // 1 nomor = 1 akun
    let user = await this.persistence.findUserByPhone(phoneNumber);
    if (!user) {
      user = await this.persistence.createUserWithReputation({
        phoneNumber,
        fullName: input.fullName ?? null,
        role: UserRole.WARGA,
        isVerified: true,
        waNotifEnabled: true,
      });
    } else {
      user.isVerified = true;
      if (input.fullName && !user.fullName) {
        user.fullName = input.fullName;
      }
      if (!user.reputation) {
        user.reputation = this.persistence.ensureUserReputation(user);
      }
    }

    await this.persistence.flush();

    const token = signAccessToken({
      id: user.id,
      phoneNumber: user.phoneNumber,
      role: user.role,
    });

    return {
      token,
      user: {
        id: user.id,
        phoneNumber: user.phoneNumber,
        fullName: user.fullName ?? null,
        role: user.role,
        isVerified: user.isVerified,
        waNotifEnabled: user.waNotifEnabled,
        reputation: user.reputation
          ? {
              totalReports: user.reputation.totalReports,
              matchedReports: user.reputation.matchedReports,
              isTrustedReporter: user.reputation.isTrustedReporter,
              voteWeight: user.reputation.voteWeight,
            }
          : null,
      },
    };
  }
}
