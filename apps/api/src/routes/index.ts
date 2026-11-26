import { Router } from "express";
import { authRouter } from "./auth.routes";
import { botRouter } from "./bot.routes";
import { healthRouter } from "./health.routes";
import { locationsRouter } from "./locations.routes";
import { notificationsRouter } from "./notifications.routes";
import { questionsRouter } from "./questions.routes";
import { reportsRouter } from "./reports.routes";
import { schedulesRouter } from "./schedules.routes";
import { watchlistRouter } from "./watchlist.routes";

export const apiV1Router = Router();

apiV1Router.use("/health", healthRouter);
apiV1Router.use("/auth", authRouter);
apiV1Router.use("/locations", locationsRouter);
apiV1Router.use("/reports", reportsRouter);
apiV1Router.use("/schedules", schedulesRouter);
apiV1Router.use("/questions", questionsRouter);
apiV1Router.use("/watchlist", watchlistRouter);
apiV1Router.use("/notifications", notificationsRouter);
apiV1Router.use("/bot", botRouter);
