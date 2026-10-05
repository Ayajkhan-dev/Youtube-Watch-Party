// Phase 4 integration tests: 2-3 asli socket.io-clients se join/leave/reconnect/grace/host-transfer.
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { JoinRoomAck, JoinRoomAckOk, RoomAuthResponse } from '@watchparty/shared';
import { startTestServer } from './helpers.js';

let server: Awaited<ReturnType<typeof startTestServer>>;
const clients: Socket[] = [];

beforeAll(async () => {
  // Chhote timers taaki grace/TTL tests jaldi chalein. Max 3 log ek room mein.
  server = await startTestServer({ graceMs: 150, emptyRoomTtlMs: 300, maxParticipants: 3 });
});
afterAll(async () => {
  await server.close();
});
afterEach(() => {
  for (const c of clients.splice(0)) c.close();
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post(path: string, body: unknown): Promise<RoomAuthResponse> {
  const r = await fetch(server.url + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await r.json()) as RoomAuthResponse;
}
const createRoom = (username: string) => post('/api/rooms', { username });
const guest = (roomId: string, username: string) => post(`/api/rooms/${roomId}/guest`, { username });

async function connectWith(token: string): Promise<Socket> {
  const s = connect(server.url, { transports: ['websocket'], reconnection: false, auth: { token } });
  clients.push(s);
  await new Promise<void>((res, rej) => {
    s.on('connect', () => res());
    s.on('connect_error', rej);
  });
  return s;
}

function join(s: Socket, roomId: string, username: string, extra: object = {}): Promise<JoinRoomAck> {
  return new Promise((res) => s.emit('join_room', { roomId, username, ...extra }, res));
}
async function joinOk(s: Socket, roomId: string, username: string): Promise<JoinRoomAckOk> {
  const ack = await join(s, roomId, username);
  if (!ack.ok) throw new Error(`join failed: ${ack.error.code}`);
  return ack;
}
function waitFor<T = unknown>(s: Socket, event: string, ms = 2000): Promise<T> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`timeout waiting for ${event}`)), ms);
    s.once(event, (p: T) => {
      clearTimeout(t);
      res(p);
    });
  });
}

// Room ready: creator host ban chuka hai + dono guest tokens
async function setup3() {
  const c = await createRoom('Creator');
  const g1 = await guest(c.roomId, 'Alice');
  const g2 = await guest(c.roomId, 'Bob');
  const sHost = await connectWith(c.token);
  const hostAck = await joinOk(sHost, c.roomId, 'Creator');
  const sA = await connectWith(g1.token);
  const sB = await connectWith(g2.token);
  return { c, g1, g2, sHost, sA, sB, hostAck };
}

describe('join_room', () => {
  it('3 clients: creator = host, joiners = participant, list roles ke saath', async () => {
    const { c, g1, g2, sHost, sA, sB, hostAck } = await setup3();
    expect(hostAck.role).toBe('host');
    expect(hostAck.me.userId).toBe(c.userId);
    expect(hostAck.playback.playState).toBe('paused');
    expect(hostAck.chat).toEqual([]);
    expect(hostAck.instanceId).toBeTruthy();

    const joinedSeenByHost = waitFor<{ username: string; userId: string; role: string; participants: unknown[] }>(
      sHost,
      'user_joined',
    );
    const a = await joinOk(sA, c.roomId, 'Alice');
    expect(a.role).toBe('participant');
    expect(a.me.userId).toBe(g1.userId);
    const ev = await joinedSeenByHost;
    expect(ev).toMatchObject({ username: 'Alice', userId: g1.userId, role: 'participant' });
    expect(ev.participants).toHaveLength(2);

    const b = await joinOk(sB, c.roomId, 'Bob');
    expect(b.role).toBe('participant');
    expect(b.me.userId).toBe(g2.userId);
    expect(b.participants.map((p) => [p.username, p.role])).toEqual([
      ['Creator', 'host'],
      ['Alice', 'participant'],
      ['Bob', 'participant'],
    ]);
  });

  it('userId payload se nahi, token se aata hai', async () => {
    const c = await createRoom('Creator');
    const s = await connectWith(c.token);
    const ack = await join(s, c.roomId, 'Creator', { userId: 'evil', role: 'host' });
    expect(ack.ok && ack.me.userId).toBe(c.userId);
  });

  it('room nahi mila / invalid payload / banned / room full sahi error dete hain', async () => {
    const c = await createRoom('Creator');
    const sHost = await connectWith(c.token);
    await joinOk(sHost, c.roomId, 'Creator');

    const g = await guest(c.roomId, 'X');
    const sX = await connectWith(g.token);

    const nf = await join(sX, 'ZZZZZZ', 'X');
    expect(nf.ok === false && nf.error.code).toBe('ROOM_NOT_FOUND');
    const bad = await join(sX, 'abc', 'X');
    expect(bad.ok === false && bad.error.code).toBe('INVALID_PAYLOAD');
    const noName = await join(sX, c.roomId, '   ');
    expect(noName.ok === false && noName.error.code).toBe('INVALID_PAYLOAD');

    // error_event bhi sender ko milta hai
    const errEv = waitFor<{ code: string; event: string }>(sX, 'error_event');
    await join(sX, 'ZZZZZZ', 'X');
    expect(await errEv).toMatchObject({ code: 'ROOM_NOT_FOUND', event: 'join_room' });

    // banned
    const room = (await server.ctx.roomManager.getRoom(c.roomId))!;
    room.ban(g.userId);
    const banned = await join(sX, c.roomId, 'X');
    expect(banned.ok === false && banned.error.code).toBe('BANNED');
    room.banned.delete(g.userId);

    // room full (max 3)
    const g2 = await guest(c.roomId, 'Y');
    const g3 = await guest(c.roomId, 'Z');
    const sY = await connectWith(g2.token);
    const sZ = await connectWith(g3.token);
    await joinOk(sX, c.roomId, 'X');
    await joinOk(sY, c.roomId, 'Y');
    const full = await join(sZ, c.roomId, 'Z');
    expect(full.ok === false && full.error.code).toBe('ROOM_FULL');
  });

  it('creator se pehle koi aur join nahi kar sakta', async () => {
    const c = await createRoom('Creator');
    const g = await guest(c.roomId, 'Early');
    const s = await connectWith(g.token);
    const ack = await join(s, c.roomId, 'Early');
    expect(ack.ok === false && ack.error.code).toBe('FORBIDDEN');
  });
});

describe('refresh / reconnect / duplicate tab', () => {
  it('disconnect ke baad grace ke andar wapas aao: same userId aur role (moderator bhi bachta hai)', async () => {
    const { c, g1, sHost, sA } = await setup3();
    await joinOk(sA, c.roomId, 'Alice');
    const room = (await server.ctx.roomManager.getRoom(c.roomId))!;
    room.setRole(g1.userId, 'moderator'); // Phase 5 se pehle role ko seedha set karke test

    sA.close();
    await sleep(40); // grace (150ms) se pehle
    const sA2 = await connectWith(g1.token);
    const again = await joinOk(sA2, c.roomId, 'Alice');
    expect(again.me.userId).toBe(g1.userId);
    expect(again.role).toBe('moderator');
    expect(again.participants).toHaveLength(2);

    // grace ka timer cancel hua: ab 300ms baad bhi Alice room mein hai
    await sleep(300);
    expect(room.getParticipant(g1.userId)?.connected).toBe(true);
    expect(sHost.connected).toBe(true);
  });

  it('refresh: host wapas aaye to host hi rehta hai', async () => {
    const { c, sHost } = await setup3();
    sHost.close();
    await sleep(30);
    const again = await connectWith(c.token);
    const ack = await joinOk(again, c.roomId, 'Creator');
    expect(ack.role).toBe('host');
    expect(ack.me.userId).toBe(c.userId);
  });

  it('dusra tab: purane socket ko replaced + disconnect, user_left nahi', async () => {
    const { c, g1, sHost, sA } = await setup3();
    await joinOk(sA, c.roomId, 'Alice');

    let leftSeen = false;
    sHost.on('user_left', () => (leftSeen = true));
    const replaced = waitFor(sA, 'replaced');
    const gone = waitFor(sA, 'disconnect');

    const sA2 = await connectWith(g1.token);
    const ack = await joinOk(sA2, c.roomId, 'Alice');
    expect(ack.role).toBe('participant');
    await replaced;
    await gone;
    await sleep(300); // grace se zyada
    expect(leftSeen).toBe(false);
    const room = (await server.ctx.roomManager.getRoom(c.roomId))!;
    expect(room.participants.size).toBe(2);
    expect(room.getParticipant(g1.userId)?.connected).toBe(true);
  });
});

describe('leave_room aur disconnect', () => {
  it('leave_room: baaki ko user_left + ack ok; dobara leave = NOT_IN_ROOM', async () => {
    const { c, g1, sHost, sA } = await setup3();
    await joinOk(sA, c.roomId, 'Alice');
    const left = waitFor<{ username: string; userId: string; participants: unknown[] }>(sHost, 'user_left');
    const ack = await new Promise<{ ok: boolean }>((res) => sA.emit('leave_room', { roomId: c.roomId }, res));
    expect(ack.ok).toBe(true);
    const ev = await left;
    expect(ev).toMatchObject({ username: 'Alice', userId: g1.userId });
    expect(ev.participants).toHaveLength(1);

    const second = await new Promise<{ ok: boolean; error?: { code: string } }>((res) =>
      sA.emit('leave_room', { roomId: c.roomId }, res),
    );
    expect(second.ok).toBe(false);
    expect(second.error?.code).toBe('NOT_IN_ROOM');
  });

  it('tab close: turant user_left nahi, grace ke baad user_left', async () => {
    const { c, g1, sHost, sA } = await setup3();
    await joinOk(sA, c.roomId, 'Alice');
    const t0 = Date.now();
    const left = waitFor<{ userId: string; participants: unknown[] }>(sHost, 'user_left', 3000);
    sA.close();
    const ev = await left;
    expect(ev.userId).toBe(g1.userId);
    expect(ev.participants).toHaveLength(1);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(120); // graceMs 150 ke aaspaas
  });

  it('khali room TTL ke baad delete ho jaata hai', async () => {
    const c = await createRoom('Creator');
    const s = await connectWith(c.token);
    await joinOk(s, c.roomId, 'Creator');
    await new Promise((res) => s.emit('leave_room', {}, res));
    expect(await server.ctx.roomManager.exists(c.roomId)).toBe(true);
    await sleep(450); // emptyRoomTtlMs 300
    expect(await server.ctx.roomManager.exists(c.roomId)).toBe(false);
  });
});

describe('host auto-transfer', () => {
  it('host disconnect + grace khatam: pehla moderator naya host', async () => {
    const { c, g1, g2, sHost, sA, sB } = await setup3();
    await joinOk(sA, c.roomId, 'Alice');
    await joinOk(sB, c.roomId, 'Bob');
    const room = (await server.ctx.roomManager.getRoom(c.roomId))!;
    room.setRole(g2.userId, 'moderator'); // Bob moderator (Alice se baad mein joined, par moderator ko tarjeeh)

    const transferred = waitFor<{ oldHostId: string; newHostId: string; participants: { userId: string; role: string }[] }>(
      sA,
      'host_transferred',
      3000,
    );
    sHost.close();
    const ev = await transferred;
    expect(ev.oldHostId).toBe(c.userId);
    expect(ev.newHostId).toBe(g2.userId);
    expect(ev.participants.find((p) => p.userId === g2.userId)?.role).toBe('host');
    expect(ev.participants.find((p) => p.userId === g1.userId)?.role).toBe('participant');
    expect(room.hostId).toBe(g2.userId);
  });

  it('moderator nahi to sabse purana participant; leave_room par turant transfer; creator wapas aaye to participant', async () => {
    const { c, g1, sHost, sA, sB } = await setup3();
    await joinOk(sA, c.roomId, 'Alice');
    await joinOk(sB, c.roomId, 'Bob');

    const transferred = waitFor<{ newHostId: string }>(sB, 'host_transferred');
    await new Promise((res) => sHost.emit('leave_room', {}, res));
    expect((await transferred).newHostId).toBe(g1.userId); // Alice sabse purani participant

    // Creator wapas aata hai: ab host Alice hai, creator Participant banta hai (do host nahi)
    const sC = await connectWith(c.token);
    const ack = await joinOk(sC, c.roomId, 'Creator');
    expect(ack.role).toBe('participant');
    expect(ack.participants.filter((p) => p.role === 'host')).toHaveLength(1);
  });
});

// SPEC: creator hi Host hai, uske actions koi aur nahi kar sakta.
describe('host sirf creator (ajnabi kabhi host nahi banta)', () => {
  it('creator ke room chhodne ke baad khali room mein ajnabi aaye to Participant, creator wapas aaye to Host', async () => {
    const c = await createRoom('Creator');
    const g1 = await guest(c.roomId, 'Stranger');
    const sHost = await connectWith(c.token);
    await joinOk(sHost, c.roomId, 'Creator');
    await new Promise((res) => sHost.emit('leave_room', {}, res)); // room khali

    const sS = await connectWith(g1.token);
    const strangerAck = await joinOk(sS, c.roomId, 'Stranger');
    expect(strangerAck.role).toBe('participant'); // pehle: yahan Host ban jaata tha

    // Stranger ke paas Host power nahi: play FORBIDDEN
    const playAck = await new Promise<{ ok: boolean; error?: { code: string } }>((res) => sS.emit('play', {}, res));
    expect(playAck.ok).toBe(false);
    expect(playAck.error?.code).toBe('FORBIDDEN');

    // Creator wapas aaye (abhi koi host nahi) to Host milta hai, aur sirf ek host
    const sC = await connectWith(c.token);
    const creatorAck = await joinOk(sC, c.roomId, 'Creator');
    expect(creatorAck.role).toBe('host');
    expect(creatorAck.participants.filter((p) => p.role === 'host')).toHaveLength(1);
  });
});

