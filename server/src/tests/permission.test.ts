// PermissionService: SPEC Section 5 ki matrix ki har cell (4 roles x 12 actions) test hoti hai.
import { describe, it, expect } from 'vitest';
import { ROLES, type Role } from '@watchparty/shared';
import { ACTIONS, ASSIGNABLE_ROLES, PermissionService, type Action } from '../services/PermissionService.js';

// SPEC matrix ki independent copy: kaun sa role kaun si action kar sakta hai.
const EXPECTED: Record<Action, Role[]> = {
  play: ['host', 'moderator'],
  pause: ['host', 'moderator'],
  seek: ['host', 'moderator'],
  change_video: ['host', 'moderator'],
  resolve_request: ['host', 'moderator'],
  assign_role: ['host'],
  remove_participant: ['host'],
  transfer_host: ['host'],
  request_action: ['participant', 'viewer'],
  chat_message: ['host', 'moderator', 'participant', 'viewer'],
  reaction: ['host', 'moderator', 'participant', 'viewer'],
  leave_room: ['host', 'moderator', 'participant', 'viewer'],
};

describe('PermissionService matrix', () => {
  it('EXPECTED matrix har action cover karta hai', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...ACTIONS].sort());
  });

  for (const action of ACTIONS) {
    for (const role of ROLES) {
      const allowed = EXPECTED[action].includes(role);
      it(`${role} ${allowed ? 'CAN' : 'CANNOT'} ${action}`, () => {
        expect(PermissionService.can(role, action)).toBe(allowed);
      });
    }
  }

  it('viewer participant jaisa hai (playback nahi, request kar sakta hai)', () => {
    for (const a of ACTIONS) {
      expect(PermissionService.can('viewer', a)).toBe(PermissionService.can('participant', a));
    }
  });

  it('assign_role se host role nahi diya ja sakta', () => {
    expect([...ASSIGNABLE_ROLES]).toEqual(['moderator', 'participant', 'viewer']);
    expect(PermissionService.isAssignable('host')).toBe(false);
    expect(PermissionService.isAssignable('moderator')).toBe(true);
  });

  it('isHost sirf host ke liye true', () => {
    expect(ROLES.filter((r) => PermissionService.isHost(r))).toEqual(['host']);
  });
});
