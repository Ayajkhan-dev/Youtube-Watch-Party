// Ek jaisa error format: { error: CODE, message }. zod ke errors yahin 400 mein badalte hain.
import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../logger.js';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

// Express error handler mein 4 arguments zaroori hain, isliye _next likha hai (use nahi hota).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'INVALID_PAYLOAD',
      message: err.issues[0]?.message ?? 'Invalid input',
    });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code, message: err.message });
    return;
  }
  // Galat JSON body (express.json ka error)
  if (err instanceof SyntaxError) {
    res.status(400).json({ error: 'INVALID_PAYLOAD', message: 'Invalid JSON' });
    return;
  }
  logger.error({ err }, 'unhandled error');
  res.status(500).json({ error: 'INTERNAL', message: 'Something went wrong' });
};

// Express 4 async handler ke error khud nahi pakadta; ye wrapper error ko errorHandler tak bhejta hai.
export const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
