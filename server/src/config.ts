// Environment variables ko ek baar validate karte hain. Galat/missing ho to server start hi nahi hoga.
// parseConfig(env) alag function hai taaki tests alag-alag env se config check kar sakein.
import 'dotenv/config';
import { z } from 'zod';

// Dev ka default secret production mein kabhi nahi chalna chahiye.
const WEAK_SECRET = /dev-only|change-?me|secret123|password/i;

// z.coerce.boolean() 'false' ko bhi true bana deta hai, isliye string ko khud parse karte hain.
const envBool = z.preprocess((v) => (typeof v === 'string' ? ['true', '1', 'yes', 'on'].includes(v.trim().toLowerCase()) : v), z.boolean());

const schema = z.object({
  // Render PORT khud deta hai; local mein 4000.
  PORT: z.coerce.number().int().positive().default(4000),
  // Frontend URL (CORS). Comma se kai: "https://app.vercel.app,https://preview.vercel.app". Trailing slash hata diya jaata hai.
  CLIENT_URL: z.string().default('http://localhost:5173'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // JWT sign karne ki secret. Kam se kam 16 characters, warna server start nahi hoga.
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  // Render/Heroku jaise proxy ke peeche real client IP (rate limit ke liye). Production mein default 1 hop.
  TRUST_PROXY: z.coerce.number().int().nonnegative().optional(),
  // Phase 13: REDIS_URL set ho to RedisRoomStore + Socket.IO Redis adapter enable hote hain.
  REDIS_URL: z.string().url().optional(),
  // Phase 14: MONGO_URI set ho to persistent rooms + account auth enable hote hain.
  MONGO_URI: z.string().url().optional(),
  // Guest flow default false hai; true par room create/join ke liye account JWT required hai.
  REQUIRE_AUTH: envBool.default(false),
  // Load test ke liye optional query-token auth. Production mein default false aur NODE_ENV=production mein reject hoga.
  LOADTEST_QUERY_AUTH: envBool.default(false),
  LOADTEST_AUTH_TOKEN: z.string().min(16).optional(),
  // Room limits (Phase 4). Defaults SPEC ke hisaab se: 100 log, 30 sec grace, 10 min empty-room TTL.
  MAX_PARTICIPANTS: z.coerce.number().int().positive().default(100),
  GRACE_PERIOD_MS: z.coerce.number().int().nonnegative().default(30_000),
  EMPTY_ROOM_TTL_MS: z.coerce.number().int().positive().default(600_000),
  // REST API rate limit (per IP per minute). Default 60.
  REST_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(60),
  // Participant ki approval request kitni der pending rahe (Phase 7). Default 60 sec.
  REQUEST_TTL_MS: z.coerce.number().int().positive().default(60_000),
});

export interface AppConfig extends Omit<z.infer<typeof schema>, 'TRUST_PROXY' | 'CLIENT_URL'> {
  CLIENT_URL: string; // pehla origin (backward compat)
  CLIENT_ORIGINS: string[]; // CORS ke liye allowed origins
  TRUST_PROXY: number;
}

// "https://a.com/, https://b.com" -> ['https://a.com', 'https://b.com'] (har ek valid http(s) origin)
export function parseOrigins(value: string): string[] {
  const list = value
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  if (list.length === 0) throw new Error('CLIENT_URL is empty');
  for (const o of list) {
    let u: URL;
    try {
      u = new URL(o);
    } catch {
      throw new Error(`CLIENT_URL is an invalid URL: "${o}"`);
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error(`CLIENT_URL must use http(s): "${o}"`);
    if (u.pathname !== '/' || u.search || u.hash) throw new Error(`CLIENT_URL must be an origin only (no path or query): "${o}"`);
  }
  return list.map((o) => new URL(o).origin);
}

export function parseConfig(env: NodeJS.ProcessEnv): AppConfig {
  const c = schema.parse(env);
  const CLIENT_ORIGINS = parseOrigins(c.CLIENT_URL);

  if (c.NODE_ENV === 'production') {
    // Production mein ye galtiyan chup-chaap nahi chalni chahiye: CORS localhost par ya weak secret.
    if (!env.CLIENT_URL?.trim()) throw new Error('CLIENT_URL must be set in production (your Vercel URL)');
    if (WEAK_SECRET.test(c.JWT_SECRET)) throw new Error('A weak or development JWT_SECRET is not allowed in production. Use a long random secret');
  }
  return {
    ...c,
    CLIENT_URL: CLIENT_ORIGINS[0] as string,
    CLIENT_ORIGINS,
    TRUST_PROXY: c.TRUST_PROXY ?? (c.NODE_ENV === 'production' ? 1 : 0),
  };
}

// Browser WebSocket upgrade par cors() header check nahi hota, isliye Origin hum khud check karte hain.
// Origin header na ho (curl, server-to-server, health check) to allow; browser hamesha bhejta hai.
export function isOriginAllowed(origin: string | undefined, allowed: string[]): boolean {
  if (!origin) return true;
  return allowed.includes(origin.replace(/\/+$/, ''));
}

export const config = parseConfig(process.env);
