// RoomPage (/room/:roomId): join directly from a shared link. No session -> username modal; unknown room -> 'Room not found'.
// Player (Phase 9) + participants/requests/chat tabs (Phase 10-11): on mobile the player is on top and the tabs sit below.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Chat from '../components/Chat';
import ConnectionBadge from '../components/ConnectionBadge';
import JoinGate from '../components/JoinGate';
import ParticipantList, { ROLE_BADGE } from '../components/ParticipantList';
import Player from '../components/Player';
import RequestsPanel from '../components/RequestsPanel';
import RoleRequestButton from '../components/RoleRequestButton';
import Toasts from '../components/Toasts';
import { useRoomSocket } from '../hooks/useRoomSocket';
import { useServerClock } from '../hooks/useServerClock';
import { api, ApiError, normalizeRoomCode, ROOM_CODE_REGEX } from '../lib/api';
import { clearSession, lastUsername, loadSession, saveSession, type Session } from '../lib/session';
import { loadAccountSession } from '../lib/accountSession';
import { LogoMark } from '../components/Logo';
import { roleLabel, selectCanControl, useRoomStore } from '../store/roomStore';

function FullScreen({ title, text, children }: { title: string; text?: string; children?: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-indigo-50 via-white to-slate-50 p-6">
      <div className="card flex w-full max-w-md flex-col items-center gap-3 p-8 text-center">
        <LogoMark className="h-12 w-12" />
        <h1 className="mt-2 text-2xl font-bold text-slate-900">{title}</h1>
        {text && <p className="text-slate-600">{text}</p>}
        <div className="mt-3 flex flex-wrap justify-center gap-2">{children}</div>
      </div>
    </main>
  );
}
const HomeLink = () => (
  <Link to="/" className="btn btn-primary">
    Go home
  </Link>
);

export default function RoomPage() {
  const params = useParams();
  const roomId = normalizeRoomCode(params.roomId ?? '');
  if (!ROOM_CODE_REGEX.test(roomId)) {
    return (
      <FullScreen title="Room not found" text="This room code is not valid.">
        <HomeLink />
      </FullScreen>
    );
  }
  // key={roomId}: a different room always starts with fresh state.
  return <RoomView key={roomId} roomId={roomId} />;
}

function RoomView({ roomId }: { roomId: string }) {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(() => loadSession(roomId));
  const [gate, setGate] = useState<'checking' | 'notfound' | 'ask' | 'error'>(session ? 'ask' : 'checking');
  const [gateError, setGateError] = useState('');

  // No session: after the room-exists check, reuse the account identity if logged in, otherwise show the guest modal.
  useEffect(() => {
    if (session) return;
    let cancelled = false;
    api
      .roomExists(roomId)
      .then(() => {
        if (cancelled) return;
        const account = loadAccountSession();
        if (account) {
          const s: Session = { userId: account.userId, token: account.token, username: account.username };
          saveSession(roomId, s);
          setSession(s);
        } else {
          setGate('ask');
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.isNotFound) setGate('notfound');
        else {
          setGateError(e instanceof Error ? e.message : 'Server error');
          setGate('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, session]);

  const { reconnect, leave } = useRoomSocket(roomId, session);
  useServerClock();
  const [tab, setTab] = useState<'people' | 'requests' | 'chat'>('people');
  const status = useRoomStore((s) => s.status);
  const fatal = useRoomStore((s) => s.fatalError);
  const role = useRoomStore((s) => s.role);
  const canControl = useRoomStore(selectCanControl);
  const requestCount = useRoomStore((s) => s.requests.length);
  const unreadChat = useRoomStore((s) => s.unreadChat);
  const addToast = useRoomStore((s) => s.addToast);

  async function joinAsGuest(username: string) {
    try {
      const g = await api.guest(roomId, username);
      const s: Session = { userId: g.userId, token: g.token, username };
      saveSession(roomId, s);
      setSession(s);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'AUTH_REQUIRED') {
        navigate(`/login?redirect=/room/${roomId}`);
        return;
      }
      throw e;
    }
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      addToast('success', `${label} copied`);
    } catch {
      addToast('error', 'Could not copy. Please copy it manually.');
    }
  }

  function leaveRoom() {
    leave();
    clearSession(roomId);
    navigate('/');
  }

  // ---- pre-join screens ----
  if (!session) {
    if (gate === 'checking') return <FullScreen title="Loading room..." />;
    if (gate === 'notfound') {
      return (
        <FullScreen title="Room not found" text="This room does not exist or has been closed.">
          <HomeLink />
        </FullScreen>
      );
    }
    if (gate === 'error') {
      return (
        <FullScreen title="Something went wrong" text={gateError}>
          <button onClick={() => navigate(0)} className="btn btn-primary">
            Retry
          </button>
        </FullScreen>
      );
    }
    return <JoinGate roomId={roomId} initialName={lastUsername()} onSubmit={joinAsGuest} />;
  }

  // ---- full-screen end states ----
  if (status === 'removed') {
    return (
      <FullScreen title="You were removed" text={fatal?.message ?? 'The host removed you from the room.'}>
        <HomeLink />
      </FullScreen>
    );
  }
  if (status === 'replaced') {
    return (
      <FullScreen title="Opened in another tab" text="You have opened this room in another tab or device.">
        <button onClick={reconnect} className="btn btn-primary">
          Use here
        </button>
        <HomeLink />
      </FullScreen>
    );
  }
  if (status === 'error') {
    const code = fatal?.code;
    const title = code === 'ROOM_NOT_FOUND' ? 'Room not found' : code === 'BANNED' ? "You can't join this room" : code === 'ROOM_FULL' ? 'Room is full' : code === 'UNAUTHENTICATED' ? 'Session expired' : 'Could not join room';
    return (
      <FullScreen title={title} text={fatal?.message}>
        {code === 'UNAUTHENTICATED' && (
          <button onClick={() => setSession(null)} className="btn btn-dark">
            Rejoin
          </button>
        )}
        <HomeLink />
      </FullScreen>
    );
  }

  // ---- room ----
  const tabClass = (active: boolean) =>
    `flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/" aria-label="Watch Party home" className="shrink-0">
              <LogoMark className="h-9 w-9" />
            </Link>
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-sm text-slate-500">Room</span>
              <span data-testid="room-code" className="rounded-lg bg-slate-900 px-2.5 py-1 font-mono text-sm font-semibold tracking-widest text-white">{roomId}</span>
              {role && <span data-testid="my-role" className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${ROLE_BADGE[role]}`}>{roleLabel(role)}</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ConnectionBadge />
            <button onClick={() => void copy(`${window.location.origin}/room/${roomId}`, 'Link')} className="btn btn-secondary btn-sm">
              Copy link
            </button>
            <button onClick={() => void copy(roomId, 'Code')} className="btn btn-secondary btn-sm">
              Copy code
            </button>
            <button onClick={leaveRoom} className="btn btn-danger btn-sm">
              Leave
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 p-3 sm:p-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0">
          {status === 'joined' ? (
            <Player />
          ) : (
            <section className="flex aspect-video items-center justify-center rounded-2xl bg-slate-900 text-slate-200 shadow-soft">
              <p className="animate-pulse">Joining room...</p>
            </section>
          )}
        </div>

        <aside className="min-w-0 space-y-3">
          <RoleRequestButton />
          <div role="tablist" className="flex gap-1 rounded-xl bg-slate-200/70 p-1">
            <button role="tab" aria-selected={tab === 'people'} onClick={() => setTab('people')} className={tabClass(tab === 'people')}>
              Participants
            </button>
            <button role="tab" aria-selected={tab === 'chat'} onClick={() => setTab('chat')} className={tabClass(tab === 'chat')}>
              Chat
              {unreadChat > 0 && tab !== 'chat' && (
                <span data-testid="chat-unread" className="rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">
                  {unreadChat}
                </span>
              )}
            </button>
            {canControl && (
              <button role="tab" aria-selected={tab === 'requests'} onClick={() => setTab('requests')} className={tabClass(tab === 'requests')}>
                Requests
                {requestCount > 0 && (
                  <span data-testid="request-count" className="rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">
                    {requestCount}
                  </span>
                )}
              </button>
            )}
          </div>
          {tab === 'chat' ? <Chat /> : tab === 'requests' && canControl ? <RequestsPanel /> : <ParticipantList />}
        </aside>
      </div>
      <Toasts />
    </div>
  );
}
