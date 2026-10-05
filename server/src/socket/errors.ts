// Socket events ke errors: WsError throw karo, handler use error_event payload mein badal deta hai.
import { ZodError } from 'zod';
import type { ErrorCode, ErrorEventPayload } from '@watchparty/shared';
import { logger } from '../logger.js';

export class WsError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

// Kisi bhi error ko client-safe payload mein badalta hai (stack/internal details kabhi nahi jaate).
export function toErrorPayload(err: unknown, event: string): ErrorEventPayload {
  if (err instanceof WsError) return { code: err.code, event, message: err.message };
  if (err instanceof ZodError) {
    return { code: 'INVALID_PAYLOAD', event, message: err.issues[0]?.message ?? 'Invalid payload' };
  }
  logger.error({ err, event }, 'unhandled socket error');
  return { code: 'INTERNAL', event, message: 'Something went wrong' };
}
