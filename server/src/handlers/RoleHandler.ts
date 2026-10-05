// RoleHandler: assign_role, remove_participant, transfer_host (teeno sirf Host).
// Har event guard(action) ke andar: permission fail par handler chalta hi nahi. Rules (self/host target) yahan.
import { EVENTS } from '@watchparty/shared';
import type { OkAck } from '@watchparty/shared';
import type { AppContext } from '../context.js';
import type { RoleService } from '../services/RoleService.js';
import { WsError } from '../socket/errors.js';
import { guard, type GuardContext } from '../socket/guard.js';
import { onEvent } from '../socket/handle.js';
import { dropUserRequests, replayPending } from '../socket/requestNotify.js';
import { privilegedRooms, syncModsMembership } from '../socket/rooms.js';
import type { AppServer, AppSocket } from '../socket/types.js';
import {
  assignRolePayload,
  removeParticipantPayload,
  transferHostPayload,
} from '../validation/schemas.js';

export class RoleHandler {
  constructor(
    private readonly io: AppServer,
    private readonly ctx: AppContext,
    private readonly roles: RoleService,
  ) {}

  registerSocket(socket: AppSocket): void {
    const assign = guard(this.ctx, 'assign_role', (g, raw) => this.assignRole(g, raw));
    const remove = guard(this.ctx, 'remove_participant', (g, raw) => this.removeParticipant(g, raw));
    const transfer = guard(this.ctx, 'transfer_host', (g, raw) => this.transferHost(g, raw));
    onEvent(socket, EVENTS.ASSIGN_ROLE, (raw) => assign(socket, raw));
    onEvent(socket, EVENTS.REMOVE_PARTICIPANT, (raw) => remove(socket, raw));
    onEvent(socket, EVENTS.TRANSFER_HOST, (raw) => transfer(socket, raw));
  }

  // ---------- assign_role ----------
  private async assignRole({ room, participant: actor }: GuardContext, raw: unknown): Promise<OkAck> {
    const { userId, role } = assignRolePayload.parse(raw);
    if (userId === actor.userId) throw new WsError('FORBIDDEN', 'You cannot change your own role');
    const target = room.getParticipant(userId);
    if (!target) throw new WsError('NOT_IN_ROOM', 'This user is not in the room');
    if (target.isHost()) throw new WsError('FORBIDDEN', 'The Host role cannot be changed with assign_role');

    // Role badalne ka ek hi raasta (RoleService): save, mods/host room sync, role_assigned broadcast.
    await this.roles.assign(room, target, role);
    return { ok: true };
  }

  // ---------- remove_participant ----------
  private async removeParticipant({ room, participant: actor }: GuardContext, raw: unknown): Promise<OkAck> {
    const { userId } = removeParticipantPayload.parse(raw);
    if (userId === actor.userId) throw new WsError('FORBIDDEN', 'The Host cannot remove themselves');
    const target = room.getParticipant(userId);
    if (!target) throw new WsError('NOT_IN_ROOM', 'This user is not in the room');
    if (target.isHost()) throw new WsError('FORBIDDEN', 'The Host cannot be removed');

    const targetSocketId = target.socketId;
    room.ban(userId); // dobara join nahi kar payega
    dropUserRequests(this.io, this.ctx, room, userId); // uski pending requests Host/Mods ke panel se bhi hatao
    room.removeParticipant(userId); // uski pending requests bhi yahin hat jaati hain
    await this.ctx.roomManager.save(room);

    // 1) target ko batao, 2) baaki sabko participant_removed, 3) target ka socket room se nikalo aur disconnect.
    if (targetSocketId) this.io.to(targetSocketId).emit(EVENTS.REMOVED, { reason: 'The host removed you from the room' });
    this.io.to(room.roomId).emit(EVENTS.PARTICIPANT_REMOVED, { userId, participants: room.listParticipants() });
    if (targetSocketId) {
      this.io.in(targetSocketId).socketsLeave([room.roomId, ...privilegedRooms(room.roomId)]);
      this.io.in(targetSocketId).disconnectSockets(true);
    }
    return { ok: true };
  }

  // ---------- transfer_host ----------
  private async transferHost({ room, participant: actor }: GuardContext, raw: unknown): Promise<OkAck> {
    const { userId } = transferHostPayload.parse(raw);
    if (userId === actor.userId) throw new WsError('FORBIDDEN', 'You are already the host');
    const target = room.getParticipant(userId);
    if (!target) throw new WsError('NOT_IN_ROOM', 'This user is not in the room');
    if (!target.connected) throw new WsError('FORBIDDEN', 'Host can only be transferred to a connected participant');

    const oldHostId = room.hostId;
    room.transferHost(userId); // naya host = target, purana host = moderator
    await this.ctx.roomManager.save(room);
    // Dono mods-room mein rehte hain (host + moderator), phir bhi sync taaki membership pakki rahe.
    syncModsMembership(this.io, room.roomId, target);
    syncModsMembership(this.io, room.roomId, actor);
    replayPending(this.io, this.ctx, room, target); // naye host ko pending role requests dikhao

    this.io.to(room.roomId).emit(EVENTS.HOST_TRANSFERRED, {
      oldHostId,
      newHostId: userId,
      participants: room.listParticipants(),
    });
    return { ok: true };
  }
}
