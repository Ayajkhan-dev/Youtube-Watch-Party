// RoleRequestButton: Participant/Viewer sends 'Request moderator role' (only the Host can approve). Disabled while pending.
import { actions } from '../lib/actions';
import { selectCanControl, useRoomStore } from '../store/roomStore';

export default function RoleRequestButton() {
  const canControl = useRoomStore(selectCanControl);
  const pending = useRoomStore((s) => s.myRequests.some((r) => r.type === 'become_moderator'));
  if (canControl) return null;
  return (
    <button
      disabled={pending}
      onClick={() => actions.requestAction({ type: 'become_moderator', payload: {} })}
      className="btn w-full bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-200 hover:bg-indigo-50"
    >
      {pending ? 'Pending...' : 'Request moderator role'}
    </button>
  );
}
