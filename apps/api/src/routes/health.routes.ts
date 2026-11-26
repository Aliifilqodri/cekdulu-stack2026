import { Router } from "express";
import { getOrm } from "@cekdulu/db";
import { getRedis } from "../lib/redis";
import { asyncHandler } from "../middlewares/error";

export const healthRouter = Router();

healthRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    let dbConnected = false;
    try {
      await getOrm().em.getConnection().execute("SELECT 1");
      dbConnected = true;
    } catch {
      dbConnected = false;
    }

    const redisConnected = getRedis() !== null;

    res.status(dbConnected ? 200 : 503).json({
      success: dbConnected,
      data: {
        service: "cekdulu-api",
        status: dbConnected ? "ok" : "degraded",
        postgres: dbConnected ? "connected" : "disconnected",
        redis: redisConnected ? "connected" : "fallback_mode",
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      },
    });
  }),
);
