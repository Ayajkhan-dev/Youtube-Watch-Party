// MongoDB connection: Phase 14 persistence only. MONGO_URI absent ho to app Mongo ke bina bhi chal sakta hai.
// maxPoolSize 20 PDF ke connection-pooling guidance ke saath aligned hai.
import mongoose from 'mongoose';

let connected = false;

export async function connectMongo(uri: string): Promise<void> {
  if (connected) return;
  await mongoose.connect(uri, {
    maxPoolSize: 20,
    serverSelectionTimeoutMS: 10_000,
  });
  connected = true;
}

export async function disconnectMongo(): Promise<void> {
  if (!connected) return;
  connected = false;
  await mongoose.disconnect();
}

export function isMongoConnected(): boolean {
  return connected && mongoose.connection.readyState === 1;
}
