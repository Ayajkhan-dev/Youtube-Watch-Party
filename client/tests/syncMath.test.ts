// syncMath unit tests: clock offset, target time, planApply/planDrift ke har branch, helpers.
import { describe, expect, it } from 'vitest';
import { parseYouTubeId } from '@watchparty/shared';
import { clockOffset, formatTime, median, planApply, planDrift, targetTime, youtubeErrorMessage, YT_STATE, type SyncLike } from '../src/lib/syncMath';

const V = 'dQw4w9WgXcQ';
const st = (o: Partial<SyncLike> = {}): SyncLike => ({ playState: 'playing', currentTime: 10, videoId: V, serverTime: 1000, ...o });
const snap = (o: Partial<{ loadedVideoId: string | null; currentTime: number; playerState: number }> = {}) => ({
  loadedVideoId: V,
  currentTime: 10,
  playerState: YT_STATE.PLAYING as number,
  ...o,
});

describe('clock', () => {
  it('median odd/even/empty, outlier se bachta hai', () => {
    expect(median([])).toBe(0);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 100])).toBe(2.5);
    expect(median([10, 11, 12, 11, 900])).toBe(11);
  });
  it('clockOffset = serverNow + rtt/2 - clientNow', () => {
    // client ghadi 1000 ms peeche: t0=0,t1=100 (rtt 100); server ne 1050 par jawab diya -> offset ~ +1000
    expect(clockOffset(0, 100, 1050)).toBe(1000);
    expect(clockOffset(500, 500, 500)).toBe(0);
  });
});

describe('targetTime', () => {
  it('playing: serverTime se ab tak ka time jodta hai; paused: currentTime', () => {
    expect(targetTime(st(), 3500)).toBe(12.5);
    expect(targetTime(st({ playState: 'paused' }), 99999)).toBe(10);
    expect(targetTime(st(), 500)).toBe(10); // future serverTime par negative nahi
  });
});

describe('planApply', () => {
  it('koi video nahi -> kuch nahi', () => {
    expect(planApply(snap(), st({ videoId: null }), 1000)).toEqual([]);
  });
  it('naya video + playing -> load (target se start); paused -> cue', () => {
    expect(planApply(snap({ loadedVideoId: null }), st(), 3000)).toEqual([{ type: 'load', videoId: V, start: 12 }]);
    expect(planApply(snap({ loadedVideoId: 'other' }), st({ playState: 'paused' }), 3000)).toEqual([{ type: 'cue', videoId: V, start: 10 }]);
  });
  it('1.0s ke andar fark par seek nahi; usse zyada par seek', () => {
    expect(planApply(snap({ currentTime: 10.9 }), st(), 1000)).toEqual([]);
    expect(planApply(snap({ currentTime: 12 }), st(), 1000)).toEqual([{ type: 'seek', to: 10 }]);
  });
  it('playing chahiye par player paused/cued -> play; buffering ho to nahi', () => {
    expect(planApply(snap({ playerState: YT_STATE.PAUSED }), st(), 1000)).toEqual([{ type: 'play' }]);
    expect(planApply(snap({ playerState: YT_STATE.CUED }), st(), 1000)).toEqual([{ type: 'play' }]);
    expect(planApply(snap({ playerState: YT_STATE.BUFFERING }), st(), 1000)).toEqual([]);
    expect(planApply(snap({ playerState: YT_STATE.ENDED }), st(), 1000)).toEqual([{ type: 'play' }]);
  });
  it('paused chahiye: chalta ho to pause; seek ke baad bhi pause (cued par seekTo play kar deta hai)', () => {
    const paused = st({ playState: 'paused' });
    expect(planApply(snap(), paused, 1000)).toEqual([{ type: 'pause' }]);
    expect(planApply(snap({ playerState: YT_STATE.PAUSED }), paused, 1000)).toEqual([]);
    expect(planApply(snap({ playerState: YT_STATE.CUED, currentTime: 50 }), paused, 1000)).toEqual([{ type: 'seek', to: 10 }, { type: 'pause' }]);
  });
});

describe('planDrift', () => {
  it('1.5s tak kuch nahi, usse zyada par seek', () => {
    expect(planDrift(snap({ currentTime: 11.4 }), st(), 1000)).toEqual([]);
    expect(planDrift(snap({ currentTime: 8 }), st(), 1000)).toEqual([{ type: 'seek', to: 10 }]);
  });
  it('paused / buffering / alag video par drift correction nahi', () => {
    expect(planDrift(snap({ currentTime: 99 }), st({ playState: 'paused' }), 1000)).toEqual([]);
    expect(planDrift(snap({ currentTime: 99, playerState: YT_STATE.BUFFERING }), st(), 1000)).toEqual([]);
    expect(planDrift(snap({ currentTime: 99, loadedVideoId: 'x' }), st(), 1000)).toEqual([]);
  });
});

describe('helpers', () => {
  it('formatTime', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65.9)).toBe('1:05');
    expect(formatTime(3725)).toBe('1:02:05');
    expect(formatTime(NaN)).toBe('0:00');
    expect(formatTime(-5)).toBe('0:00');
  });
  it('youtubeErrorMessage', () => {
    expect(youtubeErrorMessage(101)).toContain('embed');
    expect(youtubeErrorMessage(150)).toContain('embed');
    expect(youtubeErrorMessage(100)).toContain('not found');
    expect(youtubeErrorMessage(2)).toContain('Invalid');
    expect(youtubeErrorMessage(999)).toContain('999');
  });
  it('parseYouTubeId client se bhi kaam karta hai (shared)', () => {
    expect(parseYouTubeId('https://youtu.be/dQw4w9WgXcQ?si=x')).toBe(V);
    expect(parseYouTubeId('nope')).toBeNull();
  });
});

describe('parseYouTubeId compatibility matrix', () => {
  it('accepts the SPEC-supported YouTube URL shapes and raw 11-char IDs', () => {
    const cases = [
      'dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10',
      'https://youtu.be/dQw4w9WgXcQ?si=abc',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://www.youtube.com/live/dQw4w9WgXcQ?si=abc',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    ];
    for (const input of cases) expect(parseYouTubeId(input)).toBe(V);
  });

  it('rejects malformed, wrong-length and unsupported host inputs', () => {
    const invalid = [
      '',
      'short',
      '1234567890',
      '123456789012',
      'https://example.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com/not-a-real-route/dQw4w9WgXcQ',
    ];
    for (const input of invalid) expect(parseYouTubeId(input)).toBeNull();
  });
});
