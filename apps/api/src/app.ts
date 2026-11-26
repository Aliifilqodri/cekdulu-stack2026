import express, { Express } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { getOrm, RequestContext } from "@cekdulu/db";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middlewares/error";
import { apiV1Router } from "./routes";

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

  // Isolasi EntityManager MikroORM per HTTP request
  app.use((_req, _res, next) => {
    RequestContext.create(getOrm().em, next);
  });

  app.get("/", (_req, res) => {
    res.json({
      name: "cekdulu-api",
      version: "0.1.0",
      docs: "/api/v1/health",
    });
  });

  app.use("/api/v1", apiV1Router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
