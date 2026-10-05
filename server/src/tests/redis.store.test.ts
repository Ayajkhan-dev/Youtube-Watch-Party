import { describe, expect, it } from 'vitest';
import { RedisRoomStore, type RedisClientLike } from '../store/RedisRoomStore.js';

const redisUrl = process.env.REDIS_URL;

describe.skipIf(!redisUrl)('RedisRoomStore (Phase 13)', () => {
  it('persists a room snapshot and acquires a distributed lock', async () => {
    const { Redis: RedisCtor } = await import('ioredis');
    const client = new RedisCtor(redisUrl!) as unknown as RedisClientLike;
    const store = new RedisRoomStore(client);

    const { Room } = await import('../models/Room.js');
    const room = new Room(`TEST${Date.now()}`, 'creator');
    await store.save(room);

    const loaded = await store.get(room.roomId);
    expect(loaded?.roomId).toBe(room.roomId);
    expect(await store.exists(room.roomId)).toBe(true);

    let inside = false;
    await store.withLock(room.roomId, async () => {
      inside = true;
    });
    expect(inside).toBe(true);

    await store.delete(room.roomId);
    await client.quit();
  });
});
