import { Router } from "express";
import { FilterQuery } from "@mikro-orm/core";
import { z } from "zod";
import {
  Answer,
  getOrm,
  Location,
  Question,
  RtOfficial,
  User,
} from "@cekdulu/db";
import { NotifType, UserRole } from "@cekdulu/shared";
import { emitLocationEvent } from "../lib/socket";
import { requireAuth } from "../middlewares/auth";
import { AppError, asyncHandler } from "../middlewares/error";
import { validateBody, validateQuery } from "../middlewares/validate";
import { createAndDispatchNotification } from "../services/notification.service";

export const questionsRouter = Router();

const listQuestionsQuerySchema = z.object({
  locationId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const createQuestionSchema = z.object({
  locationId: z.string().uuid(),
  questionText: z.string().trim().min(5).max(1000),
});

const createAnswerSchema = z.object({
  answerText: z.string().trim().min(2).max(1000),
});

questionsRouter.get(
  "/",
  validateQuery(listQuestionsQuerySchema),
  asyncHandler(async (req, res) => {
    const em = getOrm().em;
    const { locationId, limit } = req.query as unknown as z.infer<
      typeof listQuestionsQuerySchema
    >;

    const where: FilterQuery<Question> = {};
    if (locationId) {
      where.location = locationId;
    }

    const questions = await em.find(Question, where, {
      populate: ["user", "location", "answers", "answers.user"],
      orderBy: { createdAt: "DESC" },
      limit,
    });

    res.json({
      success: true,
      data: questions.map((q) => ({
        id: q.id,
        locationId: q.location.id,
        locationName: q.location.name,
        questionText: q.questionText,
        isAnswered: q.isAnswered,
        createdAt: q.createdAt,
        askedBy: {
          id: q.user.id,
          name: q.user.fullName ?? "Warga",
        },
        answers: q.answers.getItems().map((a) => ({
          id: a.id,
          answerText: a.answerText,
          isOfficialRt: a.isOfficialRt,
          createdAt: a.createdAt,
          answeredBy: {
            id: a.user.id,
            name: a.user.fullName ?? (a.isOfficialRt ? "Pengurus RT" : "Warga"),
          },
        })),
      })),
    });
  }),
);

questionsRouter.post(
  "/",
  requireAuth,
  validateBody(createQuestionSchema),
  asyncHandler(async (req, res) => {
    const em = getOrm().em;
    const body = req.body as z.infer<typeof createQuestionSchema>;

    const [location, user] = await Promise.all([
      em.findOne(Location, { id: body.locationId }),
      em.findOneOrFail(User, { id: req.user!.id }),
    ]);

    if (!location) {
      throw new AppError(404, "LOCATION_NOT_FOUND", "Lokasi tidak ditemukan");
    }

    const question = em.create(Question, {
      location,
      user,
      questionText: body.questionText,
      isAnswered: false,
    });

    await em.flush();

    const payload = {
      id: question.id,
      locationId: location.id,
      questionText: question.questionText,
      isAnswered: question.isAnswered,
      createdAt: question.createdAt,
      askedBy: user.fullName ?? "Warga",
    };

    emitLocationEvent(location.id, "question:created", payload);

    res.status(201).json({
      success: true,
      data: payload,
    });
  }),
);

questionsRouter.post(
  "/:id/answers",
  requireAuth,
  validateBody(createAnswerSchema),
  asyncHandler(async (req, res) => {
    const em = getOrm().em;
    const body = req.body as z.infer<typeof createAnswerSchema>;

    const [question, answerer] = await Promise.all([
      em.findOne(
        Question,
        { id: req.params.id },
        { populate: ["location", "user"] },
      ),
      em.findOneOrFail(User, { id: req.user!.id }),
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
      answerText: body.answerText,
      isOfficialRt,
    });

    question.isAnswered = true;

    if (question.user.id !== answerer.id) {
      await createAndDispatchNotification(em, {
        user: question.user,
        type: NotifType.QUESTION_ANSWERED,
        title: `Pertanyaanmu di ${question.location.name} Dijawab`,
        body: `${answerer.fullName ?? (isOfficialRt ? "Pengurus RT" : "Warga")}: "${body.answerText}"`,
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
      createdAt: answer.createdAt,
      answeredBy: answerer.fullName ?? (isOfficialRt ? "Pengurus RT" : "Warga"),
    };

    emitLocationEvent(question.location.id, "answer:created", payload);

    res.status(201).json({
      success: true,
      data: payload,
    });
  }),
);
