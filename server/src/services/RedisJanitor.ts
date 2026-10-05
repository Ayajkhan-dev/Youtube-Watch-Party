// Redis janitor: Phase 13 leader-elected cleanup for room-level tasks.
// Every 10s one instance gets the janitor lock, expires requests and removes rooms empty for EMPTY_ROOM_TTL_MS.
import { EVENTS } from '@watchparty/shared';
import type { AppContext } from '../context.js';
import { audienceRoom } from '../socket/rooms.js';
import type { AppServer } from '../socket/types.js';
import type { RedisRoomStore } from '../store/RedisRoomStore.js';

export class RedisJanitor {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly io: AppServer,
    private readonly ctx: AppContext,
    private readonly store: RedisRoomStore,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, 10_000);
    this.timer.unref();
    void this.tick();
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.store.withLock('janitor', async () => this.cleanupAllRooms());
    } finally {
      this.running = false;
    }
  }

  private async cleanupAllRooms(): Promise<void> {
    const now = Date.now();
    const roomIds = await this.ctx.roomManager.listRoomIds();

    for (const roomId of roomIds) {
      await this.ctx.roomManager.withRoomLock(roomId, async () => {
        const room = await this.ctx.roomManager.getRoom(roomId);
        if (!room) return;

        const expired = [...room.pendingRequests.values()].filter((r) => r.expiresAt <= now);
        for (const record of expired) {
          this.ctx.requests.remove(room, record.requestId);
          const payload = { requestId: record.requestId, status: 'expired' as const, reason: 'ttl' };
          this.io.to(audienceRoom(room.roomId, record.type)).emit(EVENTS.REQUEST_RESOLVED, payload);
          const requester = room.getParticipant(record.userId);
          if (requester?.socketId) this.io.to(requester.socketId).emit(EVENTS.REQUEST_RESOLVED, payload);
        }

        if (expired.length > 0) await this.ctx.roomManager.save(room);

        if (
          room.participants.size === 0 &&
          room.emptySince !== null &&
          now - room.emptySince >= this.ctx.settings.emptyRoomTtlMs
        ) {
          await this.ctx.roomManager.deleteIfEmptyUnlocked(room.roomId);
        }
      });
    }
  }
}
