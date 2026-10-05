// Mongo rooms collection: sirf persistent room metadata rakhti hai, live participants/playback nahi.
// Live state Redis/in-memory Room mein rehta hai; restart ke baad yahi metadata rehydrate hota hai.
import mongoose, { type Model } from 'mongoose';

export interface RoomDocument {
  roomId: string;
  creatorUserId: string;
  lastVideoId: string | null;
  createdAt: Date;
  lastActiveAt: Date;
}

const roomSchema = new mongoose.Schema<RoomDocument>(
  {
    roomId: { type: String, required: true, unique: true, index: true },
    creatorUserId: { type: String, required: true, index: true },
    lastVideoId: { type: String, default: null },
    createdAt: { type: Date, required: true },
    lastActiveAt: { type: Date, required: true, index: true },
  },
  {
    collection: 'rooms',
    versionKey: false,
  },
);

export const RoomModel: Model<RoomDocument> =
  (mongoose.models.Room as Model<RoomDocument> | undefined) ?? mongoose.model<RoomDocument>('Room', roomSchema);
