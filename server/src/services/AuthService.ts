// Account auth service: register/login par bcrypt cost 10 use karta hai aur account JWT issue karta hai.
// REQUIRE_AUTH flag guest flow ko default mein break nahi karta; route level par enforce hota hai.
import bcrypt from 'bcrypt';
import { UserModel } from '../store/mongo/UserModel.js';
import { signToken } from '../auth/token.js';

const BCRYPT_COST = 10;

export interface AuthResult {
  userId: string;
  username: string;
  token: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export class AuthService {
  async register(email: string, password: string, name: string): Promise<AuthResult> {
    const normalizedEmail = normalizeEmail(email);
    const now = new Date();
    const existing = await UserModel.findOne({ email: normalizedEmail }).lean();
    if (existing) throw new Error('EMAIL_EXISTS');

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    let user;
    try {
      user = await UserModel.create({
        email: normalizedEmail,
        passwordHash,
        name: name.trim(),
        createdAt: now,
        lastSeen: now,
      });
    } catch (err) {
      if (err instanceof Error && 'code' in err && (err as { code?: number }).code === 11000) {
        throw new Error('EMAIL_EXISTS');
      }
      throw err;
    }

    return {
      userId: String(user._id),
      username: user.name,
      token: signToken({ userId: String(user._id), username: user.name, authType: 'account' }),
    };
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const normalizedEmail = normalizeEmail(email);
    const user = await UserModel.findOne({ email: normalizedEmail });
    if (!user) throw new Error('INVALID_CREDENTIALS');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new Error('INVALID_CREDENTIALS');

    user.lastSeen = new Date();
    await user.save();

    return {
      userId: String(user._id),
      username: user.name,
      token: signToken({ userId: String(user._id), username: user.name, authType: 'account' }),
    };
  }
}
