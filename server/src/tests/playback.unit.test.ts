// PlaybackService + parseYouTubeId + TokenBucket unit tests (socket ke bina).
import { describe, it, expect } from 'vitest';
import { parseYouTubeId } from '@watchparty/shared';
import { Room } from '../models/Room.js';
import { PlaybackService } from '../services/PlaybackService.js';
import { TokenBucket } from '../socket/rateLimiter.js';
import { changeVideoPayload, playPayload, seekPayload } from '../validation/schemas.js';

describe('PlaybackService', () => {
  const svc = new PlaybackService();
  const T0 = 1_000_000;

  it('play: time diya to wahi; na diya to liveTime (paused me currentTime)', () => {
    const room = new Room('ABCDEF', 'host', T0);
    expect(svc.play(room, 'host', undefined, T0 + 5000).currentTime).toBe(0);
    const s = svc.play(room, 'host', 33, T0 + 6000);
    expect(s).toMatchObject({ playState: 'playing', currentTime: 33, version: 2, updatedBy: 'host' });
  });

  it('pause: playing me liveTime freeze hota hai', () => {
    const room = new Room('ABCDEF', 'host', T0);
    svc.seek(room, 'host', 10, T0);
    svc.play(room, 'host', undefined, T0);
    const s = svc.pause(room, 'host', undefined, T0 + 4000);
    expect(s).toMatchObject({ playState: 'paused', currentTime: 14 });
    expect(room.getLiveTime(T0 + 99_000)).toBe(14);
  });

  it('seek playState nahi badalta; change_video 0 se playing; version har baar +1', () => {
    const room = new Room('ABCDEF', 'host', T0);
    expect(svc.seek(room, 'host', 20, T0).playState).toBe('paused');
    const s = svc.changeVideo(room, 'm1', 'dQw4w9WgXcQ', T0 + 1);
    expect(s).toMatchObject({ videoId: 'dQw4w9WgXcQ', currentTime: 0, playState: 'playing', version: 2, updatedBy: 'm1' });
  });

  it('apply() type ke hisaab se dispatch karta hai; change_video bina videoId error', () => {
    const room = new Room('ABCDEF', 'host', T0);
    expect(svc.apply(room, 'seek', { time: 5 }, 'host', T0).currentTime).toBe(5);
    expect(svc.apply(room, 'change_video', { videoId: 'jNQXAC9IVRw' }, 'host', T0).videoId).toBe('jNQXAC9IVRw');
    expect(() => svc.apply(room, 'change_video', {}, 'host', T0)).toThrow();
  });
});

describe('parseYouTubeId', () => {
  const ID = 'dQw4w9WgXcQ';
  it.each([
    [ID, ID],
    [`https://www.youtube.com/watch?v=${ID}`, ID],
    [`https://www.youtube.com/watch?v=${ID}&t=42s&list=PL1`, ID],
    [`https://m.youtube.com/watch?v=${ID}`, ID],
    [`youtube.com/watch?v=${ID}`, ID],
    [`https://youtu.be/${ID}`, ID],
    [`https://youtu.be/${ID}?si=xyz`, ID],
    [`https://www.youtube.com/shorts/${ID}`, ID],
    [`https://www.youtube.com/embed/${ID}`, ID],
    [`https://www.youtube.com/live/${ID}?feature=share`, ID],
    [`  ${ID}  `, ID],
  ])('%s -> %s', (input, expected) => {
    expect(parseYouTubeId(input)).toBe(expected);
  });
  it.each(['', '   ', 'short', 'https://example.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/watch', 'https://www.youtube.com/watch?v=tooshort', 'not a url at all!!', 'https://youtu.be/'])(
    'invalid %j -> null',
    (input) => {
      expect(parseYouTubeId(input)).toBeNull();
    },
  );
});

describe('zod playback schemas', () => {
  it('play payload optional', () => {
    expect(playPayload.parse(undefined)).toEqual({});
    expect(playPayload.parse(null)).toEqual({});
    expect(playPayload.parse({ time: 3 })).toEqual({ time: 3 });
    expect(() => playPayload.parse({ time: -1 })).toThrow();
  });
  it('seek time range', () => {
    expect(seekPayload.parse({ time: 0 }).time).toBe(0);
    expect(() => seekPayload.parse({ time: 86401 })).toThrow();
    expect(() => seekPayload.parse({})).toThrow();
  });
  it('change_video URL se ID nikalta hai', () => {
    expect(changeVideoPayload.parse({ videoId: 'https://youtu.be/dQw4w9WgXcQ' }).videoId).toBe('dQw4w9WgXcQ');
    expect(() => changeVideoPayload.parse({ videoId: 'nope' })).toThrow();
  });
});

describe('TokenBucket', () => {
  it('capacity ke baad block, time ke saath refill', () => {
    const b = new TokenBucket(2, 1000, 0);
    expect(b.tryTake(0)).toBe(true);
    expect(b.tryTake(0)).toBe(true);
    expect(b.tryTake(0)).toBe(false);
    expect(b.tryTake(500)).toBe(true); // 500ms = 1 token
    expect(b.tryTake(500)).toBe(false);
  });
});
