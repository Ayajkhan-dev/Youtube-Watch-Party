// Poore app ke liye ek hi socket connection (singleton).
// autoConnect: false -> hum khud tab connect karenge jab token ho (room join par).
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@watchparty/shared';

// Trailing slash hata dete hain (https://x.onrender.com/ -> https://x.onrender.com), warna '//api/rooms' ban jaata hai.
export function normalizeServerUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}
export const SERVER_URL = normalizeServerUrl(import.meta.env.VITE_SERVER_URL ?? 'http://localhost:4000');

let authToken = '';
export function setAuthToken(token: string) {
  authToken = token;
}

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(SERVER_URL, {
  autoConnect: false,
  transports: ['websocket'], // polling nahi -> load balancer par sticky session ki zaroorat nahi
  auth: (cb) => cb({ token: authToken }), // har connect/reconnect par fresh token padhta hai
});
