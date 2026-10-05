// Mongo users collection: optional Phase 14 account auth ke liye.
// Password plaintext kabhi store nahi hota; sirf bcrypt passwordHash rakha jata hai.
import mongoose, { type Model } from 'mongoose';

export interface UserDocument {
  email: string;
  passwordHash: string;
  name: string;
  createdAt: Date;
  lastSeen: Date;
}

const userSchema = new mongoose.Schema<UserDocument>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 24 },
    createdAt: { type: Date, required: true },
    lastSeen: { type: Date, required: true },
  },
  {
    collection: 'users',
    versionKey: false,
  },
);

export const UserModel: Model<UserDocument> =
  (mongoose.models.User as Model<UserDocument> | undefined) ?? mongoose.model<UserDocument>('User', userSchema);
