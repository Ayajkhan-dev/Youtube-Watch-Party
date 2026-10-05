// Socket connect hone se pehle token verify karta hai. REQUIRE_AUTH=true ho to sirf account JWT allow hota hai.
// Guest tokens default REQUIRE_AUTH=false mode mein Phase 12 ki tarah kaam karte hain.
import type { AppSocket } from './types.js';
import { verifyToken } from '../auth/token.js';
import { config } from '../config.js';

export function socketAuth(socket: AppSocket, next: (err?: Error) => void) {
  if (
    config.LOADTEST_QUERY_AUTH &&
    config.NODE_ENV !== 'production' &&
    !config.REQUIRE_AUTH &&
    typeof socket.handshake.query?.token === 'string' &&
    config.LOADTEST_AUTH_TOKEN &&
    socket.handshake.query.token === config.LOADTEST_AUTH_TOKEN
  ) {
    socket.data.userId = `loadtest:${socket.id}`;
    socket.data.username = `LoadTest-${socket.id.slice(0, 8)}`;
    return next();
  }

  const token = socket.handshake.auth?.token;
  if (typeof token !== 'string' || token.length === 0) return next(new Error('UNAUTHENTICATED'));
  try {
    const payload = verifyToken(token);
    if (config.REQUIRE_AUTH && payload.authType !== 'account') return next(new Error('UNAUTHENTICATED'));
    socket.data.userId = payload.userId;
    socket.data.username = payload.username;
    socket.data.authType = payload.authType;
    next();
  } catch {
    next(new Error('UNAUTHENTICATED'));
  }
}
