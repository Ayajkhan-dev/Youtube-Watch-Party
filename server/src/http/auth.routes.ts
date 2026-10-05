// REST account auth: POST /api/auth/register aur /api/auth/login.
// Mongo configured nahi ho to ye routes 503 return karte hain; guest room flow unaffected rehta hai.
import { Router } from 'express';
import type { AuthResponse } from '@watchparty/shared';
import { z } from 'zod';
import { config } from '../config.js';
import { AuthService } from '../services/AuthService.js';
import { asyncHandler, HttpError } from './errors.js';

const registerBody = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(128),
  name: z.string().trim().min(1).max(24),
});

const loginBody = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(128),
});

export function createAuthRouter(): Router {
  const router = Router();
  const auth = new AuthService();

  router.post(
    '/register',
    asyncHandler(async (req, res) => {
      if (!config.MONGO_URI) throw new HttpError(503, 'AUTH_UNAVAILABLE', 'Configure MONGO_URI to enable account authentication');
      const { email, password, name } = registerBody.parse(req.body);
      try {
        const result = await auth.register(email, password, name);
        const body: AuthResponse = result;
        res.status(201).json(body);
      } catch (err) {
        if (err instanceof Error && err.message === 'EMAIL_EXISTS') {
          throw new HttpError(409, 'EMAIL_EXISTS', 'This email is already registered');
        }
        throw err;
      }
    }),
  );

  router.post(
    '/login',
    asyncHandler(async (req, res) => {
      if (!config.MONGO_URI) throw new HttpError(503, 'AUTH_UNAVAILABLE', 'Configure MONGO_URI to enable account authentication');
      const { email, password } = loginBody.parse(req.body);
      try {
        const result = await auth.login(email, password);
        const body: AuthResponse = result;
        res.json(body);
      } catch (err) {
        if (err instanceof Error && err.message === 'INVALID_CREDENTIALS') {
          throw new HttpError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password');
        }
        throw err;
      }
    }),
  );

  return router;
}
