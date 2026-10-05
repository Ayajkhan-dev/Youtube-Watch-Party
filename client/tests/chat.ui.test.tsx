// @vitest-environment jsdom
// Phase 11 UI integration (jsdom + asli server): chat bhejna/milna, history, XSS safe render, unread badge, reactions.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { io as connect, type Socket } from 'socket.io-client';
import App from '../src/App';
import { api } from '../src/lib/api';
import { installFakeYT } from './fakeYT';

const URL_ = 'http://127.0.0.1:4517';
const raw: Socket[] = [];
installFakeYT();

afterEach(() => {
  cleanup();
  for (const s of raw.splice(0)) s.close();
  localStorage.clear();
  installFakeYT();
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

async function uiJoin(roomId: string, name: string) {
  window.history.pushState({}, '', `/room/${roomId}`);
  render(<App />);
  fireEvent.change(await screen.findByPlaceholderText(/Your name/), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: 'Join party' }));
  await waitFor(() => expect(screen.getByTestId('my-role')).toBeTruthy());
}
const openChat = () => fireEvent.click(screen.getByRole('tab', { name: /Chat/ }));

describe('chat UI', () => {
  it('message bhejo -> sab ko; history naye joiner ko; XSS text ki tarah dikhta hai', async () => {
    const host = await api.createRoom('Creator');
    const sHost = await rawJoin(host.token, host.roomId, 'Creator');
    await emitAck(sHost, 'chat_message', { text: 'pehle ka message' });

    await uiJoin(host.roomId, 'Alice');
    openChat();
    // History join ack se
    expect((await screen.findAllByTestId('chat-message'))[0]!.textContent).toContain('pehle ka message');

    // UI se bhejo (Enter) -> host ko milta hai
    const hostGot = new Promise<{ text: string; username: string }>((res) => sHost.once('chat_message', res));
    const input = screen.getByLabelText('Chat message');
    fireEvent.change(input, { target: { value: 'hello from alice' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await hostGot).toMatchObject({ text: 'hello from alice', username: 'Alice' });
    expect((input as HTMLInputElement).value).toBe(''); // input saaf

    // Host ka message UI mein; HTML inject text ki tarah (element nahi banta)
    await emitAck(sHost, 'chat_message', { text: '<img src=x onerror=alert(1)><b>bold</b>' });
    await waitFor(() => expect(screen.getAllByTestId('chat-message')).toHaveLength(3));
    const list = screen.getByTestId('chat-list');
    expect(list.querySelector('img')).toBeNull();
    expect(list.querySelector('b')).toBeNull();
    expect(list.textContent).toContain('<img src=x onerror=alert(1)><b>bold</b>');
    const mine = screen.getAllByTestId('chat-message').find((e) => e.textContent?.includes('hello from alice'))!;
    expect(within(mine).getByText(/^You/)).toBeTruthy();
  });

  it('chat tab band ho to unread badge; kholne par saaf', async () => {
    const host = await api.createRoom('Creator');
    const sHost = await rawJoin(host.token, host.roomId, 'Creator');
    await uiJoin(host.roomId, 'Alice');
    await emitAck(sHost, 'chat_message', { text: 'one' });
    await emitAck(sHost, 'chat_message', { text: 'two' });
    await waitFor(() => expect(screen.getByTestId('chat-unread').textContent).toBe('2'));
    openChat();
    await waitFor(() => expect(screen.queryByTestId('chat-unread')).toBeNull());
  });

  it('spam par RATE_LIMITED toast', async () => {
    const host = await api.createRoom('Creator');
    await rawJoin(host.token, host.roomId, 'Creator');
    await uiJoin(host.roomId, 'Alice');
    openChat();
    const input = screen.getByLabelText('Chat message');
    for (let i = 0; i < 7; i++) {
      fireEvent.change(input, { target: { value: `m${i}` } });
      fireEvent.keyDown(input, { key: 'Enter' });
    }
    expect((await screen.findAllByText(/You are sending messages too quickly/)).length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('chat-message').length).toBe(5);
  });
});

describe('reactions UI', () => {
  it('button click -> sab ko reaction; apni aur dusre ki floating emoji dikhti hai aur 2 sec mein hat jaati hai', async () => {
    const host = await api.createRoom('Creator');
    const sHost = await rawJoin(host.token, host.roomId, 'Creator');
    await emitAck(sHost, 'change_video', { videoId: 'dQw4w9WgXcQ' });
    await uiJoin(host.roomId, 'Alice');

    const hostGot = new Promise<{ emoji: string; username: string }>((res) => sHost.once('reaction', res));
    fireEvent.click(screen.getByRole('button', { name: 'React fire' }));
    expect(await hostGot).toEqual(expect.objectContaining({ emoji: '🔥', username: 'Alice' }));
    await waitFor(() => expect(screen.getAllByTestId('floating-reaction')[0]!.textContent).toBe('🔥'));

    await emitAck(sHost, 'reaction', { emoji: 'clap' });
    await waitFor(() => expect(screen.getAllByTestId('floating-reaction').map((e) => e.textContent)).toContain('👏'));
    await waitFor(() => expect(screen.queryAllByTestId('floating-reaction')).toHaveLength(0), { timeout: 3500 });
  });
});
