// Zustand store: room ka client-side state ek jagah (me, role, participants, playback, requests, chat, toasts).
// Socket events useRoomSocket se in actions ko call karte hain. Koi component socket se seedha state nahi badalta.
import { create } from 'zustand';
import type {
  ActionRequestedPayload,
  ChatMessage,
  ErrorEventPayload,
  HostTransferredPayload,
  JoinRoomAckOk,
  ParticipantDTO,
  ReactionBroadcast,
  RequestResolvedPayload,
  RequestType,
  Role,
  RoleAssignedPayload,
  SyncStatePayload,
  UserJoinedPayload,
  UserLeftPayload,
} from '@watchparty/shared';

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
// idle: room page abhi join nahi hua; joining: join_room bheja; joined: room mein hain;
// removed/replaced/error: full-screen states
export type RoomStatus = 'idle' | 'joining' | 'joined' | 'removed' | 'replaced' | 'error';
export type ToastKind = 'info' | 'success' | 'error';
// Meri bheji hui pending approval request (button par 'Pending...' dikhane ke liye).
export interface MyRequest {
  requestId: string;
  type: RequestType;
  expiresAt: number;
}
// Player ke upar float-up hone wali reaction (2 sec baad hat jaati hai).
export interface FloatingReaction {
  id: number;
  emoji: string;
  username: string;
  left: number; // % (random position)
}
export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

const MAX_CHAT = 200;
const MAX_TOASTS = 5;
let toastSeq = 0;
let reactionSeq = 0;
const MAX_REACTIONS = 30;

export interface RoomState {
  status: RoomStatus;
  fatalError: { code: string; message: string } | null;
  connection: ConnectionState;
  instanceId: string | null;
  me: ParticipantDTO | null;
  role: Role | null;
  participants: ParticipantDTO[];
  playback: SyncStatePayload | null;
  requests: ActionRequestedPayload[];
  chat: ChatMessage[];
  toasts: Toast[];
  clockSynced: boolean; // time_sync offset mil gaya (tab tak player state apply nahi hota)
  myRequests: MyRequest[];
  reactions: FloatingReaction[];
  unreadChat: number; // chat tab band ho tab aaye messages

  // actions
  reset: () => void;
  setConnection: (c: ConnectionState) => void;
  setJoining: () => void;
  setJoined: (ack: JoinRoomAckOk) => void;
  setFatal: (code: string, message: string) => void;
  userJoined: (p: UserJoinedPayload) => void;
  userLeft: (p: UserLeftPayload) => void;
  roleAssigned: (p: RoleAssignedPayload) => void;
  participantRemoved: (userId: string, participants: ParticipantDTO[]) => void;
  hostTransferred: (p: HostTransferredPayload) => void;
  syncState: (s: SyncStatePayload) => void;
  actionRequested: (r: ActionRequestedPayload) => void;
  requestResolved: (r: RequestResolvedPayload) => void;
  chatMessage: (m: ChatMessage) => void;
  removed: (reason: string) => void;
  replaced: (reason: string) => void;
  errorEvent: (e: ErrorEventPayload) => void;
  reaction: (r: ReactionBroadcast) => void;
  removeReaction: (id: number) => void;
  markChatRead: () => void;
  setClockSynced: (v: boolean) => void;
  addMyRequest: (r: MyRequest) => void;
  addToast: (kind: ToastKind, text: string) => void;
  dismissToast: (id: number) => void;
}

const initial = {
  status: 'idle' as RoomStatus,
  fatalError: null,
  connection: 'connecting' as ConnectionState,
  instanceId: null,
  me: null,
  role: null,
  participants: [] as ParticipantDTO[],
  playback: null,
  requests: [] as ActionRequestedPayload[],
  chat: [] as ChatMessage[],
  toasts: [] as Toast[],
  clockSynced: false,
  myRequests: [] as MyRequest[],
  reactions: [] as FloatingReaction[],
  unreadChat: 0,
};

const ROLE_LABEL: Record<Role, string> = {
  host: 'Host',
  moderator: 'Moderator',
  participant: 'Participant',
  viewer: 'Viewer',
};
export const roleLabel = (r: Role) => ROLE_LABEL[r];

const REQUEST_LABEL: Record<RequestType, string> = {
  play: 'play',
  pause: 'pause',
  seek: 'seek',
  change_video: 'change video',
  become_moderator: 'moderator role',
};
export const requestLabel = (t: RequestType) => REQUEST_LABEL[t];

// Participants list se meri role nikaalo (server list hi sach hai).
function myRoleFrom(participants: ParticipantDTO[], me: ParticipantDTO | null, fallback: Role | null): Role | null {
  if (!me) return fallback;
  return participants.find((p) => p.userId === me.userId)?.role ?? fallback;
}

export const useRoomStore = create<RoomState>((set, get) => {
  // Participants badle: list + meri role (aur me.role) sync.
  const applyParticipants = (participants: ParticipantDTO[]) => {
    const { me, role } = get();
    const nextRole = myRoleFrom(participants, me, role);
    const mine = participants.find((p) => p.userId === me?.userId);
    set({ participants, role: nextRole, me: mine ?? me });
  };
  const toast = (kind: ToastKind, text: string) => get().addToast(kind, text);

  return {
    ...initial,

    reset: () => set({ ...initial, toasts: [] }),
    setConnection: (connection) => set({ connection }),
    setJoining: () => set({ status: 'joining', fatalError: null }),

    setJoined: (ack) =>
      set((s) => ({
        status: 'joined',
        fatalError: null,
        me: ack.me,
        role: ack.role,
        participants: ack.participants,
        // Reconnect par purane version se peeche ka state mat lo
        playback: s.playback && s.playback.version > ack.playback.version ? s.playback : ack.playback,
        chat: ack.chat,
        instanceId: ack.instanceId,
        requests: [], // Host/Mod ke liye server pending requests dobara bhejta hai
      })),

    setFatal: (code, message) => set({ status: 'error', fatalError: { code, message } }),

    userJoined: (p) => {
      const isMe = p.userId === get().me?.userId;
      applyParticipants(p.participants);
      if (!isMe) toast('info', `${p.username} joined`);
    },

    userLeft: (p) => {
      applyParticipants(p.participants);
      if (p.userId !== get().me?.userId) toast('info', `${p.username} left`);
    },

    roleAssigned: (p) => {
      const wasMe = p.userId === get().me?.userId;
      const before = get().role;
      applyParticipants(p.participants);
      if (wasMe) {
        if (before !== p.role) toast('success', `You are now ${roleLabel(p.role)}`);
        // Moderator/Host ko approval ki zaroorat nahi: pending 'Pending...' hata do
        if (p.role === 'host' || p.role === 'moderator') set({ myRequests: [] });
      } else {
        toast('info', `${p.username} is now ${roleLabel(p.role)}`);
      }
    },

    participantRemoved: (userId, participants) => {
      const gone = get().participants.find((p) => p.userId === userId);
      applyParticipants(participants);
      // Requests jo us user ki thi, panel se hatao
      set((s) => ({ requests: s.requests.filter((r) => r.userId !== userId) }));
      if (gone && userId !== get().me?.userId) toast('info', `${gone.username} was removed`);
    },

    hostTransferred: (p) => {
      applyParticipants(p.participants);
      const newHost = p.participants.find((x) => x.userId === p.newHostId);
      if (p.newHostId === get().me?.userId) toast('success', 'You are now the Host');
      else if (newHost) toast('info', `${newHost.username} is now the Host`);
    },

    syncState: (s) =>
      set((st) => {
        // Purana (stale) sync_state ignore: version sirf aage badhta hai.
        if (st.playback && s.version < st.playback.version) return {};
        return { playback: s };
      }),

    actionRequested: (r) =>
      set((s) => ({
        requests: s.requests.some((x) => x.requestId === r.requestId) ? s.requests : [...s.requests, r],
      })),

    requestResolved: (r) => {
      const mine = get().myRequests.find((x) => x.requestId === r.requestId);
      set((s) => ({
        requests: s.requests.filter((x) => x.requestId !== r.requestId),
        myRequests: s.myRequests.filter((x) => x.requestId !== r.requestId),
      }));
      // Meri request ka natija: toast (stale par alag message)
      if (mine) {
        const what = requestLabel(mine.type);
        if (r.status === 'approved') toast('success', `Your ${what} request was approved`);
        else if (r.status === 'rejected') toast('error', r.reason === 'stale' ? `Your ${what} request is outdated (video changed)` : `Your ${what} request was rejected`);
        else toast('info', `Your ${what} request expired`);
      }
    },

    setClockSynced: (clockSynced) => set({ clockSynced }),
    // Same type ki nayi request purani pending ko replace karti hai (server bhi aisa hi karta hai).
    addMyRequest: (r) => set((s) => ({ myRequests: [...s.myRequests.filter((x) => x.type !== r.type), r] })),

    chatMessage: (m) =>
      set((s) => {
        if (s.chat.some((x) => x.id === m.id)) return {};
        // Dusre ka message aaya aur chat tab khula nahi: unread badge (tab khulne par markChatRead)
        return { chat: [...s.chat, m].slice(-MAX_CHAT), unreadChat: m.userId === s.me?.userId ? s.unreadChat : s.unreadChat + 1 };
      }),
    markChatRead: () => set({ unreadChat: 0 }),

    reaction: (r) =>
      set((s) => ({
        reactions: [...s.reactions, { id: ++reactionSeq, emoji: r.emoji, username: r.username, left: 10 + Math.random() * 80 }].slice(-MAX_REACTIONS),
      })),
    removeReaction: (id) => set((s) => ({ reactions: s.reactions.filter((x) => x.id !== id) })),

    removed: (reason) => {
      set({ status: 'removed', fatalError: { code: 'REMOVED', message: reason } });
    },
    replaced: (reason) => {
      set({ status: 'replaced', fatalError: { code: 'REPLACED', message: reason } });
    },

    errorEvent: (e) => toast('error', e.message),

    addToast: (kind, text) =>
      set((s) => ({ toasts: [...s.toasts, { id: ++toastSeq, kind, text }].slice(-MAX_TOASTS) })),
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  };
});

// Derived: Host/Moderator playback control kar sakte hain (UX ke liye; asli check server par hai).
export const selectCanControl = (s: Pick<RoomState, 'role'>): boolean => s.role === 'host' || s.role === 'moderator';
export const selectIsHost = (s: Pick<RoomState, 'role'>): boolean => s.role === 'host';
