// Toasts: 'X joined', 'Y is now Moderator', errors. Each toast dismisses itself after 4 seconds.
import { useEffect } from 'react';
import { useRoomStore, type Toast } from '../store/roomStore';

const COLORS: Record<Toast['kind'], string> = {
  info: 'bg-slate-800 text-white',
  success: 'bg-emerald-600 text-white',
  error: 'bg-red-600 text-white',
};

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useRoomStore((s) => s.dismissToast);
  useEffect(() => {
    const t = setTimeout(() => dismiss(toast.id), 4000);
    return () => clearTimeout(t);
  }, [toast.id, dismiss]);
  return (
    <div role="status" className={`pointer-events-auto rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ${COLORS[toast.kind]}`}>
      {toast.text}
    </div>
  );
}

export default function Toasts() {
  const toasts = useRoomStore((s) => s.toasts);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
