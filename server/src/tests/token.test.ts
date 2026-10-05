import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { signToken, verifyToken } from '../auth/token.js';

describe('jwt token', () => {
  it('sign ke baad verify wahi payload deta hai', () => {
    const t = signToken({ userId: 'u1', username: 'Ayaj' });
    const p = verifyToken(t);
    expect(p.userId).toBe('u1');
    expect(p.username).toBe('Ayaj');
    expect(p.authType).toBe('guest');
  });
  it('account token ka authType account hota hai', () => {
    const t = signToken({ userId: 'account-1', username: 'Ayaj', authType: 'account' });
    expect(verifyToken(t).authType).toBe('account');
  });
  it('galat secret se bana token reject', () => {
    const bad = jwt.sign({ userId: 'u1', username: 'x' }, 'some-other-secret-value-1234');
    expect(() => verifyToken(bad)).toThrow();
  });
  it('expired token reject', () => {
    const old = jwt.sign({ userId: 'u1', username: 'x' }, process.env.JWT_SECRET!, { expiresIn: -10 });
    expect(() => verifyToken(old)).toThrow();
  });
  it('garbage string reject', () => {
    expect(() => verifyToken('not-a-token')).toThrow();
  });
});
