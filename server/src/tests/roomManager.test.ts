// InMemoryRoomStore + RoomManager tests: create, unique code, deleteIfEmpty, empty-room TTL.
import { describe, it, expect } from 'vitest';
import { InMemoryRoomStore } from '../store/InMemoryRoomStore.js';
import { RoomManager } from '../services/RoomManager.js';
import { Participant } from '../models/Participant.js';
import { Room } from '../models/Room.js';
import type { MongoRoomPersistence } from '../store/MongoRoomPersistence.js';
import { ROOM_CODE_REGEX } from '../utils/roomCode.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('InMemoryRoomStore', () => {
  it('get/save/exists/delete/size', async () => {
    const s = new InMemoryRoomStore();
    const r = new Room('ABC234', 'u');
    expect(await s.exists('ABC234')).toBe(false);
    await s.save(r);
    expect(await s.exists('ABC234')).toBe(true);
    expect(await s.get('ABC234')).toBe(r);
    expect(await s.size()).toBe(1);
    await s.delete('ABC234');
    expect(await s.get('ABC234')).toBeUndefined();
  });
});

describe('RoomManager', () => {
  it('createRoom: valid code, creator = host', async () => {
    const m = new RoomManager(new InMemoryRoomStore(), 60_000);
    const room = await m.createRoom('creator1');
    expect(room?.roomId).toMatch(ROOM_CODE_REGEX);
    expect(room?.creatorId).toBe('creator1');
    expect(room?.hostId).toBe('creator1');
    expect(await m.exists(room!.roomId)).toBe(true);
    m.dispose();
  });

  it('code collision par dusra code try karta hai; hamesha collide ho to undefined', async () => {
    const codes = ['AAAAAA', 'AAAAAA', 'BBBBBB'];
    const m = new RoomManager(new InMemoryRoomStore(), 60_000, () => codes.shift() ?? 'BBBBBB');
    expect((await m.createRoom('u1'))?.roomId).toBe('AAAAAA');
    expect((await m.createRoom('u2'))?.roomId).toBe('BBBBBB'); // AAAAAA collide hua, skip
    expect(await m.createRoom('u3')).toBeUndefined(); // ab sirf BBBBBB milta hai
    m.dispose();
  });


  it('Mongo persistence miss par room rehydrate karke store mein save karta hai', async () => {
    const store = new InMemoryRoomStore();
    const restored = new Room('REHY12', 'creator');
    restored.playback.videoId = 'abcdefghijk';
    const persistence = {
      createRoom: async () => {},
      exists: async (roomId: string) => roomId === restored.roomId,
      rehydrate: async (roomId: string) => (roomId === restored.roomId ? restored : undefined),
      onRoomSaved: () => {},
      touchRoom: async () => {},
      dispose: async () => {},
    } as unknown as MongoRoomPersistence;
    const m = new RoomManager(store, 60_000, () => 'ZZZZZZ', persistence);
    expect(await m.exists(restored.roomId)).toBe(true);
    const room = await m.getRoom(restored.roomId);
    expect(room?.creatorId).toBe('creator');
    expect(room?.playback.videoId).toBe('abcdefghijk');
    expect(await store.exists(restored.roomId)).toBe(true);
    m.dispose();
  });

  it('deleteIfEmpty: participant ho to nahi, khali ho to delete', async () => {
    const m = new RoomManager(new InMemoryRoomStore(), 60_000);
    const room = (await m.createRoom('u'))!;
    room.addParticipant(new Participant({ userId: 'u', username: 'U', role: 'host', socketId: 's' }));
    expect(await m.deleteIfEmpty(room.roomId)).toBe(false);
    room.removeParticipant('u');
    expect(await m.deleteIfEmpty(room.roomId)).toBe(true);
    expect(await m.exists(room.roomId)).toBe(false);
    m.dispose();
  });

  it('khali room TTL ke baad delete hota hai; cancel par bachta hai', async () => {
    const m = new RoomManager(new InMemoryRoomStore(), 40);
    const a = (await m.createRoom('u1'))!;
    const b = (await m.createRoom('u2'))!;
    m.cancelEmptyCleanup(b.roomId);
    await sleep(120);
    expect(await m.exists(a.roomId)).toBe(false);
    expect(await m.exists(b.roomId)).toBe(true);
    m.dispose();
  });
});
