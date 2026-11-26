import { NextFunction, Request, Response, RequestHandler } from "express";
import { ZodTypeAny } from "zod";

export function validateBody(schema: ZodTypeAny): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.body = schema.parse(req.body);
    next();
  };
}

export function validateQuery(schema: ZodTypeAny): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.query = schema.parse(req.query) as Request["query"];
    next();
  };
}

export function validateParams(schema: ZodTypeAny): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.params = schema.parse(req.params) as Request["params"];
    next();
  };
}
