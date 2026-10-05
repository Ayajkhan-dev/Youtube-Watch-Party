// ChatHandler: chat_message (text, rate limit 5 / 5s, last 50 history) aur reaction (whitelist, rate limit).
// Sab roles kar sakte hain (guard permission). Message server banata hai: id/userId/username/ts client se nahi aate.
import { nanoid } from 'nanoid';
import { EVENTS } from '@watchparty/shared';
import type { ChatMessage, OkAck } from '@watchparty/shared';
import type { AppContext } from '../context.js';
import { WsError } from '../socket/errors.js';
import { guard, type GuardContext } from '../socket/guard.js';
import { onEvent } from '../socket/handle.js';
import { RateLimiter } from '../socket/rateLimiter.js';
import type { AppServer, AppSocket } from '../socket/types.js';
import { chatPayload, reactionPayload } from '../validation/schemas.js';

export class ChatHandler {
  private readonly chatLimiter = new RateLimiter(5, 5000); // 5 messages / 5 sec per socket
  private readonly reactionLimiter = new RateLimiter(10, 5000); // 10 reactions / 5 sec per socket

  constructor(
    private readonly io: AppServer,
    private readonly ctx: AppContext,
  ) {}

  registerSocket(socket: AppSocket): void {
    const chat = guard(this.ctx, 'chat_message', (g, raw) => this.chat(g, raw));
    const react = guard(this.ctx, 'reaction', (g, raw) => this.reaction(g, raw));
    onEvent(socket, EVENTS.CHAT_MESSAGE, (raw) => chat(socket, raw));
    onEvent(socket, EVENTS.REACTION, (raw) => react(socket, raw));
  }

  private async chat({ socket, room, participant }: GuardContext, raw: unknown): Promise<OkAck> {
    const { text } = chatPayload.parse(raw);
    if (!this.chatLimiter.allow(socket)) throw new WsError('RATE_LIMITED', 'You are sending messages too quickly. Please slow down');
    const msg: ChatMessage = { id: nanoid(10), userId: participant.userId, username: participant.username, text, ts: Date.now() };
    room.addChat(msg);
    await this.ctx.roomManager.save(room);
    this.io.to(room.roomId).emit(EVENTS.CHAT_MESSAGE, msg);
    return { ok: true };
  }

  private async reaction({ socket, room, participant }: GuardContext, raw: unknown): Promise<OkAck> {
    const { emoji } = reactionPayload.parse(raw);
    if (!this.reactionLimiter.allow(socket)) throw new WsError('RATE_LIMITED', 'Too many reactions. Please slow down');
    this.io.to(room.roomId).emit(EVENTS.REACTION, { userId: participant.userId, username: participant.username, emoji });
    return { ok: true };
  }
}
