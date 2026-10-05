// RequestHandler: request_action (participant/viewer) aur resolve_request (Host/Mod).
// Participant approval maangta hai; approve hone par hi change lagu hota hai, wahi PlaybackService/RoleService se
// jo Mod ke direct action par chalta hai. Role request (become_moderator) sirf Host approve kar sakta hai.
import { EVENTS } from '@watchparty/shared';
import type { RequestActionAckOk, RequestStatus, ResolveRequestAckOk } from '@watchparty/shared';
import type { AppContext } from '../context.js';
import type { PendingRequestRecord, Room } from '../models/Room.js';
import { PermissionService } from '../services/PermissionService.js';
import type { PlaybackInput, PlaybackType } from '../services/PlaybackService.js';
import { PlaybackService } from '../services/PlaybackService.js';
import type { RoleService } from '../services/RoleService.js';
import { logger } from '../logger.js';
import { WsError } from '../socket/errors.js';
import { guard, type GuardContext } from '../socket/guard.js';
import { onEvent } from '../socket/handle.js';
import { RateLimiter } from '../socket/rateLimiter.js';
import { audienceRoom } from '../socket/rooms.js';
import type { AppServer, AppSocket } from '../socket/types.js';
import { requestActionPayload, resolveRequestPayload } from '../validation/schemas.js';

export class RequestHandler {
  private readonly playback = new PlaybackService();
  private readonly limiter = new RateLimiter(10, 5000); // request_action spam roko

  constructor(
    private readonly io: AppServer,
    private readonly ctx: AppContext,
    private readonly roles: RoleService,
  ) {}

  registerSocket(socket: AppSocket): void {
    const req = guard(this.ctx, 'request_action', (g, raw) => this.requestAction(g, raw));
    const res = guard(this.ctx, 'resolve_request', (g, raw) => this.resolveRequest(g, raw));
    onEvent(socket, EVENTS.REQUEST_ACTION, (raw) => req(socket, raw));
    onEvent(socket, EVENTS.RESOLVE_REQUEST, (raw) => res(socket, raw));
  }

  // ---------- request_action ----------
  private async requestAction({ socket, room, participant }: GuardContext, raw: unknown): Promise<RequestActionAckOk> {
    const body = requestActionPayload.parse(raw);
    if (!this.limiter.allow(socket)) throw new WsError('RATE_LIMITED', 'Too many requests. Please slow down');
    // (guard participant/viewer hi aane deta hai; ye defensive check hai)
    if (body.type === 'become_moderator' && participant.canControlPlayback()) {
      throw new WsError('ALREADY_PRIVILEGED', 'You are already a Host or Moderator');
    }

    const result = this.ctx.requests.create(room, participant, body.type, body.payload);
    if ('error' in result) throw new WsError('RATE_LIMITED', 'Too many pending requests (max 5)');
    const { record, replaced } = result;
    await this.ctx.roomManager.save(room);
    this.ctx.requests.track(record.requestId, () => void this.expire(room.roomId, record.requestId));

    const audience = audienceRoom(room.roomId, record.type);
    if (replaced) {
      this.io.to(audience).emit(EVENTS.REQUEST_RESOLVED, {
        requestId: replaced.requestId,
        status: 'expired',
        reason: 'replaced',
      });
    }
    this.io.to(audience).emit(EVENTS.ACTION_REQUESTED, {
      requestId: record.requestId,
      userId: record.userId,
      username: record.username,
      type: body.type,
      payload: record.payload,
      expiresAt: record.expiresAt,
    });
    return { ok: true, requestId: record.requestId, expiresAt: record.expiresAt };
  }

  // ---------- resolve_request ----------
  private async resolveRequest(
    { room, participant: resolver }: GuardContext,
    raw: unknown,
  ): Promise<ResolveRequestAckOk> {
    const { requestId, approve } = resolveRequestPayload.parse(raw);
    const rec = room.pendingRequests.get(requestId);
    if (!rec) throw new WsError('REQUEST_NOT_FOUND', 'Request not found or already resolved');

    // Role request sirf Host (assign_role permission), Moderator nahi.
    if (rec.type === 'become_moderator' && !PermissionService.can(resolver.role, 'assign_role')) {
      throw new WsError('FORBIDDEN', 'Only the Host can approve role requests');
    }

    // Lazy expiry check: timer se pehle bhi expired request approve nahi hogi.
    if (this.ctx.requests.isExpired(rec)) {
      await this.finish(room, rec, 'expired');
      throw new WsError('REQUEST_EXPIRED', 'This request has expired');
    }

    if (!approve) {
      await this.finish(room, rec, 'rejected');
      return { ok: true, status: 'rejected' };
    }

    if (rec.type === 'become_moderator') {
      const target = room.getParticipant(rec.userId);
      if (!target) {
        await this.finish(room, rec, 'rejected', 'requester_left');
        throw new WsError('NOT_IN_ROOM', 'The requester is not in the room');
      }
      if (target.canControlPlayback()) {
        await this.finish(room, rec, 'rejected', 'already_privileged');
        throw new WsError('ALREADY_PRIVILEGED', 'This user is already a Host or Moderator');
      }
      await this.roles.assign(room, target, 'moderator'); // assign_role wala hi raasta
      await this.finish(room, rec, 'approved');
      return { ok: true, status: 'approved' };
    }

    // Playback request: video badal gaya ho to purani request lagu nahi hogi (stale).
    if (rec.type !== 'change_video' && (rec.videoId ?? null) !== room.playback.videoId) {
      await this.finish(room, rec, 'rejected', 'stale');
      return { ok: true, status: 'rejected' };
    }
    const type = rec.type as PlaybackType;
    const state = this.playback.apply(room, type, rec.payload as PlaybackInput, resolver.userId);
    await this.finish(room, rec, 'approved'); // request hatao + save
    this.io.to(room.roomId).emit(EVENTS.SYNC_STATE, state);
    return { ok: true, status: 'approved' };
  }

  // Request hatao, save karo, aur mods/host + requester ko request_resolved bhejo.
  private async finish(room: Room, rec: PendingRequestRecord, status: RequestStatus, reason?: string): Promise<void> {
    this.ctx.requests.remove(room, rec.requestId);
    await this.ctx.roomManager.save(room);
    this.notifyResolved(room, rec, status, reason);
  }

  private notifyResolved(room: Room, rec: PendingRequestRecord, status: RequestStatus, reason?: string): void {
    const payload = { requestId: rec.requestId, status, ...(reason ? { reason } : {}) };
    this.io.to(audienceRoom(room.roomId, rec.type)).emit(EVENTS.REQUEST_RESOLVED, payload);
    const requester = room.getParticipant(rec.userId);
    if (requester?.socketId) this.io.to(requester.socketId).emit(EVENTS.REQUEST_RESOLVED, payload);
  }

  // 60 sec timer: abhi bhi pending ho to expired bhejo.
  private async expire(roomId: string, requestId: string): Promise<void> {
    try {
      const room = await this.ctx.roomManager.getRoom(roomId);
      const rec = room?.pendingRequests.get(requestId);
      if (!room || !rec) return;
      await this.finish(room, rec, 'expired');
    } catch (err) {
      logger.error({ err, roomId, requestId }, 'request expiry failed');
    }
  }
}
