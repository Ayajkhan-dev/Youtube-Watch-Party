// JoinGate: shown when someone opens a room link without a session. Asks for a username, then joins with a guest token.
import { useState } from 'react';
import { LogoMark } from './Logo';

interface Props {
  roomId: string;
  onSubmit: (username: string) => Promise<void>;
  initialName?: string;
}

export default function JoinGate({ roomId, onSubmit, initialName = '' }: Props) {
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    const username = name.trim();
    if (!username || busy) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit(username);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join the room');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-label="Enter your name" className="card w-full max-w-sm p-6 shadow-xl">
        <LogoMark className="h-11 w-11" />
        <h2 className="mt-4 text-xl font-bold text-slate-900">Join room {roomId}</h2>
        <p className="mt-1 text-sm text-slate-500">Enter your name to join the party.</p>
        <input
          autoFocus
          maxLength={24}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
          placeholder="Your name (1-24 chars)"
          className="input mt-4"
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button disabled={!name.trim() || busy} onClick={() => void submit()} className="btn btn-primary btn-lg mt-4 w-full">
          {busy ? 'Joining...' : 'Join party'}
        </button>
      </div>
    </div>
  );
}
