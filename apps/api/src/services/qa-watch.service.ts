import { EntityManager } from "@mikro-orm/postgresql";
import {
  Answer,
  Location,
  Question,
  RtOfficial,
  User,
  WatchedLocation,
} from "@cekdulu/db";
import { ChannelSource, NotifType, UserRole } from "@cekdulu/shared";
import { emitLocationEvent } from "../lib/socket";
import { AppError } from "../middlewares/error";
import { createAndDispatchNotification } from "./notification.service";

export interface BusyHourBucket {
  hour: number;
  label: string;
  reportCount: number;
  queueCount: number;
  avgQueueScore: number;
}

export async function fetchLocationBusyHours(
  em: EntityManager,
  locationId: string,
): Promise<BusyHourBucket[]> {
  const rows = await em.getConnection().execute<
    Array<{
      hour: number;
      report_count: number;
      queue_count: number;
      avg_queue_score: number | null;
    }>
  >(
    `SELECT
       EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Jakarta')::int AS hour,
       COUNT(*)::int AS report_count,
       SUM(CASE WHEN condition_type = 'antre' THEN 1 ELSE 0 END)::int AS queue_count,
       ROUND(AVG(
         CASE queue_range
           WHEN '< 5' THEN 3
           WHEN '5-15' THEN 10
           WHEN '15-30' THEN 22
           WHEN '> 30' THEN 35
           ELSE 0
         END
       ), 1)::float AS avg_queue_score
     FROM reports
     WHERE location_id = ?
       AND is_hidden = FALSE
       AND created_at >= NOW() - INTERVAL '28 days'
     GROUP BY EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Jakarta')
     ORDER BY hour ASC`,
    [locationId],
  );

  return rows.map((row) => ({
    hour: Number(row.hour),
    label: `${String(row.hour).padStart(2, "0")}:00`,
    reportCount: Number(row.report_count),
    queueCount: Number(row.queue_count),
    avgQueueScore: Number(row.avg_queue_score ?? 0),
  }));
}

export async function createLocationQuestion(
  em: EntityManager,
  input: {
    locationId: string;
    userId: string;
    questionText: string;
    sourceChannel: ChannelSource;
  },
) {
  const [location, user] = await Promise.all([
    em.findOne(Location, { id: input.locationId }),
    em.findOneOrFail(User, { id: input.userId }),
  ]);

  if (!location) {
    throw new AppError(404, "LOCATION_NOT_FOUND", "Lokasi tidak ditemukan");
  }

  const question = em.create(Question, {
    location,
    user,
    questionText: input.questionText,
    isAnswered: false,
  });

  await em.flush();

  const payload = {
    id: question.id,
    locationId: location.id,
    questionText: question.questionText,
    isAnswered: question.isAnswered,
    sourceChannel: input.sourceChannel,
    createdAt: question.createdAt,
    askedBy: user.fullName ?? "Warga",
  };

  emitLocationEvent(location.id, "question:created", payload);
  return payload;
}

export async function createQuestionAnswer(
  em: EntityManager,
  input: {
    questionId: string;
    userId: string;
    answerText: string;
    sourceChannel: ChannelSource;
  },
) {
  const [question, answerer] = await Promise.all([
    em.findOne(
      Question,
      { id: input.questionId },
      { populate: ["location", "user"] },
    ),
    em.findOneOrFail(User, { id: input.userId }),
  ]);

  if (!question) {
    throw new AppError(404, "QUESTION_NOT_FOUND", "Pertanyaan tidak ditemukan");
  }

  const officialAssignment = await em.findOne(RtOfficial, {
    user: answerer.id,
    location: question.location.id,
    isActive: true,
  });

  const isOfficialRt =
    officialAssignment !== null || answerer.role === UserRole.ADMIN;

  const answer = em.create(Answer, {
    question,
    user: answerer,
    answerText: input.answerText,
    isOfficialRt,
  });

  question.isAnswered = true;

  if (question.user.id !== answerer.id) {
    await createAndDispatchNotification(em, {
      user: question.user,
      type: NotifType.QUESTION_ANSWERED,
      title: `Pertanyaanmu di ${question.location.name} Dijawab`,
      body: `${answerer.fullName ?? (isOfficialRt ? "Pengurus RT" : "Warga")}: "${input.answerText}"`,
      referenceId: question.id,
      sendWhatsApp: true,
    });
  }

  await em.flush();

  const payload = {
    id: answer.id,
    questionId: question.id,
    answerText: answer.answerText,
    isOfficialRt: answer.isOfficialRt,
    sourceChannel: input.sourceChannel,
    createdAt: answer.createdAt,
    answeredBy: answerer.fullName ?? (isOfficialRt ? "Pengurus RT" : "Warga"),
  };

  emitLocationEvent(question.location.id, "answer:created", payload);
  return payload;
}

export async function toggleWatchLocation(
  em: EntityManager,
  input: {
    locationId: string;
    userId: string;
    sourceChannel: ChannelSource;
  },
) {
  const [location, user] = await Promise.all([
    em.findOne(Location, { id: input.locationId }),
    em.findOneOrFail(User, { id: input.userId }),
  ]);

  if (!location) {
    throw new AppError(404, "LOCATION_NOT_FOUND", "Lokasi tidak ditemukan");
  }

  const existing = await em.findOne(WatchedLocation, {
    user: user.id,
    location: location.id,
  });

  if (existing) {
    await em.removeAndFlush(existing);
    return {
      userId: user.id,
      locationId: location.id,
      isWatching: false,
      sourceChannel: input.sourceChannel,
    };
  }

  const created = em.create(WatchedLocation, {
    user,
    location,
  });
  await em.flush();

  return {
    userId: user.id,
    locationId: location.id,
    isWatching: true,
    watchedAt: created.createdAt,
    sourceChannel: input.sourceChannel,
  };
}
