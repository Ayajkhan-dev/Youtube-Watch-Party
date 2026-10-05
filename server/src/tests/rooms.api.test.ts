import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestServer } from './helpers.js';

let server: Awaited<ReturnType<typeof startTestServer>>;
beforeAll(async () => {
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
});

const post = (path: string, body: unknown) =>
  fetch(server.url + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('REST: rooms', () => {
  it('GET /health 200', async () => {
    const r = await fetch(server.url + '/health');
    expect(r.status).toBe(200);
    expect((await r.json()).ok).toBe(true);
  });

  it('POST /api/rooms room banata hai', async () => {
    const r = await post('/api/rooms', { username: '  Ayaj  ' });
    expect(r.status).toBe(201);
    const b = await r.json();
    expect(b.roomId).toMatch(/^[A-Z2-9]{6}$/);
    expect(b.userId).toBeTruthy();
    expect(b.token).toBeTruthy();
  });

  it('username invalid par 400', async () => {
    expect((await post('/api/rooms', {})).status).toBe(400);
    expect((await post('/api/rooms', { username: '   ' })).status).toBe(400);
    expect((await post('/api/rooms', { username: 'x'.repeat(25) })).status).toBe(400);
  });

  it('GET /api/rooms/:id exist / not found / invalid code', async () => {
    const { roomId } = await (await post('/api/rooms', { username: 'A' })).json();
    expect((await fetch(`${server.url}/api/rooms/${roomId}`)).status).toBe(200);
    // lowercase code bhi chalta hai
    expect((await fetch(`${server.url}/api/rooms/${roomId.toLowerCase()}`)).status).toBe(200);
    const nf = await fetch(`${server.url}/api/rooms/ZZZZZZ`);
    expect(nf.status).toBe(404);
    expect((await nf.json()).error).toBe('ROOM_NOT_FOUND');
    expect((await fetch(`${server.url}/api/rooms/abc`)).status).toBe(400);
  });

  it('guest token alag userId deta hai; room na ho to 404', async () => {
    const c = await (await post('/api/rooms', { username: 'Host' })).json();
    const g = await (await post(`/api/rooms/${c.roomId}/guest`, { username: 'Guest' })).json();
    expect(g.roomId).toBe(c.roomId);
    expect(g.userId).not.toBe(c.userId);
    expect((await post('/api/rooms/ZZZZZZ/guest', { username: 'G' })).status).toBe(404);
  });
});
