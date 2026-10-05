// Client se server ko emit: ek jagah. Server har event par permission check karta hai (UI disable sirf UX hai).
// Error aane par server error_event bhejta hai, jo toast ban jaata hai (useRoomSocket).
import { EVENTS } from '@watchparty/shared';
import type { RequestActionAck, RequestActionBody, RequestType, Role } from '@watchparty/shared';
import { socket } from './socket';
import { useRoomStore } from '../store/roomStore';

export const actions = {
  play: (time?: number) => void socket.emit(EVENTS.PLAY, time === undefined ? {} : { time }),
  pause: (time?: number) => void socket.emit(EVENTS.PAUSE, time === undefined ? {} : { time }),
  seek: (time: number) => void socket.emit(EVENTS.SEEK, { time }),
  changeVideo: (videoId: string) => void socket.emit(EVENTS.CHANGE_VIDEO, { videoId }),

  assignRole: (userId: string, role: Exclude<Role, 'host'>) => void socket.emit(EVENTS.ASSIGN_ROLE, { userId, role }),
  removeParticipant: (userId: string) => void socket.emit(EVENTS.REMOVE_PARTICIPANT, { userId }),
  transferHost: (userId: string) => void socket.emit(EVENTS.TRANSFER_HOST, { userId }),

  chat: (text: string) => void socket.emit(EVENTS.CHAT_MESSAGE, { text }),
  reaction: (emoji: string) => void socket.emit(EVENTS.REACTION, { emoji }),

  resolveRequest: (requestId: string, approve: boolean) => void socket.emit(EVENTS.RESOLVE_REQUEST, { requestId, approve }),

  // Participant/Viewer approval maangta hai. Ack ok to "Pending..." state store mein.
  requestAction(body: RequestActionBody): void {
    socket.emit(EVENTS.REQUEST_ACTION, body, (ack: RequestActionAck) => {
      if (ack.ok) useRoomStore.getState().addMyRequest({ requestId: ack.requestId, type: body.type as RequestType, expiresAt: ack.expiresAt });
    });
  },
};
