// AppContext: store + RoomManager + settings. REST aur Socket dono ko ek hi context milta hai,
// taaki dono ek hi rooms dekhein (global variable ke bina).
import { config } from './config.js';
import { RequestService } from './services/RequestService.js';
import { RoomManager } from './services/RoomManager.js';
import { InMemoryRoomStore } from './store/InMemoryRoomStore.js';
import { RedisRoomStore, type RedisClientLike } from './store/RedisRoomStore.js';
import { MongoRoomPersistence } from './store/MongoRoomPersistence.js';
import { connectMongo, disconnectMongo } from './store/mongo/connection.js';
import type { RoomStore } from './store/RoomStore.js';

export interface AppSettings {
  maxParticipants: number; // ek room mein max log
  graceMs: number; // disconnect ke baad wapas aane ka time
  emptyRoomTtlMs: number; // khali room kitni der baad delete
  requestTtlMs: number; // approval request ka expiry (60s)
  restRateLimitPerMin: number; // REST API rate limit per IP
  instanceId: string; // join ack mein dikhta hai (Phase 13 mein hostname)
}

export interface AppContext {
  settings: AppSettings;
  store: RoomStore;
  roomManager: RoomManager;
  requests: RequestService; // approval requests ka state + expiry timers
  persistence?: MongoRoomPersistence; // Phase 14 optional Mongo metadata persistence
}

export function createContext(overrides: Partial<AppSettings> = {}, store?: RoomStore, persistence?: MongoRoomPersistence): AppContext {
  const settings: AppSettings = {
    maxParticipants: config.MAX_PARTICIPANTS,
    graceMs: config.GRACE_PERIOD_MS,
    emptyRoomTtlMs: config.EMPTY_ROOM_TTL_MS,
    requestTtlMs: config.REQUEST_TTL_MS,
    restRateLimitPerMin: config.REST_RATE_LIMIT_PER_MIN,
    instanceId: process.env.HOSTNAME ?? 'local',
    ...overrides,
  };
  // REDIS_URL / MONGO_URI wale stores Phase 13-14 mein yahin select honge; abhi memory.
  const theStore = store ?? new InMemoryRoomStore();
  return {
    settings,
    store: theStore,
    roomManager: new RoomManager(theStore, settings.emptyRoomTtlMs, undefined, persistence),
    requests: new RequestService(settings.requestTtlMs),
    persistence,
  };
}


// Production/dev runtime selector: REDIS_URL present => RedisRoomStore; otherwise keep the Phase 12 in-memory fallback.
export async function createRuntimeContext(overrides: Partial<AppSettings> = {}): Promise<{
  context: AppContext;
  redisStore?: RedisRoomStore;
  mongoPersistence?: MongoRoomPersistence;
}> {
  let mongoPersistence: MongoRoomPersistence | undefined;
  if (config.MONGO_URI) {
    await connectMongo(config.MONGO_URI);
    mongoPersistence = new MongoRoomPersistence();
  }
  if (!config.REDIS_URL) return { context: createContext(overrides, undefined, mongoPersistence), mongoPersistence };

  const { Redis } = await import('ioredis');
  const client = new Redis(config.REDIS_URL) as unknown as RedisClientLike;
  await client.ping();
  const redisStore = new RedisRoomStore(client);
  return { context: createContext(overrides, redisStore, mongoPersistence), redisStore, mongoPersistence };
}

export async function shutdownPersistence(): Promise<void> {
  await disconnectMongo();
}
