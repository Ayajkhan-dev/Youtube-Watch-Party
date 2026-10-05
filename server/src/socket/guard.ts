// guard(action, handler): har protected event se pehle identity + room + participant + permission check.
// Fail par WsError throw hota hai (runHandler use error_event mein badalta hai) aur handler chalta hi nahi.
import type { AppContext } from '../context.js';
import type { Participant } from '../models/Participant.js';
import type { Room } from '../models/Room.js';
import { PermissionService, type Action } from '../services/PermissionService.js';
import { WsError } from './errors.js';
import type { AppSocket } from './types.js';

// Handler ko guard ye deta hai: room aur participant, dono server-side state se (payload se nahi).
export interface GuardContext {
  socket: AppSocket;
  room: Room;
  participant: Participant;
}

// action = null: sirf "room ka member ho" check (jaise request_sync), koi role permission nahi.
export function guard<R>(
  ctx: AppContext,
  action: Action | null,
  handler: (g: GuardContext, raw: unknown) => Promise<R>,
): (socket: AppSocket, raw: unknown) => Promise<R> {
  return async (socket, raw) => {
    // userId JWT se (socket.data), roomId join ke baad server ne set kiya; payload ka roomId kabhi nahi.
    const roomId = socket.data.roomId;
    if (!roomId) throw new WsError('NOT_IN_ROOM', 'You are not in a room');
    // Multi-instance critical section: Redis mode mein get -> permission -> mutate -> save ek room lock ke andar hota hai.
    return ctx.roomManager.withRoomLock(roomId, async () => {
      const room = await ctx.roomManager.getRoom(roomId);
      if (!room) throw new WsError('ROOM_NOT_FOUND', 'Room not found');
      const participant = room.getParticipant(socket.data.userId);
      // Purana/replaced socket participant ka active socket nahi hota: usse events accept nahi.
      if (!participant || participant.socketId !== socket.id) {
        throw new WsError('NOT_IN_ROOM', 'You are not in this room');
      }
      if (action && !PermissionService.can(participant.role, action)) {
        throw new WsError('FORBIDDEN', `You do not have permission to '${action}'`);
      }
      return handler({ socket, room, participant }, raw);
    });
  };
}
