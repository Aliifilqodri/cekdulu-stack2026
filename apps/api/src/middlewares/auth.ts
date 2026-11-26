import { NextFunction, Request, Response, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { getOrm, User, UserReputation } from "@cekdulu/db";
import { ChannelSource, normalizePhoneNumber, UserRole } from "@cekdulu/shared";
import { env } from "../config/env";
import { AppError } from "./error";

export interface AuthUser {
  id: string;
  phoneNumber: string;
  role: UserRole;
  sourceChannel: ChannelSource;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signAccessToken(user: {
  id: string;
  phoneNumber: string;
  role: UserRole;
}): string {
  return jwt.sign(
    {
      sub: user.id,
      phone: user.phoneNumber,
      role: user.role,
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] },
  );
}

async function resolveUserFromRequest(req: Request): Promise<AuthUser | null> {
  // 1. Integrasi internal WhatsApp Bot (x-bot-api-key + x-user-phone)
  const botKey = req.header("x-bot-api-key");
  const botPhone = req.header("x-user-phone");

  if (botKey && botKey === env.BOT_API_KEY && botPhone) {
    const normalizedPhone = normalizePhoneNumber(botPhone);
    const em = getOrm().em;
    let user = await em.findOne(User, { phoneNumber: normalizedPhone });

    if (!user) {
      user = em.create(User, {
        phoneNumber: normalizedPhone,
        role: UserRole.WARGA,
        isVerified: true, // Pengirim langsung dari nomor WA terverifikasi otomatis
      });
      em.create(UserReputation, { user });
      await em.flush();
    } else if (!user.isVerified) {
      user.isVerified = true;
      await em.flush();
    }

    return {
      id: user.id,
      phoneNumber: user.phoneNumber,
      role: user.role,
      sourceChannel: ChannelSource.WA_BOT,
    };
  }

  // 2. Bearer JWT untuk pengguna Web
  const authHeader = req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as {
      sub: string;
      phone: string;
      role: UserRole;
    };

    return {
      id: payload.sub,
      phoneNumber: payload.phone,
      role: payload.role,
      sourceChannel: ChannelSource.WEB,
    };
  } catch {
    throw new AppError(401, "INVALID_TOKEN", "Sesi login tidak valid atau sudah kedaluwarsa");
  }
}

export const requireAuth: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const user = await resolveUserFromRequest(req);
    if (!user) {
      throw new AppError(401, "UNAUTHORIZED", "Silakan login terlebih dahulu");
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

export const optionalAuth: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const user = await resolveUserFromRequest(req);
    if (user) {
      req.user = user;
    }
    next();
  } catch {
    next();
  }
};

export function requireRole(...allowedRoles: UserRole[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new AppError(401, "UNAUTHORIZED", "Silakan login terlebih dahulu"));
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      next(
        new AppError(
          403,
          "FORBIDDEN",
          "Anda tidak memiliki akses untuk melakukan aksi ini",
        ),
      );
      return;
    }
    next();
  };
}
