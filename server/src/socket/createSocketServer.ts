// Socket.IO server banane ka kaam: config + auth middleware + connection events + RoomHandler.
import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { EVENTS } from '@watchparty/shared';
import { config, isOriginAllowed } from '../config.js';
import { logger } from '../logger.js';
import { socketAuth } from './authMiddleware.js';
import type { AppContext } from '../context.js';
import { ChatHandler } from '../handlers/ChatHandler.js';
import { PlaybackHandler } from '../handlers/PlaybackHandler.js';
import { RequestHandler } from '../handlers/RequestHandler.js';
import { RoleHandler } from '../handlers/RoleHandler.js';
import { RoleService } from '../services/RoleService.js';
import { RoomHandler } from '../handlers/RoomHandler.js';
import type { AppServer } from './types.js';

export function createSocketServer(httpServer: HttpServer, ctx: AppContext): AppServer {
  const io: AppServer = new Server(httpServer, {
    cors: { origin: config.CLIENT_ORIGINS },
    // Production mein WebSocket upgrade par bhi Origin check (cors option sirf polling handshake ko rokta hai).
    allowRequest: (req, cb) => cb(null, config.NODE_ENV !== 'production' || isOriginAllowed(req.headers.origin, config.CLIENT_ORIGINS)),
    perMessageDeflate: false, // CPU bachao (chhote messages ke liye compression ka fayda nahi)
    pingInterval: 25000,
    pingTimeout: 20000,
    maxHttpBufferSize: 1e5, // 100KB se bada message reject
  });

  io.use(socketAuth); // har connection par pehle token check
  const roomHandler = new RoomHandler(io, ctx);
  const roleService = new RoleService(io, ctx);
  const roleHandler = new RoleHandler(io, ctx, roleService);
  const requestHandler = new RequestHandler(io, ctx, roleService);
  const playbackHandler = new PlaybackHandler(io, ctx);
  const chatHandler = new ChatHandler(io, ctx);

  io.on('connection', (socket) => {
    logger.info({ socketId: socket.id, userId: socket.data.userId }, 'socket connected');

    roomHandler.registerSocket(socket); // join_room / leave_room / disconnect
    roleHandler.registerSocket(socket); // assign_role / remove_participant / transfer_host (Host only)
    requestHandler.registerSocket(socket); // request_action / resolve_request (approval flow)
    chatHandler.registerSocket(socket); // chat_message / reaction
    playbackHandler.registerSocket(socket); // play / pause / seek / change_video / request_sync / time_sync

    socket.on(EVENTS.PING_TEST, (payload) => {
      socket.emit(EVENTS.PONG_TEST, { sentAt: payload.sentAt, serverTime: Date.now() });
    });

    socket.on('disconnect', (reason) => {
      logger.info({ socketId: socket.id, reason }, 'socket disconnected');
    });
  });

  return io;
}
