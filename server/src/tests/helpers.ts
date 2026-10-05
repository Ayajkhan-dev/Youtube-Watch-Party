// Test helper: random port par poora server (Express + Socket.IO) start karta hai.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../app.js';
import { createContext, type AppSettings } from '../context.js';
import { createSocketServer } from '../socket/createSocketServer.js';

export async function startTestServer(overrides: Partial<AppSettings> = {}) {
  const ctx = createContext(overrides); // har test server ka apna fresh store
  const httpServer = http.createServer(createApp(ctx));
  const io = createSocketServer(httpServer, ctx);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const { port } = httpServer.address() as AddressInfo;
  const url = `http://localhost:${port}`;
  const close = () =>
    new Promise<void>((resolve) => {
      ctx.roomManager.dispose();
      ctx.requests.dispose();
      io.close(() => resolve());
    });
  return { url, close, ctx, io };
}
