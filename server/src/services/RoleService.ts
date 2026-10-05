// RoleService: role badalne ka ek hi raasta. assign_role (Host) aur become_moderator approval dono yahi chalate hain.
// setRole -> save -> mods/host room sync -> role_assigned broadcast -> (naye mod ko) pending requests.
import { EVENTS } from '@watchparty/shared';
import type { Role } from '@watchparty/shared';
import type { AppContext } from '../context.js';
import type { Participant } from '../models/Participant.js';
import type { Room } from '../models/Room.js';
import { replayPending } from '../socket/requestNotify.js';
import { syncModsMembership } from '../socket/rooms.js';
import type { AppServer } from '../socket/types.js';

export class RoleService {
  constructor(
    private readonly io: AppServer,
    private readonly ctx: AppContext,
  ) {}

  // Caller pehle saari rules check kar chuka hota hai (target host nahi, role assignable, room mein hai).
  async assign(room: Room, target: Participant, role: Exclude<Role, 'host'>): Promise<void> {
    room.setRole(target.userId, role);
    await this.ctx.roomManager.save(room);
    syncModsMembership(this.io, room.roomId, target);
    this.io.to(room.roomId).emit(EVENTS.ROLE_ASSIGNED, {
      userId: target.userId,
      username: target.username,
      role: target.role,
      participants: room.listParticipants(),
    });
    replayPending(this.io, this.ctx, room, target); // naya moderator ho gaya to pending requests dikhao
  }
}
