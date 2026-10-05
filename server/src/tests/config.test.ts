// Phase 12: production config checks (CORS origins, weak secret, trust proxy) aur Origin check.
import { describe, expect, it } from 'vitest';
import { isOriginAllowed, parseConfig, parseOrigins } from '../config.js';

const base = { JWT_SECRET: 'a-long-random-secret-value-1234567890' };

describe('parseOrigins', () => {
  it('trailing slash hata deta hai, comma list, dedupe nahi par normalize', () => {
    expect(parseOrigins('https://app.vercel.app/')).toEqual(['https://app.vercel.app']);
    expect(parseOrigins(' https://a.com/ , http://localhost:5173 ')).toEqual(['https://a.com', 'http://localhost:5173']);
  });
  it('invalid: khali, URL nahi, path ke saath, ftp', () => {
    expect(() => parseOrigins('')).toThrow();
    expect(() => parseOrigins('not a url')).toThrow(/invalid/);
    expect(() => parseOrigins('https://a.com/app')).toThrow(/origin/);
    expect(() => parseOrigins('ftp://a.com')).toThrow(/http/);
  });
});

describe('parseConfig', () => {
  it('development defaults: localhost CORS, proxy off', () => {
    const c = parseConfig({ ...base });
    expect(c).toMatchObject({ PORT: 4000, NODE_ENV: 'development', CLIENT_URL: 'http://localhost:5173', TRUST_PROXY: 0 });
    expect(c.CLIENT_ORIGINS).toEqual(['http://localhost:5173']);
  });

  it('production valid: Render PORT, trailing slash hata, trust proxy 1', () => {
    const c = parseConfig({ ...base, NODE_ENV: 'production', PORT: '10000', CLIENT_URL: 'https://my-app.vercel.app/' });
    expect(c).toMatchObject({ PORT: 10000, CLIENT_URL: 'https://my-app.vercel.app', TRUST_PROXY: 1 });
    expect(c.CLIENT_ORIGINS).toEqual(['https://my-app.vercel.app']);
  });

  it('production: CLIENT_URL missing / weak JWT_SECRET par start nahi hota', () => {
    expect(() => parseConfig({ ...base, NODE_ENV: 'production' })).toThrow(/CLIENT_URL/);
    expect(() => parseConfig({ ...base, NODE_ENV: 'production', CLIENT_URL: ' ' })).toThrow();
    expect(() => parseConfig({ JWT_SECRET: 'dev-only-secret-change-me-123456', NODE_ENV: 'production', CLIENT_URL: 'https://a.com' })).toThrow(/weak/);
  });

  it('JWT_SECRET missing/chhota par hamesha fail', () => {
    expect(() => parseConfig({})).toThrow();
    expect(() => parseConfig({ JWT_SECRET: 'short' })).toThrow();
  });

  it('REQUIRE_AUTH default false aur env se true ho sakta hai', () => {
    expect(parseConfig({ ...base }).REQUIRE_AUTH).toBe(false);
    expect(parseConfig({ ...base, REQUIRE_AUTH: 'true' }).REQUIRE_AUTH).toBe(true);
  });

  it('TRUST_PROXY env se override', () => {
    expect(parseConfig({ ...base, NODE_ENV: 'production', CLIENT_URL: 'https://a.com', TRUST_PROXY: '2' }).TRUST_PROXY).toBe(2);
    expect(parseConfig({ ...base, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1);
  });
});

describe('isOriginAllowed', () => {
  const allowed = ['https://app.vercel.app'];
  it('allowed origin, bina Origin (curl), aur galat origin', () => {
    expect(isOriginAllowed('https://app.vercel.app', allowed)).toBe(true);
    expect(isOriginAllowed('https://app.vercel.app/', allowed)).toBe(true);
    expect(isOriginAllowed(undefined, allowed)).toBe(true);
    expect(isOriginAllowed('https://evil.com', allowed)).toBe(false);
    expect(isOriginAllowed('http://app.vercel.app', allowed)).toBe(false);
  });
});
