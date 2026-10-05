// REST routes: room create, room check, guest token. Account token optional hai; REQUIRE_AUTH=true par guest route band.
import { Router } from 'express';
import { nanoid } from 'nanoid';
import type { RoomAuthResponse, RoomExistsResponse } from '@watchparty/shared';
import { createRoomBody, guestBody, roomIdParam } from '../validation/schemas.js';
import { signToken, verifyToken, type TokenPayload } from '../auth/token.js';
import { config } from '../config.js';
import type { AppContext } from '../context.js';
import { asyncHandler, HttpError } from './errors.js';
import type { Request } from 'express';

function getBearerPayload(req: Request): TokenPayload | undefined {
  const header = req.get('authorization');
  if (!header) return undefined;
  const [scheme, value] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !value) throw new HttpError(401, 'UNAUTHENTICATED', 'Valid Bearer token required');
  try {
    return verifyToken(value);
  } catch {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Session is invalid or has expired');
  }
}

function requireAccount(req: Request): TokenPayload {
  const payload = getBearerPayload(req);
  if (!payload || payload.authType !== 'account') {
    throw new HttpError(401, 'AUTH_REQUIRED', 'Login is required for this action');
  }
  return payload;
}

export function createRoomsRouter(ctx: AppContext): Router {
  const router = Router();
  const { roomManager } = ctx;

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const { username } = createRoomBody.parse(req.body);
      const account = config.REQUIRE_AUTH ? requireAccount(req) : getBearerPayload(req);
      if (config.REQUIRE_AUTH && account?.authType !== 'account') {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Login is required to create a room');
      }

      const userId = account?.authType === 'account' ? account.userId : nanoid();
      const finalUsername = account?.authType === 'account' ? account.username : username;
      const room = await roomManager.createRoom(userId);
      if (!room) throw new HttpError(503, 'SERVER_BUSY', 'Could not generate a room code. Please try again');

      // Logged-in creator ka account JWT hi session token hai; guest creator ko fresh guest JWT milta hai.
      const token = account?.authType === 'account' ? (req.get('authorization') as string).slice('Bearer '.length).trim() : signToken({ userId, username: finalUsername, authType: 'guest' });
      const body: RoomAuthResponse = { roomId: room.roomId, userId, token };
      res.status(201).json(body);
    }),
  );

  router.get(
    '/:roomId',
    asyncHandler(async (req, res) => {
      const roomId = roomIdParam.parse(req.params.roomId);
      if (!(await roomManager.exists(roomId))) throw new HttpError(404, 'ROOM_NOT_FOUND', 'Room not found');
      const body: RoomExistsResponse = { exists: true, roomId };
      res.json(body);
    }),
  );

  router.post(
    '/:roomId/guest',
    asyncHandler(async (req, res) => {
      if (config.REQUIRE_AUTH) throw new HttpError(401, 'AUTH_REQUIRED', 'Guest join is disabled. Please log in first');
      const roomId = roomIdParam.parse(req.params.roomId);
      if (!(await roomManager.exists(roomId))) throw new HttpError(404, 'ROOM_NOT_FOUND', 'Room not found');
      const { username } = guestBody.parse(req.body);
      const userId = nanoid();
      const token = signToken({ userId, username, authType: 'guest' });
      const body: RoomAuthResponse = { roomId, userId, token };
      res.json(body);
    }),
  );

  return router;
}
