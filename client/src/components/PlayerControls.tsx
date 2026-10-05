// PlayerControls: custom play/pause + seek slider (YouTube's native controls are disabled).
// Host/Mod: emit events (play/pause button, seek on slider release). Participant: controls disabled + request buttons.
// The local player is never touched directly: everyone (the host too) applies the server's sync_state through a single path.
import { useEffect, useState } from 'react';
import { actions } from '../lib/actions';
import { serverNow } from '../lib/serverClock';
import { formatTime, targetTime } from '../lib/syncMath';
import { selectCanControl, useRoomStore } from '../store/roomStore';
import type { PlayerHandle } from '../hooks/useYouTubePlayer';

interface Props {
  handle: PlayerHandle;
  activated: boolean; // the autoplay gate was clicked
  onFullscreen: () => void;
}

const DISABLED_TIP = 'Only host/moderator can control';

export default function PlayerControls({ handle, activated, onFullscreen }: Props) {
  const canControl = useRoomStore(selectCanControl);
  const playback = useRoomStore((s) => s.playback);
  const pendingSeek = useRoomStore((s) => s.myRequests.some((r) => r.type === 'seek'));
  const pendingToggle = useRoomStore((s) => s.myRequests.some((r) => r.type === 'play' || r.type === 'pause'));
  const [now, setNow] = useState(0); // slider time (seconds)
  const [duration, setDuration] = useState(0);
  const [dragging, setDragging] = useState<number | null>(null); // the user is dragging the slider
  const [picked, setPicked] = useState<number | null>(null); // time picked by a participant (used for a seek request)
  const [volume, setVolume] = useState(100);

  const playing = playback?.playState === 'playing';
  const hasVideo = !!playback?.videoId;

  // Slider time: from the local player once activated, otherwise estimated from the server state.
  useEffect(() => {
    const tick = () => {
      if (activated && hasVideo) {
        setNow(handle.getCurrentTime());
        setDuration(handle.getDuration());
      } else if (playback) {
        setNow(targetTime(playback, serverNow()));
      }
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
    // the handle is a new object on every render; its methods act on the player ref, so it is not a dependency
  }, [activated, hasVideo, playback]);

  // Host/Mod: only send the local player time once the player is really activated (otherwise the server uses its live time).
  const clientTime = () => (activated && hasVideo ? handle.getCurrentTime() : undefined);

  function togglePlay() {
    if (!canControl) return;
    if (playing) actions.pause(clientTime());
    else actions.play(clientTime());
  }

  const sliderMax = Math.max(duration, now, 1);
  const shown = dragging ?? picked ?? now;

  function commitSeek() {
    if (dragging === null) return;
    const t = dragging;
    setDragging(null);
    if (canControl) actions.seek(t);
    else setPicked(t); // a participant only picks a time and sends it with the request button
  }

  return (
    <div className="card space-y-3 p-3 sm:p-4">
      <div className="flex items-center gap-3">
        <button
          aria-label={playing ? 'Pause' : 'Play'}
          title={canControl ? undefined : DISABLED_TIP}
          disabled={!canControl || !hasVideo}
          onClick={togglePlay}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-lg text-white shadow-sm transition hover:shadow-glow disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
        >
          {playing ? '⏸' : '▶'}
        </button>

        <span className="w-12 shrink-0 text-right font-mono text-xs text-slate-600">{formatTime(shown)}</span>
        <input
          type="range"
          aria-label="Seek"
          title={canControl ? undefined : 'Choose a time, then request a seek'}
          min={0}
          max={sliderMax}
          step={1}
          value={Math.min(shown, sliderMax)}
          disabled={!hasVideo}
          onChange={(e) => setDragging(Number(e.target.value))}
          onPointerUp={commitSeek}
          onKeyUp={commitSeek}
          onTouchEnd={commitSeek}
          className="min-w-0 flex-1 accent-indigo-600 disabled:opacity-50"
        />
        <span className="w-12 shrink-0 font-mono text-xs text-slate-600">{formatTime(duration)}</span>

        <input
          type="range"
          aria-label="Volume"
          min={0}
          max={100}
          value={volume}
          onChange={(e) => {
            const v = Number(e.target.value);
            setVolume(v);
            handle.setVolume(v); // local-only, not part of the sync
          }}
          className="hidden w-20 accent-slate-600 sm:block"
        />
        <button aria-label="Fullscreen" onClick={onFullscreen} className="btn btn-ghost btn-sm shrink-0 text-base">
          ⛶
        </button>
      </div>

      {!canControl && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-sm">
          <span className="text-xs text-slate-500">Need a change? Ask the host/moderator:</span>
          <button
            disabled={!hasVideo || pendingToggle}
            onClick={() => actions.requestAction(playing ? { type: 'pause', payload: {} } : { type: 'play', payload: {} })}
            className="btn btn-sm bg-slate-100 text-slate-800 hover:bg-slate-200"
          >
            {pendingToggle ? 'Pending...' : playing ? 'Request pause' : 'Request play'}
          </button>
          <button
            disabled={!hasVideo || pendingSeek}
            onClick={() => {
              actions.requestAction({ type: 'seek', payload: { time: Math.floor(shown) } });
              setPicked(null);
            }}
            className="btn btn-sm bg-slate-100 text-slate-800 hover:bg-slate-200"
          >
            {pendingSeek ? 'Pending...' : `Request seek to ${formatTime(shown)}`}
          </button>
        </div>
      )}
    </div>
  );
}
