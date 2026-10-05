// MongoRoomPersistence: room metadata ko persist karta hai aur restart par Redis/memory miss hone par Room rehydrate karta hai.
// lastVideoId writes 5s debounce se hoti hain; room close/empty cleanup par lastActiveAt touch hota hai.
import { Room } from '../models/Room.js';
import { RoomModel } from './mongo/RoomModel.js';

const VIDEO_WRITE_DEBOUNCE_MS = 5_000;

type PendingWrite = {
  room: Room;
  timer: NodeJS.Timeout;
};

export class MongoRoomPersistence {
  private readonly knownVideoIds = new Map<string, string | null>();
  private readonly pendingVideoWrites = new Map<string, PendingWrite>();

  async createRoom(room: Room): Promise<void> {
    const now = new Date();
    await RoomModel.updateOne(
      { roomId: room.roomId },
      {
        $setOnInsert: {
          roomId: room.roomId,
          creatorUserId: room.creatorId,
          lastVideoId: room.playback.videoId,
          createdAt: new Date(room.createdAt),
          lastActiveAt: now,
        },
      },
      { upsert: true },
    );
    this.knownVideoIds.set(room.roomId, room.playback.videoId);
  }

  async exists(roomId: string): Promise<boolean> {
    return Boolean(await RoomModel.exists({ roomId }));
  }

  async rehydrate(roomId: string): Promise<Room | undefined> {
    const doc = await RoomModel.findOne({ roomId }).lean();
    if (!doc) return undefined;

    // Phase 14 spec: rehydrate paused state, lastVideoId, host = creatorId.
    const room = new Room(doc.roomId, doc.creatorUserId, new Date(doc.createdAt).getTime());
    const now = Date.now();
    room.started = false;
    room.emptySince = now;
    room.hostId = doc.creatorUserId;
    room.playback.videoId = doc.lastVideoId ?? null;
    room.playback.playState = 'paused';
    room.playback.currentTime = 0;
    room.playback.updatedAt = now;
    room.playback.version = now; // time-based: restart ke baad bhi version purane clients se aage rahe (stale check)
    room.playback.updatedBy = null;
    this.knownVideoIds.set(room.roomId, room.playback.videoId);
    return room;
  }

  // Har Room save ko persist nahi karte; sirf videoId change detect hone par 5s debounce schedule hota hai.
  onRoomSaved(room: Room): void {
    const currentVideo = room.playback.videoId;
    const previousVideo = this.knownVideoIds.get(room.roomId);
    if (previousVideo === undefined) {
      this.knownVideoIds.set(room.roomId, currentVideo);
      return;
    }
    if (previousVideo === currentVideo) return;

    this.knownVideoIds.set(room.roomId, currentVideo);
    this.scheduleVideoWrite(room);
  }

  private scheduleVideoWrite(room: Room): void {
    const existing = this.pendingVideoWrites.get(room.roomId);
    if (existing) clearTimeout(existing.timer);

    const timer = setTimeout(() => {
      this.pendingVideoWrites.delete(room.roomId);
      void this.flushVideoWrite(room);
    }, VIDEO_WRITE_DEBOUNCE_MS);
    timer.unref();
    this.pendingVideoWrites.set(room.roomId, { room, timer });
  }

  private async flushVideoWrite(room: Room): Promise<void> {
    await RoomModel.updateOne(
      { roomId: room.roomId },
      {
        $set: {
          lastVideoId: room.playback.videoId,
          lastActiveAt: new Date(),
        },
      },
    );
  }

  async touchRoom(roomId: string): Promise<void> {
    await RoomModel.updateOne({ roomId }, { $set: { lastActiveAt: new Date() } });
  }

  async dispose(): Promise<void> {
    const pending = [...this.pendingVideoWrites.values()].map(({ room, timer }) => {
      clearTimeout(timer);
      return this.flushVideoWrite(room).catch(() => undefined);
    });
    this.pendingVideoWrites.clear();
    await Promise.all(pending);
  }
}
