// Participants list: avatar + name + role badge + 'You' + host crown + online dot.
// For every other participant the Host gets: a role dropdown (assign_role), Remove (confirm) and Make host (confirm).
// These controls are UX only; the server re-checks Host permission on every event.
import { useState } from 'react';
import type { ParticipantDTO, Role } from '@watchparty/shared';
import { actions } from '../lib/actions';
import { roleLabel, selectIsHost, useRoomStore } from '../store/roomStore';
import ConfirmDialog from './ConfirmDialog';

export const ROLE_BADGE: Record<Role, string> = {
  host: 'bg-amber-100 text-amber-800 ring-amber-300',
  moderator: 'bg-indigo-100 text-indigo-800 ring-indigo-300',
  participant: 'bg-slate-100 text-slate-700 ring-slate-300',
  viewer: 'bg-teal-100 text-teal-800 ring-teal-300',
};

const ASSIGNABLE: Exclude<Role, 'host'>[] = ['moderator', 'participant', 'viewer'];
type Pending = { kind: 'remove' | 'transfer'; user: ParticipantDTO } | null;

export default function ParticipantList() {
  const participants = useRoomStore((s) => s.participants);
  const meId = useRoomStore((s) => s.me?.userId);
  const isHost = useRoomStore(selectIsHost);
  const [pending, setPending] = useState<Pending>(null);

  function confirm() {
    if (!pending) return;
    if (pending.kind === 'remove') actions.removeParticipant(pending.user.userId);
    else actions.transferHost(pending.user.userId);
    setPending(null);
  }

  return (
    <section aria-label="Participants">
      <h2 className="mb-2 px-1 text-sm font-semibold text-slate-600">Participants ({participants.length})</h2>
      <ul className="space-y-1.5">
        {participants.map((p) => {
          const showControls = isHost && p.userId !== meId && p.role !== 'host';
          return (
            <li key={p.userId} data-testid="participant" className="rounded-xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-200/80">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-bold uppercase text-white">
                    {p.username.charAt(0)}
                    <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${p.connected ? 'bg-emerald-500' : 'bg-slate-300'}`} title={p.connected ? 'online' : 'reconnecting'} />
                  </span>
                  {p.role === 'host' && <span title="Host" aria-label="Host crown">👑</span>}
                  <span className="truncate text-sm font-medium text-slate-800">{p.username}</span>
                  {p.userId === meId && <span className="rounded bg-slate-800 px-1.5 text-[10px] font-semibold uppercase text-white">You</span>}
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${ROLE_BADGE[p.role]}`}>{roleLabel(p.role)}</span>
              </div>

              {showControls && (
                <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
                  <select
                    aria-label={`Role for ${p.username}`}
                    value={p.role}
                    onChange={(e) => actions.assignRole(p.userId, e.target.value as Exclude<Role, 'host'>)}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  >
                    {ASSIGNABLE.map((r) => (
                      <option key={r} value={r}>
                        {roleLabel(r)}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={!p.connected}
                    title={p.connected ? undefined : 'User is offline'}
                    onClick={() => setPending({ kind: 'transfer', user: p })}
                    className="btn btn-sm bg-amber-50 text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100"
                  >
                    Make host
                  </button>
                  <button
                    onClick={() => setPending({ kind: 'remove', user: p })}
                    className="btn btn-sm btn-danger"
                  >
                    Remove
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {pending && (
        <ConfirmDialog
          title={pending.kind === 'remove' ? `Remove ${pending.user.username}?` : `Make ${pending.user.username} the host?`}
          text={
            pending.kind === 'remove'
              ? 'This user will be removed from the room and will not be able to rejoin.'
              : 'They will receive all Host privileges and you will become a Moderator.'
          }
          confirmLabel={pending.kind === 'remove' ? 'Remove' : 'Make host'}
          danger={pending.kind === 'remove'}
          onConfirm={confirm}
          onCancel={() => setPending(null)}
        />
      )}
    </section>
  );
}
