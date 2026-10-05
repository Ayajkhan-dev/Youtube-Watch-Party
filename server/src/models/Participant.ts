// Participant: room mein ek user (userId, naam, role, socketId, connected). Socket code yahan nahi hai.
// isHost() / canControlPlayback() role ke hisaab se jawab dete hain (PermissionService se).
import type { ParticipantDTO, Role } from '@watchparty/shared';
import { PermissionService } from '../services/PermissionService.js';

export interface ParticipantInit {
  userId: string;
  username: string;
  role: Role;
  socketId: string | null;
  connected?: boolean;
  joinedAt?: number;
}

export class Participant {
  readonly userId: string;
  username: string;
  role: Role;
  socketId: string | null;
  connected: boolean;
  readonly joinedAt: number;

  constructor(init: ParticipantInit) {
    this.userId = init.userId;
    this.username = init.username;
    this.role = init.role;
    this.socketId = init.socketId;
    this.connected = init.connected ?? true;
    this.joinedAt = init.joinedAt ?? Date.now();
  }

  isHost(): boolean {
    return PermissionService.isHost(this.role);
  }

  canControlPlayback(): boolean {
    return PermissionService.can(this.role, 'play');
  }

  // Client ko jaane wala roop (socketId nahi jaata).
  toDTO(): ParticipantDTO {
    return {
      userId: this.userId,
      username: this.username,
      role: this.role,
      connected: this.connected,
      joinedAt: this.joinedAt,
    };
  }

  // Store (Redis) ke liye poora data, socketId ke saath.
  toJSON(): ParticipantInit & { joinedAt: number; connected: boolean } {
    return {
      userId: this.userId,
      username: this.username,
      role: this.role,
      socketId: this.socketId,
      connected: this.connected,
      joinedAt: this.joinedAt,
    };
  }

  static fromJSON(data: ParticipantInit): Participant {
    return new Participant(data);
  }
}
