// Guest session localStorage mein: refresh par wahi userId/token, isliye server par role bachta hai.
// Key: wp_session_{roomId}. localStorage fail ho sakta hai (private mode), isliye try/catch.
export interface Session {
  userId: string;
  token: string;
  username: string;
}

const key = (roomId: string) => `wp_session_${roomId.toUpperCase()}`;
const NAME_KEY = 'wp_last_username';

export function loadSession(roomId: string): Session | null {
  try {
    const raw = localStorage.getItem(key(roomId));
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<Session>;
    if (typeof s.userId === 'string' && typeof s.token === 'string' && typeof s.username === 'string') {
      return { userId: s.userId, token: s.token, username: s.username };
    }
  } catch {
    /* kharab data: ignore */
  }
  return null;
}

export function saveSession(roomId: string, s: Session): void {
  try {
    localStorage.setItem(key(roomId), JSON.stringify(s));
    localStorage.setItem(NAME_KEY, s.username);
  } catch {
    /* storage band hai: session sirf is page tak chalega */
  }
}

export function clearSession(roomId: string): void {
  try {
    localStorage.removeItem(key(roomId));
  } catch {
    /* ignore */
  }
}

export function lastUsername(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}
