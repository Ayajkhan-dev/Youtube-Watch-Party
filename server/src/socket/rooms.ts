// Socket.IO sub-room naam aur membership. Host + Moderator `${roomId}:mods` mein, sirf Host `${roomId}:host` mein.
// Playback requests mods-room ko jaati hain, role requests (become_moderator) sirf host-room ko.
// io.in(socketId) adapter ke saath cross-server chalta hai.
import type { RequestType } from '@watchparty/shared';
import type { Participant } from '../models/Participant.js';
import type { AppServer } from './types.js';

export function modsRoom(roomId: string): string {
  return `${roomId}:mods`;
}
export function hostRoom(roomId: string): string {
  return `${roomId}:host`;
}
// Ye socket-level sub-rooms leave/remove par saaf karne ke liye.
export function privilegedRooms(roomId: string): string[] {
  return [modsRoom(roomId), hostRoom(roomId)];
}

// Request type ke hisaab se kaun sunega: role request sirf Host, baaki Host + Moderators.
export function audienceRoom(roomId: string, type: RequestType | string): string {
  return type === 'become_moderator' ? hostRoom(roomId) : modsRoom(roomId);
}

// Participant ke role ke hisaab se mods-room / host-room mein jodo ya hatao.
// Role badalne / join / host transfer par call hota hai.
export function syncModsMembership(io: AppServer, roomId: string, p: Participant): void {
  if (!p.socketId || !p.connected) return;
  const target = io.in(p.socketId);
  if (p.canControlPlayback()) target.socketsJoin(modsRoom(roomId));
  else target.socketsLeave(modsRoom(roomId));
  if (p.isHost()) target.socketsJoin(hostRoom(roomId));
  else target.socketsLeave(hostRoom(roomId));
}
