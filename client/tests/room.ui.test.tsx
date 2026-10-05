// @vitest-environment jsdom
// UI integration test (jsdom + ASLI server process): Home create/join, link join, role updates, removed screen.
// Server globalSetup se (tests/globalSetup.ts) asli process mein chalta hai, UI App.tsx real socket.io se jud'ta hai.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { io as connect, type Socket } from 'socket.io-client';
import App from '../src/App';
import { api } from '../src/lib/api';
import { installFakeYT } from './fakeYT';

const URL_ = 'http://127.0.0.1:4517';
const raw: Socket[] = [];

beforeAll(() => {
  installFakeYT();
});
afterEach(() => {
  cleanup();
  installFakeYT();
  for (const s of raw.splice(0)) s.close();
  localStorage.clear();
});

// Raw client (host ya doosra banda) room mein join karke
async function rawJoin(token: string, roomId: string, username: string): Promise<Socket> {
  const s = connect(URL_, { transports: ['websocket'], auth: { token }, reconnection: false });
  raw.push(s);
  await new Promise<void>((res, rej) => {
    s.on('connect', () => res());
    s.on('connect_error', rej);
  });
  const ack = await new Promise<{ ok: boolean }>((res) => s.emit('join_room', { roomId, username }, res));
  if (!ack.ok) throw new Error('raw join failed');
  return s;
}
const emitAck = (s: Socket, ev: string, p: unknown) => new Promise<{ ok: boolean }>((res) => s.emit(ev, p, res));
const open = (url: string) => {
  window.history.pushState({}, '', url);
  return render(<App />);
};

describe('Home page', () => {
  it('Create room -> /room/CODE par Host; refresh (remount) par same role', async () => {
    open('/');
    fireEvent.change(screen.getByPlaceholderText('e.g. Alex'), { target: { value: 'Creator' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create room' }));

    const role = await screen.findByTestId('my-role');
    await waitFor(() => expect(role.textContent).toBe('Host'));
    const code = screen.getByTestId('room-code').textContent!;
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect(window.location.pathname).toBe(`/room/${code}`);
    await waitFor(() => expect(screen.getByTestId('connection-badge').textContent).toContain('Connected'));
    expect(within(screen.getAllByTestId('participant')[0]).getByText('You')).toBeTruthy();

    // Refresh: component unmount + dobara render, session localStorage se
    cleanup();
    open(`/room/${code}`);
    await waitFor(() => expect(screen.getByTestId('my-role').textContent).toBe('Host'));
    expect(screen.getAllByTestId('participant')).toHaveLength(1); // duplicate nahi
  });

  it('Join with code: room mila to Participant; galat code par error', async () => {
    const host = await api.createRoom('Creator');
    await rawJoin(host.token, host.roomId, 'Creator');

    open('/');
    fireEvent.change(screen.getByPlaceholderText('e.g. Alex'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByLabelText('Room code'), { target: { value: 'zzzzzz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Room not found');

    fireEvent.change(screen.getByLabelText('Room code'), { target: { value: host.roomId.toLowerCase() } });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    await waitFor(() => expect(screen.getByTestId('my-role').textContent).toBe('Participant'));
    expect(screen.getAllByTestId('participant').map((e) => e.textContent)).toEqual([
      expect.stringContaining('Creator'),
      expect.stringContaining('Alice'),
    ]);
  });
});

describe('Room page: link join + live updates', () => {
  it('link -> username modal -> Participant; roles/playback/joins/remove live update', async () => {
    const host = await api.createRoom('Creator');
    const sHost = await rawJoin(host.token, host.roomId, 'Creator');

    open(`/room/${host.roomId}`);
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByPlaceholderText(/Your name/), { target: { value: 'Alice' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Join party' }));

    await waitFor(() => expect(screen.getByTestId('my-role').textContent).toBe('Participant'));
    expect(screen.getByRole('button', { name: 'Play' }).hasAttribute('disabled')).toBe(true); // participant: controls disabled
    const aliceId = JSON.parse(localStorage.getItem(`wp_session_${host.roomId}`)!).userId as string;

    // Naya banda join -> participants live + toast
    const g = await api.guest(host.roomId, 'Bob');
    await rawJoin(g.token, host.roomId, 'Bob');
    await waitFor(() => expect(screen.getAllByTestId('participant')).toHaveLength(3));
    expect(screen.getByText('Bob joined')).toBeTruthy();

    // Host Moderator banata hai -> role badge + toast + controls text
    expect((await emitAck(sHost, 'assign_role', { userId: aliceId, role: 'moderator' })).ok).toBe(true);
    await waitFor(() => expect(screen.getByTestId('my-role').textContent).toBe('Moderator'));
    expect(screen.getByText('You are now Moderator')).toBeTruthy();


    // Playback state server se
    await emitAck(sHost, 'change_video', { videoId: 'dQw4w9WgXcQ' });
    await waitFor(() => expect(screen.getByTestId('join-party')).toBeTruthy()); // video aaya: autoplay gate dikha

    // Host transfer
    expect((await emitAck(sHost, 'transfer_host', { userId: aliceId })).ok).toBe(true);
    await waitFor(() => expect(screen.getByTestId('my-role').textContent).toBe('Host'));

    // Transfer ke baad purana host Moderator dikhta hai, list mein teeno hain.
    expect(screen.getAllByTestId('participant').map((e) => e.textContent)).toEqual([
      expect.stringMatching(/Creator.*Moderator/),
      expect.stringMatching(/Alice.*You.*Host/),
      expect.stringMatching(/Bob.*Participant/),
    ]);
  });

  it('Host hataye to "You were removed" full screen; wahi user dobara join kare to BANNED screen', async () => {
    const host = await api.createRoom('Creator');
    const sHost = await rawJoin(host.token, host.roomId, 'Creator');
    open(`/room/${host.roomId}`);
    fireEvent.change(await screen.findByPlaceholderText(/Your name/), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join party' }));
    await waitFor(() => expect(screen.getByTestId('my-role').textContent).toBe('Participant'));
    const session = JSON.parse(localStorage.getItem(`wp_session_${host.roomId}`)!) as { userId: string; token: string };

    await emitAck(sHost, 'remove_participant', { userId: session.userId });
    expect((await screen.findByText('You were removed')).tagName).toBe('H1');
    expect(localStorage.getItem(`wp_session_${host.roomId}`)).toBeNull();

    // Purane token se dobara try (session wapas rakh ke): BANNED
    cleanup();
    localStorage.setItem(`wp_session_${host.roomId}`, JSON.stringify({ ...session, username: 'Alice' }));
    open(`/room/${host.roomId}`);
    expect((await screen.findByText("You can't join this room")).tagName).toBe('H1');
  });

  it('Room not found: galat code / invalid code', async () => {
    open('/room/ZZZZZZ');
    expect((await screen.findByText('Room not found')).tagName).toBe('H1');
    cleanup();
    open('/room/abc');
    expect((await screen.findByText('Room not found')).tagName).toBe('H1');
  });

  it('dusre tab (replaced): "Opened in another tab" + Use here', async () => {
    const host = await api.createRoom('Creator');
    await rawJoin(host.token, host.roomId, 'Creator');
    open(`/room/${host.roomId}`);
    fireEvent.change(await screen.findByPlaceholderText(/Your name/), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join party' }));
    await waitFor(() => expect(screen.getByTestId('my-role').textContent).toBe('Participant'));
    const s = JSON.parse(localStorage.getItem(`wp_session_${host.roomId}`)!) as { token: string };

    await rawJoin(s.token, host.roomId, 'Alice'); // same user ka doosra socket
    expect((await screen.findByText('Opened in another tab')).tagName).toBe('H1');
  });
});
