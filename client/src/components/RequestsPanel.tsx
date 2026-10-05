// RequestsPanel (Host/Mod): approval requests from participants: who, what, countdown, Approve/Reject.
// Role requests (become_moderator): only the Host can approve; a Moderator sees 'Host approval needed'.
import { useEffect, useState } from 'react';
import type { ActionRequestedPayload } from '@watchparty/shared';
import { actions } from '../lib/actions';
import { serverNow } from '../lib/serverClock';
import { formatTime } from '../lib/syncMath';
import { requestLabel, selectIsHost, useRoomStore } from '../store/roomStore';

function summary(r: ActionRequestedPayload): string {
  const p = (r.payload ?? {}) as { time?: number; videoId?: string };
  switch (r.type) {
    case 'seek':
      return `wants to seek to ${formatTime(p.time ?? 0)}`;
    case 'change_video':
      return `wants to play video ${p.videoId ?? ''}`;
    case 'play':
      return 'wants to play';
    case 'pause':
      return 'wants to pause';
    case 'become_moderator':
      return 'wants the Moderator role';
  }
}

export default function RequestsPanel() {
  const requests = useRoomStore((s) => s.requests);
  const isHost = useRoomStore(selectIsHost);
  const [, tick] = useState(0);

  // Refresh the countdown every second
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (requests.length === 0) {
    return <p data-testid="no-requests" className="card p-6 text-center text-sm text-slate-500">No pending requests.</p>;
  }

  return (
    <ul className="space-y-2" aria-label="Requests">
      {requests.map((r) => {
        const left = Math.max(0, Math.ceil((r.expiresAt - serverNow()) / 1000));
        const hostOnly = r.type === 'become_moderator' && !isHost;
        return (
          <li key={r.requestId} data-testid="request" className="card p-3.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-slate-800">
                <b>{r.username}</b> {summary(r)}
              </p>
              <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200" title={requestLabel(r.type)}>
                {left}s
              </span>
            </div>
            {hostOnly ? (
              <p className="mt-2 text-xs text-slate-500">Host approval needed</p>
            ) : (
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => actions.resolveRequest(r.requestId, true)}
                  className="btn btn-sm btn-success"
                >
                  Approve
                </button>
                <button
                  onClick={() => actions.resolveRequest(r.requestId, false)}
                  className="btn btn-sm bg-slate-100 text-slate-700 hover:bg-slate-200"
                >
                  Reject
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
