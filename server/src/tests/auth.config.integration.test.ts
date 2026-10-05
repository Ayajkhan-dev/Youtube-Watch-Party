// Phase 15 auth/config regression coverage that does not require a live MongoDB server.
// Mongo-backed register/login remains covered by the Phase 14 implementation and is manual/integration-only here.
import { describe, expect, it } from 'vitest';
import { parseConfig } from '../config.js';
import { signToken, verifyToken } from '../auth/token.js';

describe('authentication configuration regression', () => {
  const base = {
    NODE_ENV: 'test',
    JWT_SECRET: 'phase15-test-secret-1234567890',
    CLIENT_URL: 'http://localhost:5173',
  } as NodeJS.ProcessEnv;

  it('REQUIRE_AUTH defaults to false for backward-compatible guest mode', () => {
    expect(parseConfig(base).REQUIRE_AUTH).toBe(false);
  });

  it('REQUIRE_AUTH=true is parsed as a real boolean', () => {
    expect(parseConfig({ ...base, REQUIRE_AUTH: 'true' }).REQUIRE_AUTH).toBe(true);
    expect(parseConfig({ ...base, REQUIRE_AUTH: 'false' }).REQUIRE_AUTH).toBe(false);
  });

  it('account token remains distinguishable from guest token', () => {
    const account = verifyToken(signToken({ userId: 'u1', username: 'Alice', authType: 'account' }));
    const guest = verifyToken(signToken({ userId: 'u2', username: 'Bob', authType: 'guest' }));
    expect(account.authType).toBe('account');
    expect(guest.authType).toBe('guest');
    expect(account.userId).toBe('u1');
    expect(guest.userId).toBe('u2');
  });
});
