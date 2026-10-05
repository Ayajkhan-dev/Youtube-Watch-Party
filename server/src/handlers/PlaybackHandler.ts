// PlaybackHandler: play, pause, seek, change_video (Host/Mod), plus request_sync aur time_sync (sab).
// Server single source of truth hai: state yahan badalta hai, phir sync_state sab ko broadcast hota hai.
import { EVENTS } from '@watchparty/shared';
import type { OkAck, SyncStatePayload, TimeSyncResponse } from '@watchparty/shared';
import type { AppContext } from '../context.js';
import type { PlaybackType, PlaybackInput } from '../services/PlaybackService.js';
import { PlaybackService } from '../services/PlaybackService.js';
import { WsError } from '../socket/errors.js';
import { guard, type GuardContext } from '../socket/guard.js';
import { onEvent, splitArgs } from '../socket/handle.js';
import { RateLimiter } from '../socket/rateLimiter.js';
import type { AppServer, AppSocket } from '../socket/types.js';
import {
  changeVideoPayload,
  pausePayload,
  playPayload,
  seekPayload,
  timeSyncPayload,
} from '../validation/schemas.js';

export class PlaybackHandler {
  private readonly playback = new PlaybackService();
  // Per-socket: 10 playback events / 5 sec. request_sync: 1 / 2 sec.
  private readonly playbackLimiter = new RateLimiter(10, 5000);
  private readonly syncLimiter = new RateLimiter(1, 2000);

  constructor(
    private readonly io: AppServer,
    private readonly ctx: AppContext,
  ) {}

  registerSocket(socket: AppSocket): void {
    const wire = (event: PlaybackType, parse: (raw: unknown) => PlaybackInput) => {
      const h = guard(this.ctx, event, (g, raw) => this.apply(g, event, parse(raw)));
      onEvent(socket, event, (raw) => h(socket, raw));
    };
    wire(EVENTS.PLAY, (raw) => playPayload.parse(raw));
    wire(EVENTS.PAUSE, (raw) => pausePayload.parse(raw));
    wire(EVENTS.SEEK, (raw) => seekPayload.parse(raw));
    wire(EVENTS.CHANGE_VIDEO, (raw) => changeVideoPayload.parse(raw));

    const reqSync = guard(this.ctx, null, (g) => this.requestSync(g));
    onEvent(socket, EVENTS.REQUEST_SYNC, (raw) => reqSync(socket, raw));

    // time_sync: sirf ack; room ki zaroorat nahi (connect ke turant baad clock offset ke liye).
    socket.on(EVENTS.TIME_SYNC, ((a: unknown, b: unknown) => {
      const { raw, ack } = splitArgs(a, b);
      if (typeof ack !== 'function') return;
      if (!timeSyncPayload.safeParse(raw).success) return;
      const res: TimeSyncResponse = { serverNow: Date.now() };
      ack(res);
    }) as never);
  }

  // Permission guard ke andar pahunch chuka hai. Rate limit -> state mutate -> save -> broadcast.
  private async apply({ socket, room, participant }: GuardContext, type: PlaybackType, input: PlaybackInput): Promise<OkAck> {
    if (!this.playbackLimiter.allow(socket)) {
      throw new WsError('RATE_LIMITED', 'Too many playback events. Please slow down');
    }
    const state = this.playback.apply(room, type, input, participant.userId);
    await this.ctx.roomManager.save(room);
    this.io.to(room.roomId).emit(EVENTS.SYNC_STATE, state);
    return { ok: true };
  }

  // Sirf sender ko current sync_state (reconnect/drift ke baad).
  private async requestSync({ socket, room }: GuardContext): Promise<OkAck> {
    if (!this.syncLimiter.allow(socket)) throw new WsError('RATE_LIMITED', 'request_sync is limited to once every 2 seconds');
    const state: SyncStatePayload = room.getLiveState(Date.now());
    socket.emit(EVENTS.SYNC_STATE, state);
    return { ok: true };
  }
}
