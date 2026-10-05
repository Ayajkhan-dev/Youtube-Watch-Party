// RoomHandler: join_room, leave_room, disconnect (30s grace), duplicate tab, host auto-transfer.
// Sirf socket events sunta hai, validate karta hai, aur Room/RoomManager ko call karta hai.
// userId aur roomId payload se nahi: JWT (socket.data.userId) aur join ke baad socket.data.roomId se.
import { EVENTS } from '@watchparty/shared';
import type { JoinRoomAckOk, LeaveRoomAckOk, Role } from '@watchparty/shared';
import type { AppContext } from '../context.js';
import { logger } from '../logger.js';
import { Participant } from '../models/Participant.js';
import type { Room } from '../models/Room.js';
import { WsError } from '../socket/errors.js';
import { runHandler } from '../socket/handle.js';
import { dropUserRequests, replayPending } from '../socket/requestNotify.js';
import { privilegedRooms, syncModsMembership } from '../socket/rooms.js';
import type { AppServer, AppSocket } from '../socket/types.js';
import { joinRoomPayload, leaveRoomPayload } from '../validation/schemas.js';

export class RoomHandler {
  // key = `${roomId}:${userId}` -> disconnect ke baad ka grace timer
  private readonly graceTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly io: AppServer,
    private readonly ctx: AppContext,
  ) {}

  registerSocket(socket: AppSocket): void {
    socket.on(EVENTS.JOIN_ROOM, (raw: unknown, ack?: unknown) => {
      void runHandler(socket, EVENTS.JOIN_ROOM, ack, () => this.join(socket, raw));
    });
    socket.on(EVENTS.LEAVE_ROOM, (raw: unknown, ack?: unknown) => {
      void runHandler(socket, EVENTS.LEAVE_ROOM, ack, () => this.leave(socket, raw));
    });
    socket.on('disconnect', () => {
      void this.onDisconnect(socket);
    });
  }

  // Saare grace timers saaf (shutdown/tests).
  dispose(): void {
    for (const t of this.graceTimers.values()) clearTimeout(t);
    this.graceTimers.clear();
  }

  // ---------- join_room ----------
  private async join(socket: AppSocket, raw: unknown): Promise<JoinRoomAckOk> {
    const { roomId, username } = joinRoomPayload.parse(raw);
    const userId = socket.data.userId;
    const { roomManager, settings } = this.ctx;

    // Failed target-room validation should not kick a user out of their current room.
    const preview = await roomManager.getRoom(roomId);
    if (!preview) throw new WsError('ROOM_NOT_FOUND', 'Room not found');
    if (preview.isBanned(userId)) throw new WsError('BANNED', 'You have been removed from this room');
    const previewExisting = preview.getParticipant(userId);
    if (!previewExisting) {
      if (preview.participants.size >= settings.maxParticipants) throw new WsError('ROOM_FULL', 'Room is full');
      if (!preview.started && userId !== preview.creatorId) {
        throw new WsError('FORBIDDEN', 'The host has not joined the room yet');
      }
    }

    // Socket ek hi room mein active rahe; current room pehle release karo, phir target room lock lo.
    if (socket.data.roomId && socket.data.roomId !== roomId) await this.leaveCurrent(socket);

    return roomManager.withRoomLock(roomId, async () => {
      const room = await roomManager.getRoom(roomId);
      if (!room) throw new WsError('ROOM_NOT_FOUND', 'Room not found');
      if (room.isBanned(userId)) throw new WsError('BANNED', 'You have been removed from this room');

      const existing = room.getParticipant(userId);
      if (!existing) {
        if (room.participants.size >= settings.maxParticipants) throw new WsError('ROOM_FULL', 'Room is full');
        if (!room.started && userId !== room.creatorId) {
          throw new WsError('FORBIDDEN', 'The host has not joined the room yet');
        }
      }

      this.cancelGrace(roomId, userId);
      roomManager.cancelEmptyCleanup(roomId);

      let participant: Participant;
      if (existing) {
        const oldSocketId = existing.socketId;
        existing.socketId = socket.id;
        existing.connected = true;
        existing.username = username;
        participant = existing;
        if (oldSocketId && oldSocketId !== socket.id) this.replaceSocket(oldSocketId);
      } else {
        const role: Role = room.roleForJoiner(userId); // creator => host, baaki => participant (SPEC)
        if (role === 'host') room.hostId = userId;
        participant = new Participant({ userId, username, role, socketId: socket.id });
        room.addParticipant(participant);
      }

      socket.data.roomId = roomId;
      await socket.join(roomId);
      syncModsMembership(this.io, roomId, participant);
      await roomManager.save(room);

      const participants = room.listParticipants();
      this.io.to(roomId).emit(EVENTS.USER_JOINED, {
        username: participant.username,
        userId,
        role: participant.role,
        participants,
      });

      replayPending(this.io, this.ctx, room, participant);
      return {
        ok: true,
        me: participant.toDTO(),
        role: participant.role,
        participants,
        playback: room.getLiveState(Date.now()),
        chat: room.chat,
        instanceId: settings.instanceId,
      };
    });
  }

  // Purane socket ko 'replaced' bata ke disconnect. io.in(id) adapter ke saath cross-server bhi chalta hai.
  private replaceSocket(oldSocketId: string): void {
    this.io.in(oldSocketId).emit(EVENTS.REPLACED, { reason: 'You opened this room in another tab or device' });
    this.io.in(oldSocketId).disconnectSockets(true);
  }

  // ---------- leave_room ----------
  private async leave(socket: AppSocket, raw: unknown): Promise<LeaveRoomAckOk> {
    leaveRoomPayload.parse(raw ?? {}); // payload ka roomId ignore hota hai
    if (!socket.data.roomId) throw new WsError('NOT_IN_ROOM', 'You are not in a room');
    await this.leaveCurrent(socket);
    return { ok: true };
  }

  // Is socket ke current room se user ko nikalta hai (leave_room ya room badalte waqt).
  private async leaveCurrent(socket: AppSocket): Promise<void> {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    socket.data.roomId = undefined;
    await socket.leave(roomId);
    for (const r of privilegedRooms(roomId)) await socket.leave(r);

    await this.ctx.roomManager.withRoomLock(roomId, async () => {
      const room = await this.ctx.roomManager.getRoom(roomId);
      const p = room?.getParticipant(socket.data.userId);
      // Agar participant ka socket ab koi aur hai, to is (purane) socket ka leave kuch nahi badalta.
      if (!room || !p || p.socketId !== socket.id) return;
      this.cancelGrace(roomId, p.userId);
      await this.removeFromRoom(room, p);
    });
  }

  // ---------- disconnect + grace ----------
  private async onDisconnect(socket: AppSocket): Promise<void> {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    try {
      await this.ctx.roomManager.withRoomLock(roomId, async () => {
        const room = await this.ctx.roomManager.getRoom(roomId);
        const p = room?.getParticipant(socket.data.userId);
        // Replaced (purana) socket ka disconnect ignore: participant ab naye socket par hai.
        if (!room || !p || p.socketId !== socket.id) return;
        p.connected = false;
        await this.ctx.roomManager.save(room);
        this.startGrace(roomId, p.userId, socket.id);
      });
    } catch (err) {
      logger.error({ err, roomId }, 'disconnect handling failed');
    }
  }

  private startGrace(roomId: string, userId: string, socketId: string): void {
    const key = `${roomId}:${userId}`;
    this.cancelGrace(roomId, userId);
    const timer = setTimeout(() => {
      this.graceTimers.delete(key);
      void this.expireGrace(roomId, userId, socketId);
    }, this.ctx.settings.graceMs);
    timer.unref();
    this.graceTimers.set(key, timer);
  }

  private cancelGrace(roomId: string, userId: string): void {
    const key = `${roomId}:${userId}`;
    const t = this.graceTimers.get(key);
    if (t) clearTimeout(t);
    this.graceTimers.delete(key);
  }

  // Grace khatam: agar user wapas nahi aaya to leave jaisa cleanup.
  private async expireGrace(roomId: string, userId: string, socketId: string): Promise<void> {
    try {
      await this.ctx.roomManager.withRoomLock(roomId, async () => {
        const room = await this.ctx.roomManager.getRoom(roomId);
        const p = room?.getParticipant(userId);
        if (!room || !p || p.connected || p.socketId !== socketId) return;
        await this.removeFromRoom(room, p);
      });
    } catch (err) {
      logger.error({ err, roomId, userId }, 'grace expiry failed');
    }
  }

  // ---------- common cleanup ----------
  // Participant hatao (pending requests Room.removeParticipant mein hat jaati hain), host gaya to
  // auto-transfer, save, user_left (+ host_transferred) broadcast, room khali ho to delete timer.
  private async removeFromRoom(room: Room, p: Participant): Promise<void> {
    const { userId, username } = p;
    const wasHost = p.isHost();
    dropUserRequests(this.io, this.ctx, room, userId); // pending requests Host/Mods ke panel se hatao
    room.removeParticipant(userId);

    let newHostId: string | undefined;
    if (wasHost) {
      newHostId = room.pickNextHostId();
      if (newHostId) room.transferHost(newHostId);
    }
    const newHost = newHostId ? room.getParticipant(newHostId) : undefined;
    if (newHost) {
      syncModsMembership(this.io, room.roomId, newHost);
      replayPending(this.io, this.ctx, room, newHost);
    }
    await this.ctx.roomManager.save(room);

    this.io.to(room.roomId).emit(EVENTS.USER_LEFT, { username, userId, participants: room.listParticipants() });
    if (wasHost && newHostId) {
      this.io.to(room.roomId).emit(EVENTS.HOST_TRANSFERRED, {
        oldHostId: userId,
        newHostId,
        participants: room.listParticipants(),
      });
    }
    if (room.participants.size === 0) this.ctx.roomManager.scheduleEmptyCleanup(room.roomId);
  }
}
