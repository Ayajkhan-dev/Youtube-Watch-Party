// Approval requests ke socket-side helpers: requester gaya to mods ko batao, naye mod/host ko pending list dikhao.
import { EVENTS } from '@watchparty/shared';
import type { RequestType } from '@watchparty/shared';
import type { AppContext } from '../context.js';
import type { Participant } from '../models/Participant.js';
import type { Room } from '../models/Room.js';
import { audienceRoom } from './rooms.js';
import type { AppServer } from './types.js';

// Requester ki saari pending requests hatao aur Host/Mods ke panel se bhi hatwao.
// removeParticipant se PEHLE call karo (wo bhi hatati hai par notify nahi karti).
export function dropUserRequests(io: AppServer, ctx: AppContext, room: Room, userId: string): void {
  for (const r of ctx.requests.dropForUser(room, userId)) {
    io.to(audienceRoom(room.roomId, r.type)).emit(EVENTS.REQUEST_RESOLVED, {
      requestId: r.requestId,
      status: 'expired',
      reason: 'requester_left',
    });
  }
}

// Host/Mod ban gaya ya wapas aaya (refresh): jo requests pending hain wo is socket ko dobara bhejo.
export function replayPending(io: AppServer, ctx: AppContext, room: Room, p: Participant): void {
  if (!p.socketId || !p.connected) return;
  for (const r of ctx.requests.visibleTo(room, p)) {
    io.to(p.socketId).emit(EVENTS.ACTION_REQUESTED, {
      requestId: r.requestId,
      userId: r.userId,
      username: r.username,
      type: r.type as RequestType,
      payload: r.payload,
      expiresAt: r.expiresAt,
    });
  }
}
