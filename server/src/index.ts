// Entry point: Express + Socket.IO ek hi HTTP server par chalte hain.
// Phase 13: REDIS_URL ho to RedisRoomStore, Redis adapter aur leader janitor enable hota hai.
import http from 'node:http';
import { createApp } from './app.js';
import { createRuntimeContext, shutdownPersistence } from './context.js';
import { configureRedisAdapter } from './socket/redisAdapter.js';
import { createSocketServer } from './socket/createSocketServer.js';
import { RedisJanitor } from './services/RedisJanitor.js';
import { config } from './config.js';
import { logger } from './logger.js';

const { context: ctx, redisStore } = await createRuntimeContext();
const app = createApp(ctx);
const httpServer = http.createServer(app);
const io = createSocketServer(httpServer, ctx);

let closeRedisAdapter: (() => Promise<void>) | undefined;
let janitor: RedisJanitor | undefined;

if (redisStore) {
  closeRedisAdapter = await configureRedisAdapter(io, redisStore.getClient());
  janitor = new RedisJanitor(io, ctx, redisStore);
  janitor.start();
  logger.info('Phase 13 Redis mode enabled');
} else {
  logger.info('Redis not configured; using in-memory room store');
}

httpServer.listen(config.PORT, () => {
  logger.info(`server running on port ${config.PORT} (${config.NODE_ENV})`);
});

async function shutdown() {
  logger.info('shutting down...');
  janitor?.dispose();
  ctx.roomManager.dispose();
  ctx.requests.dispose();
  io.close(async () => {
    httpServer.close(async () => {
      try {
        await closeRedisAdapter?.();
        await redisStore?.getClient().quit();
        await ctx.persistence?.dispose();
        await shutdownPersistence();
      } finally {
        process.exit(0);
      }
    });
  });
}
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
