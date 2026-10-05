// Client aur server ke beech jaane wale types ek jagah. Phase 1-4 tak ke payloads yahan hain.
// Aage ke phases (playback, requests, chat) mein naye types isi file mein judenge.
import type { Role } from './roles.js';

export interface PingPayload {
  sentAt: number; // client ka timestamp (ms)
}
export interface PongPayload {
  sentAt: number; // wahi wapas
  serverTime: number; // server ka timestamp (ms)
}

// ---- Error codes (plan Section 6.2) ----
export const ERROR_CODES = [
  'UNAUTHENTICATED',
  'INVALID_PAYLOAD',
  'FORBIDDEN',
  'NOT_IN_ROOM',
  'ROOM_NOT_FOUND',
  'BANNED',
  'RATE_LIMITED',
  'ROOM_FULL',
  'INTERNAL', // extra: unexpected server error
  // Phase 7 (approval flow) extras
  'ALREADY_PRIVILEGED', // Host/Moderator ne moderator role request ki (ya approve ke waqt ban chuka tha)
  'REQUEST_NOT_FOUND',
  'REQUEST_EXPIRED',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorEventPayload {
  code: ErrorCode;
  event: string; // kis event par error aaya
  message: string;
}

// ---- Participants ----
// Client ko jaane wala participant (socketId jaisi internal cheezein nahi bhejte).
export interface ParticipantDTO {
  userId: string;
  username: string;
  role: Role;
  connected: boolean;
  joinedAt: number;
}

// ---- Playback ----
export type PlayState = 'playing' | 'paused';

// Server jo store karta hai. videoId null = abhi koi video select nahi hua.
export interface PlaybackState {
  videoId: string | null;
  playState: PlayState;
  currentTime: number; // seconds, updatedAt par
  updatedAt: number; // server ms
  version: number; // har change par +1
  updatedBy: string | null; // userId
}

// PDF ka sync_state payload ({playState, currentTime, videoId}) + extra optional fields.
// currentTime yahan liveTime hota hai (late joiner ke liye sahi position).
export interface SyncStatePayload {
  playState: PlayState;
  currentTime: number;
  videoId: string | null;
  updatedAt: number;
  serverTime: number;
  version: number;
  updatedBy: string | null;
}

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  text: string;
  ts: number;
}

// ---- join_room / leave_room ----
export interface JoinRoomPayload {
  roomId: string;
  username: string;
}
export interface LeaveRoomPayload {
  roomId: string;
}

export interface JoinRoomAckOk {
  ok: true;
  me: ParticipantDTO;
  role: Role;
  participants: ParticipantDTO[];
  playback: SyncStatePayload;
  chat: ChatMessage[];
  instanceId: string;
}
export interface AckError {
  ok: false;
  error: { code: ErrorCode; message: string };
}
export type JoinRoomAck = JoinRoomAckOk | AckError;
export interface LeaveRoomAckOk {
  ok: true;
}
export type LeaveRoomAck = LeaveRoomAckOk | AckError;

// ---- Server -> clients broadcasts (PDF payloads) ----
export interface UserJoinedPayload {
  username: string;
  userId: string;
  role: Role;
  participants: ParticipantDTO[];
}
export interface UserLeftPayload {
  username: string;
  userId: string;
  participants: ParticipantDTO[];
}
export interface HostTransferredPayload {
  oldHostId: string;
  newHostId: string;
  participants: ParticipantDTO[];
}
export interface ReplacedPayload {
  reason: string;
}

// ---- RBAC (Phase 5) ----
export interface AssignRolePayload {
  userId: string;
  role: Exclude<Role, 'host'>; // host sirf transfer_host se milta hai
}
export interface RemoveParticipantPayload {
  userId: string;
}
export interface TransferHostPayload {
  userId: string;
}
export interface RoleAssignedPayload {
  userId: string;
  username: string;
  role: Role;
  participants: ParticipantDTO[];
}
export interface ParticipantRemovedPayload {
  userId: string;
  participants: ParticipantDTO[];
}
export interface RemovedPayload {
  reason: string;
}

// ---- Playback (Phase 6) ----
// time = host/mod ke player ka current time (optional, accuracy ke liye).
export interface PlayPayload {
  time?: number;
}
export interface PausePayload {
  time?: number;
}
export interface SeekPayload {
  time: number;
}
// videoId ya poora YouTube URL; server parseYouTubeId se 11-char ID nikalta hai.
export interface ChangeVideoPayload {
  videoId: string;
}
export interface TimeSyncResponse {
  serverNow: number;
}

// ---- Approval flow (Phase 7) ----
export const REQUEST_TYPES = ['play', 'pause', 'seek', 'change_video', 'become_moderator'] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];
// become_moderator ka payload {}.
export type RequestActionBody =
  | { type: 'play'; payload?: PlayPayload }
  | { type: 'pause'; payload?: PausePayload }
  | { type: 'seek'; payload: SeekPayload }
  | { type: 'change_video'; payload: ChangeVideoPayload }
  | { type: 'become_moderator'; payload?: Record<string, never> };
export interface ActionRequestedPayload {
  requestId: string;
  userId: string;
  username: string;
  type: RequestType;
  payload: unknown; // server ka validated/normalized payload (change_video mein videoId 11-char)
  expiresAt: number; // server ms
}
export type RequestStatus = 'approved' | 'rejected' | 'expired';
export interface RequestResolvedPayload {
  requestId: string;
  status: RequestStatus;
  // Optional: 'stale' (video badal gaya), 'requester_left', 'replaced'
  reason?: string;
}
export interface RequestActionAckOk {
  ok: true;
  requestId: string;
  expiresAt: number;
}
export type RequestActionAck = RequestActionAckOk | AckError;
export interface ResolveRequestPayload {
  requestId: string;
  approve: boolean;
}
export interface ResolveRequestAckOk {
  ok: true;
  status: 'approved' | 'rejected'; // stale approve auto-reject hota hai
}
export type ResolveRequestAck = ResolveRequestAckOk | AckError;

// ---- Chat / reactions (payload types; handlers Phase 11 mein) ----
export interface ReactionBroadcast {
  userId: string;
  username: string;
  emoji: string;
}

// Role/playback events ka generic ack.
export interface OkAck {
  ok: true;
}
export type SimpleAck = OkAck | AckError;

export interface ClientToServerEvents {
  ping_test: (payload: PingPayload) => void;
  join_room: (payload: JoinRoomPayload, ack?: (res: JoinRoomAck) => void) => void;
  leave_room: (payload: LeaveRoomPayload, ack?: (res: LeaveRoomAck) => void) => void;
  // Phase 5: RBAC (Host only)
  assign_role: (payload: AssignRolePayload, ack?: (res: SimpleAck) => void) => void;
  remove_participant: (payload: RemoveParticipantPayload, ack?: (res: SimpleAck) => void) => void;
  transfer_host: (payload: TransferHostPayload, ack?: (res: SimpleAck) => void) => void;
  // Phase 6: playback (Host/Moderator)
  play: (payload?: PlayPayload, ack?: (res: SimpleAck) => void) => void;
  pause: (payload?: PausePayload, ack?: (res: SimpleAck) => void) => void;
  seek: (payload: SeekPayload, ack?: (res: SimpleAck) => void) => void;
  change_video: (payload: ChangeVideoPayload, ack?: (res: SimpleAck) => void) => void;
  request_sync: (payload?: Record<string, never>, ack?: (res: SimpleAck) => void) => void;
  time_sync: (payload: { t0?: number } | undefined, ack: (res: TimeSyncResponse) => void) => void;
  // Phase 7: approval flow
  request_action: (payload: RequestActionBody, ack?: (res: RequestActionAck) => void) => void;
  resolve_request: (payload: ResolveRequestPayload, ack?: (res: ResolveRequestAck) => void) => void;
  // Phase 11 (client side abhi se typed)
  chat_message: (payload: { text: string }, ack?: (res: SimpleAck) => void) => void;
  reaction: (payload: { emoji: string }, ack?: (res: SimpleAck) => void) => void;
}
export interface ServerToClientEvents {
  pong_test: (payload: PongPayload) => void;
  user_joined: (payload: UserJoinedPayload) => void;
  user_left: (payload: UserLeftPayload) => void;
  host_transferred: (payload: HostTransferredPayload) => void;
  replaced: (payload: ReplacedPayload) => void;
  sync_state: (payload: SyncStatePayload) => void;
  role_assigned: (payload: RoleAssignedPayload) => void;
  participant_removed: (payload: ParticipantRemovedPayload) => void;
  removed: (payload: RemovedPayload) => void;
  action_requested: (payload: ActionRequestedPayload) => void;
  request_resolved: (payload: RequestResolvedPayload) => void;
  chat_message: (payload: ChatMessage) => void;
  reaction: (payload: ReactionBroadcast) => void;
  error_event: (payload: ErrorEventPayload) => void;
}

// socket.data mein server ye rakhta hai (token se aata hai, client se nahi)
export interface SocketData {
  userId: string;
  username: string;
  authType?: 'guest' | 'account';
  roomId?: string; // join_room ke baad set hota hai
}

// REST responses
export interface RoomAuthResponse {
  roomId: string;
  userId: string;
  token: string;
}
export interface RoomExistsResponse {
  exists: true;
  roomId: string;
}
export interface AuthResponse {
  userId: string;
  username: string;
  token: string;
}
export interface ApiError {
  error: string;
  message: string;
}
