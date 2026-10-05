// Room + Participant domain tests: transferHost, liveTime, ban, snapshot, aur "Room mein socket import nahi".
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { Participant } from '../models/Participant.js';
import { Room } from '../models/Room.js';

function p(userId: string, role: 'host' | 'moderator' | 'participant' | 'viewer', joinedAt: number, connected = true) {
  return new Participant({ userId, username: userId.toUpperCase(), role, socketId: `s-${userId}`, joinedAt, connected });
}

function roomWith() {
  const room = new Room('ABC234', 'h', 1000);
  room.addParticipant(p('h', 'host', 1));
  room.addParticipant(p('m', 'moderator', 2));
  room.addParticipant(p('a', 'participant', 3));
  room.addParticipant(p('b', 'participant', 4));
  return room;
}

describe('Participant', () => {
  it('isHost / canControlPlayback role ke hisaab se', () => {
    expect(p('x', 'host', 1).isHost()).toBe(true);
    expect(p('x', 'host', 1).canControlPlayback()).toBe(true);
    expect(p('x', 'moderator', 1).isHost()).toBe(false);
    expect(p('x', 'moderator', 1).canControlPlayback()).toBe(true);
    expect(p('x', 'participant', 1).canControlPlayback()).toBe(false);
    expect(p('x', 'viewer', 1).canControlPlayback()).toBe(false);
  });
  it('toDTO mein socketId nahi hota', () => {
    expect(p('x', 'participant', 5).toDTO()).toEqual({
      userId: 'x',
      username: 'X',
      role: 'participant',
      connected: true,
      joinedAt: 5,
    });
  });
});

describe('Room basics', () => {
  it('creator host hai aur playback default paused/0', () => {
    const r = new Room('ABC234', 'creator');
    expect(r.hostId).toBe('creator');
    expect(r.playback.playState).toBe('paused');
    expect(r.playback.videoId).toBeNull();
    expect(r.started).toBe(false);
  });

  it('addParticipant started=true karta hai; listParticipants joinedAt order mein roles ke saath', () => {
    const r = roomWith();
    expect(r.started).toBe(true);
    expect(r.listParticipants().map((x) => [x.userId, x.role])).toEqual([
      ['h', 'host'],
      ['m', 'moderator'],
      ['a', 'participant'],
      ['b', 'participant'],
    ]);
  });

  it('roleForJoiner: creator host (jab host na ho), baaki participant; host maujood ho to creator bhi participant', () => {
    const r = new Room('ABC234', 'creator');
    expect(r.roleForJoiner('creator')).toBe('host');
    expect(r.roleForJoiner('stranger')).toBe('participant');
    r.addParticipant(new Participant({ userId: 'creator', username: 'C', role: 'host', socketId: 's1' }));
    r.removeParticipant('creator'); // room khali, hostId = creator
    expect(r.roleForJoiner('stranger')).toBe('participant');
    expect(r.roleForJoiner('creator')).toBe('host');
    r.addParticipant(new Participant({ userId: 'x', username: 'X', role: 'host', socketId: 's2' }));
    r.hostId = 'x';
    expect(r.roleForJoiner('creator')).toBe('participant'); // do host nahi
  });

  it('removeParticipant uski pending requests bhi hataata hai', () => {
    const r = roomWith();
    r.pendingRequests.set('r1', { requestId: 'r1', userId: 'a', username: 'A', type: 'play', payload: {}, expiresAt: 9 });
    r.pendingRequests.set('r2', { requestId: 'r2', userId: 'b', username: 'B', type: 'play', payload: {}, expiresAt: 9 });
    expect(r.removeParticipant('a')?.userId).toBe('a');
    expect([...r.pendingRequests.keys()]).toEqual(['r2']);
    expect(r.removeParticipant('nope')).toBeUndefined();
  });

  it('setRole: valid change, host nahi ban sakta, host ka role nahi badalta', () => {
    const r = roomWith();
    r.setRole('a', 'moderator');
    expect(r.getParticipant('a')?.role).toBe('moderator');
    expect(() => r.setRole('a', 'host')).toThrow();
    expect(() => r.setRole('h', 'participant')).toThrow();
    expect(() => r.setRole('ghost', 'viewer')).toThrow();
  });

  it('bans', () => {
    const r = roomWith();
    expect(r.isBanned('a')).toBe(false);
    r.ban('a');
    expect(r.isBanned('a')).toBe(true);
  });
});

describe('Room.transferHost', () => {
  it('naya host banta hai, purana host moderator', () => {
    const r = roomWith();
    r.transferHost('a');
    expect(r.hostId).toBe('a');
    expect(r.getParticipant('a')?.role).toBe('host');
    expect(r.getParticipant('h')?.role).toBe('moderator');
    // sirf ek host
    expect(r.listParticipants().filter((x) => x.role === 'host')).toHaveLength(1);
  });
  it('purana host room se ja chuka ho to bhi chalta hai', () => {
    const r = roomWith();
    r.removeParticipant('h');
    r.transferHost('m');
    expect(r.hostId).toBe('m');
    expect(r.getParticipant('m')?.role).toBe('host');
  });
  it('room mein na hone wale ko host nahi bana sakte', () => {
    expect(() => roomWith().transferHost('ghost')).toThrow();
  });
});

describe('Room.pickNextHostId', () => {
  it('pehle moderator', () => {
    const r = roomWith();
    r.removeParticipant('h');
    expect(r.pickNextHostId()).toBe('m');
  });
  it('moderator nahi to sabse purana participant', () => {
    const r = roomWith();
    r.removeParticipant('h');
    r.removeParticipant('m');
    expect(r.pickNextHostId()).toBe('a');
  });
  it('connected ko tarjeeh, warna disconnected', () => {
    const r = new Room('ABC234', 'h');
    r.addParticipant(p('a', 'participant', 1, false));
    r.addParticipant(p('b', 'participant', 2, true));
    expect(r.pickNextHostId()).toBe('b');
    r.removeParticipant('b');
    expect(r.pickNextHostId()).toBe('a');
  });
  it('exclude aur khali room', () => {
    const r = roomWith();
    expect(r.pickNextHostId('m')).toBe('a');
    expect(new Room('ABC234', 'h').pickNextHostId()).toBeUndefined();
  });
});

describe('Room live time (SPEC 4.2)', () => {
  it('paused: time aage nahi badhta', () => {
    const r = new Room('ABC234', 'h', 0);
    r.applyPlayback({ playState: 'paused', currentTime: 42 }, 1000, 'h');
    expect(r.getLiveTime(1000)).toBe(42);
    expect(r.getLiveTime(61000)).toBe(42);
  });
  it('playing: currentTime + (now - updatedAt)/1000', () => {
    const r = new Room('ABC234', 'h', 0);
    r.applyPlayback({ playState: 'playing', currentTime: 10 }, 5000, 'h');
    expect(r.getLiveTime(5000)).toBe(10);
    expect(r.getLiveTime(8500)).toBeCloseTo(13.5, 5);
  });
  it('clock peeche ho to time peeche nahi jaata', () => {
    const r = new Room('ABC234', 'h', 0);
    r.applyPlayback({ playState: 'playing', currentTime: 10 }, 5000, 'h');
    expect(r.getLiveTime(4000)).toBe(10);
  });
  it('applyPlayback version +1 aur updatedBy set karta hai', () => {
    const r = new Room('ABC234', 'h', 0);
    r.applyPlayback({ videoId: 'dQw4w9WgXcQ', currentTime: 0, playState: 'playing' }, 100, 'h');
    r.applyPlayback({ currentTime: 30 }, 200, 'm');
    expect(r.version).toBe(2);
    expect(r.playback).toMatchObject({ videoId: 'dQw4w9WgXcQ', playState: 'playing', currentTime: 30, updatedBy: 'm' });
  });
  it('getLiveState: sync_state ke saare fields, late joiner ko live time', () => {
    const r = new Room('ABC234', 'h', 0);
    r.applyPlayback({ videoId: 'dQw4w9WgXcQ', currentTime: 20, playState: 'playing' }, 1000, 'h');
    const s = r.getLiveState(4000);
    expect(s).toEqual({
      playState: 'playing',
      currentTime: 23,
      videoId: 'dQw4w9WgXcQ',
      updatedAt: 4000,
      serverTime: 4000,
      version: 1,
      updatedBy: 'h',
    });
  });
});

describe('Room snapshot', () => {
  it('toSnapshot -> JSON -> fromSnapshot same room deta hai', () => {
    const r = roomWith();
    r.ban('z');
    r.applyPlayback({ videoId: 'dQw4w9WgXcQ', playState: 'playing', currentTime: 5 }, 2000, 'h');
    r.chat.push({ id: '1', userId: 'a', username: 'A', text: 'hi', ts: 1 });
    r.pendingRequests.set('r1', { requestId: 'r1', userId: 'a', username: 'A', type: 'play', payload: {}, expiresAt: 9 });
    const copy = Room.fromSnapshot(JSON.parse(JSON.stringify(r.toSnapshot())));
    expect(copy.toSnapshot()).toEqual(r.toSnapshot());
    expect(copy.isBanned('z')).toBe(true);
    expect(copy.getParticipant('m')?.role).toBe('moderator');
    expect(copy.getLiveTime(3000)).toBe(r.getLiveTime(3000));
  });
});

describe('design rule', () => {
  it('models/ mein socket.io import nahi hai', () => {
    for (const f of ['Room.ts', 'Participant.ts']) {
      const src = fs.readFileSync(new URL(`../models/${f}`, import.meta.url), 'utf8');
      expect(src).not.toMatch(/from ['"]socket\.io/);
    }
  });
});
