// Saari permission logic ek hi jagah (SPEC Section 5). Koi aur file role strings compare nahi karti.
// can(role, action) se pata chalta hai ki role ye action kar sakta hai ya nahi.
import { ROLES, type Role } from '@watchparty/shared';

export const ACTIONS = [
  'play',
  'pause',
  'seek',
  'change_video',
  'resolve_request', // playback request approve/reject (Host + Moderator)
  'assign_role', // role dena; become_moderator request approve bhi isi se (sirf Host)
  'remove_participant',
  'transfer_host',
  'request_action', // participant/viewer approval maangte hain
  'chat_message',
  'reaction',
  'leave_room',
] as const;
export type Action = (typeof ACTIONS)[number];

const HOST: Role[] = ['host'];
const HOST_MOD: Role[] = ['host', 'moderator'];
const NON_PRIVILEGED: Role[] = ['participant', 'viewer'];

export const PERMISSIONS: Readonly<Record<Action, readonly Role[]>> = {
  play: HOST_MOD,
  pause: HOST_MOD,
  seek: HOST_MOD,
  change_video: HOST_MOD,
  resolve_request: HOST_MOD,
  assign_role: HOST,
  remove_participant: HOST,
  transfer_host: HOST,
  request_action: NON_PRIVILEGED,
  chat_message: ROLES,
  reaction: ROLES,
  leave_room: ROLES,
};

// assign_role se sirf ye roles diye ja sakte hain. 'host' sirf transfer_host se milta hai.
export const ASSIGNABLE_ROLES = ['moderator', 'participant', 'viewer'] as const satisfies readonly Role[];

export const PermissionService = {
  can(role: Role, action: Action): boolean {
    return PERMISSIONS[action].includes(role);
  },
  isHost(role: Role): boolean {
    return role === 'host';
  },
  isAssignable(role: Role): boolean {
    return (ASSIGNABLE_ROLES as readonly Role[]).includes(role);
  },
};
