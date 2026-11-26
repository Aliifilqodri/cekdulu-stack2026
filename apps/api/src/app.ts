import express, { Express } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import { getOrm, RequestContext } from "@cekdulu/db";
import { env, parseCorsOrigins } from "./config/env";
import { openApiSpec } from "./docs/openapi";
import { errorHandler, notFoundHandler } from "./middlewares/error";
import { apiV1Router } from "./routes";

export function createApp(): Express {
  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          "script-src": ["'self'", "'unsafe-inline'"],
          "style-src": ["'self'", "'unsafe-inline'"],
          "img-src": ["'self'", "data:", "https:"],
        },
      },
    }),
  );
  app.use(
    cors({
      origin: parseCorsOrigins(env.CORS_ORIGIN),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

  // Dokumentasi OpenAPI JSON & Swagger UI (tidak memerlukan MikroORM RequestContext)
  app.get("/api/docs.json", (_req, res) => {
    res.json(openApiSpec);
  });
  app.use(
    "/api/docs",
    swaggerUi.serve,
    swaggerUi.setup(openApiSpec, {
      customSiteTitle: "CekDulu API Docs",
      swaggerOptions: {
        persistAuthorization: true,
      },
    }),
  );

  // Isolasi EntityManager MikroORM per HTTP request
  app.use((_req, _res, next) => {
    RequestContext.create(getOrm().em, next);
  });

  app.get("/", (_req, res) => {
    res.json({
      name: "cekdulu-api",
      version: "0.1.0",
      health: "/api/v1/health",
      docs: "/api/docs",
      openApiJson: "/api/docs.json",
    });
  });

  app.use("/api/v1", apiV1Router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
