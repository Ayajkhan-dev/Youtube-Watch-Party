# Phase 13 Load Test

## Target

The build plan asks for:

- 100 rooms with about 10 users per room
- one hot room with about 60 users
- 1,000+ concurrent Socket.IO connections
- playback activity from a host every 10 seconds
- connect/event p95 plus CPU/RAM observations
- honest limits: do not claim 1,000-user production capacity on Render free tier

## Run locally

```powershell
docker compose up --build --scale server=3
$env:TARGET_URL="http://localhost"
npx artillery run loadtest/artillery.yml
```

Linux/macOS:

```bash
docker compose up --build --scale server=3
TARGET_URL=http://localhost npx artillery run loadtest/artillery.yml
```

The processor seeds 100 rooms and uses the first user assigned to a room as that room's host; later users receive guest tokens.

## Cross-instance smoke test

1. Connect the host through server replica #1.
2. Connect a participant through replica #2.
3. Pause from the host.
4. Confirm the participant receives `sync_state`.
5. Stop one server container.
6. Reconnect clients.
7. Confirm the room state remains available from Redis.

## Record

Capture:

- connections attempted / established
- connect latency
- event round-trip p50 / p95 / p99
- Socket.IO errors/timeouts
- `docker stats` for Nginx, Redis and each server replica

The Artillery file is a scenario template for the requested scale target. The actual numeric result must be recorded only after running it on the local Docker environment; it is not fabricated in this repository.

## Artillery authentication note

The application's real Socket.IO auth still uses the JWT in the Socket.IO `auth` object. For the local scalability lab only, `LOADTEST_QUERY_AUTH=true` enables a fixed `LOADTEST_AUTH_TOKEN` query token and derives a unique test identity from each Socket.IO `socket.id`. Keep this disabled in production. This is a load-test harness only; it does not add login/authentication features.

The built-in Artillery Socket.IO engine supports WebSocket-only transport and query parameters, but its connection handshake is established before processor hooks can inject a per-VU dynamic query token. For that reason the Phase 13 load test intentionally uses the fixed local load-test token rather than changing normal JWT auth behavior.

For the PDF's "host events every 10 seconds" measurement, run the load test while a real Host client is connected to a test room and sends play/pause every 10 seconds. Record the resulting Socket.IO p95 plus CPU/RAM in this document after the run; no numeric benchmark is claimed until an actual Docker run is completed.

## Phase 15 rerun status

The Phase 15 plan asks for the Phase 13 load test to be rerun and the measured result saved. This repository records the procedure and does **not** invent benchmark numbers. The current preparation environment could not install the project dependencies because the npm registry was unavailable, so no 1000-socket runtime result is claimed here.
