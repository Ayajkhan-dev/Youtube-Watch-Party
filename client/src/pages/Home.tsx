// Home (landing page): hero + create/join card, features and how-it-works sections.
// The create/join flow saves the session in localStorage, then navigates to /room/CODE.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, normalizeRoomCode, ROOM_CODE_REGEX } from '../lib/api';
import { lastUsername, loadSession, saveSession } from '../lib/session';
import { loadAccountSession } from '../lib/accountSession';
import Footer from '../components/Footer';
import NavBar from '../components/NavBar';

export default function Home() {
  const navigate = useNavigate();
  const account = loadAccountSession();
  const [username, setUsername] = useState(account?.username ?? lastUsername());
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState('');

  const nameOk = username.trim().length >= 1 && username.trim().length <= 24;
  const codeOk = ROOM_CODE_REGEX.test(normalizeRoomCode(code));

  async function createRoom() {
    if (!nameOk || busy) return;
    setBusy('create');
    setError('');
    try {
      const r = await api.createRoom(username.trim(), account?.token);
      saveSession(r.roomId, { userId: r.userId, token: r.token, username: username.trim() });
      navigate(`/room/${r.roomId}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'AUTH_REQUIRED') {
        navigate('/login?redirect=/');
        return;
      }
      setError(e instanceof Error ? e.message : 'Could not create the room');
      setBusy(null);
    }
  }

  async function joinRoom() {
    if (!nameOk || !codeOk || busy) return;
    const roomId = normalizeRoomCode(code);
    setBusy('join');
    setError('');
    try {
      // Pehle se session hai (wahi browser) to wahi identity: role bacha rehta hai.
      if (!loadSession(roomId)) {
        await api.roomExists(roomId);
        if (account) {
          saveSession(roomId, { userId: account.userId, token: account.token, username: account.username });
        } else {
          const g = await api.guest(roomId, username.trim());
          saveSession(roomId, { userId: g.userId, token: g.token, username: username.trim() });
        }
      }
      navigate(`/room/${roomId}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'AUTH_REQUIRED') {
        navigate(`/login?redirect=/room/${roomId}`);
        return;
      }
      setError(e instanceof ApiError && e.isNotFound ? 'Room not found. Please check the code.' : e instanceof Error ? e.message : 'Could not join the room');
      setBusy(null);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <NavBar />
      <main className="flex-1">
        {/* ---------- Hero ---------- */}
        <section className="relative overflow-hidden bg-gradient-to-b from-indigo-50 via-white to-slate-50">
          <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-indigo-200/50 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -right-24 top-24 h-96 w-96 rounded-full bg-fuchsia-200/40 blur-3xl" />

          <div className="container-page relative grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:py-24">
            <div className="text-center lg:text-left">
              <span className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-indigo-700 shadow-sm ring-1 ring-indigo-100">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Real-time synchronized viewing
              </span>
              <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                Watch YouTube together, <span className="gradient-text">perfectly in sync.</span>
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-slate-600 lg:mx-0">
                Create a room, share the code, and everyone sees the same play, pause, seek and video change at the same moment. Hosts stay in control with role-based permissions.
              </p>
              <ul className="mx-auto mt-6 flex max-w-xl flex-col gap-2.5 text-left text-sm font-medium text-slate-700 sm:flex-row sm:flex-wrap sm:gap-x-6 lg:mx-0">
                {['No installation needed', 'Share a link or a 6-character code', 'Live chat and reactions'].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-emerald-500" fill="currentColor">
                      <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
                    </svg>
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            {/* ---------- Create / join card ---------- */}
            <div id="start" className="card scroll-mt-24 space-y-5 p-6 sm:p-8">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Start watching</h2>
                <p className="mt-1 text-sm text-slate-500">Pick a name, then create a new room or join an existing one.</p>
              </div>

              <label className="block text-sm font-medium text-slate-700">
                Your name
                <input
                  value={username}
                  maxLength={24}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. Alex"
                  className="input mt-1.5"
                />
              </label>

              <button disabled={!nameOk || busy !== null} onClick={() => void createRoom()} className="btn btn-primary btn-lg w-full">
                {busy === 'create' ? 'Creating...' : 'Create room'}
              </button>

              <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <span className="h-px flex-1 bg-slate-200" />
                or join
                <span className="h-px flex-1 bg-slate-200" />
              </div>

              <div className="flex gap-2">
                <input
                  value={code}
                  maxLength={6}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && void joinRoom()}
                  placeholder="ROOM CODE"
                  aria-label="Room code"
                  className="input font-mono uppercase tracking-widest"
                />
                <button disabled={!nameOk || !codeOk || busy !== null} onClick={() => void joinRoom()} className="btn btn-dark shrink-0 px-6">
                  {busy === 'join' ? '...' : 'Join'}
                </button>
              </div>

              {error && (
                <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
                  {error}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ---------- Features ---------- */}
        <section id="features" className="scroll-mt-16 bg-white py-16 sm:py-24">
          <div className="container-page">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">Features</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Everything you need for movie night</h2>
              <p className="mt-4 text-slate-600">A complete watch party toolkit: synchronized playback, fine-grained control and a social layer on top.</p>
            </div>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <article key={f.title} className="group rounded-2xl bg-slate-50 p-6 ring-1 ring-slate-200/70 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-soft">
                  <span aria-hidden className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 text-xl">{f.icon}</span>
                  <h3 className="mt-4 text-base font-bold text-slate-900">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{f.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- How it works ---------- */}
        <section id="how-it-works" className="scroll-mt-16 bg-slate-50 py-16 sm:py-24">
          <div className="container-page">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">How it works</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Up and running in three steps</h2>
            </div>
            <ol className="mt-12 grid gap-5 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="card p-6">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-sm font-bold text-white">{i + 1}</span>
                  <h3 className="mt-4 text-base font-bold text-slate-900">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{s.text}</p>
                </li>
              ))}
            </ol>
            <div className="mt-12 text-center">
              <a href="#start" className="btn btn-primary btn-lg">
                Create your room
              </a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

const FEATURES = [
  { icon: '⚡', title: 'Real-time synchronization', text: 'Play, pause, seek and video changes reach every participant instantly over WebSockets, with automatic drift correction.' },
  { icon: '🔗', title: 'Rooms with share links', text: 'Every room has a unique code and a shareable link. Friends join in one click, no account required.' },
  { icon: '🛡️', title: 'Role-based access', text: 'Host, Moderator, Participant and Viewer roles. Only Host and Moderators can control playback; the server enforces it.' },
  { icon: '✅', title: 'Approval requests', text: 'Participants can request a play, pause, seek, video change or moderator role. Hosts and moderators approve or reject.' },
  { icon: '💬', title: 'Chat and reactions', text: 'Talk during the video and send floating emoji reactions that everyone in the room sees.' },
  { icon: '🔄', title: 'Resilient connections', text: 'Dropped connections rejoin automatically with their role intact, and the host role is handed over if the host leaves.' },
];

const STEPS = [
  { title: 'Create a room', text: 'Enter your name and create a room. You become the Host with full control.' },
  { title: 'Invite your friends', text: 'Share the room link or the 6-character code. Friends join as Participants.' },
  { title: 'Watch together', text: 'Paste a YouTube link and press play. Everyone stays in sync, whatever device they use.' },
];
