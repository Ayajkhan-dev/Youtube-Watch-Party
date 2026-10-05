import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as connect } from 'socket.io-client';
import { startTestServer } from './helpers.js';

let server: Awaited<ReturnType<typeof startTestServer>>;
beforeAll(async () => {
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
});

async function getToken() {
  const r = await fetch(server.url + '/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Tester' }),
  });
  return (await r.json()).token as string;
}

describe('socket auth', () => {
  it('bina token ke connect reject', async () => {
    const s = connect(server.url, { transports: ['websocket'], reconnection: false });
    const err = await new Promise<Error>((res) => s.on('connect_error', res));
    expect(err.message).toBe('UNAUTHENTICATED');
    s.close();
  });

  it('galat token reject', async () => {
    const s = connect(server.url, { transports: ['websocket'], reconnection: false, auth: { token: 'fake' } });
    const err = await new Promise<Error>((res) => s.on('connect_error', res));
    expect(err.message).toBe('UNAUTHENTICATED');
    s.close();
  });

  it('sahi token se connect + ping/pong', async () => {
    const token = await getToken();
    const s = connect(server.url, { transports: ['websocket'], reconnection: false, auth: { token } });
    await new Promise<void>((res) => s.on('connect', () => res()));
    const sentAt = Date.now();
    s.emit('ping_test', { sentAt });
    const pong = await new Promise<{ sentAt: number; serverTime: number }>((res) => s.on('pong_test', res));
    expect(pong.sentAt).toBe(sentAt);
    s.close();
  });
});
