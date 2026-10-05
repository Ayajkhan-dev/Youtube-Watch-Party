import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../app.js';
import { createContext } from '../context.js';
import { createSocketServer } from '../socket/createSocketServer.js';
import { configureRedisAdapter } from '../socket/redisAdapter.js';
import { RedisRoomStore, type RedisClientLike } from '../store/RedisRoomStore.js';

const redisUrl = process.env.REDIS_URL;
const sockets: ClientSocket[] = [];
const servers: Array<{
  http: http.Server;
  io: ReturnType<typeof createSocketServer>;
  closeAdapter?: () => Promise<void>;
}> = [];
let redisClients: RedisClientLike[] = [];

async function boot() {
  const { Redis: RedisCtor } = await import('ioredis');
  const clientA = new RedisCtor(redisUrl!) as unknown as RedisClientLike;
  const clientB = new RedisCtor(redisUrl!) as unknown as RedisClientLike;
  redisClients = [clientA, clientB];

  const ctxA = createContext({}, new RedisRoomStore(clientA));
  const ctxB = createContext({}, new RedisRoomStore(clientB));

  async function start(ctx: ReturnType<typeof createContext>) {
    const server = http.createServer(createApp(ctx));
    const io = createSocketServer(server, ctx);
    const closeAdapter = await configureRedisAdapter(io, (ctx.store as RedisRoomStore).getClient());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    servers.push({ http: server, io, closeAdapter });
    const { port } = server.address() as AddressInfo;
    return `http://localhost:${port}`;
  }

  return { urlA: await start(ctxA), urlB: await start(ctxB) };
}

function waitForEvent<T>(socket: ClientSocket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

afterEach(async () => {
  sockets.splice(0).forEach((s) => s.disconnect());
  for (const server of servers.splice(0)) {
    // Pehle io.close (adapter ka unsubscribe chalta hai), phir pub/sub connections quit (index.ts shutdown jaisa order).
    await new Promise<void>((resolve) => server.io.close(() => server.http.close(() => resolve())));
    await server.closeAdapter?.();
  }
  for (const client of redisClients.splice(0)) await client.quit();
});

describe.skipIf(!redisUrl)('Phase 13 cross-instance sync', () => {
  it('broadcasts playback between two Socket.IO instances through Redis', async () => {
    const { urlA, urlB } = await boot();

    const createRes = await fetch(`${urlA}/api/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'Host' }),
    });
    expect(createRes.ok).toBe(true);
    const { roomId, token: hostToken } = (await createRes.json()) as { roomId: string; token: string };

    const guestRes = await fetch(`${urlA}/api/rooms/${roomId}/guest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'Guest' }),
    });
    expect(guestRes.ok).toBe(true);
    const { token: guestToken } = (await guestRes.json()) as { token: string };

    const host = ioClient(urlA, { transports: ['websocket'], auth: { token: hostToken } });
    const guest = ioClient(urlB, { transports: ['websocket'], auth: { token: guestToken } });
    sockets.push(host, guest);

    await Promise.all([waitForEvent(host, 'connect'), waitForEvent(guest, 'connect')]);

    await new Promise<void>((resolve, reject) => {
      host.emit('join_room', { roomId, username: 'Host' }, (ack: { ok: boolean; role: string }) => {
        if (!ack.ok || ack.role !== 'host') reject(new Error('host join failed'));
        else resolve();
      });
    });
    await new Promise<void>((resolve, reject) => {
      guest.emit('join_room', { roomId, username: 'Guest' }, (ack: { ok: boolean }) => {
        if (!ack.ok) reject(new Error('guest join failed'));
        else resolve();
      });
    });

    const sync = waitForEvent<{ playState: string }>(guest, 'sync_state');
    host.emit('pause', { time: 12 });
    const payload = await sync;
    expect(payload.playState).toBe('paused');
  });
});
