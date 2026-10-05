# Architecture Overview

## High-level components

```
 Browser (React + YouTube IFrame)                    Server (Node.js)
 ┌──────────────────────────────┐   REST (HTTPS)   ┌───────────────────────────────┐
 │ Pages / Components           │ ───────────────► │ Express routes (rooms, auth)  │
 │ Zustand store (room state)   │                  │  └─ RoomManager               │
 │ useRoomSocket (Socket.IO)    │ ◄──WebSocket───► │ Socket.IO server              │
 │ useYouTubePlayer + syncMath  │   (JWT in auth)  │  ├─ authMiddleware (JWT)      │
 └──────────────────────────────┘                  │  ├─ guard (room + permission) │
                                                   │  └─ Handlers: Room, Playback, │
                                                   │     Role, Request, Chat       │
                                                   │ Services: Permission, Playback│
                                                   │  Role, Request                │
                                                   │ RoomStore: InMemory | Redis   │
                                                   │ Optional: MongoDB persistence │
                                                   └───────────────────────────────┘
```

## How WebSockets fit into the flow

1. **Identity (REST).** `POST /api/rooms` (creator) or `POST /api/rooms/:id/guest` returns a JWT containing the `userId`. The room code is the shareable identifier.
2. **Handshake.** The client connects with `auth: { token }`. `authMiddleware` verifies the token and stores the identity in `socket.data`. WebSocket upgrades also check the `Origin` header in production.
3. **Join.** `join_room` → `RoomHandler` loads the room from the `RoomStore`, rejects banned users or full rooms, assigns the role (Host only for the creator), joins the Socket.IO room, acks a snapshot and broadcasts `user_joined`.
4. **Every protected event** passes the same pipeline:
   `Zod validation → guard (room + participant from socket.data) → PermissionService.can(role, action) → service mutates Room → store.save → io.to(room).emit(...)`.
   A failed check sends `error_event { code: 'FORBIDDEN' }` to the sender only and the handler never runs.
5. **Playback sync.** `PlaybackService` keeps `{ playState, currentTime, videoId, updatedAt, version }`. Each change increments `version` and broadcasts `sync_state` including `serverTime`. Clients compute `expected = currentTime + (serverNow - updatedAt)` while playing, using a clock offset measured with `time_sync`.
6. **No echo loop.** The client never emits from the YouTube `onStateChange`; the local player only changes when `sync_state` arrives, for the Host as well.
7. **Approval flow.** A Participant emits `request_action`. The request goes only to the `${roomId}:mods` sub-room (Host + Moderators) as `action_requested`. `resolve_request { approve }` runs the same service as a direct action and broadcasts the result; requests expire after 60 s or become stale if the video changed.
8. **Reconnects.** A dropped socket keeps its participant for a 30 s grace period. On reconnect the client re-emits `join_room` and gets the latest snapshot. Opening the room in a second tab replaces the first socket.
9. **Scaling.** With Redis, `RedisRoomStore` stores room state (with a lock around mutations) and the Socket.IO Redis adapter forwards broadcasts between instances, so rooms work across several server processes behind a load balancer (see `docker-compose.yml`, `nginx.conf`).

## Role enforcement

`PermissionService` is the single source of truth (matrix in `docs/SPEC.md`). Handlers never check roles themselves. The frontend only hides or disables controls for UX; a forged event from a Participant is rejected by the server.

## Sequence: Host pauses the video

```
Host UI ──pause──► Server: validate → guard → can(host,'pause') → PlaybackService.pause()
                           └─ store.save(room) → io.to(roomId).emit('sync_state', {...version+1})
All clients ◄──sync_state── applyState(): align time (seek if drift) → pauseVideo()
```
