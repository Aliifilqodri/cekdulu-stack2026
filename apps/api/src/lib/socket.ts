import { Server as HttpServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

let io: SocketIOServer | null = null;

export function initSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()),
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    // Default join ke feed peta global untuk marker dinamis
    socket.join("map:global");

    socket.on("subscribe:location", (locationId: string) => {
      if (typeof locationId === "string" && locationId.length > 0) {
        socket.join(`location:${locationId}`);
      }
    });

    socket.on("unsubscribe:location", (locationId: string) => {
      if (typeof locationId === "string" && locationId.length > 0) {
        socket.leave(`location:${locationId}`);
      }
    });

    socket.on("subscribe:user", (token: string) => {
      try {
        const decoded = jwt.verify(token, env.JWT_SECRET) as { sub?: string };
        if (decoded?.sub) {
          socket.join(`user:${decoded.sub}`);
        }
      } catch {
        socket.emit("auth:error", { message: "Token tidak valid" });
      }
    });
  });

  return io;
}

export function getIO(): SocketIOServer | null {
  return io;
}

export function emitLocationStatusUpdate(
  locationId: string,
  summaryPayload: unknown,
): void {
  if (!io) return;
  const eventPayload = {
    locationId,
    summary: summaryPayload,
  };
  io.to("map:global").emit("location:status_updated", eventPayload);
  io.to(`location:${locationId}`).emit("location:status_updated", eventPayload);
  io.to(`location:${locationId}`).emit("location:detail_updated", eventPayload);
}

export function emitLocationEvent(
  locationId: string,
  eventName: string,
  payload: unknown,
): void {
  if (!io) return;
  io.to(`location:${locationId}`).emit(eventName, payload);
  if (eventName === "schedule:updated") {
    io.to("map:global").emit("location:schedule_updated", {
      locationId,
      schedule: payload,
    });
  }
}

export function emitUserNotification(userId: string, notification: unknown): void {
  if (!io) return;
  io.to(`user:${userId}`).emit("notification:new", notification);
}
