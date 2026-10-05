// Player: YouTube IFrame (controls:0) + autoplay gate + click-block overlay + sync (applyState, drift correction).
// Everything flows through one path: server sync_state -> planApply -> player. Player events are never emitted to the server.
import { useEffect, useRef, useState } from 'react';
import { EVENTS } from '@watchparty/shared';
import { serverNow } from '../lib/serverClock';
import { socket } from '../lib/socket';
import { DRIFT_INTERVAL_MS, planApply, planDrift, YT_STATE } from '../lib/syncMath';
import { useYouTubePlayer } from '../hooks/useYouTubePlayer';
import { useRoomStore } from '../store/roomStore';
import PlayerControls from './PlayerControls';
import { ReactionBar, ReactionOverlay } from './Reactions';
import VideoUrlInput from './VideoUrlInput';

export default function Player() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const { ready, playerState, error, apiFailed, handle } = useYouTubePlayer(mountRef);
  const playback = useRoomStore((s) => s.playback);
  const status = useRoomStore((s) => s.status);
  const clockSynced = useRoomStore((s) => s.clockSynced);
  const [activated, setActivated] = useState(false); // true once 'Click to join the party' was clicked

  // The handle is a new object on every render, so effects read it through a ref.
  const handleRef = useRef(handle);
  handleRef.current = handle;

  const videoId = playback?.videoId ?? null;
  const active = activated && ready && clockSynced && status === 'joined';

  // applyState: on every new sync_state (version change), or the first time after the gate, player and clock are ready.
  useEffect(() => {
    if (!active || !playback) return;
    const h = handleRef.current;
    h.run(planApply(h.snapshot(), playback, serverNow()));
  }, [active, playback]);

  // Drift correction: every 2 seconds, seek if the player is more than 1.5 seconds off the expected time.
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      const pb = useRoomStore.getState().playback;
      if (!pb) return;
      const h = handleRef.current;
      h.run(planDrift(h.snapshot(), pb, serverNow()));
    }, DRIFT_INTERVAL_MS);
    return () => clearInterval(t);
  }, [active]);

  // Ask for a fresh state when the tab becomes visible again (browsers throttle timers in background tabs).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && socket.connected && useRoomStore.getState().status === 'joined') {
        socket.emit(EVENTS.REQUEST_SYNC, {});
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // After a reconnect the join ack carries the new state, but also request a fresh sync to correct drift.
  const joinedOnce = useRef(false);
  useEffect(() => {
    if (status !== 'joined') return;
    if (joinedOnce.current) socket.emit(EVENTS.REQUEST_SYNC, {});
    joinedOnce.current = true;
  }, [status]);

  const ended = activated && playerState === YT_STATE.ENDED && !!videoId;
  const buffering = activated && playerState === YT_STATE.BUFFERING;

  function fullscreen() {
    const el = boxRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  }

  return (
    <div className="space-y-3">
      <div ref={boxRef} className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-soft ring-1 ring-slate-900/10">
        {/* The YouTube iframe is mounted here */}
        <div ref={mountRef} className="absolute inset-0 [&>*]:h-full [&>*]:w-full" />

        {/* Click-block: stops clicks on the iframe from pausing/seeking locally */}
        <div data-testid="click-block" className="absolute inset-0 z-10" />

        {!videoId && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-1 bg-slate-900 p-4 text-center text-slate-300">
            <p className="text-lg font-semibold">No video yet</p>
            <p className="text-sm text-slate-400">Paste a YouTube link below to choose a video.</p>
          </div>
        )}

        {apiFailed && (
          <div role="alert" className="absolute inset-0 z-30 flex items-center justify-center bg-slate-900 p-4 text-center text-red-300">
            Could not load the YouTube player. Check your internet connection and refresh the page.
          </div>
        )}

        {error && videoId && !apiFailed && (
          <div role="alert" data-testid="player-error" className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-1 bg-slate-900/95 p-4 text-center text-white">
            <p className="font-semibold">This video cannot be played</p>
            <p className="text-sm text-slate-300">{error.message}</p>
          </div>
        )}

        {ended && !error && (
          <div data-testid="video-ended" className="absolute inset-x-0 bottom-0 z-20 bg-black/70 p-2 text-center text-sm text-white">
            Video ended
          </div>
        )}
        {buffering && !error && <div className="absolute right-2 top-2 z-20 rounded bg-black/60 px-2 py-0.5 text-xs text-white">Buffering...</div>}

        {/* Autoplay gate: browsers do not allow audio without a user click */}
        {!activated && videoId && (
          <button
            data-testid="join-party"
            onClick={() => setActivated(true)}
            className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 bg-slate-900/90 text-white hover:bg-slate-900/80"
          >
            <span aria-hidden className="flex h-16 w-16 items-center justify-center rounded-full bg-white/15 text-3xl ring-1 ring-white/30">▶</span>
            <span className="text-lg font-semibold">Click to join the party</span>
            <span className="text-sm text-slate-300">Your browser needs one click before it can play synced audio</span>
          </button>
        )}
        <ReactionOverlay />
      </div>

      <ReactionBar />
      <PlayerControls handle={handle} activated={activated} onFullscreen={fullscreen} />
      <VideoUrlInput />
    </div>
  );
}
