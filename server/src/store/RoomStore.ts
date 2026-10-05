// RoomStore interface: room kahan rakha hai (memory / Redis) handlers ko isse farak nahi padta.
// Phase 13 mein withLock() distributed short lock deta hai taaki multi-instance load-mutate-save race na ho.
import type { Room } from '../models/Room.js';

export interface RoomStore {
  get(roomId: string): Promise<Room | undefined>;
  save(room: Room): Promise<void>;
  delete(roomId: string): Promise<void>;
  exists(roomId: string): Promise<boolean>;
  // Monitoring/janitor ke liye room IDs enumerate karo.
  listRoomIds(): Promise<string[]>;
  // Multi-instance critical section. In-memory implementation no-op; Redis implementation distributed lock.
  withLock<T>(resourceId: string, fn: () => Promise<T>): Promise<T>;
  // Sirf monitoring/tests ke liye: kitne rooms abhi store mein hain.
  size(): Promise<number>;
}
