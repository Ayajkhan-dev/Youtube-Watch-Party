// REST calls: room create, room exists, guest token. Errors ApiError mein (status + message).
import type { ApiError as ApiErrorBody, AuthResponse, RoomAuthResponse, RoomExistsResponse } from '@watchparty/shared';
import { SERVER_URL } from './socket';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
  // Galat/nahi mila room code: server 404 (ROOM_NOT_FOUND) ya 400 (invalid code) deta hai.
  get isNotFound(): boolean {
    return this.status === 404 || this.code === 'ROOM_NOT_FOUND' || (this.status === 400 && this.code === 'INVALID_PAYLOAD');
  }
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${SERVER_URL}${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Unable to reach the server. Please check your connection.');
  }
  const data = (await res.json().catch(() => null)) as (T & Partial<ApiErrorBody>) | null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? 'ERROR', data?.message ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  createRoom: (username: string, token?: string) => request<RoomAuthResponse>('POST', '/api/rooms', { username }, token),
  roomExists: (roomId: string) => request<RoomExistsResponse>('GET', `/api/rooms/${encodeURIComponent(roomId)}`),
  guest: (roomId: string, username: string) =>
    request<RoomAuthResponse>('POST', `/api/rooms/${encodeURIComponent(roomId)}/guest`, { username }),
  register: (email: string, password: string, name: string) =>
    request<AuthResponse>('POST', '/api/auth/register', { email, password, name }),
  login: (email: string, password: string) =>
    request<AuthResponse>('POST', '/api/auth/login', { email, password }),
};

export const ROOM_CODE_REGEX = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase();
}
