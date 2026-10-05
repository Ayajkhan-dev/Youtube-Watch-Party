// roomStore unit tests: socket events ke baad state kaisa dikhna chahiye (participants, role, toasts, stale sync).
import { beforeEach, describe, expect, it } from 'vitest';
import type { JoinRoomAckOk, ParticipantDTO, SyncStatePayload } from '@watchparty/shared';
import { selectCanControl, useRoomStore } from '../src/store/roomStore';

const P = (userId: string, username: string, role: ParticipantDTO['role'], joinedAt = 1): ParticipantDTO => ({
  userId,
  username,
  role,
  connected: true,
  joinedAt,
});
const sync = (version: number, over: Partial<SyncStatePayload> = {}): SyncStatePayload => ({
  playState: 'paused',
  currentTime: 0,
  videoId: null,
  updatedAt: 1,
  serverTime: 1,
  version,
  updatedBy: null,
  ...over,
});
const ack = (me: ParticipantDTO, list: ParticipantDTO[]): JoinRoomAckOk => ({
  ok: true,
  me,
  role: me.role,
  participants: list,
  playback: sync(0),
  chat: [],
  instanceId: 'local',
});
const s = () => useRoomStore.getState();
const toasts = () => s().toasts.map((t) => t.text);

beforeEach(() => s().reset());

describe('join + participants', () => {
  it('setJoined: me, role, participants, status', () => {
    const host = P('h', 'Host', 'host');
    s().setJoined(ack(host, [host]));
    expect(s()).toMatchObject({ status: 'joined', role: 'host', instanceId: 'local' });
    expect(s().participants).toHaveLength(1);
    expect(selectCanControl(s())).toBe(true);
  });

  it('user_joined / user_left: list update + toast (apne liye toast nahi)', () => {
    const me = P('a', 'Alice', 'participant');
    s().setJoined(ack(me, [P('h', 'Host', 'host'), me]));
    s().userJoined({ username: 'Alice', userId: 'a', role: 'participant', participants: [P('h', 'Host', 'host'), me] });
    expect(toasts()).toEqual([]);
    const bob = P('b', 'Bob', 'participant');
    s().userJoined({ username: 'Bob', userId: 'b', role: 'participant', participants: [P('h', 'Host', 'host'), me, bob] });
    expect(s().participants).toHaveLength(3);
    s().userLeft({ username: 'Bob', userId: 'b', participants: [P('h', 'Host', 'host'), me] });
    expect(s().participants).toHaveLength(2);
    expect(toasts()).toEqual(['Bob joined', 'Bob left']);
  });
});

describe('roles', () => {
  it('meri role badle to role + controls turant badalte hain', () => {
    const me = P('a', 'Alice', 'participant');
    const host = P('h', 'Host', 'host');
    s().setJoined(ack(me, [host, me]));
    expect(selectCanControl(s())).toBe(false);
    s().roleAssigned({ userId: 'a', username: 'Alice', role: 'moderator', participants: [host, { ...me, role: 'moderator' }] });
    expect(s().role).toBe('moderator');
    expect(s().me?.role).toBe('moderator');
    expect(selectCanControl(s())).toBe(true);
    expect(toasts()).toContain('You are now Moderator');
    s().roleAssigned({ userId: 'a', username: 'Alice', role: 'viewer', participants: [host, { ...me, role: 'viewer' }] });
    expect(selectCanControl(s())).toBe(false);
  });

  it('dusre ka role badle to toast "Y is now Moderator"', () => {
    const me = P('a', 'Alice', 'participant');
    const bob = P('b', 'Bob', 'participant');
    s().setJoined(ack(me, [P('h', 'Host', 'host'), me, bob]));
    s().roleAssigned({ userId: 'b', username: 'Bob', role: 'moderator', participants: [P('h', 'Host', 'host'), me, { ...bob, role: 'moderator' }] });
    expect(toasts()).toEqual(['Bob is now Moderator']);
    expect(s().role).toBe('participant');
  });

  it('host_transferred: naya host hum hon to role host', () => {
    const me = P('a', 'Alice', 'moderator');
    const host = P('h', 'Host', 'host');
    s().setJoined(ack(me, [host, me]));
    s().hostTransferred({ oldHostId: 'h', newHostId: 'a', participants: [{ ...host, role: 'moderator' }, { ...me, role: 'host' }] });
    expect(s().role).toBe('host');
    expect(toasts()).toContain('You are now the Host');
  });

  it('participant_removed: list se hata, uski requests panel se hati, toast', () => {
    const me = P('h', 'Host', 'host');
    const bob = P('b', 'Bob', 'participant');
    s().setJoined(ack(me, [me, bob]));
    s().actionRequested({ requestId: 'r1', userId: 'b', username: 'Bob', type: 'play', payload: {}, expiresAt: 9 });
    s().participantRemoved('b', [me]);
    expect(s().participants).toHaveLength(1);
    expect(s().requests).toHaveLength(0);
    expect(toasts()).toEqual(['Bob was removed']);
  });
});

describe('playback + requests + end states', () => {
  it('purana (stale) sync_state ignore hota hai', () => {
    const me = P('h', 'Host', 'host');
    s().setJoined(ack(me, [me]));
    s().syncState(sync(5, { videoId: 'dQw4w9WgXcQ', playState: 'playing' }));
    s().syncState(sync(3, { playState: 'paused' }));
    expect(s().playback).toMatchObject({ version: 5, playState: 'playing' });
    s().syncState(sync(6, { playState: 'paused' }));
    expect(s().playback?.version).toBe(6);
  });

  it('reconnect join ack purane version se peeche ka playback overwrite nahi karta', () => {
    const me = P('h', 'Host', 'host');
    s().setJoined(ack(me, [me]));
    s().syncState(sync(9));
    s().setJoined(ack(me, [me])); // ack.playback.version = 0
    expect(s().playback?.version).toBe(9);
  });

  it('action_requested dedupe, request_resolved hatata hai', () => {
    const r = { requestId: 'r1', userId: 'b', username: 'Bob', type: 'seek' as const, payload: { time: 5 }, expiresAt: 9 };
    s().actionRequested(r);
    s().actionRequested(r);
    expect(s().requests).toHaveLength(1);
    s().requestResolved({ requestId: 'r1', status: 'approved' });
    expect(s().requests).toHaveLength(0);
  });

  it('removed / replaced / fatal / error_event', () => {
    s().removed('Host ne hata diya');
    expect(s()).toMatchObject({ status: 'removed', fatalError: { code: 'REMOVED' } });
    s().reset();
    s().replaced('dusra tab');
    expect(s().status).toBe('replaced');
    s().reset();
    s().setFatal('BANNED', 'banned');
    expect(s()).toMatchObject({ status: 'error', fatalError: { code: 'BANNED' } });
    s().errorEvent({ code: 'FORBIDDEN', event: 'play', message: 'You do not have permission' });
    expect(s().toasts[0]).toMatchObject({ kind: 'error', text: 'You do not have permission' });
  });

  it('chat dedupe + toasts max 5', () => {
    const m = { id: 'm1', userId: 'a', username: 'A', text: 'hi', ts: 1 };
    s().chatMessage(m);
    s().chatMessage(m);
    expect(s().chat).toHaveLength(1);
    for (let i = 0; i < 8; i++) s().addToast('info', `t${i}`);
    expect(s().toasts).toHaveLength(5);
    expect(toasts()[4]).toBe('t7');
  });
});

describe('my requests (Phase 10)', () => {
  const join = (role: ParticipantDTO['role'] = 'participant') => {
    const me = P('a', 'Alice', role);
    s().setJoined(ack(me, [P('h', 'Host', 'host'), me]));
    return me;
  };

  it('addMyRequest: same type replace; requestResolved toast + pending hata', () => {
    join();
    s().addMyRequest({ requestId: 'r1', type: 'play', expiresAt: 9 });
    s().addMyRequest({ requestId: 'r2', type: 'play', expiresAt: 9 }); // replace
    s().addMyRequest({ requestId: 'r3', type: 'seek', expiresAt: 9 });
    expect(s().myRequests.map((r) => r.requestId)).toEqual(['r2', 'r3']);

    s().requestResolved({ requestId: 'r2', status: 'approved' });
    s().requestResolved({ requestId: 'r3', status: 'rejected', reason: 'stale' });
    expect(s().myRequests).toHaveLength(0);
    expect(toasts()).toEqual(['Your play request was approved', 'Your seek request is outdated (video changed)']);
  });

  it('expired toast; doosre ki request resolve par toast nahi', () => {
    join();
    s().addMyRequest({ requestId: 'r1', type: 'change_video', expiresAt: 9 });
    s().requestResolved({ requestId: 'zzz', status: 'approved' });
    expect(toasts()).toEqual([]);
    s().requestResolved({ requestId: 'r1', status: 'expired' });
    expect(toasts()).toEqual(['Your change video request expired']);
  });

  it('moderator ban jaane par pending requests saaf', () => {
    const me = join();
    s().addMyRequest({ requestId: 'r1', type: 'become_moderator', expiresAt: 9 });
    s().roleAssigned({ userId: 'a', username: 'Alice', role: 'moderator', participants: [P('h', 'Host', 'host'), { ...me, role: 'moderator' }] });
    expect(s().myRequests).toHaveLength(0);
  });

  it('clockSynced flag; reset sab saaf karta hai', () => {
    s().setClockSynced(true);
    s().addMyRequest({ requestId: 'r1', type: 'play', expiresAt: 9 });
    expect(s().clockSynced).toBe(true);
    s().reset();
    expect(s().clockSynced).toBe(false);
    expect(s().myRequests).toHaveLength(0);
  });
});

describe('chat + reactions (Phase 11)', () => {
  it('unread: dusre ka message +1, apna nahi; markChatRead reset', () => {
    const me = P('a', 'Alice', 'participant');
    s().setJoined(ack(me, [me]));
    s().chatMessage({ id: '1', userId: 'b', username: 'Bob', text: 'hi', ts: 1 });
    s().chatMessage({ id: '2', userId: 'a', username: 'Alice', text: 'mine', ts: 2 });
    s().chatMessage({ id: '2', userId: 'a', username: 'Alice', text: 'mine', ts: 2 }); // dup
    expect(s().chat).toHaveLength(2);
    expect(s().unreadChat).toBe(1);
    s().markChatRead();
    expect(s().unreadChat).toBe(0);
  });

  it('reaction add/remove aur max 30 floating', () => {
    s().reaction({ userId: 'b', username: 'Bob', emoji: '🔥' });
    expect(s().reactions).toHaveLength(1);
    expect(s().reactions[0]).toMatchObject({ emoji: '🔥', username: 'Bob' });
    expect(s().reactions[0]!.left).toBeGreaterThanOrEqual(10);
    expect(s().reactions[0]!.left).toBeLessThanOrEqual(90);
    s().removeReaction(s().reactions[0]!.id);
    expect(s().reactions).toHaveLength(0);
    for (let i = 0; i < 40; i++) s().reaction({ userId: 'b', username: 'Bob', emoji: '👏' });
    expect(s().reactions).toHaveLength(30);
  });
});
