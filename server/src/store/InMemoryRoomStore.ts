// InMemoryRoomStore: Map mein rooms. REDIS_URL na ho to yahi chalta hai (MVP fallback).
// withLock() local mode mein no-op hai kyunki test/local single process ko distributed lock ki zaroorat nahi.
import type { Room } from '../models/Room.js';
import type { RoomStore } from './RoomStore.js';

export class InMemoryRoomStore implements RoomStore {
  private readonly rooms = new Map<string, Room>();

  async get(roomId: string): Promise<Room | undefined> {
    return this.rooms.get(roomId);
  }
  async save(room: Room): Promise<void> {
    this.rooms.set(room.roomId, room);
  }
  async delete(roomId: string): Promise<void> {
    this.rooms.delete(roomId);
  }
  async exists(roomId: string): Promise<boolean> {
    return this.rooms.has(roomId);
  }
  async listRoomIds(): Promise<string[]> {
    return [...this.rooms.keys()];
  }
  async withLock<T>(_resourceId: string, fn: () => Promise<T>): Promise<T> {
    return fn();
  }
  async size(): Promise<number> {
    return this.rooms.size;
  }
}
