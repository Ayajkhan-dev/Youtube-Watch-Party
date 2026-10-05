// Reactions: emoji bar (whitelist) + float-up animation over the player (2 seconds). Two separate exports:
// ReactionBar (the buttons that send reactions) and ReactionOverlay (the layer that shows everyone's reactions).
import { useEffect } from 'react';
import { REACTION_KEYS, REACTIONS } from '@watchparty/shared';
import { actions } from '../lib/actions';
import { useRoomStore, type FloatingReaction } from '../store/roomStore';

export function ReactionBar() {
  return (
    <div role="group" aria-label="Reactions" className="flex flex-wrap items-center gap-1.5">
      {REACTION_KEYS.map((k) => (
        <button
          key={k}
          aria-label={`React ${k}`}
          onClick={() => actions.reaction(k)}
          className="rounded-full bg-white px-3.5 py-1.5 text-lg shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:scale-110 hover:bg-slate-50 active:scale-95"
        >
          {REACTIONS[k]}
        </button>
      ))}
    </div>
  );
}

function Floating({ r }: { r: FloatingReaction }) {
  const remove = useRoomStore((s) => s.removeReaction);
  useEffect(() => {
    const t = setTimeout(() => remove(r.id), 2000);
    return () => clearTimeout(t);
  }, [r.id, remove]);
  return (
    <span data-testid="floating-reaction" title={r.username} className="wp-float-up absolute bottom-4 text-4xl drop-shadow" style={{ left: `${r.left}%` }}>
      {r.emoji}
    </span>
  );
}

// Absolute layer inside the player; it does not block clicks (pointer-events-none).
export function ReactionOverlay() {
  const reactions = useRoomStore((s) => s.reactions);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[45] overflow-hidden">
      {reactions.map((r) => (
        <Floating key={r.id} r={r} />
      ))}
    </div>
  );
}
