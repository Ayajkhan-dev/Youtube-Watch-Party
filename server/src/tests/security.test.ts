// Phase 15 security regression tests: error sanitization aur source-level guardrails.
// Ye tests runtime secrets expose nahi karte; inka focus protocol/security invariants par hai.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isOriginAllowed } from '../config.js';
import { WsError, toErrorPayload } from '../socket/errors.js';

const root = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));

function read(relative: string): string {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

describe('security: error handling', () => {
  it('internal socket errors expose a generic client-safe message, not the stack', () => {
    const payload = toErrorPayload(new Error('db password=super-secret\nstack details'), 'play');
    expect(payload.code).toBe('INTERNAL');
    expect(payload.message).toBe('Something went wrong');
    expect(JSON.stringify(payload)).not.toContain('super-secret');
    expect(JSON.stringify(payload)).not.toContain('stack details');
  });

  it('expected websocket errors preserve their public code/message only', () => {
    const payload = toErrorPayload(new WsError('FORBIDDEN', 'Not allowed'), 'assign_role');
    expect(payload).toEqual({ code: 'FORBIDDEN', event: 'assign_role', message: 'Not allowed' });
  });
});

describe('security: origin policy', () => {
  const allowed = ['https://watch.example.com', 'http://localhost:5173'];

  it('allows configured origins and rejects lookalike origins', () => {
    expect(isOriginAllowed('https://watch.example.com', allowed)).toBe(true);
    expect(isOriginAllowed('https://watch.example.com.evil.test', allowed)).toBe(false);
    expect(isOriginAllowed('http://localhost:5173', allowed)).toBe(true);
    expect(isOriginAllowed(undefined, allowed)).toBe(true);
  });
});

describe('security: source guardrails', () => {
  it('does not use dangerouslySetInnerHTML anywhere in client source', () => {
    const clientSrcDir = path.join(root, 'client', 'src');
    const stack: string[] = [clientSrcDir];
    const offenders: string[] = [];
    while (stack.length) {
      const current = stack.pop() as string;
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
          if (fs.readFileSync(full, 'utf8').includes('dangerouslySetInnerHTML')) offenders.push(path.relative(root, full));
        }
      }
    }
    // Chat.tsx documentation mentions the forbidden API by name, so allow comments but not executable usage.
    const executableOffenders = offenders.filter((file) => {
      const src = fs.readFileSync(path.join(root, file), 'utf8');
      return /(^|[^/])dangerouslySetInnerHTML\s*=/.test(src) || /\{\s*dangerouslySetInnerHTML\s*:/.test(src);
    });
    expect(executableOffenders).toEqual([]);
  });

  it('protected realtime handlers keep permission validation centralized in guard()', () => {
    const files = [
      'server/src/handlers/PlaybackHandler.ts',
      'server/src/handlers/RoleHandler.ts',
      'server/src/handlers/RequestHandler.ts',
      'server/src/handlers/ChatHandler.ts',
    ];
    for (const file of files) {
      const src = read(file);
      expect(src).toMatch(/guard\(/);
    }
  });

  it('socket guard uses server-side socket identity and room membership', () => {
    const src = read('server/src/socket/guard.ts');
    expect(src).toMatch(/socket\.data\.userId/);
    expect(src).toMatch(/socket\.data\.roomId/);
    expect(src).toMatch(/participant\.socketId !== socket\.id/);
    expect(src).toMatch(/PermissionService\.can/);
  });
});
