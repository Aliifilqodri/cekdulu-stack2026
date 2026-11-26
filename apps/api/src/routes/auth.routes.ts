import crypto from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  getOrm,
  OtpVerification,
  RtOfficial,
  User,
  UserReputation,
} from "@cekdulu/db";
import {
  MAX_OTP_ATTEMPTS,
  normalizePhoneNumber,
  OTP_TTL_SECONDS,
  UserRole,
} from "@cekdulu/shared";
import { env } from "../config/env";
import { getRedis, REDIS_KEYS } from "../lib/redis";
import { dispatchWhatsAppMessage } from "../lib/whatsapp";
import { requireAuth, signAccessToken } from "../middlewares/auth";
import { AppError, asyncHandler } from "../middlewares/error";
import { validateBody } from "../middlewares/validate";

export const authRouter = Router();

const requestOtpSchema = z.object({
  phoneNumber: z
    .string()
    .min(9, "Nomor WhatsApp minimal 9 digit")
    .max(20, "Nomor WhatsApp maksimal 20 karakter"),
});

const verifyOtpSchema = z.object({
  phoneNumber: z.string().min(9).max(20),
  otpCode: z.string().regex(/^\d{6}$/, "Kode OTP harus 6 digit angka"),
  fullName: z.string().trim().min(2).max(100).optional(),
});

const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(100).nullable().optional(),
  waNotifEnabled: z.boolean().optional(),
});

authRouter.post(
  "/otp/request",
  validateBody(requestOtpSchema),
  asyncHandler(async (req, res) => {
    const phoneNumber = normalizePhoneNumber(req.body.phoneNumber);
    if (phoneNumber.length < 10 || phoneNumber.length > 16) {
      throw new AppError(400, "INVALID_PHONE", "Format nomor WhatsApp tidak valid");
    }

    const redis = getRedis();
    if (redis) {
      const rlKey = REDIS_KEYS.otpRateLimit(phoneNumber);
      const ttl = await redis.ttl(rlKey);
      if (ttl > 0) {
        throw new AppError(
          429,
          "OTP_RATE_LIMITED",
          `Tunggu ${ttl} detik sebelum meminta kode OTP baru`,
          { retryAfterSeconds: ttl },
        );
      }
      await redis.set(rlKey, "1", "EX", 60);
    }

    const em = getOrm().em;

    // Nonaktifkan OTP lama yang belum dipakai untuk nomor ini
    const previousOtps = await em.find(OtpVerification, {
      phoneNumber,
      isUsed: false,
    });
    for (const old of previousOtps) {
      old.isUsed = true;
    }

    const otpCode = crypto.randomInt(100000, 1000000).toString();
    const otpHash = await bcrypt.hash(otpCode, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);

    em.create(OtpVerification, {
      phoneNumber,
      otpHash,
      attempts: 0,
      expiresAt,
      isUsed: false,
    });

    await em.flush();

    await dispatchWhatsAppMessage({
      toPhoneNumber: phoneNumber,
      text: `Kode verifikasi *cekdulu* kamu adalah *${otpCode}*. Berlaku 5 menit. Jangan berikan kode ini kepada siapa pun.`,
      category: "otp",
    });

    res.status(200).json({
      success: true,
      data: {
        phoneNumber,
        expiresInSeconds: OTP_TTL_SECONDS,
        ...(env.NODE_ENV !== "production" ? { devOtp: otpCode } : {}),
      },
    });
  }),
);

authRouter.post(
  "/otp/verify",
  validateBody(verifyOtpSchema),
  asyncHandler(async (req, res) => {
    const phoneNumber = normalizePhoneNumber(req.body.phoneNumber);
    const { otpCode, fullName } = req.body as z.infer<typeof verifyOtpSchema>;
    const em = getOrm().em;
    const now = new Date();

    const otpRecord = await em.findOne(
      OtpVerification,
      {
        phoneNumber,
        isUsed: false,
        expiresAt: { $gt: now },
      },
      { orderBy: { createdAt: "DESC" } },
    );

    if (!otpRecord) {
      throw new AppError(
        400,
        "OTP_INVALID_OR_EXPIRED",
        "Kode OTP tidak ditemukan atau sudah kedaluwarsa",
      );
    }

    if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
      otpRecord.isUsed = true;
      await em.flush();
      throw new AppError(
        429,
        "OTP_MAX_ATTEMPTS",
        "Batas percobaan OTP habis. Silakan minta kode baru.",
      );
    }

    const isMatch = await bcrypt.compare(otpCode, otpRecord.otpHash);
    if (!isMatch) {
      otpRecord.attempts = Math.min(MAX_OTP_ATTEMPTS, otpRecord.attempts + 1);
      if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
        otpRecord.isUsed = true;
      }
      await em.flush();
      throw new AppError(400, "OTP_MISMATCH", "Kode OTP salah", {
        remainingAttempts: Math.max(0, MAX_OTP_ATTEMPTS - otpRecord.attempts),
      });
    }

    otpRecord.isUsed = true;

    // Sistem 1 nomor = 1 akun
    let user = await em.findOne(
      User,
      { phoneNumber },
      { populate: ["reputation"] },
    );

    if (!user) {
      user = em.create(User, {
        phoneNumber,
        fullName: fullName ?? null,
        role: UserRole.WARGA,
        isVerified: true,
        waNotifEnabled: true,
      });
      em.create(UserReputation, { user });
    } else {
      user.isVerified = true;
      if (fullName && !user.fullName) {
        user.fullName = fullName;
      }
      if (!user.reputation) {
        em.create(UserReputation, { user });
      }
    }

    await em.flush();

    const token = signAccessToken({
      id: user.id,
      phoneNumber: user.phoneNumber,
      role: user.role,
    });

    const reputation = await em.findOne(UserReputation, { user: user.id });

    res.status(200).json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          phoneNumber: user.phoneNumber,
          fullName: user.fullName ?? null,
          role: user.role,
          isVerified: user.isVerified,
          waNotifEnabled: user.waNotifEnabled,
          reputation: reputation
            ? {
                totalReports: reputation.totalReports,
                matchedReports: reputation.matchedReports,
                isTrustedReporter: reputation.isTrustedReporter,
                voteWeight: reputation.voteWeight,
              }
            : null,
        },
      },
    });
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const em = getOrm().em;
    const user = await em.findOne(
      User,
      { id: req.user!.id },
      { populate: ["reputation"] },
    );

    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "Pengguna tidak ditemukan");
    }

    const officialLocations = await em.find(
      RtOfficial,
      { user: user.id, isActive: true },
      { populate: ["location"] },
    );

    res.json({
      success: true,
      data: {
        id: user.id,
        phoneNumber: user.phoneNumber,
        fullName: user.fullName ?? null,
        role: user.role,
        isVerified: user.isVerified,
        waNotifEnabled: user.waNotifEnabled,
        createdAt: user.createdAt,
        reputation: user.reputation
          ? {
              totalReports: user.reputation.totalReports,
              matchedReports: user.reputation.matchedReports,
              isTrustedReporter: user.reputation.isTrustedReporter,
              voteWeight: user.reputation.voteWeight,
            }
          : null,
        rtOfficialAssignments: officialLocations.map((o) => ({
          id: o.id,
          rtRwCode: o.rtRwCode,
          locationId: o.location.id,
          locationName: o.location.name,
        })),
      },
    });
  }),
);

authRouter.patch(
  "/me",
  requireAuth,
  validateBody(updateProfileSchema),
  asyncHandler(async (req, res) => {
    const em = getOrm().em;
    const user = await em.findOneOrFail(User, { id: req.user!.id });
    const body = req.body as z.infer<typeof updateProfileSchema>;

    if (body.fullName !== undefined) {
      user.fullName = body.fullName;
    }
    if (body.waNotifEnabled !== undefined) {
      user.waNotifEnabled = body.waNotifEnabled;
    }

    await em.flush();

    res.json({
      success: true,
      data: {
        id: user.id,
        phoneNumber: user.phoneNumber,
        fullName: user.fullName ?? null,
        role: user.role,
        waNotifEnabled: user.waNotifEnabled,
      },
    });
  }),
);
