// Phase 6 integration tests: play/pause/seek/change_video sync, FORBIDDEN, late joiner, rate limit, request_sync, time_sync.
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { SyncStatePayload } from '@watchparty/shared';
import { startTestServer } from './helpers.js';
import { makeKit, sleep, type TestServer } from './socketUtils.js';

let server: TestServer;
let kit: ReturnType<typeof makeKit>;

beforeAll(async () => {
  server = await startTestServer({ graceMs: 150, emptyRoomTtlMs: 5000 });
  kit = makeKit(server);
});
afterAll(async () => {
  await server.close();
});
afterEach(() => kit.closeAll());

const VID = 'dQw4w9WgXcQ';
const VID2 = 'jNQXAC9IVRw';

describe('host playback', () => {
  it('Host ka pause/play/seek/change_video sab clients ko sync_state deta hai', async () => {
    const { c, sHost, sA, sB } = await kit.setup3();

    // change_video: 0 sec, playing, videoId set
    let a = kit.waitFor<SyncStatePayload>(sA, 'sync_state');
    let b = kit.waitFor<SyncStatePayload>(sB, 'sync_state');
    const h = kit.waitFor<SyncStatePayload>(sHost, 'sync_state'); // host ko bhi milta hai (single path)
    expect((await kit.emitAck(sHost, 'change_video', { videoId: VID })).ok).toBe(true);
    for (const s of [await a, await b, await h]) {
      expect(s).toMatchObject({ videoId: VID, playState: 'playing', currentTime: 0, updatedBy: c.userId });
      expect(s.version).toBe(1);
      expect(s.serverTime).toBeGreaterThan(0);
      expect(s.updatedAt).toBe(s.serverTime);
    }

    // pause with client time
    a = kit.waitFor(sA, 'sync_state');
    b = kit.waitFor(sB, 'sync_state');
    await kit.emitAck(sHost, 'pause', { time: 42.5 });
    for (const s of [await a, await b]) {
      expect(s).toMatchObject({ playState: 'paused', currentTime: 42.5, videoId: VID });
      expect(s.version).toBe(2);
    }

    // seek: paused hi rehta hai
    a = kit.waitFor(sA, 'sync_state');
    await kit.emitAck(sHost, 'seek', { time: 100 });
    expect(await a).toMatchObject({ playState: 'paused', currentTime: 100, version: 3 });

    // play without time: server liveTime (paused 100) se
    a = kit.waitFor(sA, 'sync_state');
    await kit.emitAck(sHost, 'play');
    expect(await a).toMatchObject({ playState: 'playing', currentTime: 100, version: 4 });

    // seek while playing: playing hi rehta hai
    a = kit.waitFor(sA, 'sync_state');
    await kit.emitAck(sHost, 'seek', { time: 7 });
    expect(await a).toMatchObject({ playState: 'playing', currentTime: 7, version: 5 });
  });

  it('PDF style: play ack ke bina, aur emit(event, ackFn) dono chalte hain', async () => {
    const { sHost, sA } = await kit.setup3();
    const a = kit.waitFor<SyncStatePayload>(sA, 'sync_state');
    sHost.emit('play'); // payload bhi nahi, ack bhi nahi
    expect((await a).playState).toBe('playing');
    const ack = await new Promise<{ ok: boolean }>((res) => sHost.emit('pause', res)); // pehla arg ack
    expect(ack.ok).toBe(true);
  });

  it('change_video poora YouTube URL bhi accept karta hai (server ID nikalta hai)', async () => {
    const { sHost, sA } = await kit.setup3();
    const a = kit.waitFor<SyncStatePayload>(sA, 'sync_state');
    await kit.emitAck(sHost, 'change_video', { videoId: `https://youtu.be/${VID2}?si=abc&t=10` });
    expect((await a).videoId).toBe(VID2);
  });

  it('invalid payloads INVALID_PAYLOAD dete hain aur state nahi badalta', async () => {
    const { c, sHost } = await kit.setup3();
    const bad: [string, unknown][] = [
      ['seek', { time: -1 }],
      ['seek', { time: 86401 }],
      ['seek', { time: 'abc' }],
      ['seek', {}],
      ['seek', { time: Infinity }],
      ['play', { time: -5 }],
      ['pause', { time: 'x' }],
      ['change_video', { videoId: 'short' }],
      ['change_video', { videoId: 'https://example.com/watch?v=dQw4w9WgXcQ' }],
      ['change_video', {}],
      ['change_video', { videoId: 123 }],
    ];
    for (const [ev, p] of bad) {
      const ack = await kit.emitAck(sHost, ev, p);
      expect(ack.error?.code, `${ev} ${JSON.stringify(p)}`).toBe('INVALID_PAYLOAD');
    }
    const room = (await server.ctx.roomManager.getRoom(c.roomId))!;
    expect(room.playback.version).toBe(0);
    // boundary: 0 aur 86400 valid
    expect((await kit.emitAck(sHost, 'seek', { time: 0 })).ok).toBe(true);
    expect((await kit.emitAck(sHost, 'seek', { time: 86400 })).ok).toBe(true);
  });
});

describe('moderator aur participant', () => {
  it('Moderator ka play sab ko sync_state deta hai; Participant ka play reject', async () => {
    const { g1, sHost, sA, sB } = await kit.setup3();
    await kit.emitAck(sHost, 'assign_role', { userId: g1.userId, role: 'moderator' });

    const h = kit.waitFor<SyncStatePayload>(sHost, 'sync_state');
    const b = kit.waitFor<SyncStatePayload>(sB, 'sync_state');
    expect((await kit.emitAck(sA, 'change_video', { videoId: VID })).ok).toBe(true);
    expect((await h).updatedBy).toBe(g1.userId);
    expect((await b).videoId).toBe(VID);

    const none = kit.expectNone(sHost, 'sync_state');
    const ack = await kit.emitAck(sB, 'play', {});
    expect(ack.error?.code).toBe('FORBIDDEN');
    expect(await none).toBe(true);
  });

  it('Viewer bhi playback nahi chala sakta', async () => {
    const { g2, sHost, sB } = await kit.setup3();
    await kit.emitAck(sHost, 'assign_role', { userId: g2.userId, role: 'viewer' });
    expect((await kit.emitAck(sB, 'pause', {})).error?.code).toBe('FORBIDDEN');
  });
});

describe('late joiner aur request_sync / time_sync', () => {
  it('late joiner ko sahi liveTime milta hai (join ack mein)', async () => {
    const c = await kit.createRoom('Creator');
    const sHost = await kit.connectWith(c.token);
    await kit.joinOk(sHost, c.roomId, 'Creator');
    await kit.emitAck(sHost, 'change_video', { videoId: VID });
    await kit.emitAck(sHost, 'seek', { time: 50 });
    await sleep(1100); // playing: ~1.1 sec guzar gaye

    const g = await kit.guest(c.roomId, 'Late');
    const sL = await kit.connectWith(g.token);
    const ack = await kit.joinOk(sL, c.roomId, 'Late');
    expect(ack.playback.playState).toBe('playing');
    expect(ack.playback.videoId).toBe(VID);
    expect(ack.playback.currentTime).toBeGreaterThan(50.9);
    expect(ack.playback.currentTime).toBeLessThan(52.5);

    // paused ho to time freeze rehta hai
    await kit.emitAck(sHost, 'pause', { time: 60 });
    await sleep(300);
    const g2 = await kit.guest(c.roomId, 'Late2');
    const sL2 = await kit.connectWith(g2.token);
    const ack2 = await kit.joinOk(sL2, c.roomId, 'Late2');
    expect(ack2.playback).toMatchObject({ playState: 'paused', currentTime: 60 });
  });

  it('request_sync: sirf sender ko fresh sync_state; 2 sec mein dobara RATE_LIMITED', async () => {
    const { sHost, sB } = await kit.setup3();
    await kit.emitAck(sHost, 'change_video', { videoId: VID });
    await sleep(100);
    const none = kit.expectNone(sHost, 'sync_state');
    const mine = kit.waitFor<SyncStatePayload>(sB, 'sync_state');
    const ack = await kit.emitAck(sB, 'request_sync');
    expect(ack.ok).toBe(true);
    expect(await mine).toMatchObject({ videoId: VID, playState: 'playing' });
    expect(await none).toBe(true);
    const again = await kit.emitAck(sB, 'request_sync');
    expect(again.error?.code).toBe('RATE_LIMITED');
  });

  it('request_sync room join kiye bina NOT_IN_ROOM', async () => {
    const c = await kit.createRoom('Creator');
    const s = await kit.connectWith(c.token);
    expect((await kit.emitAck(s, 'request_sync')).error?.code).toBe('NOT_IN_ROOM');
  });

  it('time_sync ack serverNow deta hai (room join ke bina bhi)', async () => {
    const c = await kit.createRoom('Creator');
    const s = await kit.connectWith(c.token);
    const before = Date.now();
    const res = await new Promise<{ serverNow: number }>((r) => s.emit('time_sync', { t0: before }, r));
    expect(res.serverNow).toBeGreaterThanOrEqual(before);
    expect(res.serverNow).toBeLessThanOrEqual(Date.now());
  });
});

describe('rate limit', () => {
  it('10 playback events / 5 sec ke baad RATE_LIMITED', async () => {
    const { sHost } = await kit.setup3();
    const codes: (string | undefined)[] = [];
    for (let i = 0; i < 13; i++) {
      const ack = await kit.emitAck(sHost, 'seek', { time: i });
      codes.push(ack.ok ? 'ok' : ack.error?.code);
    }
    expect(codes.slice(0, 10).every((x) => x === 'ok')).toBe(true);
    expect(codes.slice(10).every((x) => x === 'RATE_LIMITED')).toBe(true);
  });
});

describe('replaced socket', () => {
  it('purane (replaced) socket se aaya event accept nahi hota', async () => {
    const { c, sHost } = await kit.setup3();
    const sHost2 = await kit.connectWith(c.token);
    await kit.joinOk(sHost2, c.roomId, 'Creator'); // purana sHost replaced ho gaya
    await sleep(100);
    expect(sHost.connected).toBe(false); // purana socket server ne band kar diya
    expect((await kit.emitAck(sHost2, 'pause', {})).ok).toBe(true);
  });
});
