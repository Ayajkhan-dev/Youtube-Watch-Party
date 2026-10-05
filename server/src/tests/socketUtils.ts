// Phase 5-6 tests ke liye shared helpers: server start, room/guest banana, socket connect, join, waitFor.
import { io as connect, type Socket } from 'socket.io-client';
import type { JoinRoomAck, JoinRoomAckOk, RoomAuthResponse } from '@watchparty/shared';
import { startTestServer } from './helpers.js';

export type TestServer = Awaited<ReturnType<typeof startTestServer>>;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function makeKit(server: TestServer) {
  const clients: Socket[] = [];

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

  async function joinOk(s: Socket, roomId: string, username: string): Promise<JoinRoomAckOk> {
    const ack = await new Promise<JoinRoomAck>((res) => s.emit('join_room', { roomId, username }, res));
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

  // Event aaya hi nahi (ms tak) to true.
  async function expectNone(s: Socket, event: string, ms = 250): Promise<boolean> {
    let got = false;
    const h = () => (got = true);
    s.on(event, h);
    await sleep(ms);
    s.off(event, h);
    return !got;
  }

  // Event emit karke ack lo (ok ya error).
  function emitAck<T = { ok: boolean; error?: { code: string } }>(s: Socket, event: string, payload?: unknown): Promise<T> {
    return new Promise((res) => s.emit(event, payload, res));
  }

  // Host (creator) + Mod-candidate Alice + Participant Bob, teeno joined.
  async function setup3() {
    const c = await createRoom('Creator');
    const g1 = await guest(c.roomId, 'Alice');
    const g2 = await guest(c.roomId, 'Bob');
    const sHost = await connectWith(c.token);
    await joinOk(sHost, c.roomId, 'Creator');
    const sA = await connectWith(g1.token);
    await joinOk(sA, c.roomId, 'Alice');
    const sB = await connectWith(g2.token);
    await joinOk(sB, c.roomId, 'Bob');
    return { c, g1, g2, sHost, sA, sB, roomId: c.roomId };
  }

  const closeAll = () => {
    for (const c of clients.splice(0)) c.close();
  };
  return { createRoom, guest, connectWith, joinOk, waitFor, expectNone, emitAck, setup3, closeAll };
}
