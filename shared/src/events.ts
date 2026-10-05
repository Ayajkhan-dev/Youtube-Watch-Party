// Socket event ke naam. PDF ke 13 events exact naam se + hamare extra events.
export const EVENTS = {
  // Phase 1 sirf test ke liye
  PING_TEST: 'ping_test',
  PONG_TEST: 'pong_test',

  // PDF ke 13 events
  JOIN_ROOM: 'join_room',
  LEAVE_ROOM: 'leave_room',
  SYNC_STATE: 'sync_state',
  PLAY: 'play',
  PAUSE: 'pause',
  SEEK: 'seek',
  CHANGE_VIDEO: 'change_video',
  ASSIGN_ROLE: 'assign_role',
  REMOVE_PARTICIPANT: 'remove_participant',
  USER_JOINED: 'user_joined',
  USER_LEFT: 'user_left',
  ROLE_ASSIGNED: 'role_assigned',
  PARTICIPANT_REMOVED: 'participant_removed',

  // Extra events (plan Section 6.2)
  REQUEST_SYNC: 'request_sync',
  TIME_SYNC: 'time_sync',
  TRANSFER_HOST: 'transfer_host',
  HOST_TRANSFERRED: 'host_transferred',
  REQUEST_ACTION: 'request_action',
  ACTION_REQUESTED: 'action_requested',
  RESOLVE_REQUEST: 'resolve_request',
  REQUEST_RESOLVED: 'request_resolved',
  CHAT_MESSAGE: 'chat_message',
  REACTION: 'reaction',
  ERROR_EVENT: 'error_event',
  REMOVED: 'removed',
  REPLACED: 'replaced', // same user ka naya tab aaya, purana socket band
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
