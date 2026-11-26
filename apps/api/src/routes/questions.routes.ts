import { Router } from "express";
import { FilterQuery } from "@mikro-orm/core";
import { z } from "zod";
import { getOrm, Question } from "@cekdulu/db";
import { ChannelSource } from "@cekdulu/shared";
import { requireAuth, resolveSourceChannel } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/error";
import { validateBody, validateQuery } from "../middlewares/validate";
import {
  createLocationQuestion,
  createQuestionAnswer,
} from "../services/qa-watch.service";

export const questionsRouter = Router();

const listQuestionsQuerySchema = z.object({
  locationId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const createQuestionSchema = z.object({
  locationId: z.string().uuid(),
  questionText: z.string().trim().min(5).max(1000),
  source_channel: z.nativeEnum(ChannelSource).optional(),
  sourceChannel: z.nativeEnum(ChannelSource).optional(),
});

const createAnswerSchema = z.object({
  answerText: z.string().trim().min(2).max(1000),
  source_channel: z.nativeEnum(ChannelSource).optional(),
  sourceChannel: z.nativeEnum(ChannelSource).optional(),
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
    const body = req.body as z.infer<typeof createQuestionSchema>;
    const payload = await createLocationQuestion(getOrm().em, {
      locationId: body.locationId,
      userId: req.user!.id,
      questionText: body.questionText,
      sourceChannel: resolveSourceChannel(
        req,
        body.source_channel ?? body.sourceChannel,
      ),
    });

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
    const body = req.body as z.infer<typeof createAnswerSchema>;
    const payload = await createQuestionAnswer(getOrm().em, {
      questionId: req.params.id,
      userId: req.user!.id,
      answerText: body.answerText,
      sourceChannel: resolveSourceChannel(
        req,
        body.source_channel ?? body.sourceChannel,
      ),
    });

    res.status(201).json({
      success: true,
      data: payload,
    });
  }),
);
