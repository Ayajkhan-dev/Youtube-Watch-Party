// RedisRoomStore: Phase 13 distributed room store.
// Room key is authoritative JSON snapshot; auxiliary keys match SPEC 4.3 for participants, requests, bans and chat.
import { randomBytes } from 'node:crypto';
import { Room, type RoomSnapshot } from '../models/Room.js';
import type { RoomStore } from './RoomStore.js';

const ROOM_TTL_SECONDS = 24 * 60 * 60;
const CHAT_LIMIT = 50;
const LOCK_TTL_MS = 3_000;
const LOCK_RETRIES = 60;
const LOCK_RETRY_DELAY_MS = 50;

type RedisMulti = {
  set: (...args: unknown[]) => RedisMulti;
  del: (...args: unknown[]) => RedisMulti;
  hset: (...args: unknown[]) => RedisMulti;
  sadd: (...args: unknown[]) => RedisMulti;
  rpush: (...args: unknown[]) => RedisMulti;
  ltrim: (...args: unknown[]) => RedisMulti;
  expire: (...args: unknown[]) => RedisMulti;
  exec: () => Promise<unknown>;
};

export interface RedisClientLike {
  get(key: string): Promise<string | null>;
  set(key: string, ...args: unknown[]): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  exists(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  scan(cursor: string, ...args: unknown[]): Promise<[string, string[]]>;
  multi(): RedisMulti;
  eval(script: string, numKeys: number, ...args: unknown[]): Promise<unknown>;
  ping(): Promise<string>;
  duplicate(): RedisClientLike;
  quit(): Promise<unknown>;
}

const releaseLockScript = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
`;

function roomKey(roomId: string): string {
  return `room:${roomId}`;
}
function participantsKey(roomId: string): string {
  return `room:${roomId}:participants`;
}
function requestsKey(roomId: string): string {
  return `room:${roomId}:requests`;
}
function bannedKey(roomId: string): string {
  return `room:${roomId}:banned`;
}
function chatKey(roomId: string): string {
  return `room:${roomId}:chat`;
}

export class RedisRoomStore implements RoomStore {
  constructor(private readonly redis: RedisClientLike) {}

  getClient(): RedisClientLike {
    return this.redis;
  }

  async ping(): Promise<string> {
    return this.redis.ping();
  }

  async get(roomId: string): Promise<Room | undefined> {
    const raw = await this.redis.get(roomKey(roomId));
    if (!raw) return undefined;

    // A read counts as activity, so refresh the 24h TTL on all present keys.
    await this.refreshTtl(roomId);
    const snapshot = JSON.parse(raw) as RoomSnapshot;
    return Room.fromSnapshot(snapshot);
  }

  async save(room: Room): Promise<void> {
    const snapshot = room.toSnapshot();
    const baseKey = roomKey(room.roomId);
    const participantKey = participantsKey(room.roomId);
    const requestKey = requestsKey(room.roomId);
    const banKey = bannedKey(room.roomId);
    const messagesKey = chatKey(room.roomId);

    // All data is written in one Redis transaction. The base JSON is authoritative;
    // auxiliary structures make the required Phase 13 key layout visible/queryable.
    const tx = this.redis.multi();
    tx.set(baseKey, JSON.stringify(snapshot), 'EX', ROOM_TTL_SECONDS);
    tx.del(participantKey, requestKey, banKey, messagesKey);

    const participants = snapshot.participants.map((p) => [p.userId, JSON.stringify(p)]);
    if (participants.length > 0) tx.hset(participantKey, Object.fromEntries(participants));

    const requests = snapshot.pendingRequests.map((r) => [r.requestId, JSON.stringify(r)]);
    if (requests.length > 0) tx.hset(requestKey, Object.fromEntries(requests));

    if (snapshot.banned.length > 0) tx.sadd(banKey, ...snapshot.banned);
    if (snapshot.chat.length > 0) {
      tx.rpush(messagesKey, ...snapshot.chat.slice(-CHAT_LIMIT).map((m) => JSON.stringify(m)));
      tx.ltrim(messagesKey, -CHAT_LIMIT, -1);
    }

    // Empty auxiliary keys may not exist; EXPIRE simply returns 0 in that case.
    tx.expire(participantKey, ROOM_TTL_SECONDS);
    tx.expire(requestKey, ROOM_TTL_SECONDS);
    tx.expire(banKey, ROOM_TTL_SECONDS);
    tx.expire(messagesKey, ROOM_TTL_SECONDS);
    await tx.exec();
  }

  async delete(roomId: string): Promise<void> {
    await this.redis.del(
      roomKey(roomId),
      participantsKey(roomId),
      requestsKey(roomId),
      bannedKey(roomId),
      chatKey(roomId),
    );
  }

  async exists(roomId: string): Promise<boolean> {
    return (await this.redis.exists(roomKey(roomId))) === 1;
  }

  async listRoomIds(): Promise<string[]> {
    const ids: string[] = [];
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', 'room:*', 'COUNT', 200);
      cursor = nextCursor;
      for (const key of keys) {
        const match = /^room:([^:]+)$/.exec(key);
        if (match?.[1]) ids.push(match[1]);
      }
    } while (cursor !== '0');
    return ids;
  }

  async withLock<T>(resourceId: string, fn: () => Promise<T>): Promise<T> {
    const key = `lock:${resourceId}`;
    const token = randomBytes(16).toString('hex');

    for (let attempt = 0; attempt < LOCK_RETRIES; attempt += 1) {
      const acquired = await this.redis.set(key, token, 'PX', LOCK_TTL_MS, 'NX');
      if (acquired === 'OK') {
        try {
          return await fn();
        } finally {
          try {
            await this.redis.eval(releaseLockScript, 1, key, token);
          } catch {
            // Redis may already have expired the lock. Never mask the real handler error.
          }
        }
      }
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_DELAY_MS));
    }
    throw new Error(`Redis lock timeout for ${resourceId}`);
  }

  async size(): Promise<number> {
    return (await this.listRoomIds()).length;
  }

  private async refreshTtl(roomId: string): Promise<void> {
    await Promise.all([
      this.redis.expire(roomKey(roomId), ROOM_TTL_SECONDS),
      this.redis.expire(participantsKey(roomId), ROOM_TTL_SECONDS),
      this.redis.expire(requestsKey(roomId), ROOM_TTL_SECONDS),
      this.redis.expire(bannedKey(roomId), ROOM_TTL_SECONDS),
      this.redis.expire(chatKey(roomId), ROOM_TTL_SECONDS),
    ]);
  }
}
