// Reactions ki whitelist: key (network par) -> emoji character (UI par). Client aur server dono yahi use karte hain.
export const REACTIONS = {
  thumbsup: '👍',
  heart: '❤️',
  laugh: '😂',
  wow: '😮',
  fire: '🔥',
  clap: '👏',
} as const;
export type ReactionKey = keyof typeof REACTIONS;
export const REACTION_KEYS = Object.keys(REACTIONS) as ReactionKey[];

export const CHAT_MAX_LENGTH = 500;
export const CHAT_HISTORY_LIMIT = 50;

// Key ('fire') ya seedha emoji ('🔥') dono accept; whitelist ke bahar kuch nahi. Valid par emoji character, warna null.
export function resolveReaction(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const v = input.trim();
  if (Object.prototype.hasOwnProperty.call(REACTIONS, v)) return REACTIONS[v as ReactionKey];
  return Object.values(REACTIONS).includes(v as (typeof REACTIONS)[ReactionKey]) ? v : null;
}
