// RequestService: participant ki approval requests ka state (create/replace/expire/drop). Socket emit yahan nahi.
// Requests Room.pendingRequests mein rehti hain (store ke saath save); sirf expiry timers is service ke paas hain.
import { nanoid } from 'nanoid';
import type { Participant } from '../models/Participant.js';
import type { PendingRequestRecord, Room } from '../models/Room.js';

export const MAX_PENDING_PER_USER = 5;

export class RequestService {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly ttlMs: number) {}

  // Nayi request. Same type ki purani pending ho to replace (replaced return hota hai).
  // Limit: ek user ki max 5 pending.
  create(
    room: Room,
    p: Participant,
    type: string,
    payload: unknown,
    now: number = Date.now(),
  ): { record: PendingRequestRecord; replaced?: PendingRequestRecord } | { error: 'LIMIT' } {
    let replaced: PendingRequestRecord | undefined;
    for (const r of room.pendingRequests.values()) {
      if (r.userId === p.userId && r.type === type) replaced = r;
    }
    const mine = [...room.pendingRequests.values()].filter((r) => r.userId === p.userId && r !== replaced);
    if (mine.length >= MAX_PENDING_PER_USER) return { error: 'LIMIT' };
    if (replaced) this.remove(room, replaced.requestId);

    const record: PendingRequestRecord = {
      requestId: nanoid(12),
      userId: p.userId,
      username: p.username,
      type,
      payload,
      expiresAt: now + this.ttlMs,
      videoId: room.playback.videoId,
      version: room.playback.version,
    };
    room.pendingRequests.set(record.requestId, record);
    return { record, replaced };
  }

  isExpired(r: PendingRequestRecord, now: number = Date.now()): boolean {
    return now >= r.expiresAt;
  }

  // Request hatao (resolve/expire/replace) aur uska timer band.
  remove(room: Room, requestId: string): PendingRequestRecord | undefined {
    const r = room.pendingRequests.get(requestId);
    room.pendingRequests.delete(requestId);
    this.untrack(requestId);
    return r;
  }

  // Requester leave/remove/grace-expire: uski saari pending requests hatao. Hataayi gayi records return.
  dropForUser(room: Room, userId: string): PendingRequestRecord[] {
    const dropped: PendingRequestRecord[] = [];
    for (const r of [...room.pendingRequests.values()]) {
      if (r.userId === userId) {
        this.remove(room, r.requestId);
        dropped.push(r);
      }
    }
    return dropped;
  }

  // Is participant ko kaun si pending requests dikhni chahiye (Host: sab, Moderator: role requests chhodke).
  visibleTo(room: Room, p: Participant, now: number = Date.now()): PendingRequestRecord[] {
    return [...room.pendingRequests.values()].filter((r) => {
      if (this.isExpired(r, now)) return false;
      if (r.type === 'become_moderator') return p.isHost();
      return p.canControlPlayback();
    });
  }

  // Expiry timer: ttl ke baad onExpire chalega. unref taaki process ruke nahi.
  track(requestId: string, onExpire: () => void, ms: number = this.ttlMs): void {
    this.untrack(requestId);
    const t = setTimeout(() => {
      this.timers.delete(requestId);
      onExpire();
    }, ms);
    t.unref();
    this.timers.set(requestId, t);
  }

  untrack(requestId: string): void {
    const t = this.timers.get(requestId);
    if (t) clearTimeout(t);
    this.timers.delete(requestId);
  }

  dispose(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }
}
