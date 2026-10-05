// Socket event helpers: har handler ke around try/catch (error_event + ack) aur (payload, ack) normalize.
// RoomHandler, RoleHandler, PlaybackHandler teeno yahi use karte hain, taaki error format ek jaisa rahe.
import { EVENTS } from '@watchparty/shared';
import type { AckError } from '@watchparty/shared';
import { toErrorPayload } from './errors.js';
import type { AppSocket } from './types.js';

// Event chalao: error par sender ko error_event + ack (agar diya ho), success par ack(result).
export async function runHandler<T extends { ok: true }>(
  socket: AppSocket,
  event: string,
  ack: unknown,
  fn: () => Promise<T>,
): Promise<void> {
  try {
    const result = await fn();
    if (typeof ack === 'function') ack(result);
  } catch (err) {
    const payload = toErrorPayload(err, event);
    socket.emit(EVENTS.ERROR_EVENT, payload);
    if (typeof ack === 'function') {
      const res: AckError = { ok: false, error: { code: payload.code, message: payload.message } };
      ack(res);
    }
  }
}

// Client kabhi emit('play', cb) bhi bhej sakta hai (payload ke bina). Tab pehla argument function hota hai.
export function splitArgs(a: unknown, b: unknown): { raw: unknown; ack: unknown } {
  if (typeof a === 'function') return { raw: undefined, ack: a };
  return { raw: a, ack: b };
}

// Event register: (payload, ack) normalize karke fn ko deta hai, aur runHandler se chalata hai.
export function onEvent<T extends { ok: true }>(
  socket: AppSocket,
  event: string,
  fn: (raw: unknown) => Promise<T>,
): void {
  socket.on(event as never, ((a: unknown, b: unknown) => {
    const { raw, ack } = splitArgs(a, b);
    void runHandler(socket, event, ack, () => fn(raw));
  }) as never);
}
