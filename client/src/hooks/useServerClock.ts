// useServerClock: connect hote hi time_sync (5 samples, median offset), phir har 5 min dobara.
// Jab tak offset nahi mila, store.clockSynced = false (player state apply nahi karta).
import { useEffect } from 'react';
import { syncServerClock } from '../lib/serverClock';
import { useRoomStore } from '../store/roomStore';

export function useServerClock(): void {
  const connection = useRoomStore((s) => s.connection);
  useEffect(() => {
    if (connection !== 'connected') return;
    let cancelled = false;
    const run = () =>
      void syncServerClock().then((ok) => {
        if (!cancelled && ok) useRoomStore.getState().setClockSynced(true);
      });
    run();
    const t = setInterval(run, 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [connection]);
}
