// Express app: security headers, CORS, rate limit, routes, error handler.
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { config } from './config.js';
import { createRoomsRouter } from './http/rooms.routes.js';
import { createAuthRouter } from './http/auth.routes.js';
import type { AppContext } from './context.js';
import { errorHandler } from './http/errors.js';

export function createApp(ctx: AppContext) {
  const app = express();
  // Render/Vercel jaise proxy ke peeche: X-Forwarded-For se asli IP (warna sab users ek IP gine jaate hain aur rate limit galat lagti hai).
  app.set('trust proxy', config.TRUST_PROXY);
  app.use(helmet());
  app.use(cors({ origin: config.CLIENT_ORIGINS }));
  app.use(express.json({ limit: '10kb' }));

  // Chhota info route: browser mein backend URL kholne par kuch dikhe (aur free-tier wake-up ping ke kaam aaye).
  app.get('/', (_req, res) => {
    res.json({ name: 'watch-party-server', ok: true });
  });

  // Render jaise platforms is route se check karte hain ki server zinda hai.
  app.get('/health', (_req, res) => {
    res.json({ ok: true, uptime: process.uptime() });
  });

  // REST par rate limit: ek IP se 1 minute mein 60 requests.
  app.use('/api', rateLimit({ windowMs: 60_000, limit: ctx.settings.restRateLimitPerMin, standardHeaders: true, legacyHeaders: false }));
  app.use('/api/rooms', createRoomsRouter(ctx));
  app.use('/api/auth', createAuthRouter());

  app.use(errorHandler); // hamesha sabse last mein
  return app;
}
