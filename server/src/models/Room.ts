// Room: ek watch party ka poora state (participants, playback, bans, requests, chat). Socket import nahi.
// Handlers room ko load -> mutate -> save karte hain; Room.toSnapshot/fromSnapshot Redis ke liye taiyar hain.
import type {
  ChatMessage,
  ParticipantDTO,
  PlaybackState,
  Role,
  SyncStatePayload,
} from '@watchparty/shared';
import { CHAT_HISTORY_LIMIT } from '@watchparty/shared';
import { Participant, type ParticipantInit } from './Participant.js';

// Participant ki pending approval request (RequestService bharta hai).
// videoId/version request ke waqt ka playback: video badal jaye to stale check ke kaam aata hai.
export interface PendingRequestRecord {
  requestId: string;
  userId: string;
  username: string;
  type: string;
  payload: unknown;
  expiresAt: number;
  videoId?: string | null;
  version?: number;
}

export interface PlaybackPatch {
  videoId?: string | null;
  playState?: PlaybackState['playState'];
  currentTime?: number;
}

export interface RoomSnapshot {
  roomId: string;
  creatorId: string;
  hostId: string;
  createdAt: number;
  started: boolean;
  emptySince: number | null;
  playback: PlaybackState;
  participants: ParticipantInit[];
  pendingRequests: PendingRequestRecord[];
  banned: string[];
  chat: ChatMessage[];
}

export class Room {
  readonly roomId: string;
  readonly creatorId: string;
  hostId: string;
  readonly createdAt: number;
  // true jab pehli baar koi participant join ho chuka ho (creator se pehle koi aur host na ban jaye).
  started = false;
  // Room blank hone ke baad janitor ko 10-minute empty-room TTL track karne ke liye.
  emptySince: number | null;
  readonly participants = new Map<string, Participant>();
  readonly pendingRequests = new Map<string, PendingRequestRecord>();
  readonly banned = new Set<string>();
  chat: ChatMessage[] = [];
  playback: PlaybackState;

  constructor(roomId: string, creatorId: string, now: number = Date.now()) {
    this.roomId = roomId;
    this.creatorId = creatorId;
    this.hostId = creatorId; // creator hi Host hai (SPEC: join_room par userId == creatorId)
    this.createdAt = now;
    this.emptySince = now;
    this.playback = {
      videoId: null,
      playState: 'paused',
      currentTime: 0,
      updatedAt: now,
      version: 0,
      updatedBy: null,
    };
  }

  // playback.version hi room ka version hai (Phase 13 mein compare-and-set ke kaam aayega).
  get version(): number {
    return this.playback.version;
  }

  // ---- participants ----
  addParticipant(p: Participant): void {
    this.participants.set(p.userId, p);
    this.started = true;
    this.emptySince = null;
  }

  getParticipant(userId: string): Participant | undefined {
    return this.participants.get(userId);
  }

  // Participant hatata hai aur uski pending requests bhi (SPEC: leave/remove par cleanup).
  removeParticipant(userId: string): Participant | undefined {
    const p = this.participants.get(userId);
    if (!p) return undefined;
    this.participants.delete(userId);
    for (const [id, r] of this.pendingRequests) {
      if (r.userId === userId) this.pendingRequests.delete(id);
    }
    if (this.participants.size === 0) this.emptySince = Date.now();
    return p;
  }

  // Naya joiner kis role mein aayega (SPEC: creator = Host, baaki Participant).
  // Host tabhi milta hai jab room mein abhi koi Host na ho AND joiner creator ho (ya aakhri host jo room khali karke gaya tha).
  // Isse room khali hone ke baad link wala koi bhi ajnabi Host nahi ban sakta, aur kabhi do Host nahi bante.
  roleForJoiner(userId: string): Role {
    const hostPresent = [...this.participants.values()].some((p) => p.isHost());
    if (!hostPresent && (userId === this.creatorId || userId === this.hostId)) return 'host';
    return 'participant';
  }

  // Role badalta hai. 'host' yahan se nahi milta: sirf transferHost se.
  setRole(userId: string, role: Role): Participant {
    const p = this.participants.get(userId);
    if (!p) throw new Error('participant not in room');
    if (role === 'host') throw new Error('use transferHost to make someone host');
    if (p.isHost()) throw new Error('host role cannot be changed via setRole');
    p.role = role;
    return p;
  }

  // Naya host banata hai. Purana host (agar abhi room mein hai) Moderator ban jata hai.
  transferHost(newHostId: string): void {
    const next = this.participants.get(newHostId);
    if (!next) throw new Error('new host not in room');
    if (newHostId === this.hostId && next.isHost()) return;
    const old = this.participants.get(this.hostId);
    if (old && old.userId !== newHostId) old.role = 'moderator';
    next.role = 'host';
    this.hostId = newHostId;
  }

  // Host chala gaya to agla host: pehla Moderator (joinedAt order), phir sabse purana Participant,
  // phir Viewer. Connected log pehle chune jaate hain. Koi bacha nahi to undefined.
  pickNextHostId(excludeUserId?: string): string | undefined {
    const pool = [...this.participants.values()].filter((p) => p.userId !== excludeUserId);
    const order: Role[] = ['moderator', 'participant', 'viewer'];
    for (const onlyConnected of [true, false]) {
      for (const role of order) {
        const c = pool
          .filter((p) => p.role === role && (!onlyConnected || p.connected))
          .sort((a, b) => a.joinedAt - b.joinedAt)[0];
        if (c) return c.userId;
      }
    }
    return undefined;
  }

  listParticipants(): ParticipantDTO[] {
    return [...this.participants.values()]
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => p.toDTO());
  }

  // ---- chat ----
  // Naya message; sirf aakhri 50 rakhte hain (join ack mein history ke liye).
  addChat(m: ChatMessage): void {
    this.chat.push(m);
    if (this.chat.length > CHAT_HISTORY_LIMIT) this.chat = this.chat.slice(-CHAT_HISTORY_LIMIT);
  }

  // ---- bans ----
  ban(userId: string): void {
    this.banned.add(userId);
  }
  isBanned(userId: string): boolean {
    return this.banned.has(userId);
  }

  // ---- playback ----
  // Formula (SPEC 4.2): playing ho to currentTime + (now - updatedAt)/1000, warna currentTime.
  getLiveTime(now: number): number {
    const pb = this.playback;
    if (pb.playState !== 'playing') return pb.currentTime;
    return pb.currentTime + Math.max(0, now - pb.updatedAt) / 1000;
  }

  getLiveState(now: number): SyncStatePayload {
    const pb = this.playback;
    return {
      playState: pb.playState,
      currentTime: this.getLiveTime(now),
      videoId: pb.videoId,
      updatedAt: now,
      serverTime: now,
      version: pb.version,
      updatedBy: pb.updatedBy,
    };
  }

  // Playback badalta hai: updatedAt = now, version + 1.
  applyPlayback(patch: PlaybackPatch, now: number, updatedBy: string | null): PlaybackState {
    const pb = this.playback;
    if (patch.videoId !== undefined) pb.videoId = patch.videoId;
    if (patch.playState !== undefined) pb.playState = patch.playState;
    if (patch.currentTime !== undefined) pb.currentTime = patch.currentTime;
    pb.updatedAt = now;
    pb.version += 1;
    pb.updatedBy = updatedBy;
    return pb;
  }

  // ---- serialize ----
  toSnapshot(): RoomSnapshot {
    return {
      roomId: this.roomId,
      creatorId: this.creatorId,
      hostId: this.hostId,
      createdAt: this.createdAt,
      started: this.started,
      emptySince: this.emptySince,
      playback: { ...this.playback },
      participants: [...this.participants.values()].map((p) => p.toJSON()),
      pendingRequests: [...this.pendingRequests.values()].map((r) => ({ ...r })),
      banned: [...this.banned],
      chat: this.chat.map((m) => ({ ...m })),
    };
  }

  static fromSnapshot(s: RoomSnapshot): Room {
    const room = new Room(s.roomId, s.creatorId, s.createdAt);
    room.hostId = s.hostId;
    room.started = s.started;
    room.emptySince = s.emptySince ?? (s.started ? null : s.createdAt);
    room.playback = { ...s.playback };
    for (const p of s.participants) room.participants.set(p.userId, Participant.fromJSON(p));
    for (const r of s.pendingRequests) room.pendingRequests.set(r.requestId, { ...r });
    for (const b of s.banned) room.banned.add(b);
    room.chat = s.chat.map((m) => ({ ...m }));
    return room;
  }
}
