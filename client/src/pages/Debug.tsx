// Debug page (/debug): Phase 1-2 ka ping/pong demo, ab sirf connection check ke liye.
// Phase 2 demo: room banao -> token milta hai -> token ke saath socket connect -> ping.
// Asli Home/Room pages Phase 8 mein banenge.
import { useEffect, useState } from 'react';
import { EVENTS } from '@watchparty/shared';
import type { RoomAuthResponse } from '@watchparty/shared';
import { SERVER_URL, setAuthToken, socket } from '../lib/socket';

export default function Debug() {
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onConnectError = (e: Error) => setError(`connect error: ${e.message}`);
    const onPong = (p: { sentAt: number; serverTime: number }) =>
      setLog((l) => [`pong received, round trip ${Date.now() - p.sentAt} ms`, ...l].slice(0, 8));

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on(EVENTS.PONG_TEST, onPong);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off(EVENTS.PONG_TEST, onPong);
      socket.disconnect();
    };
  }, []);

  async function createRoom() {
    setError('');
    const res = await fetch(`${SERVER_URL}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.message ?? 'Failed');
    const { roomId, token } = data as RoomAuthResponse;
    setRoomId(roomId);
    setAuthToken(token);
    socket.disconnect();
    socket.connect();
  }

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-bold">Watch Party</h1>
      <input
        className="mt-4 w-full rounded border p-2"
        placeholder="Your name"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <button
        className="mt-2 rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        disabled={!username.trim()}
        onClick={createRoom}
      >
        Create room
      </button>
      {roomId && <p className="mt-3">Room code: <b>{roomId}</b></p>}
      <p className="mt-2">
        Status:{' '}
        <span className={connected ? 'font-semibold text-green-600' : 'font-semibold text-red-600'}>
          {connected ? 'socket connected' : 'disconnected'}
        </span>
      </p>
      {error && <p className="mt-2 text-red-600">{error}</p>}
      <button
        className="mt-3 rounded bg-gray-800 px-4 py-2 text-white disabled:opacity-50"
        disabled={!connected}
        onClick={() => socket.emit(EVENTS.PING_TEST, { sentAt: Date.now() })}
      >
        Send ping
      </button>
      <ul className="mt-3 space-y-1 text-sm text-gray-700">
        {log.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </main>
  );
}
