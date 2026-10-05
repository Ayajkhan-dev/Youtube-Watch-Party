// zod schemas: client se aane wali har cheez yahan validate hoti hai.
import { z } from 'zod';
import { CHAT_MAX_LENGTH, parseYouTubeId, resolveReaction } from '@watchparty/shared';
import { ROOM_CODE_REGEX } from '../utils/roomCode.js';

// Username: control characters hatao, trim karo, 1-24 characters.
export const usernameSchema = z
  .string()
  // eslint-disable-next-line no-control-regex
  .transform((s) => s.replace(/[\u0000-\u001F\u007F]/g, '').trim())
  .pipe(z.string().min(1, 'Username cannot be empty').max(24, 'Username must be at most 24 characters'));

export const createRoomBody = z.object({ username: usernameSchema });
export const guestBody = z.object({ username: usernameSchema });

// URL mein code kisi bhi case mein aa sakta hai, hum uppercase karke check karte hain.
export const roomIdParam = z
  .string()
  .transform((s) => s.toUpperCase())
  .pipe(z.string().regex(ROOM_CODE_REGEX, 'Invalid room code'));

// ---- Socket payloads (Phase 4) ----
// roomId yahan sirf join ke liye hai. Uske baad server socket.data.roomId par chalta hai.
export const joinRoomPayload = z.object({ roomId: roomIdParam, username: usernameSchema });
export const leaveRoomPayload = z.object({ roomId: z.string().optional() });

// ---- RBAC payloads (Phase 5) ----
const userIdSchema = z.string().min(1, 'userId is required').max(64);
// 'host' yahan allowed nahi: host role sirf transfer_host se milta hai.
export const assignRolePayload = z.object({
  userId: userIdSchema,
  role: z.enum(['moderator', 'participant', 'viewer'], {
    errorMap: () => ({ message: 'role must be moderator, participant or viewer' }),
  }),
});
export const removeParticipantPayload = z.object({ userId: userIdSchema });
export const transferHostPayload = z.object({ userId: userIdSchema });

// ---- Playback payloads (Phase 6) ----
const MAX_TIME = 86400; // 24 ghante
const timeSchema = z
  .number({ invalid_type_error: 'time must be a number' })
  .finite()
  .min(0, 'time cannot be less than 0')
  .max(MAX_TIME, 'time cannot exceed 86400 seconds');

// play/pause: payload optional ({} ya kuch nahi), time optional.
export const playPayload = z.preprocess((v) => v ?? {}, z.object({ time: timeSchema.optional() }));
export const pausePayload = playPayload;
export const seekPayload = z.object({ time: timeSchema });
// videoId: 11-char ID ya poora YouTube URL; dono se ID nikalte hain, invalid par INVALID_PAYLOAD.
export const changeVideoPayload = z.object({
  videoId: z
    .string({ required_error: 'videoId is required' })
    .max(300)
    .transform((s, ctx) => {
      const id = parseYouTubeId(s);
      if (!id) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid YouTube video ID/URL' });
      return id ?? '';
    }),
});
export const timeSyncPayload = z.object({ t0: z.number().optional() }).passthrough().optional();

// ---- Approval flow payloads (Phase 7) ----
// Har type ka payload usi type ke schema se validate hota hai; become_moderator ka payload {}.
const emptyBody = z.preprocess((v) => v ?? {}, z.object({}));
export const requestActionPayload = z.discriminatedUnion('type', [
  z.object({ type: z.literal('play'), payload: playPayload }),
  z.object({ type: z.literal('pause'), payload: pausePayload }),
  z.object({ type: z.literal('seek'), payload: seekPayload }),
  z.object({ type: z.literal('change_video'), payload: changeVideoPayload }),
  z.object({ type: z.literal('become_moderator'), payload: emptyBody }),
]);
export const resolveRequestPayload = z.object({
  requestId: z.string().min(1, 'requestId is required').max(64),
  approve: z.boolean({ required_error: 'approve (true/false) is required', invalid_type_error: 'approve must be a boolean' }),
});

// ---- Chat / reactions (Phase 11) ----
// Text: control characters hatao, trim, 1-500 chars. (HTML escape client karta hai: React text escape)
export const chatPayload = z.object({
  text: z
    .string({ required_error: 'text is required', invalid_type_error: 'text must be a string' })
    // eslint-disable-next-line no-control-regex
    .transform((s) => s.replace(/[\u0000-\u001F\u007F]/g, ' ').trim())
    .pipe(z.string().min(1, 'Message cannot be empty').max(CHAT_MAX_LENGTH, `Message must be at most ${CHAT_MAX_LENGTH} characters`)),
});
// emoji: whitelist key ('fire') ya emoji character; server hamesha character broadcast karta hai.
export const reactionPayload = z.object({
  emoji: z.unknown().transform((v, ctx) => {
    const e = resolveReaction(v);
    if (!e) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'This reaction is not allowed' });
    return e ?? '';
  }),
});
