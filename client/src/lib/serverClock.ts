// Server clock offset: time_sync ko 5 baar bhejke median offset. serverNow() = Date.now() + offset.
// Isse sync_state ka serverTime client ke apne clock se compare kiya ja sakta hai (client clock galat ho tab bhi).
import { EVENTS } from '@watchparty/shared';
import { clockOffset, median } from './syncMath';
import { socket } from './socket';

let offset = 0;

export const serverNow = (): number => Date.now() + offset;
export const getClockOffset = (): number => offset;
export function setClockOffset(ms: number): void {
  offset = ms;
}

function sample(): Promise<number | null> {
  return new Promise((resolve) => {
    if (!socket.connected) return resolve(null);
    const t0 = Date.now();
    const timer = setTimeout(() => resolve(null), 3000);
    socket.emit(EVENTS.TIME_SYNC, { t0 }, (res) => {
      clearTimeout(timer);
      resolve(clockOffset(t0, Date.now(), res.serverNow));
    });
  });
}

// 5 samples (thoda gap ke saath), median offset set karo. Kam se kam 1 sample mila to true.
export async function syncServerClock(count = 5, gapMs = 120): Promise<boolean> {
  const offsets: number[] = [];
  for (let i = 0; i < count; i++) {
    const o = await sample();
    if (o !== null) offsets.push(o);
    if (i < count - 1) await new Promise((r) => setTimeout(r, gapMs));
  }
  if (offsets.length === 0) return false;
  offset = median(offsets);
  return true;
}
