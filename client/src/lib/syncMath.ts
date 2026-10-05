// Sync ka saara hisaab pure functions mein (React/YT ke bina), taaki unit test ho sake.
// Server single source of truth: client sirf sync_state se "ab player ko kya karna chahiye" nikaalta hai.
import type { PlayState } from '@watchparty/shared';

// YouTube player states (YT.PlayerState ke numbers; global YT par depend nahi karte)
export const YT_STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;

export const APPLY_SEEK_THRESHOLD = 1.0; // sync_state aane par itne se zyada fark par seek
export const DRIFT_SEEK_THRESHOLD = 1.5; // har 2 sec ke drift check mein
export const DRIFT_INTERVAL_MS = 2000;

// Median: outliers (ek slow ping) se bachne ke liye average nahi, median.
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

// Ek time_sync sample se clock offset: server ka time ~ serverNow + rtt/2 (reply aate waqt).
// offset = serverNow + rtt/2 - clientNow(reply ke waqt). Server time = Date.now() + offset.
export function clockOffset(t0: number, t1: number, serverNow: number): number {
  const rtt = Math.max(0, t1 - t0);
  return serverNow + rtt / 2 - t1;
}

export interface SyncLike {
  playState: PlayState;
  currentTime: number;
  videoId: string | null;
  serverTime: number;
}

// State ke hisaab se abhi player ka sahi position (seconds). Playing ho to serverTime se ab tak ka time jodte hain.
export function targetTime(state: SyncLike, serverNowMs: number): number {
  if (state.playState !== 'playing') return state.currentTime;
  return state.currentTime + Math.max(0, serverNowMs - state.serverTime) / 1000;
}

export interface PlayerSnapshot {
  loadedVideoId: string | null; // jo video hamne player mein load/cue kiya
  currentTime: number; // player.getCurrentTime()
  playerState: number; // player.getPlayerState()
}
export type PlayerAction =
  | { type: 'load'; videoId: string; start: number } // load + autoplay
  | { type: 'cue'; videoId: string; start: number } // load, paused
  | { type: 'seek'; to: number }
  | { type: 'play' }
  | { type: 'pause' };

// applyState ka dimaag: sync_state + player ki haalat -> actions ki list.
// - video badla: load (playing) ya cue (paused).
// - warna: fark > threshold to seek; phir playing/paused match karao.
export function planApply(
  snap: PlayerSnapshot,
  state: SyncLike,
  serverNowMs: number,
  seekThreshold: number = APPLY_SEEK_THRESHOLD,
): PlayerAction[] {
  if (!state.videoId) return [];
  const target = targetTime(state, serverNowMs);
  const playing = state.playState === 'playing';

  if (snap.loadedVideoId !== state.videoId) {
    return [{ type: playing ? 'load' : 'cue', videoId: state.videoId, start: target }];
  }

  const actions: PlayerAction[] = [];
  const seeking = Math.abs(snap.currentTime - target) > seekThreshold;
  if (seeking) actions.push({ type: 'seek', to: target });

  const running = snap.playerState === YT_STATE.PLAYING || snap.playerState === YT_STATE.BUFFERING;
  if (playing) {
    // Video khatam ho chuka ho to seek(target) usse dobara chala deta hai; warna play chahiye.
    if (!running || snap.playerState === YT_STATE.ENDED) actions.push({ type: 'play' });
  } else if (running || seeking) {
    // paused: chalta ho to roko. Cued/unstarted player par seekTo playback shuru kar deta hai, isliye seek ke baad bhi pause.
    actions.push({ type: 'pause' });
  }
  return actions;
}

// Drift check (har 2 sec): sirf jab server ke hisaab se playing ho aur player buffering mein na ho.
export function planDrift(snap: PlayerSnapshot, state: SyncLike, serverNowMs: number): PlayerAction[] {
  if (state.playState !== 'playing' || !state.videoId) return [];
  if (snap.loadedVideoId !== state.videoId || snap.playerState === YT_STATE.BUFFERING) return [];
  return planApply(snap, state, serverNowMs, DRIFT_SEEK_THRESHOLD);
}

// m:ss ya h:mm:ss
export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// YouTube onError codes -> user ko samajhne wala message
export function youtubeErrorMessage(code: number): string {
  switch (code) {
    case 2:
      return 'Invalid video ID. Please try another link.';
    case 5:
      return 'This video cannot be played in the HTML5 player.';
    case 100:
      return 'Video not found (it may be private or removed).';
    case 101:
    case 150:
      return 'Video owner ne embed band kiya hai. Koi aur video chuno.';
    default:
      return `Video could not be played (error ${code}).`;
  }
}
