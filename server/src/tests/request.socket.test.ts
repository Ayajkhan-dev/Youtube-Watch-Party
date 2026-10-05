// Phase 7 integration tests: request_action -> action_requested -> resolve_request (approve/reject/expiry/stale).
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { ActionRequestedPayload, RequestResolvedPayload, SyncStatePayload } from '@watchparty/shared';
import { startTestServer } from './helpers.js';
import { makeKit, sleep, type TestServer } from './socketUtils.js';

let server: TestServer;
let kit: ReturnType<typeof makeKit>;

beforeAll(async () => {
  // requestTtlMs chhota (400ms) taaki expiry test jaldi ho; baaki tests ke liye kaafi.
  server = await startTestServer({ graceMs: 150, emptyRoomTtlMs: 5000, requestTtlMs: 400, restRateLimitPerMin: 10_000 });
  kit = makeKit(server);
});
afterAll(async () => {
  await server.close();
});
afterEach(() => kit.closeAll());

const VID = 'dQw4w9WgXcQ';
const VID2 = 'jNQXAC9IVRw';
type ReqAck = { ok: boolean; requestId?: string; expiresAt?: number; status?: string; error?: { code: string } };

// Host + Alice (moderator) + Bob (participant) + Carol (viewer)
async function setup4() {
  const base = await kit.setup3();
  const g3 = await kit.guest(base.roomId, 'Carol');
  const sC = await kit.connectWith(g3.token);
  await kit.joinOk(sC, base.roomId, 'Carol');
  await kit.emitAck(base.sHost, 'assign_role', { userId: base.g1.userId, role: 'moderator' });
  await kit.emitAck(base.sHost, 'assign_role', { userId: g3.userId, role: 'viewer' });
  await sleep(30);
  return { ...base, g3, sC };
}

describe('request_action', () => {
  it('Participant request -> sirf Host/Mod ko action_requested; participant/viewer ko nahi; requester ko ack', async () => {
    const { g2, sHost, sA, sB, sC } = await setup4();
    const toHost = kit.waitFor<ActionRequestedPayload>(sHost, 'action_requested');
    const toMod = kit.waitFor<ActionRequestedPayload>(sA, 'action_requested');
    const noneB = kit.expectNone(sB, 'action_requested');
    const noneC = kit.expectNone(sC, 'action_requested');

    const ack = await kit.emitAck<ReqAck>(sB, 'request_action', { type: 'seek', payload: { time: 90 } });
    expect(ack.ok).toBe(true);
    expect(ack.requestId).toBeTruthy();
    for (const ev of [await toHost, await toMod]) {
      expect(ev).toMatchObject({ requestId: ack.requestId, userId: g2.userId, username: 'Bob', type: 'seek', payload: { time: 90 } });
      expect(ev.expiresAt).toBe(ack.expiresAt);
    }
    expect(await noneB).toBe(true);
    expect(await noneC).toBe(true);
  });

  it('Viewer bhi request bhej sakta hai; change_video URL se ID normalize hota hai', async () => {
    const { sHost, sC } = await setup4();
    const ev = kit.waitFor<ActionRequestedPayload>(sHost, 'action_requested');
    const ack = await kit.emitAck<ReqAck>(sC, 'request_action', { type: 'change_video', payload: { videoId: `https://youtu.be/${VID2}` } });
    expect(ack.ok).toBe(true);
    expect((await ev).payload).toEqual({ videoId: VID2 });
  });

  it('Host/Moderator request_action nahi kar sakte (FORBIDDEN)', async () => {
    const { sHost, sA } = await setup4();
    expect((await kit.emitAck<ReqAck>(sHost, 'request_action', { type: 'play' })).error?.code).toBe('FORBIDDEN');
    expect((await kit.emitAck<ReqAck>(sA, 'request_action', { type: 'become_moderator' })).error?.code).toBe('FORBIDDEN');
  });

  it('invalid type / payload INVALID_PAYLOAD; kuch pending nahi banta', async () => {
    const { c, sB } = await setup4();
    const bad: unknown[] = [
      { type: 'nope' },
      { type: 'seek' },
      { type: 'seek', payload: { time: -4 } },
      { type: 'change_video', payload: { videoId: 'bad' } },
      { type: 'assign_role', payload: {} },
      undefined,
    ];
    for (const b of bad) expect((await kit.emitAck<ReqAck>(sB, 'request_action', b)).error?.code, JSON.stringify(b)).toBe('INVALID_PAYLOAD');
    const room = (await server.ctx.roomManager.getRoom(c.roomId))!;
    expect(room.pendingRequests.size).toBe(0);
  });

  it('same type ki duplicate pending replace hoti hai', async () => {
    const { c, sHost, sB } = await setup4();
    const first = await kit.emitAck<ReqAck>(sB, 'request_action', { type: 'play' });
    const resolvedOld = kit.waitFor<RequestResolvedPayload>(sHost, 'request_resolved');
    const second = await kit.emitAck<ReqAck>(sB, 'request_action', { type: 'play' });
    expect(second.requestId).not.toBe(first.requestId);
    expect(await resolvedOld).toMatchObject({ requestId: first.requestId, status: 'expired', reason: 'replaced' });
    const room = (await server.ctx.roomManager.getRoom(c.roomId))!;
    expect([...room.pendingRequests.keys()]).toEqual([second.requestId]);
  });
});

describe('resolve_request: playback', () => {
  it('Participant request -> Mod approve -> sabko sync_state (updatedBy = approver); requester ko approved', async () => {
    const { g1, sHost, sA, sB } = await setup4();
    await kit.emitAck(sHost, 'change_video', { videoId: VID });
    await sleep(30);
    const ack = await kit.emitAck<ReqAck>(sB, 'request_action', { type: 'seek', payload: { time: 77 } });

    const syncB = kit.waitFor<SyncStatePayload>(sB, 'sync_state');
    const syncHost = kit.waitFor<SyncStatePayload>(sHost, 'sync_state');
    const resB = kit.waitFor<RequestResolvedPayload>(sB, 'request_resolved');
    const resHost = kit.waitFor<RequestResolvedPayload>(sHost, 'request_resolved');
    const r = await kit.emitAck<ReqAck>(sA, 'resolve_request', { requestId: ack.requestId, approve: true });
    expect(r).toMatchObject({ ok: true, status: 'approved' });
    for (const s of [await syncB, await syncHost]) {
      expect(s).toMatchObject({ currentTime: 77, videoId: VID, playState: 'playing', updatedBy: g1.userId });
    }
    expect(await resB).toEqual({ requestId: ack.requestId, status: 'approved' });
    expect(await resHost).toEqual({ requestId: ack.requestId, status: 'approved' });
  });

  it('change_video, play, pause requests approve hone par lagu hoti hain', async () => {
    const { sHost, sB } = await setup4();
    const a1 = await kit.emitAck<ReqAck>(sB, 'request_action', { type: 'change_video', payload: { videoId: VID } });
    let sync = kit.waitFor<SyncStatePayload>(sB, 'sync_state');
    await kit.emitAck(sHost, 'resolve_request', { requestId: a1.requestId, approve: true });
    expect(await sync).toMatchObject({ videoId: VID, playState: 'playing', currentTime: 0 });

    const a2 = await kit.emitAck<ReqAck>(sB, 'request_action', { type: 'pause', payload: { time: 12 } });
    sync = kit.waitFor(sB, 'sync_state');
    await kit.emitAck(sHost, 'resolve_request', { requestId: a2.requestId, approve: true });
    expect(await sync).toMatchObject({ playState: 'paused', currentTime: 12 });

    const a3 = await kit.emitAck<ReqAck>(sB, 'request_action', { type: 'play' });
    sync = kit.waitFor(sB, 'sync_state');
    await kit.emitAck(sHost, 'resolve_request', { requestId: a3.requestId, approve: true });
    expect(await sync).toMatchObject({ playState: 'playing', currentTime: 12 });
  });

  it('reject: koi sync_state nahi, requester ko rejected, state same', async () => {
    const { c, sHost, sB } = await setup4();
    const ack = await kit.emitAck<ReqAck>(sB, 'request_action', { type: 'play' });
    const none = kit.expectNone(sB, 'sync_state');
    const resB = kit.waitFor<RequestResolvedPayload>(sB, 'request_resolved');
    const r = await kit.emitAck<ReqAck>(sHost, 'resolve_request', { requestId: ack.requestId, approve: false });
    expect(r).toMatchObject({ ok: true, status: 'rejected' });
    expect((await resB).status).toBe('rejected');
    expect(await none).toBe(true);
    const room = (await server.ctx.roomManager.getRoom(c.roomId))!;
    expect(room.playback.version).toBe(0);
    expect(room.pendingRequests.size).toBe(0);
  });

  it('Participant/Viewer resolve_request FORBIDDEN; request pending rehti hai', async () => {
    const { c, sB, sC } = await setup4();
    const ack = await kit.emitAck<ReqAck>(sB, 'request_action', { type: 'play' });
    expect((await kit.emitAck<ReqAck>(sB, 'resolve_request', { requestId: ack.requestId, approve: true })).error?.code).toBe('FORBIDDEN');
    expect((await kit.emitAck<ReqAck>(sC, 'resolve_request', { requestId: ack.requestId, approve: true })).error?.code).toBe('FORBIDDEN');
    const room = (await server.ctx.roomManager.getRoom(c.roomId))!;
    expect(room.pendingRequests.has(ack.requestId!)).toBe(true);
    expect(room.playback.version).toBe(0);
  });

  it('double resolve / unknown id REQUEST_NOT_FOUND; invalid payload INVALID_PAYLOAD', async () => {
    const { sHost, sB } = await setup4();
    const ack = await kit.emitAck<ReqAck>(sB, 'request_action', { type: 'play' });
    expect((await kit.emitAck<ReqAck>(sHost, 'resolve_request', { requestId: ack.requestId, approve: false })).ok).toBe(true);
    expect((await kit.emitAck<ReqAck>(sHost, 'resolve_request', { requestId: ack.requestId, approve: true })).error?.code).toBe('REQUEST_NOT_FOUND');
    expect((await kit.emitAck<ReqAck>(sHost, 'resolve_request', { requestId: 'zzz', approve: true })).error?.code).toBe('REQUEST_NOT_FOUND');
    expect((await kit.emitAck<ReqAck>(sHost, 'resolve_request', { requestId: 'x', approve: 'yes' })).error?.code).toBe('INVALID_PAYLOAD');
  });

  it('expiry: 60s (yahan 400ms) baad expired dono ko; late approve REQUEST_EXPIRED', async () => {
    const { c, sHost, sB } = await setup4();
    const ack = await kit.emitAck<ReqAck>(sB, 'request_action', { type: 'play' });
    const resB = kit.waitFor<RequestResolvedPayload>(sB, 'request_resolved', 1500);
    const resHost = kit.waitFor<RequestResolvedPayload>(sHost, 'request_resolved', 1500);
    expect(await resB).toEqual({ requestId: ack.requestId, status: 'expired' });
    expect((await resHost).status).toBe('expired');
    const room = (await server.ctx.roomManager.getRoom(c.roomId))!;
    expect(room.pendingRequests.size).toBe(0);
    expect((await kit.emitAck<ReqAck>(sHost, 'resolve_request', { requestId: ack.requestId, approve: true })).error?.code).toBe('REQUEST_NOT_FOUND');
    expect(room.playback.version).toBe(0);
  });

  it('lazy expiry: timer se pehle bhi expired request approve nahi hoti', async () => {
    const { c, sHost, sB } = await setup4();
    const ack = await kit.emitAck<ReqAck>(sB, 'request_action', { type: 'play' });
    const room = (await server.ctx.roomManager.getRoom(c.roomId))!;
    room.pendingRequests.get(ack.requestId!)!.expiresAt = Date.now() - 1; // timer abhi chala nahi
    const r = await kit.emitAck<ReqAck>(sHost, 'resolve_request', { requestId: ack.requestId, approve: true });
    expect(r.error?.code).toBe('REQUEST_EXPIRED');
    expect(room.playback.version).toBe(0);
  });

  it('stale: video badal gaya to purani seek request approve par auto-reject', async () => {
    const { c, sHost, sB } = await setup4();
    await kit.emitAck(sHost, 'change_video', { videoId: VID });
    const ack = await kit.emitAck<ReqAck>(sB, 'request_action', { type: 'seek', payload: { time: 50 } });
    await kit.emitAck(sHost, 'change_video', { videoId: VID2 });
    const resB = kit.waitFor<RequestResolvedPayload>(sB, 'request_resolved');
    const r = await kit.emitAck<ReqAck>(sHost, 'resolve_request', { requestId: ack.requestId, approve: true });
    expect(r).toMatchObject({ ok: true, status: 'rejected' });
    expect(await resB).toMatchObject({ status: 'rejected', reason: 'stale' });
    const room = (await server.ctx.roomManager.getRoom(c.roomId))!;
    expect(room.playback.videoId).toBe(VID2);
    expect(room.playback.currentTime).toBe(0); // seek lagu nahi hua
  });
});

describe('become_moderator (role request)', () => {
  it('sirf Host ko action_requested milta hai, Moderator ko nahi', async () => {
    const { sHost, sA, sB } = await setup4();
    const toHost = kit.waitFor<ActionRequestedPayload>(sHost, 'action_requested');
    const noneMod = kit.expectNone(sA, 'action_requested');
    const ack = await kit.emitAck<ReqAck>(sB, 'request_action', { type: 'become_moderator' });
    expect(ack.ok).toBe(true);
    expect((await toHost).type).toBe('become_moderator');
    expect(await noneMod).toBe(true);
  });

  it('Moderator approve nahi kar sakta (FORBIDDEN); Host approve kare to role_assigned sab ko', async () => {
    const { g2, sHost, sA, sB, c } = await setup4();
    const ack = await kit.emitAck<ReqAck>(sB, 'request_action', { type: 'become_moderator' });
    expect((await kit.emitAck<ReqAck>(sA, 'resolve_request', { requestId: ack.requestId, approve: true })).error?.code).toBe('FORBIDDEN');
    expect((await server.ctx.roomManager.getRoom(c.roomId))!.getParticipant(g2.userId)?.role).toBe('participant');

    const roleEv = kit.waitFor<{ userId: string; role: string }>(sA, 'role_assigned');
    const resB = kit.waitFor<RequestResolvedPayload>(sB, 'request_resolved');
    const r = await kit.emitAck<ReqAck>(sHost, 'resolve_request', { requestId: ack.requestId, approve: true });
    expect(r).toMatchObject({ ok: true, status: 'approved' });
    expect(await roleEv).toMatchObject({ userId: g2.userId, role: 'moderator' });
    expect((await resB).status).toBe('approved');
    // Ab Bob playback chala sakta hai
    expect((await kit.emitAck(sB, 'pause', {})).ok).toBe(true);
  });

  it('Host reject kare to role nahi badalta', async () => {
    const { g2, sHost, sB, c } = await setup4();
    const ack = await kit.emitAck<ReqAck>(sB, 'request_action', { type: 'become_moderator' });
    await kit.emitAck(sHost, 'resolve_request', { requestId: ack.requestId, approve: false });
    expect((await server.ctx.roomManager.getRoom(c.roomId))!.getParticipant(g2.userId)?.role).toBe('participant');
  });

  it('request ke dauraan Host ne pehle hi moderator bana diya: approve par ALREADY_PRIVILEGED', async () => {
    const { g2, sHost, sB, c } = await setup4();
    const ack = await kit.emitAck<ReqAck>(sB, 'request_action', { type: 'become_moderator' });
    await kit.emitAck(sHost, 'assign_role', { userId: g2.userId, role: 'moderator' });
    const r = await kit.emitAck<ReqAck>(sHost, 'resolve_request', { requestId: ack.requestId, approve: true });
    expect(r.error?.code).toBe('ALREADY_PRIVILEGED');
    expect((await server.ctx.roomManager.getRoom(c.roomId))!.pendingRequests.size).toBe(0);
  });
});

describe('cleanup aur replay', () => {
  it('requester leave kare to pending request hat jaati hai aur Host/Mod ko batata hai', async () => {
    const { c, sHost, sB } = await setup4();
    const ack = await kit.emitAck<ReqAck>(sB, 'request_action', { type: 'play' });
    const resHost = kit.waitFor<RequestResolvedPayload>(sHost, 'request_resolved');
    await kit.emitAck(sB, 'leave_room', {});
    expect(await resHost).toMatchObject({ requestId: ack.requestId, reason: 'requester_left' });
    expect((await server.ctx.roomManager.getRoom(c.roomId))!.pendingRequests.size).toBe(0);
  });

  it('requester remove ho to uski requests hat jaati hain; disconnect + grace expiry par bhi', async () => {
    const { c, g2, g3, sHost, sB, sC } = await setup4();
    await kit.emitAck<ReqAck>(sB, 'request_action', { type: 'play' });
    const resHost = kit.waitFor<RequestResolvedPayload>(sHost, 'request_resolved');
    await kit.emitAck(sHost, 'remove_participant', { userId: g2.userId });
    expect((await resHost).reason).toBe('requester_left');

    await kit.emitAck<ReqAck>(sC, 'request_action', { type: 'pause' });
    sC.close();
    await sleep(60);
    const room = (await server.ctx.roomManager.getRoom(c.roomId))!;
    expect(room.pendingRequests.size).toBe(1); // grace ke andar abhi pending
    await sleep(500); // graceMs 150 + request expiry
    expect(room.getParticipant(g3.userId)).toBeUndefined();
    expect(room.pendingRequests.size).toBe(0);
  });

  it('Host refresh kare to pending requests wapas milti hain (role request bhi)', async () => {
    const { c, sHost, sB, sC } = await setup4();
    await kit.emitAck<ReqAck>(sB, 'request_action', { type: 'play' });
    await kit.emitAck<ReqAck>(sC, 'request_action', { type: 'become_moderator' });
    sHost.close();
    await sleep(30);
    const sHost2 = await kit.connectWith(c.token);
    const seen: ActionRequestedPayload[] = [];
    sHost2.on('action_requested', (e: ActionRequestedPayload) => seen.push(e));
    await kit.joinOk(sHost2, c.roomId, 'Creator');
    await sleep(100);
    expect(seen.map((s) => s.type).sort()).toEqual(['become_moderator', 'play']);
  });

  it('naya promote hua moderator ko pending playback requests dikhti hain; demote hone par mods-room se bahar', async () => {
    const { g2, sHost, sB, sC } = await setup4();
    await kit.emitAck<ReqAck>(sC, 'request_action', { type: 'play' });
    const seen = kit.waitFor<ActionRequestedPayload>(sB, 'action_requested');
    await kit.emitAck(sHost, 'assign_role', { userId: g2.userId, role: 'moderator' });
    expect((await seen).type).toBe('play');
    await kit.emitAck(sHost, 'assign_role', { userId: g2.userId, role: 'participant' });
    const none = kit.expectNone(sB, 'action_requested');
    await kit.emitAck<ReqAck>(sC, 'request_action', { type: 'pause' });
    expect(await none).toBe(true);
  });

  it('request_action rate limit: spam par RATE_LIMITED', async () => {
    const { sB } = await setup4();
    const codes: (string | undefined)[] = [];
    for (let i = 0; i < 13; i++) {
      const a = await kit.emitAck<ReqAck>(sB, 'request_action', { type: 'seek', payload: { time: i } });
      codes.push(a.ok ? 'ok' : a.error?.code);
    }
    expect(codes.slice(0, 10).every((x) => x === 'ok')).toBe(true);
    expect(codes.slice(10).every((x) => x === 'RATE_LIMITED')).toBe(true);
  });
});
