// RoomManager: room banana, dhoondhna, khali room delete karna, aur unique code generate karna.
// Khali room ko turant nahi hatata: TTL ke baad hatata hai (refresh/reconnect ka time milta hai).
import { Room } from '../models/Room.js';
import type { MongoRoomPersistence } from '../store/MongoRoomPersistence.js';
import type { RoomStore } from '../store/RoomStore.js';
import { generateRoomCode } from '../utils/roomCode.js';

export class RoomManager {
  private readonly emptyTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly store: RoomStore,
    private readonly emptyRoomTtlMs: number,
    private readonly codeGenerator: () => string = generateRoomCode,
    private readonly persistence?: MongoRoomPersistence,
  ) {}

  // Naya room: creation lock ke andar collision check + save, taaki 2 server instances duplicate room na bana dein.
  async createRoom(creatorId: string): Promise<Room | undefined> {
    return this.store.withLock('room-create', async () => {
      for (let i = 0; i < 5; i++) {
        const code = this.codeGenerator();
        if (await this.store.exists(code)) continue;
        const room = new Room(code, creatorId);
        await this.store.save(room);
        await this.persistence?.createRoom(room);
        // Agar creator kabhi join hi na kare to room hamesha ke liye na atke.
        this.scheduleEmptyCleanup(code);
        return room;
      }
      return undefined;
    });
  }

  async getRoom(roomId: string): Promise<Room | undefined> {
    const room = await this.store.get(roomId);
    if (room) return room;
    const restored = await this.persistence?.rehydrate(roomId);
    if (!restored) return undefined;
    await this.store.save(restored);
    return restored;
  }

  async exists(roomId: string): Promise<boolean> {
    if (await this.store.exists(roomId)) return true;
    return (await this.persistence?.exists(roomId)) ?? false;
  }

  async save(room: Room): Promise<void> {
    await this.store.save(room);
    this.persistence?.onRoomSaved(room);
  }

  listRoomIds(): Promise<string[]> {
    return this.store.listRoomIds();
  }

  withRoomLock<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
    return this.store.withLock(`room:${roomId}`, fn);
  }

  // Room mein koi participant nahi hai to delete. Redis mode mein distributed room lock ke andar hota hai.
  async deleteIfEmpty(roomId: string): Promise<boolean> {
    return this.withRoomLock(roomId, () => this.deleteIfEmptyUnlocked(roomId));
  }

  // Caller ke paas room lock already ho to isi method ko use karo (janitor deadlock avoid karne ke liye).
  async deleteIfEmptyUnlocked(roomId: string): Promise<boolean> {
    const room = await this.store.get(roomId);
    if (!room || room.participants.size > 0) return false;
    this.cancelEmptyCleanup(roomId);
    await this.persistence?.touchRoom(roomId);
    await this.store.delete(roomId);
    return true;
  }

  // TTL ke baad bhi khali ho to room hata do. Dobara schedule karne par purana timer cancel.
  scheduleEmptyCleanup(roomId: string): void {
    this.cancelEmptyCleanup(roomId);
    const t = setTimeout(() => {
      this.emptyTimers.delete(roomId);
      void this.deleteIfEmpty(roomId);
    }, this.emptyRoomTtlMs);
    t.unref(); // sirf timer ki wajah se process zinda na rahe
    this.emptyTimers.set(roomId, t);
  }

  cancelEmptyCleanup(roomId: string): void {
    const t = this.emptyTimers.get(roomId);
    if (t) clearTimeout(t);
    this.emptyTimers.delete(roomId);
  }

  // Shutdown/tests: saare pending timers saaf.
  dispose(): void {
    for (const t of this.emptyTimers.values()) clearTimeout(t);
    this.emptyTimers.clear();
  }
}
