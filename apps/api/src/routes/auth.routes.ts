import { Router } from "express";
import { EntityManager } from "@mikro-orm/postgresql";
import { z } from "zod";
import {
  getOrm,
  OtpVerification,
  RtOfficial,
  User,
  UserReputation,
} from "@cekdulu/db";
import { env } from "../config/env";
import { getRedis, REDIS_KEYS } from "../lib/redis";
import { dispatchWhatsAppMessage } from "../lib/whatsapp";
import { requireAuth } from "../middlewares/auth";
import { AppError, asyncHandler } from "../middlewares/error";
import { validateBody } from "../middlewares/validate";
import {
  AuthOtpService,
  AuthPersistence,
  AuthUserRecord,
  OtpRateLimiter,
  requestOtpSchema,
  updateProfileSchema,
  verifyOtpSchema,
  WhatsAppGatewayAdapter,
} from "../services/auth.service";

export const authRouter = Router();

function createMikroOrmAuthService(em: EntityManager): AuthOtpService {
  const persistence: AuthPersistence = {
    findUnusedOtps(phoneNumber) {
      return em.find(
        OtpVerification,
        { phoneNumber, isUsed: false },
        { orderBy: { createdAt: "DESC" } },
      );
    },
    findLatestOtp(phoneNumber) {
      return em.findOne(
        OtpVerification,
        { phoneNumber },
        { orderBy: { createdAt: "DESC" } },
      );
    },
    createOtp(data) {
      return em.create(OtpVerification, data);
    },
    findUserByPhone(phoneNumber) {
      return em.findOne(
        User,
        { phoneNumber },
        { populate: ["reputation"] },
      );
    },
    async createUserWithReputation(data) {
      const user = em.create(User, data);
      const reputation = em.create(UserReputation, { user });
      user.reputation = reputation;
      return user;
    },
    ensureUserReputation(user: AuthUserRecord) {
      return em.create(UserReputation, { user: user as User });
    },
    flush() {
      return em.flush();
    },
  };

  const whatsappAdapter: WhatsAppGatewayAdapter = {
    sendOtp(phoneNumber, otpCode) {
      return dispatchWhatsAppMessage({
        toPhoneNumber: phoneNumber,
        text: `Kode verifikasi *cekdulu* kamu adalah *${otpCode}*. Berlaku 5 menit. Jangan berikan kode ini kepada siapa pun.`,
        category: "otp",
      });
    },
  };

  const rateLimiter: OtpRateLimiter = {
    async getRemainingSeconds(phoneNumber) {
      const redis = getRedis();
      if (!redis) return 0;
      const ttl = await redis.ttl(REDIS_KEYS.otpRateLimit(phoneNumber));
      return ttl > 0 ? ttl : 0;
    },
    async markSent(phoneNumber, cooldownSeconds) {
      const redis = getRedis();
      if (!redis) return;
      await redis.set(
        REDIS_KEYS.otpRateLimit(phoneNumber),
        "1",
        "EX",
        cooldownSeconds,
      );
    },
  };

  return new AuthOtpService(persistence, whatsappAdapter, rateLimiter);
}

authRouter.post(
  "/otp/request",
  validateBody(requestOtpSchema),
  asyncHandler(async (req, res) => {
    const authService = createMikroOrmAuthService(getOrm().em);
    const result = await authService.requestOtp(req.body.phoneNumber);

    res.status(200).json({
      success: true,
      data: {
        phoneNumber: result.phoneNumber,
        expiresInSeconds: result.expiresInSeconds,
        ...(env.NODE_ENV !== "production" ? { devOtp: result.otpCode } : {}),
      },
    });
  }),
);

authRouter.post(
  "/otp/verify",
  validateBody(verifyOtpSchema),
  asyncHandler(async (req, res) => {
    const authService = createMikroOrmAuthService(getOrm().em);
    const body = req.body as z.infer<typeof verifyOtpSchema>;
    const result = await authService.verifyOtp(body);

    res.status(200).json({
      success: true,
      data: result,
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
