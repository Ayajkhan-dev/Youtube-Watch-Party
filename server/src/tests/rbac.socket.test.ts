// Phase 5 integration tests: assign_role / remove_participant / transfer_host + negative (FORBIDDEN) tests.
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { ParticipantDTO } from '@watchparty/shared';
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

type RoleEv = { userId: string; username: string; role: string; participants: ParticipantDTO[] };
const roleOf = (list: ParticipantDTO[], id: string) => list.find((p) => p.userId === id)?.role;

describe('assign_role', () => {
  it('Host Participant ko Moderator banata hai; role_assigned sab ko milta hai', async () => {
    const { g1, sHost, sA, sB, roomId } = await kit.setup3();
    const seenByB = kit.waitFor<RoleEv>(sB, 'role_assigned');
    const seenByA = kit.waitFor<RoleEv>(sA, 'role_assigned');
    const ack = await kit.emitAck(sHost, 'assign_role', { userId: g1.userId, role: 'moderator' });
    expect(ack.ok).toBe(true);
    for (const ev of [await seenByA, await seenByB]) {
      expect(ev).toMatchObject({ userId: g1.userId, username: 'Alice', role: 'moderator' });
      expect(roleOf(ev.participants, g1.userId)).toBe('moderator');
    }
    const room = (await server.ctx.roomManager.getRoom(roomId))!;
    expect(room.getParticipant(g1.userId)?.role).toBe('moderator');
  });

  it('viewer aur wapas participant bhi assign ho sakta hai', async () => {
    const { g2, sHost, sB } = await kit.setup3();
    const v = kit.waitFor<RoleEv>(sB, 'role_assigned');
    await kit.emitAck(sHost, 'assign_role', { userId: g2.userId, role: 'viewer' });
    expect((await v).role).toBe('viewer');
    const p = kit.waitFor<RoleEv>(sB, 'role_assigned');
    await kit.emitAck(sHost, 'assign_role', { userId: g2.userId, role: 'participant' });
    expect((await p).role).toBe('participant');
  });

  it('host role assign_role se nahi milta (INVALID_PAYLOAD), host ka role nahi badalta, self nahi', async () => {
    const { c, g1, sHost, roomId } = await kit.setup3();
    const toHost = await kit.emitAck(sHost, 'assign_role', { userId: g1.userId, role: 'host' });
    expect(toHost.error?.code).toBe('INVALID_PAYLOAD');
    const self = await kit.emitAck(sHost, 'assign_role', { userId: c.userId, role: 'moderator' });
    expect(self.error?.code).toBe('FORBIDDEN');
    const room = (await server.ctx.roomManager.getRoom(roomId))!;
    expect(room.getParticipant(c.userId)?.role).toBe('host');
    expect(room.getParticipant(g1.userId)?.role).toBe('participant');
  });

  it('target room mein nahi / invalid role / invalid userId', async () => {
    const { sHost } = await kit.setup3();
    expect((await kit.emitAck(sHost, 'assign_role', { userId: 'ghost', role: 'moderator' })).error?.code).toBe('NOT_IN_ROOM');
    expect((await kit.emitAck(sHost, 'assign_role', { userId: 'ghost', role: 'admin' })).error?.code).toBe('INVALID_PAYLOAD');
    expect((await kit.emitAck(sHost, 'assign_role', { role: 'moderator' })).error?.code).toBe('INVALID_PAYLOAD');
    expect((await kit.emitAck(sHost, 'assign_role', undefined)).error?.code).toBe('INVALID_PAYLOAD');
  });

  it('Moderator ko demote karne par uska role badalta hai', async () => {
    const { g1, sHost, sA } = await kit.setup3();
    await kit.emitAck(sHost, 'assign_role', { userId: g1.userId, role: 'moderator' });
    expect((await kit.emitAck(sA, 'play', {})).ok).toBe(true);
    await kit.emitAck(sHost, 'assign_role', { userId: g1.userId, role: 'participant' });
    expect((await kit.emitAck(sA, 'play', {})).error?.code).toBe('FORBIDDEN');
  });
});

describe('RBAC negative tests (server hi final authority)', () => {
  it('Participant: change_video, assign_role, remove_participant, transfer_host, play, pause, seek sab FORBIDDEN', async () => {
    const { c, g1, sHost, sB } = await kit.setup3();
    const errors: string[] = [];
    sB.on('error_event', (e: { code: string; event: string }) => errors.push(`${e.event}:${e.code}`));
    const attempts: [string, unknown][] = [
      ['change_video', { videoId: 'dQw4w9WgXcQ' }],
      ['assign_role', { userId: g1.userId, role: 'moderator' }],
      ['assign_role', { userId: 'x', role: 'host' }], // invalid payload bhi ho to participant ko FORBIDDEN hi milega
      ['remove_participant', { userId: g1.userId }],
      ['transfer_host', { userId: g1.userId }],
      ['play', {}],
      ['pause', {}],
      ['seek', { time: 30 }],
    ];
    const syncSeen = kit.expectNone(sHost, 'sync_state');
    for (const [ev, payload] of attempts) {
      const ack = await kit.emitAck(sB, ev, payload);
      expect(ack.ok, ev).toBe(false);
      expect(ack.error?.code, ev).toBe('FORBIDDEN');
    }
    expect(await syncSeen).toBe(true); // koi state change nahi hua
    await sleep(50);
    expect(errors).toContain('change_video:FORBIDDEN');
    expect(errors).toHaveLength(attempts.length);

    // Kuch nahi badla
    const room = (await server.ctx.roomManager.getRoom(c.roomId))!;
    expect(room.getParticipant(g1.userId)?.role).toBe('participant');
    expect(room.participants.size).toBe(3);
    expect(room.hostId).toBe(c.userId);
    expect(room.playback.version).toBe(0);
  });

  it('Moderator: assign_role / remove_participant / transfer_host FORBIDDEN, par play/seek OK', async () => {
    const { c, g1, g2, sHost, sA } = await kit.setup3();
    await kit.emitAck(sHost, 'assign_role', { userId: g1.userId, role: 'moderator' });
    for (const [ev, payload] of [
      ['assign_role', { userId: g2.userId, role: 'moderator' }],
      ['remove_participant', { userId: g2.userId }],
      ['remove_participant', { userId: c.userId }],
      ['transfer_host', { userId: g1.userId }],
    ] as [string, unknown][]) {
      const ack = await kit.emitAck(sA, ev, payload);
      expect(ack.error?.code, ev).toBe('FORBIDDEN');
    }
    expect((await kit.emitAck(sA, 'seek', { time: 12 })).ok).toBe(true);
    const room = (await server.ctx.roomManager.getRoom(c.roomId))!;
    expect(room.participants.size).toBe(3);
    expect(room.hostId).toBe(c.userId);
  });

  it('room join kiye bina koi RBAC/playback event NOT_IN_ROOM; payload ka roomId ignore', async () => {
    const c = await kit.createRoom('Creator');
    const other = await kit.createRoom('Other');
    const sOther = await kit.connectWith(other.token);
    // join nahi kiya
    expect((await kit.emitAck(sOther, 'assign_role', { userId: 'x', role: 'viewer' })).error?.code).toBe('NOT_IN_ROOM');
    expect((await kit.emitAck(sOther, 'play', {})).error?.code).toBe('NOT_IN_ROOM');
    // other room ka host apna room join kare; payload mein dusre room ka id: ignore hota hai
    await kit.joinOk(sOther, other.roomId, 'Other');
    const sC = await kit.connectWith(c.token);
    await kit.joinOk(sC, c.roomId, 'Creator');
    await kit.emitAck(sOther, 'change_video', { roomId: c.roomId, videoId: 'dQw4w9WgXcQ' });
    const cRoom = (await server.ctx.roomManager.getRoom(c.roomId))!;
    const oRoom = (await server.ctx.roomManager.getRoom(other.roomId))!;
    expect(cRoom.playback.videoId).toBeNull();
    expect(oRoom.playback.videoId).toBe('dQw4w9WgXcQ');
  });
});

describe('remove_participant', () => {
  it('Host hataye: target ko removed, sab ko participant_removed, socket disconnect, BANNED rejoin', async () => {
    const { g2, sHost, sA, sB, roomId } = await kit.setup3();
    const removedEv = kit.waitFor<{ reason: string }>(sB, 'removed');
    const gone = kit.waitFor(sB, 'disconnect');
    const seenByA = kit.waitFor<{ userId: string; participants: ParticipantDTO[] }>(sA, 'participant_removed');
    const seenByHost = kit.waitFor<{ userId: string; participants: ParticipantDTO[] }>(sHost, 'participant_removed');

    expect((await kit.emitAck(sHost, 'remove_participant', { userId: g2.userId })).ok).toBe(true);
    expect((await removedEv).reason).toBeTruthy();
    for (const ev of [await seenByA, await seenByHost]) {
      expect(ev.userId).toBe(g2.userId);
      expect(ev.participants).toHaveLength(2);
      expect(roleOf(ev.participants, g2.userId)).toBeUndefined();
    }
    await gone;

    const room = (await server.ctx.roomManager.getRoom(roomId))!;
    expect(room.isBanned(g2.userId)).toBe(true);
    expect(room.participants.size).toBe(2);

    // wahi user dobara join nahi kar sakta
    const sB2 = await kit.connectWith(g2.token);
    const rejoin = await new Promise<{ ok: boolean; error?: { code: string } }>((res) =>
      sB2.emit('join_room', { roomId, username: 'Bob' }, res),
    );
    expect(rejoin.error?.code).toBe('BANNED');
  });

  it('Host khud ko / host ko remove nahi; target room mein nahi to NOT_IN_ROOM', async () => {
    const { c, g1, sHost, sA } = await kit.setup3();
    await kit.emitAck(sHost, 'assign_role', { userId: g1.userId, role: 'moderator' });
    expect((await kit.emitAck(sHost, 'remove_participant', { userId: c.userId })).error?.code).toBe('FORBIDDEN');
    expect((await kit.emitAck(sHost, 'remove_participant', { userId: 'ghost' })).error?.code).toBe('NOT_IN_ROOM');
    // Moderator ko Host remove kar sakta hai
    expect((await kit.emitAck(sHost, 'remove_participant', { userId: g1.userId })).ok).toBe(true);
    await sleep(50);
    expect(sA.connected).toBe(false);
  });

  it('removed user ki pending requests hat jaati hain', async () => {
    const { g2, sHost, roomId } = await kit.setup3();
    const room = (await server.ctx.roomManager.getRoom(roomId))!;
    room.pendingRequests.set('r1', { requestId: 'r1', userId: g2.userId, username: 'Bob', type: 'play', payload: {}, expiresAt: Date.now() + 60000 });
    await kit.emitAck(sHost, 'remove_participant', { userId: g2.userId });
    expect(room.pendingRequests.size).toBe(0);
  });
});

describe('transfer_host', () => {
  it('Host transfer: naya host, purana moderator, host_transferred broadcast; naya host ke powers', async () => {
    const { c, g1, g2, sHost, sA, sB, roomId } = await kit.setup3();
    const evA = kit.waitFor<{ oldHostId: string; newHostId: string; participants: ParticipantDTO[] }>(sA, 'host_transferred');
    const evB = kit.waitFor<{ oldHostId: string; newHostId: string; participants: ParticipantDTO[] }>(sB, 'host_transferred');
    expect((await kit.emitAck(sHost, 'transfer_host', { userId: g1.userId })).ok).toBe(true);
    for (const ev of [await evA, await evB]) {
      expect(ev.oldHostId).toBe(c.userId);
      expect(ev.newHostId).toBe(g1.userId);
      expect(roleOf(ev.participants, g1.userId)).toBe('host');
      expect(roleOf(ev.participants, c.userId)).toBe('moderator');
    }
    const room = (await server.ctx.roomManager.getRoom(roomId))!;
    expect(room.hostId).toBe(g1.userId);

    // purana host (ab moderator) host-only kaam nahi kar sakta
    expect((await kit.emitAck(sHost, 'assign_role', { userId: g2.userId, role: 'moderator' })).error?.code).toBe('FORBIDDEN');
    // naya host kar sakta hai
    expect((await kit.emitAck(sA, 'assign_role', { userId: g2.userId, role: 'moderator' })).ok).toBe(true);
  });

  it('khud ko / room mein nahi / disconnected user ko transfer nahi', async () => {
    const { c, g2, sHost, sB } = await kit.setup3();
    expect((await kit.emitAck(sHost, 'transfer_host', { userId: c.userId })).error?.code).toBe('FORBIDDEN');
    expect((await kit.emitAck(sHost, 'transfer_host', { userId: 'ghost' })).error?.code).toBe('NOT_IN_ROOM');
    sB.close();
    await sleep(40); // grace (150ms) ke andar: participant hai par connected=false
    expect((await kit.emitAck(sHost, 'transfer_host', { userId: g2.userId })).error?.code).toBe('FORBIDDEN');
  });
});

describe('role persistence aur mods-room', () => {
  it('moderator refresh karke wapas aaye to role aur mods-room membership same', async () => {
    const { g1, sHost, sA, roomId } = await kit.setup3();
    await kit.emitAck(sHost, 'assign_role', { userId: g1.userId, role: 'moderator' });
    const room = (await server.ctx.roomManager.getRoom(roomId))!;
    const modsSockets = async () => (await server.io.in(`${roomId}:mods`).fetchSockets()).map((s) => s.data.userId).sort();
    expect(await modsSockets()).toContain(g1.userId);

    sA.close();
    await sleep(30); // grace ke andar
    const again = await kit.connectWith(g1.token);
    const ack = await kit.joinOk(again, roomId, 'Alice');
    expect(ack.role).toBe('moderator');
    expect(await modsSockets()).toContain(g1.userId);

    // demote par mods-room se bahar
    await kit.emitAck(sHost, 'assign_role', { userId: g1.userId, role: 'viewer' });
    expect(await modsSockets()).not.toContain(g1.userId);
    expect(room.getParticipant(g1.userId)?.role).toBe('viewer');
  });
});
