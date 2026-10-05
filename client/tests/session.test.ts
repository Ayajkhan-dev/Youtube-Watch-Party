// session.ts: localStorage save/load/clear (jsdom nahi, chhota fake storage).
import { beforeEach, describe, expect, it } from 'vitest';

const mem = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  },
});
const { clearSession, lastUsername, loadSession, saveSession } = await import('../src/lib/session');
const { normalizeRoomCode, ROOM_CODE_REGEX } = await import('../src/lib/api');

beforeEach(() => mem.clear());

describe('session', () => {
  it('save -> load -> clear (room code case-insensitive)', () => {
    saveSession('ABC234', { userId: 'u1', token: 't', username: 'Rahul' });
    expect(loadSession('abc234')).toEqual({ userId: 'u1', token: 't', username: 'Rahul' });
    expect(mem.has('wp_session_ABC234')).toBe(true);
    expect(lastUsername()).toBe('Rahul');
    clearSession('ABC234');
    expect(loadSession('ABC234')).toBeNull();
  });
  it('kharab data par null', () => {
    mem.set('wp_session_ABC234', '{bad json');
    expect(loadSession('ABC234')).toBeNull();
    mem.set('wp_session_ABC234', JSON.stringify({ userId: 1 }));
    expect(loadSession('ABC234')).toBeNull();
  });
});

describe('room code', () => {
  it('normalize + regex (O/0/I/1 allowed nahi)', () => {
    expect(normalizeRoomCode(' x7k2pq ')).toBe('X7K2PQ');
    expect(ROOM_CODE_REGEX.test('X7K2PQ')).toBe(true);
    expect(ROOM_CODE_REGEX.test('X7K2P0')).toBe(false);
    expect(ROOM_CODE_REGEX.test('ABC')).toBe(false);
  });
});

describe('normalizeServerUrl (deployment)', () => {
  it('trailing slash hata deta hai', async () => {
    const { normalizeServerUrl } = await import('../src/lib/socket');
    expect(normalizeServerUrl('https://x.onrender.com/')).toBe('https://x.onrender.com');
    expect(normalizeServerUrl('https://x.onrender.com///')).toBe('https://x.onrender.com');
    expect(normalizeServerUrl(' http://localhost:4000 ')).toBe('http://localhost:4000');
    expect(normalizeServerUrl('https://x.onrender.com')).toBe('https://x.onrender.com');
  });
});
