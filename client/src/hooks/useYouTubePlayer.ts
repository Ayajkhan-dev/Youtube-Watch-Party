// useYouTubePlayer: IFrame API load, player banana (controls:0), aur chhota imperative handle.
// Player ready hone ke baad hi control hota hai. onStateChange se server ko KABHI emit nahi karte (echo loop),
// ye sirf UI (buffering/ended) ke liye state set karta hai.
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadYouTubeApi } from '../lib/youtubeApi';
import { YT_STATE, youtubeErrorMessage, type PlayerAction, type PlayerSnapshot } from '../lib/syncMath';

export interface PlayerError {
  code: number;
  message: string;
}

export interface PlayerHandle {
  snapshot: () => PlayerSnapshot;
  run: (actions: PlayerAction[]) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  setVolume: (v: number) => void;
}

export function useYouTubePlayer(mountRef: React.RefObject<HTMLDivElement | null>) {
  const playerRef = useRef<YT.Player | null>(null);
  const loadedVideoId = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [playerState, setPlayerState] = useState<number>(YT_STATE.UNSTARTED);
  const [error, setError] = useState<PlayerError | null>(null);
  const [apiFailed, setApiFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const host = mountRef.current;
    if (!host) return;
    // YT iframe se element replace kar deta hai, isliye React ke div ke andar apna child banate hain.
    const el = document.createElement('div');
    host.appendChild(el);

    loadYouTubeApi()
      .then(() => {
        if (cancelled) return;
        playerRef.current = new YT.Player(el, {
          width: '100%',
          height: '100%',
          playerVars: { controls: 0, disablekb: 1, rel: 0, playsinline: 1, modestbranding: 1, fs: 0, origin: window.location.origin },
          events: {
            onReady: () => !cancelled && setReady(true),
            // Sirf UI state. Yahan se server ko emit NAHI hota.
            onStateChange: (e) => !cancelled && setPlayerState(e.data),
            onError: (e) => !cancelled && setError({ code: e.data, message: youtubeErrorMessage(e.data) }),
          },
        });
      })
      .catch(() => !cancelled && setApiFailed(true));

    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy();
      } catch {
        /* player pehle hi hata ho to ignore */
      }
      playerRef.current = null;
      loadedVideoId.current = null;
      setReady(false);
      el.remove();
    };
  }, [mountRef]);

  const snapshot = useCallback((): PlayerSnapshot => {
    const p = playerRef.current;
    return {
      loadedVideoId: loadedVideoId.current,
      currentTime: p?.getCurrentTime?.() ?? 0,
      playerState: p?.getPlayerState?.() ?? YT_STATE.UNSTARTED,
    };
  }, []);

  // planApply/planDrift ke actions player par chalao.
  const run = useCallback((actions: PlayerAction[]) => {
    const p = playerRef.current;
    if (!p) return;
    for (const a of actions) {
      switch (a.type) {
        case 'load':
          loadedVideoId.current = a.videoId;
          setError(null);
          p.loadVideoById({ videoId: a.videoId, startSeconds: a.start });
          break;
        case 'cue':
          loadedVideoId.current = a.videoId;
          setError(null);
          p.cueVideoById({ videoId: a.videoId, startSeconds: a.start });
          break;
        case 'seek':
          p.seekTo(a.to, true);
          break;
        case 'play':
          p.playVideo();
          break;
        case 'pause':
          p.pauseVideo();
          break;
      }
    }
  }, []);

  const handle: PlayerHandle = {
    snapshot,
    run,
    getCurrentTime: () => playerRef.current?.getCurrentTime?.() ?? 0,
    getDuration: () => playerRef.current?.getDuration?.() ?? 0,
    setVolume: (v) => playerRef.current?.setVolume?.(v),
  };
  return { ready, playerState, error, apiFailed, handle };
}
