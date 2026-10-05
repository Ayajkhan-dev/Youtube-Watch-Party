// PlaybackService: room ka playback state badalta hai (play/pause/seek/change_video). Socket code nahi.
// Direct Host/Mod action aur (Phase 7) approve hui request, dono isi se chalenge: apply(type, payload, actor).
import type { SyncStatePayload } from '@watchparty/shared';
import type { Room } from '../models/Room.js';

export type PlaybackType = 'play' | 'pause' | 'seek' | 'change_video';
export interface PlaybackInput {
  time?: number; // play/pause/seek
  videoId?: string; // change_video (validated 11-char ID)
}

export class PlaybackService {
  // play: time diya to wahi, warna server ka liveTime. playState = playing.
  play(room: Room, actorId: string, time: number | undefined, now: number = Date.now()): SyncStatePayload {
    room.applyPlayback({ playState: 'playing', currentTime: time ?? room.getLiveTime(now) }, now, actorId);
    return room.getLiveState(now);
  }

  pause(room: Room, actorId: string, time: number | undefined, now: number = Date.now()): SyncStatePayload {
    room.applyPlayback({ playState: 'paused', currentTime: time ?? room.getLiveTime(now) }, now, actorId);
    return room.getLiveState(now);
  }

  // seek: playState jaisa tha waisa; sirf position badalti hai.
  seek(room: Room, actorId: string, time: number, now: number = Date.now()): SyncStatePayload {
    room.applyPlayback({ currentTime: time }, now, actorId);
    return room.getLiveState(now);
  }

  // change_video: naya video 0 sec se, playing.
  changeVideo(room: Room, actorId: string, videoId: string, now: number = Date.now()): SyncStatePayload {
    room.applyPlayback({ videoId, currentTime: 0, playState: 'playing' }, now, actorId);
    return room.getLiveState(now);
  }

  // Ek jagah se type ke hisaab se dispatch (Phase 7 approval flow yahi use karega).
  apply(
    room: Room,
    type: PlaybackType,
    input: PlaybackInput,
    actorId: string,
    now: number = Date.now(),
  ): SyncStatePayload {
    switch (type) {
      case 'play':
        return this.play(room, actorId, input.time, now);
      case 'pause':
        return this.pause(room, actorId, input.time, now);
      case 'seek':
        return this.seek(room, actorId, input.time ?? 0, now);
      case 'change_video':
        if (!input.videoId) throw new Error('videoId required');
        return this.changeVideo(room, actorId, input.videoId, now);
    }
  }
}
