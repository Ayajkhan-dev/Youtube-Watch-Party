// Phase 11 integration tests: chat (broadcast, history, validation, rate limit) aur reactions (whitelist, rate limit).
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { REACTIONS, resolveReaction, type ChatMessage } from '@watchparty/shared';
import { startTestServer } from './helpers.js';
import { makeKit, sleep, type TestServer } from './socketUtils.js';

let server: TestServer;
let kit: ReturnType<typeof makeKit>;

beforeAll(async () => {
  server = await startTestServer({ graceMs: 150, emptyRoomTtlMs: 5000, restRateLimitPerMin: 10_000 });
  kit = makeKit(server);
});
afterAll(async () => {
  await server.close();
});
afterEach(() => kit.closeAll());

type Ack = { ok: boolean; error?: { code: string } };
type Reaction = { userId: string; username: string; emoji: string };

describe('chat_message', () => {
  it('sab ko milta hai (sender ko bhi): server id/userId/username/ts banata hai, payload ka userId ignore', async () => {
    const { g1, sHost, sA, sB } = await kit.setup3();
    const waits = [sHost, sA, sB].map((s) => kit.waitFor<ChatMessage>(s, 'chat_message'));
    const ack = await kit.emitAck<Ack>(sA, 'chat_message', { text: '  hello  team  ', userId: 'evil', username: 'Admin' });
    expect(ack.ok).toBe(true);
    for (const m of await Promise.all(waits)) {
      expect(m).toMatchObject({ userId: g1.userId, username: 'Alice', text: 'hello  team' });
      expect(m.id).toBeTruthy();
      expect(Math.abs(m.ts - Date.now())).toBeLessThan(5000);
    }
  });

  it('har role chat kar sakta hai (viewer, moderator, host)', async () => {
    const { g1, g2, sHost, sA, sB } = await kit.setup3();
    await kit.emitAck(sHost, 'assign_role', { userId: g1.userId, role: 'moderator' });
    await kit.emitAck(sHost, 'assign_role', { userId: g2.userId, role: 'viewer' });
    for (const s of [sHost, sA, sB]) expect((await kit.emitAck<Ack>(s, 'chat_message', { text: 'hi' })).ok).toBe(true);
  });

  it('naye joiner ko history join ack mein milti hai; sirf aakhri 50', async () => {
    const c = await kit.createRoom('Creator');
    const sHost = await kit.connectWith(c.token);
    await kit.joinOk(sHost, c.roomId, 'Creator');
    // 5/5s limit ke wajah se seedha room mein 60 messages daalte hain (history trimming Room.addChat ki zimmedari)
    const room = (await server.ctx.roomManager.getRoom(c.roomId))!;
    for (let i = 0; i < 60; i++) room.addChat({ id: `m${i}`, userId: c.userId, username: 'Creator', text: `msg ${i}`, ts: i });
    await kit.emitAck(sHost, 'chat_message', { text: 'live one' });

    const g = await kit.guest(c.roomId, 'Late');
    const sL = await kit.connectWith(g.token);
    const ack = await kit.joinOk(sL, c.roomId, 'Late');
    expect(ack.chat).toHaveLength(50);
    expect(ack.chat[49]).toMatchObject({ text: 'live one' });
    expect(ack.chat[0]).toMatchObject({ text: 'msg 11' });
  });

  it('invalid: khali / sirf spaces / 501 chars / non-string / payload nahi -> INVALID_PAYLOAD; 500 chars OK', async () => {
    const { sA } = await kit.setup3();
    for (const p of [{ text: '' }, { text: '   \n\t ' }, { text: 'x'.repeat(501) }, { text: 123 }, {}, undefined]) {
      expect((await kit.emitAck<Ack>(sA, 'chat_message', p)).error?.code, JSON.stringify(p)).toBe('INVALID_PAYLOAD');
    }
    expect((await kit.emitAck<Ack>(sA, 'chat_message', { text: 'y'.repeat(500) })).ok).toBe(true);
  });

  it('control characters hat jaate hain; HTML jaisa text jyon ka tyon (client escape karta hai)', async () => {
    const { sA, sB } = await kit.setup3();
    const got = kit.waitFor<ChatMessage>(sB, 'chat_message');
    await kit.emitAck(sA, 'chat_message', { text: 'a\u0000b\u0007<b>x</b>' });
    expect((await got).text).toBe('a b <b>x</b>');
  });

  it('spam: 5 messages / 5 sec ke baad RATE_LIMITED, aur wo messages broadcast nahi hote', async () => {
    const { sA, sB } = await kit.setup3();
    const seen: ChatMessage[] = [];
    sB.on('chat_message', (m: ChatMessage) => seen.push(m));
    const codes: (string | undefined)[] = [];
    for (let i = 0; i < 8; i++) {
      const a = await kit.emitAck<Ack>(sA, 'chat_message', { text: `spam ${i}` });
      codes.push(a.ok ? 'ok' : a.error?.code);
    }
    expect(codes.slice(0, 5).every((x) => x === 'ok')).toBe(true);
    expect(codes.slice(5).every((x) => x === 'RATE_LIMITED')).toBe(true);
    await sleep(100);
    expect(seen).toHaveLength(5);
  });

  it('room join kiye bina NOT_IN_ROOM; dusre room ke log message nahi dekhte', async () => {
    const a = await kit.setup3();
    const other = await kit.createRoom('Other');
    const sO = await kit.connectWith(other.token);
    expect((await kit.emitAck<Ack>(sO, 'chat_message', { text: 'hi' })).error?.code).toBe('NOT_IN_ROOM');
    await kit.joinOk(sO, other.roomId, 'Other');
    const none = kit.expectNone(a.sA, 'chat_message');
    await kit.emitAck(sO, 'chat_message', { text: 'other room', roomId: a.roomId });
    expect(await none).toBe(true);
  });
});

describe('reaction', () => {
  it('whitelist key ya emoji character dono chalte hain; sab ko emoji character milta hai', async () => {
    const { g2, sHost, sA, sB } = await kit.setup3();
    const waits = [sHost, sA, sB].map((s) => kit.waitFor<Reaction>(s, 'reaction'));
    expect((await kit.emitAck<Ack>(sB, 'reaction', { emoji: 'fire' })).ok).toBe(true);
    for (const r of await Promise.all(waits)) expect(r).toEqual({ userId: g2.userId, username: 'Bob', emoji: REACTIONS.fire });

    const again = kit.waitFor<Reaction>(sA, 'reaction');
    await kit.emitAck(sB, 'reaction', { emoji: '👏' });
    expect((await again).emoji).toBe('👏');
  });

  it('whitelist ke bahar / galat type INVALID_PAYLOAD; koi broadcast nahi', async () => {
    const { sA, sB } = await kit.setup3();
    const none = kit.expectNone(sB, 'reaction');
    for (const p of [{ emoji: 'poop' }, { emoji: '💩' }, { emoji: '<script>' }, { emoji: 5 }, {}, undefined]) {
      expect((await kit.emitAck<Ack>(sA, 'reaction', p)).error?.code, JSON.stringify(p)).toBe('INVALID_PAYLOAD');
    }
    expect(await none).toBe(true);
  });

  it('rate limit: 10 / 5 sec ke baad RATE_LIMITED', async () => {
    const { sA } = await kit.setup3();
    const codes: (string | undefined)[] = [];
    for (let i = 0; i < 13; i++) {
      const a = await kit.emitAck<Ack>(sA, 'reaction', { emoji: 'heart' });
      codes.push(a.ok ? 'ok' : a.error?.code);
    }
    expect(codes.slice(0, 10).every((x) => x === 'ok')).toBe(true);
    expect(codes.slice(10).every((x) => x === 'RATE_LIMITED')).toBe(true);
  });

  it('room ke bina NOT_IN_ROOM', async () => {
    const c = await kit.createRoom('Creator');
    const s = await kit.connectWith(c.token);
    expect((await kit.emitAck<Ack>(s, 'reaction', { emoji: 'fire' })).error?.code).toBe('NOT_IN_ROOM');
  });
});

describe('resolveReaction (shared)', () => {
  it('key, emoji, aur invalid', () => {
    expect(resolveReaction('thumbsup')).toBe('👍');
    expect(resolveReaction(' heart ')).toBe('❤️');
    expect(resolveReaction('🔥')).toBe('🔥');
    expect(resolveReaction('nope')).toBeNull();
    expect(resolveReaction(null)).toBeNull();
    expect(resolveReaction('constructor')).toBeNull(); // prototype keys se bachav
  });
});
