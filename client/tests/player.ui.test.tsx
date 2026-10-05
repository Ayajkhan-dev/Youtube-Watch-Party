// @vitest-environment jsdom
// Phase 9-10 UI integration (jsdom + asli server + fake YT): sync, gate, controls enable/disable, requests, host controls.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { io as connect, type Socket } from 'socket.io-client';
import App from '../src/App';
import { api } from '../src/lib/api';
import { setClockOffset } from '../src/lib/serverClock';
import { FakePlayer, installFakeYT } from './fakeYT';

const URL_ = 'http://127.0.0.1:4517'; // globalSetup wala server
const V1 = 'dQw4w9WgXcQ';
const V2 = 'jNQXAC9IVRw';
const raw: Socket[] = [];

installFakeYT();

// Har test ke baad: DOM saaf, raw sockets band, fake YT fresh. 
afterEach(() => {
  cleanup();
  for (const s of raw.splice(0)) s.close();
  localStorage.clear();
  installFakeYT();
  setClockOffset(0);
});

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
const emitAck = <T = { ok: boolean }>(s: Socket, ev: string, p: unknown) => new Promise<T>((res) => s.emit(ev, p, res));
const player = () => FakePlayer.instances[FakePlayer.instances.length - 1]!;

// UI user: room link kholo, naam daalo, join
async function uiJoin(roomId: string, name: string) {
  window.history.pushState({}, '', `/room/${roomId}`);
  render(<App />);
  fireEvent.change(await screen.findByPlaceholderText(/Your name/), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: 'Join party' }));
  await waitFor(() => expect(screen.getByTestId('my-role')).toBeTruthy());
  const session = JSON.parse(localStorage.getItem(`wp_session_${roomId}`)!) as { userId: string; token: string };
  return session;
}

async function hostRoom() {
  const host = await api.createRoom('Creator');
  const sHost = await rawJoin(host.token, host.roomId, 'Creator');
  return { host, sHost, roomId: host.roomId };
}

describe('Phase 9: player + sync', () => {
  it('YT player controls:0 ke saath bana; click-block overlay hai; video aane tak gate nahi', async () => {
    const { roomId } = await hostRoom();
    await uiJoin(roomId, 'Alice');
    await waitFor(() => expect(FakePlayer.instances.length).toBe(1));
    expect(player().opts.playerVars).toMatchObject({ controls: 0, disablekb: 1, rel: 0, playsinline: 1 });
    expect(screen.getByTestId('click-block')).toBeTruthy();
    expect(screen.getByText('No video yet')).toBeTruthy();
    expect(screen.queryByTestId('join-party')).toBeNull();
  });

  it('gate click ke baad current state apply: playing video sahi position par load', async () => {
    const { roomId, sHost } = await hostRoom();
    await emitAck(sHost, 'change_video', { videoId: V1 });
    await emitAck(sHost, 'seek', { time: 40 });
    await uiJoin(roomId, 'Alice');
    const gate = await screen.findByTestId('join-party');
    await new Promise((r) => setTimeout(r, 600)); // clock sync (5 samples) complete
    expect(player().calls.some((c) => c[0] === 'loadVideoById')).toBe(false); // gate se pehle kuch nahi
    fireEvent.click(gate);
    await waitFor(() => expect(player().last('loadVideoById')).toBeTruthy());
    const arg = player().last('loadVideoById')![1] as { videoId: string; startSeconds: number };
    expect(arg.videoId).toBe(V1);
    expect(arg.startSeconds).toBeGreaterThanOrEqual(40);
    expect(arg.startSeconds).toBeLessThan(43);
    expect(screen.queryByTestId('join-party')).toBeNull();
  });

  it('Host ke pause / seek / play / change_video sab player par apply hote hain', async () => {
    const { roomId, sHost } = await hostRoom();
    await emitAck(sHost, 'change_video', { videoId: V1 });
    await uiJoin(roomId, 'Alice');
    fireEvent.click(await screen.findByTestId('join-party'));
    await waitFor(() => expect(player().last('loadVideoById')).toBeTruthy());

    await emitAck(sHost, 'pause', { time: 25 });
    await waitFor(() => expect(player().names()).toContain('pauseVideo'));
    expect(player().last('seekTo')![1]).toBe(25);

    await emitAck(sHost, 'seek', { time: 100 });
    await waitFor(() => expect(player().last('seekTo')![1]).toBe(100));

    const before = player().names().filter((n) => n === 'playVideo').length;
    await emitAck(sHost, 'play', { time: 100 });
    await waitFor(() => expect(player().names().filter((n) => n === 'playVideo').length).toBe(before + 1));

    await emitAck(sHost, 'change_video', { videoId: V2 });
    await waitFor(() => expect((player().last('loadVideoById')![1] as { videoId: string }).videoId).toBe(V2));
  });

  it('chhota farak (<1s) par seek nahi hota (loop/jitter nahi)', async () => {
    const { roomId, sHost } = await hostRoom();
    await emitAck(sHost, 'change_video', { videoId: V1 });
    await emitAck(sHost, 'pause', { time: 50 });
    await uiJoin(roomId, 'Alice');
    fireEvent.click(await screen.findByTestId('join-party'));
    await waitFor(() => expect(player().last('cueVideoById')).toBeTruthy()); // paused: cue
    player().time = 50.4;
    await emitAck(sHost, 'seek', { time: 50 });
    await new Promise((r) => setTimeout(r, 300));
    expect(player().names()).not.toContain('seekTo');
  });

  it('Participant ke controls disabled; Host/Mod ke enabled; URL invalid par inline error', async () => {
    const { roomId, sHost } = await hostRoom();
    await emitAck(sHost, 'change_video', { videoId: V1 });
    const me = await uiJoin(roomId, 'Alice');
    // Video playing hai, isliye button ka naam 'Pause'
    const toggle = screen.getByRole('button', { name: /^(Play|Pause)$/ });
    expect(toggle.hasAttribute('disabled')).toBe(true);
    expect(toggle.getAttribute('title')).toBe('Only host/moderator can control');

    await emitAck(sHost, 'assign_role', { userId: me.userId, role: 'moderator' });
    await waitFor(() => expect(screen.getByTestId('my-role').textContent).toBe('Moderator'));
    expect(screen.getByRole('button', { name: /^(Play|Pause)$/ }).hasAttribute('disabled')).toBe(false); // turant enable

    fireEvent.change(screen.getByLabelText('YouTube URL'), { target: { value: 'https://example.com/x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change video' }));
    expect((await screen.findByRole('alert')).textContent).toContain('valid YouTube');
  });

  it('Moderator ka play/pause button server ko emit karta hai aur sab ko sync hota hai', async () => {
    const { roomId, sHost } = await hostRoom();
    await emitAck(sHost, 'change_video', { videoId: V1 });
    await emitAck(sHost, 'pause', { time: 5 });
    const me = await uiJoin(roomId, 'Alice');
    await emitAck(sHost, 'assign_role', { userId: me.userId, role: 'moderator' });
    await waitFor(() => expect(screen.getByTestId('my-role').textContent).toBe('Moderator'));

    const seen: { playState: string }[] = [];
    sHost.on('sync_state', (s: { playState: string }) => seen.push(s));
    fireEvent.click(await screen.findByRole('button', { name: 'Play' }));
    await waitFor(() => expect(seen.some((s) => s.playState === 'playing')).toBe(true));

    // URL paste -> change_video
    const synced = new Promise<{ videoId: string }>((res) => sHost.once('sync_state', res));
    fireEvent.change(screen.getByLabelText('YouTube URL'), { target: { value: `https://youtu.be/${V2}?t=5` } });
    fireEvent.click(screen.getByRole('button', { name: 'Change video' }));
    expect((await synced).videoId).toBe(V2);
  });

  it('YouTube error (101) par message dikhta hai', async () => {
    const { roomId, sHost } = await hostRoom();
    await emitAck(sHost, 'change_video', { videoId: V1 });
    await uiJoin(roomId, 'Alice');
    fireEvent.click(await screen.findByTestId('join-party'));
    await waitFor(() => expect(player().last('loadVideoById')).toBeTruthy());
    player().opts.events!.onError!({ data: 101 });
    expect((await screen.findByTestId('player-error')).textContent).toContain('embed');
  });

  it('onStateChange se server ko koi emit nahi (echo loop nahi)', async () => {
    const { roomId, sHost } = await hostRoom();
    await emitAck(sHost, 'change_video', { videoId: V1 });
    await uiJoin(roomId, 'Alice');
    fireEvent.click(await screen.findByTestId('join-party'));
    await waitFor(() => expect(player().last('loadVideoById')).toBeTruthy());
    let sync = 0;
    sHost.on('sync_state', () => sync++);
    for (const d of [2, 3, 1, 0]) player().opts.events!.onStateChange!({ data: d });
    await new Promise((r) => setTimeout(r, 300));
    expect(sync).toBe(0);
    expect(await screen.findByTestId('video-ended')).toBeTruthy(); // 0 = ended: sirf UI
  });
});

describe('Phase 10: roles, requests, host controls', () => {
  it('Host UI: role dropdown -> assign_role; Remove (confirm) -> participant hata; Make host (confirm)', async () => {
    const host = await api.createRoom('Creator');
    window.history.pushState({}, '', '/');
    // Host ko UI se kholo (session seed karke)
    localStorage.setItem(`wp_session_${host.roomId}`, JSON.stringify({ userId: host.userId, token: host.token, username: 'Creator' }));
    window.history.pushState({}, '', `/room/${host.roomId}`);
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('my-role').textContent).toBe('Host'));

    const gA = await api.guest(host.roomId, 'Alice');
    const gB = await api.guest(host.roomId, 'Bob');
    const sA = await rawJoin(gA.token, host.roomId, 'Alice');
    const sB = await rawJoin(gB.token, host.roomId, 'Bob');
    await waitFor(() => expect(screen.getAllByTestId('participant')).toHaveLength(3));

    // Host apne aap par controls nahi dekhta
    const rows = () => screen.getAllByTestId('participant');
    expect(within(rows()[0]!).queryByRole('combobox')).toBeNull();

    // Role dropdown
    const gotRole = new Promise<{ userId: string; role: string }>((res) => sA.once('role_assigned', res));
    fireEvent.change(screen.getByLabelText('Role for Alice'), { target: { value: 'moderator' } });
    expect(await gotRole).toMatchObject({ userId: gA.userId, role: 'moderator' });
    await waitFor(() => expect(within(rows()[1]!).getAllByText('Moderator').length).toBeGreaterThan(0));

    // Make host: confirm dialog, cancel kuch nahi karta
    fireEvent.click(within(rows()[1]!).getByRole('button', { name: 'Make host' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();

    // Remove Bob: confirm -> removed event + participants kam
    const removed = new Promise((res) => sB.once('removed', res));
    fireEvent.click(within(rows()[2]!).getByRole('button', { name: 'Remove' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove' }));
    await removed;
    await waitFor(() => expect(screen.getAllByTestId('participant')).toHaveLength(2));
    expect(screen.getByText('Bob was removed')).toBeTruthy();

    // Make host Alice (confirm)
    fireEvent.click(within(rows()[1]!).getByRole('button', { name: 'Make host' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Make host' }));
    await waitFor(() => expect(screen.getByTestId('my-role').textContent).toBe('Moderator'));
  });

  it('Participant request buttons: Pending..., Host approve -> sab sync + toast approved', async () => {
    const { roomId, sHost } = await hostRoom();
    await emitAck(sHost, 'change_video', { videoId: V1 });
    await emitAck(sHost, 'pause', { time: 10 });
    await uiJoin(roomId, 'Alice');

    const reqEv = new Promise<{ requestId: string; type: string; username: string }>((res) => sHost.once('action_requested', res));
    fireEvent.click(await screen.findByRole('button', { name: 'Request play' }));
    const req = await reqEv;
    expect(req).toMatchObject({ type: 'play', username: 'Alice' });
    await waitFor(() => expect(screen.getAllByText('Pending...').length).toBeGreaterThan(0));

    const synced = new Promise<{ playState: string }>((res) => sHost.once('sync_state', res));
    expect((await emitAck<{ ok: boolean; status: string }>(sHost, 'resolve_request', { requestId: req.requestId, approve: true })).status).toBe('approved');
    expect((await synced).playState).toBe('playing');
    expect(await screen.findByText('Your play request was approved')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Pending...')).toBeNull());
  });

  it('Request seek (slider time) + reject toast; change video request', async () => {
    const { roomId, sHost } = await hostRoom();
    await emitAck(sHost, 'change_video', { videoId: V1 });
    await uiJoin(roomId, 'Alice');

    // Gate click ke baad hi duration (300s) pata hoti hai, tab slider 0..300 chalta hai
    fireEvent.click(await screen.findByTestId('join-party'));
    await waitFor(() => expect(screen.getByLabelText('Seek').getAttribute('max')).toBe('300'));
    const r1 = new Promise<{ requestId: string; type: string; payload: { time: number } }>((res) => sHost.once('action_requested', res));
    fireEvent.change(screen.getByLabelText('Seek'), { target: { value: '90' } });
    fireEvent.pointerUp(screen.getByLabelText('Seek'));
    fireEvent.click(await screen.findByRole('button', { name: 'Request seek to 1:30' }));
    const seekReq = await r1;
    expect(seekReq).toMatchObject({ type: 'seek', payload: { time: 90 } });
    await emitAck(sHost, 'resolve_request', { requestId: seekReq.requestId, approve: false });
    expect(await screen.findByText('Your seek request was rejected')).toBeTruthy();

    const r2 = new Promise<{ type: string; payload: { videoId: string } }>((res) => sHost.once('action_requested', res));
    fireEvent.change(screen.getByLabelText('YouTube URL'), { target: { value: `https://youtu.be/${V2}` } });
    fireEvent.click(screen.getByRole('button', { name: 'Request change' }));
    expect(await r2).toMatchObject({ type: 'change_video', payload: { videoId: V2 } });
  });

  it('Requests panel (Host UI): request dikhti hai, count badge, Approve -> sync_state', async () => {
    const host = await api.createRoom('Creator');
    localStorage.setItem(`wp_session_${host.roomId}`, JSON.stringify({ userId: host.userId, token: host.token, username: 'Creator' }));
    window.history.pushState({}, '', `/room/${host.roomId}`);
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('my-role').textContent).toBe('Host'));
    const g = await api.guest(host.roomId, 'Bob');
    const sB = await rawJoin(g.token, host.roomId, 'Bob');
    await emitAck(sB, 'request_action', { type: 'change_video', payload: { videoId: V1 } });
    await emitAck(sB, 'request_action', { type: 'become_moderator', payload: {} });

    await waitFor(() => expect(screen.getByTestId('request-count').textContent).toBe('2'));
    fireEvent.click(screen.getByRole('tab', { name: /Requests/ }));
    const items = await screen.findAllByTestId('request');
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain('Bob wants to play video dQw4w9WgXcQ');
    expect(items[1]!.textContent).toContain('Moderator role');
    expect(within(items[0]!).getByText(/^\d+s$/)).toBeTruthy(); // countdown

    const synced = new Promise<{ videoId: string }>((res) => sB.once('sync_state', res));
    fireEvent.click(within(items[0]!).getByRole('button', { name: 'Approve' }));
    expect((await synced).videoId).toBe(V1);
    await waitFor(() => expect(screen.getAllByTestId('request')).toHaveLength(1));

    // Role request: Host approve -> Bob moderator
    const roleEv = new Promise<{ userId: string; role: string }>((res) => sB.once('role_assigned', res));
    fireEvent.click(within(screen.getAllByTestId('request')[0]!).getByRole('button', { name: 'Approve' }));
    expect(await roleEv).toMatchObject({ userId: g.userId, role: 'moderator' });
    await waitFor(() => expect(screen.getByTestId('no-requests')).toBeTruthy());
  });

  it('Participant: "Request moderator role" -> Host approve -> controls turant enable, button gayab', async () => {
    const { roomId, sHost } = await hostRoom();
    await emitAck(sHost, 'change_video', { videoId: V1 });
    await uiJoin(roomId, 'Alice');
    const reqEv = new Promise<{ requestId: string; type: string }>((res) => sHost.once('action_requested', res));
    fireEvent.click(screen.getByRole('button', { name: 'Request moderator role' }));
    const req = await reqEv;
    expect(req.type).toBe('become_moderator');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pending...' }).hasAttribute('disabled')).toBe(true));

    await emitAck(sHost, 'resolve_request', { requestId: req.requestId, approve: true });
    await waitFor(() => expect(screen.getByTestId('my-role').textContent).toBe('Moderator'));
    expect(screen.queryByRole('button', { name: 'Request moderator role' })).toBeNull();
    expect(screen.getByRole('button', { name: /^(Play|Pause)$/ }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('tab', { name: /Requests/ })).toBeTruthy(); // ab Requests tab bhi
  });
});
