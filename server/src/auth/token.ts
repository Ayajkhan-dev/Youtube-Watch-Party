// JWT identity: guest aur account dono isi token format ko use karte hain.
// authType omitted ho to old Phase 12 guest tokens backward-compatible tareeke se 'guest' maan liye jaate hain.
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { config } from '../config.js';

const payloadSchema = z.object({
  userId: z.string().min(1),
  username: z.string().min(1),
  authType: z.enum(['guest', 'account']).default('guest'),
});
export type TokenPayload = z.infer<typeof payloadSchema>;

export function signToken(payload: Omit<TokenPayload, 'authType'> & { authType?: TokenPayload['authType'] }): string {
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, config.JWT_SECRET);
  return payloadSchema.parse(decoded);
}
