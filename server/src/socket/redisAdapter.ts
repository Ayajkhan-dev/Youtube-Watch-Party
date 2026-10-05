// Socket.IO Redis adapter wiring for Phase 13.
// Three Redis connections per instance: command/store + publish + subscribe.
import type { Server as SocketIOServer } from 'socket.io';
import type { RedisClientLike } from '../store/RedisRoomStore.js';

export async function configureRedisAdapter(
  io: SocketIOServer,
  storeClient: RedisClientLike,
): Promise<() => Promise<void>> {
  // Adapter sirf tab load hota hai jab REDIS_URL configured ho.
  const { createAdapter } = await import('@socket.io/redis-adapter');
  const pub = storeClient.duplicate();
  const sub = pub.duplicate();

  io.adapter(createAdapter(pub as never, sub as never));
  await pub.ping();
  await sub.ping();

  return async () => {
    await Promise.allSettled([pub.quit(), sub.quit()]);
  };
}
