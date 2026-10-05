// useRoomSocket(roomId, session): socket connect + join_room (har connect/reconnect par) + saare server events store mein.
// Unmount par saare listeners off() aur socket disconnect (leak nahi).
import { useCallback, useEffect } from 'react';
import { EVENTS } from '@watchparty/shared';
import type { JoinRoomAck } from '@watchparty/shared';
import { clearSession, type Session } from '../lib/session';
import { setAuthToken, socket } from '../lib/socket';
import { useRoomStore } from '../store/roomStore';

// In errors par dobara try karna bekaar hai: socket band karke full-screen message dikhate hain.
const FATAL_JOIN_CODES = new Set(['ROOM_NOT_FOUND', 'BANNED', 'ROOM_FULL', 'FORBIDDEN', 'INVALID_PAYLOAD', 'UNAUTHENTICATED']);

export function useRoomSocket(roomId: string, session: Session | null) {
  const token = session?.token;
  const username = session?.username;

  useEffect(() => {
    if (!token || !username) return;
    const st = () => useRoomStore.getState();
    st().reset();
    st().setConnection('connecting');
    setAuthToken(token); // auth callback har (re)connect par yahi token padhta hai

    const join = () => {
      st().setJoining();
      socket.emit(EVENTS.JOIN_ROOM, { roomId, username }, (ack: JoinRoomAck) => {
        if (ack.ok) return st().setJoined(ack);
        const { code, message } = ack.error;
        if (code === 'UNAUTHENTICATED') clearSession(roomId);
        if (FATAL_JOIN_CODES.has(code)) {
          st().setFatal(code, message);
          socket.disconnect();
        } else {
          st().addToast('error', message);
        }
      });
    };

    const onConnect = () => {
      st().setConnection('connected');
      join(); // reconnect par bhi: server purana role wapas deta hai
    };
    const onDisconnect = (reason: string) => {
      // Hum ya server ne jaan-boojhkar band kiya (removed/replaced) to auto-reconnect nahi hota.
      st().setConnection(reason === 'io client disconnect' || reason === 'io server disconnect' ? 'disconnected' : 'reconnecting');
    };
    const onConnectError = (err: Error) => {
      if (err.message === 'UNAUTHENTICATED') {
        clearSession(roomId);
        st().setFatal('UNAUTHENTICATED', 'Your session has expired. Please rejoin the room.');
        socket.disconnect();
        return;
      }
      st().setConnection('reconnecting');
    };
    const onReconnectAttempt = () => st().setConnection('reconnecting');

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.io.on('reconnect_attempt', onReconnectAttempt);

    socket.on(EVENTS.USER_JOINED, (p) => st().userJoined(p));
    socket.on(EVENTS.USER_LEFT, (p) => st().userLeft(p));
    socket.on(EVENTS.ROLE_ASSIGNED, (p) => st().roleAssigned(p));
    socket.on(EVENTS.PARTICIPANT_REMOVED, (p) => st().participantRemoved(p.userId, p.participants));
    socket.on(EVENTS.HOST_TRANSFERRED, (p) => st().hostTransferred(p));
    socket.on(EVENTS.SYNC_STATE, (p) => st().syncState(p));
    socket.on(EVENTS.ACTION_REQUESTED, (p) => st().actionRequested(p));
    socket.on(EVENTS.REQUEST_RESOLVED, (p) => st().requestResolved(p));
    socket.on(EVENTS.CHAT_MESSAGE, (p) => st().chatMessage(p));
    socket.on(EVENTS.REACTION, (p) => st().reaction(p));
    socket.on(EVENTS.ERROR_EVENT, (p) => st().errorEvent(p));
    socket.on(EVENTS.REMOVED, (p) => {
      clearSession(roomId);
      st().removed(p.reason);
    });
    socket.on(EVENTS.REPLACED, (p) => st().replaced(p.reason));

    socket.connect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.io.off('reconnect_attempt', onReconnectAttempt);
      for (const e of [
        EVENTS.USER_JOINED,
        EVENTS.USER_LEFT,
        EVENTS.ROLE_ASSIGNED,
        EVENTS.PARTICIPANT_REMOVED,
        EVENTS.HOST_TRANSFERRED,
        EVENTS.SYNC_STATE,
        EVENTS.ACTION_REQUESTED,
        EVENTS.REQUEST_RESOLVED,
        EVENTS.CHAT_MESSAGE,
        EVENTS.REACTION,
        EVENTS.ERROR_EVENT,
        EVENTS.REMOVED,
        EVENTS.REPLACED,
      ] as const) {
        socket.off(e);
      }
      socket.disconnect();
      st().reset();
    };
  }, [roomId, token, username]);

  // Same tab mein dobara connect (replaced screen ke "Use here" button ke liye).
  const reconnect = useCallback(() => {
    if (socket.connected) return;
    useRoomStore.getState().setConnection('connecting');
    socket.connect();
  }, []);

  // Room chhodo: server ko batao, socket band.
  const leave = useCallback(() => {
    if (socket.connected) socket.emit(EVENTS.LEAVE_ROOM, { roomId });
    socket.disconnect();
  }, [roomId]);

  return { reconnect, leave };
}
