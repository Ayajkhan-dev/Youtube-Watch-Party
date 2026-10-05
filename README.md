# 🎬 YouTube Watch Party

Watch YouTube videos together in real time. Create a room, share the code, and every participant sees the same play, pause, seek and video change at the same moment. Access is controlled by roles (Host, Moderator, Participant, Viewer) that are enforced on the server.

**Live demo:** https://youtube-watch-party-khaki.vercel.app/   _(frontend)_

               https://watch-party-server-ioq8.onrender.com/health` _(backend)_


## Features

| Area | What is included |
| --- | --- |
| Real-time sync | Play / pause / seek / change video broadcast over WebSockets, server-authoritative clock, drift correction |
| Rooms | Create a room (creator = Host), join by link or 6-character code, participant list with roles |
| Role-based access | Host, Moderator, Participant, Viewer. Host can assign roles, remove participants and transfer host |
| Approval flow | Participants request play / pause / seek / change video / moderator role; Host/Moderators approve or reject |
| Social | Live chat and emoji reactions |
| Resilience | Auto-reconnect with the role preserved, 30s grace period, automatic host hand-over |
| Optional | Accounts (login / sign up), MongoDB persistence, Redis for horizontal scaling |

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, Zustand, React Router |
| Backend | Node.js, Express, Socket.IO, Zod (payload validation), JWT |
| Realtime | WebSockets via Socket.IO (websocket-only transport) |
| Video | YouTube IFrame Player API |
| Data (optional) | Redis (room state + Pub/Sub adapter), MongoDB (persistent rooms, accounts) |
| Deployment | Render (backend) + Vercel / Netlify (frontend), Docker + Nginx for the scaling lab |

## Project structure

```
shared/   Event names, roles, types and the YouTube URL parser (shared by client and server)
server/   Express + Socket.IO server (models, services, handlers, stores, tests)
client/   React app (pages, components, hooks, Zustand store, tests)
docs/     SPEC, DEPLOYMENT, TESTING, LOADTEST, PHASE14, ARCHITECTURE
```

## Getting started (local)

Requirements: Node.js 20+ and npm.

```bash
npm install
cp server/.env.example server/.env
cp client/.env.example client/.env
npm run dev:server   # terminal 1 -> http://localhost:4000/health
npm run dev:client   # terminal 2 -> http://localhost:5173
```

Open http://localhost:5173, enter a name and click **Create room**. Open the room link in a second browser window (or an incognito window) to join as a Participant.

### Environment variables

| Variable | Where | Description |
| --- | --- | --- |
| `PORT` | server | HTTP/WebSocket port (default `4000`) |
| `CLIENT_URL` | server | Allowed frontend origin(s) for CORS and WebSocket Origin check, comma separated, no trailing slash. **Required in production** |
| `JWT_SECRET` | server | Secret for signing tokens (min 16 chars). A weak/dev value is rejected in production |
| `REDIS_URL` | server, optional | Enables Redis room state and the Socket.IO Redis adapter. In-memory store is used when empty |
| `MONGO_URI` | server, optional | Enables persistent rooms and account login / sign up |
| `REQUIRE_AUTH` | server, optional | `true` disables guest access and requires an account (default `false`) |
| `MAX_PARTICIPANTS`, `GRACE_PERIOD_MS`, `EMPTY_ROOM_TTL_MS`, `REQUEST_TTL_MS` | server, optional | Room limits and timers |
| `VITE_SERVER_URL` | client | Backend URL, e.g. `http://localhost:4000` |

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run build` | Build shared, server and client |
| `npm test` | Run server tests (Vitest + Supertest + real sockets) and client tests (jsdom + real server) |
| `npm run lint` | ESLint |

## Roles and permissions

| Action | Host | Moderator | Participant | Viewer |
| --- | :-: | :-: | :-: | :-: |
| Play / pause / seek / change video | ✅ | ✅ | request | request |
| Assign roles | ✅ | – | – | – |
| Remove participants | ✅ | – | – | – |
| Transfer host | ✅ | – | – | – |
| Approve / reject requests | ✅ | ✅ (not role requests) | – | – |
| Chat and reactions | ✅ | ✅ | ✅ | ✅ |

The creator of a room is the Host automatically; everyone who joins is a Participant. Permissions are checked on the server by `PermissionService` before any event is processed; disabled buttons in the UI are only a convenience.

## Architecture overview

A short summary; the full description with sequence diagrams is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

1. **Create / join over REST.** `POST /api/rooms` creates a room and returns a room code plus a signed JWT identity. Guests join with `POST /api/rooms/:id/guest`.
2. **Connect over WebSocket.** The client opens a Socket.IO connection (websocket-only) with the JWT in `auth.token`. The server verifies it and keeps `userId` / `roomId` in `socket.data`, never trusting them from payloads.
3. **Join the room.** The client emits `join_room`; the server adds the participant to the Socket.IO room, assigns the role, replies with a snapshot (participants, playback state, chat) and broadcasts `user_joined`.
4. **Control playback.** Host/Moderator emit `play`, `pause`, `seek` or `change_video`. Each handler runs **validate (Zod) → authorize (PermissionService) → mutate state → broadcast**. The server broadcasts `sync_state` with a version number and server time.
5. **Stay in sync.** Every client applies `sync_state` to its YouTube player using a server-clock offset (median of 5 `time_sync` samples), seeks if drift exceeds 1.0–1.5 s, and re-checks every 2 s. Player events are never sent back to the server, so there is no echo loop.
6. **Roles and approvals.** `assign_role`, `remove_participant` and `transfer_host` are Host-only and broadcast `role_assigned` / `participant_removed` / `host_transferred`. Participants use `request_action`; Host/Moderators answer with `resolve_request`, which runs the same service as a direct action.
7. **Scale out.** With `REDIS_URL` set, room state lives in Redis and the Socket.IO Redis adapter relays broadcasts between server instances.

## WebSocket events

`join_room`, `leave_room`, `play`, `pause`, `seek`, `change_video`, `request_sync`, `time_sync`, `assign_role`, `remove_participant`, `transfer_host`, `request_action`, `resolve_request`, `chat_message`, `reaction` (client → server) and `sync_state`, `user_joined`, `user_left`, `role_assigned`, `participant_removed`, `host_transferred`, `action_requested`, `request_resolved`, `chat_message`, `reaction`, `error_event` (server → client). Payloads and the permission matrix are specified in [docs/SPEC.md](docs/SPEC.md).

## Deployment

- **Backend:** Render Blueprint in [`render.yaml`](render.yaml) (build `npm install --include=dev && npm run build -w shared && npm run build -w server`, start `npm run start -w server`, health check `/health`).
- **Frontend:** Vercel (`client/vercel.json`) or Netlify (`client/public/_redirects`); set `VITE_SERVER_URL` to the Render URL.
- Set `CLIENT_URL` on the backend to the frontend URL. Step-by-step checklist: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Design decisions and trade-offs

- **Server-authoritative state:** the server owns playback state and timing, so late joiners and reconnecting clients always converge.
- **WebSocket-only transport:** no sticky sessions needed behind a load balancer; the trade-off is no HTTP long-polling fallback.
- **OOP structure:** `Room`, `Participant`, `RoomManager`, `PermissionService`, `PlaybackService`, `RoleService`, `RequestService` and per-feature handler classes keep domain logic free of socket code.
- **Render free tier** sleeps after inactivity and cannot serve 1,000+ users; use managed Redis and paid multi-instance hosting for that scale ([docs/LOADTEST.md](docs/LOADTEST.md)).

## Testing

`npm test` covers the permission matrix, room model, playback maths, REST API, socket flows (join, RBAC, playback, approvals, chat) and UI flows. See [docs/TESTING.md](docs/TESTING.md).
