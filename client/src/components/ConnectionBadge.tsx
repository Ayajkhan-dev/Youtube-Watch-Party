// Connection status badge: connected / reconnecting / disconnected.
import { useRoomStore, type ConnectionState } from '../store/roomStore';

const STYLE: Record<ConnectionState, { dot: string; text: string; label: string }> = {
  connected: { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Connected' },
  connecting: { dot: 'bg-amber-400 animate-pulse', text: 'text-amber-700', label: 'Connecting...' },
  reconnecting: { dot: 'bg-amber-400 animate-pulse', text: 'text-amber-700', label: 'Reconnecting...' },
  disconnected: { dot: 'bg-red-500', text: 'text-red-700', label: 'Disconnected' },
};

export default function ConnectionBadge() {
  const connection = useRoomStore((s) => s.connection);
  const s = STYLE[connection];
  return (
    <span data-testid="connection-badge" className={`inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold shadow-sm ring-1 ring-slate-200 ${s.text}`}>
      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}
