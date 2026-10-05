// Account session: Phase 14 login/register ke baad user JWT ko ek global localStorage key mein rakhta hai.
// Room-specific session ab bhi wahi existing key use karta hai, isliye guest flow break nahi hota.
import type { Session } from './session';

const ACCOUNT_KEY = 'wp_account_session';

export function loadAccountSession(): Session | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<Session>;
    if (typeof s.userId === 'string' && typeof s.token === 'string' && typeof s.username === 'string') {
      return { userId: s.userId, token: s.token, username: s.username };
    }
  } catch {
    /* ignore invalid storage */
  }
  return null;
}

export function saveAccountSession(s: Session): void {
  try {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(s));
    localStorage.setItem('wp_last_username', s.username);
  } catch {
    /* ignore unavailable storage */
  }
}

export function clearAccountSession(): void {
  try {
    localStorage.removeItem(ACCOUNT_KEY);
  } catch {
    /* ignore */
  }
}
