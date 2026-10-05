# Phase 15 - Testing, Security & Load-Test Verification

Phase 15 is the quality gate after Phase 14. The PDF requires remaining unit/integration tests, a security review, `npm audit`, edge-case checks, and a requirement matrix mapped to R1-R67. The Phase 15 done check is **all automated tests green** plus the **manual matrix completed**.

> Verification status is intentionally honest: automated/static checks are recorded below. Browser/device, Redis/Mongo, and 1000+ socket tests require a dependency-enabled runtime and real infrastructure; they are marked as manual/infra-pending rather than falsely marked green.

## 1. Automated test suite

### Server unit/integration coverage

- `PermissionService`: full role × action matrix.
- `Room`: live time, snapshots, host selection, transfer, bans.
- REST rooms: create, health, validation, room existence, guest tokens.
- Socket auth: missing/invalid/valid JWT.
- RBAC: participant/moderator negative tests, assign/remove/transfer, banned rejoin.
- Room lifecycle: join/leave/reconnect/duplicate-tab/host transfer/empty TTL.
- Playback: play/pause/seek/change-video, invalid payloads, late join, request sync, rate limit.
- Approval flow: request, approve/reject, expiry, stale requests, role-request rules, cleanup.
- Chat/reactions: role coverage, payload validation, history, XSS-safe text handling, rate limits.
- Redis store: store behavior and Redis integration test harness.
- Mongo rehydration: RoomManager fallback test.
- Auth config/token regression: `REQUIRE_AUTH` parsing and account-vs-guest token identity.
- Security regression: error sanitization, origin policy, centralized socket guard, no executable `dangerouslySetInnerHTML` usage.

### Client unit/UI coverage

- `syncMath`: median, clock offset, target time, apply/drift planning, formatting, YouTube errors.
- YouTube parser compatibility matrix for watch, youtu.be, shorts, embed, live, mobile, query params, and raw IDs.
- Existing room/player/chat/store/session UI tests remain part of the client suite.

## 2. Security review checklist

| Check | Result | Evidence |
|---|---|---|
| Helmet | PASS | `server/src/app.ts` |
| CORS restricted to configured origins | PASS | `CLIENT_ORIGINS` + WebSocket `allowRequest` |
| Strong production JWT secret required | PASS | production config rejects weak/dev secrets |
| JSON payload limit | PASS | `express.json({ limit: '10kb' })` |
| WebSocket message limit | PASS | `maxHttpBufferSize: 1e5` |
| Zod validation on client payloads | PASS | socket validation schemas + handler parsing |
| REST rate limiting | PASS | `/api` rate limiter |
| Socket event rate limiting | PASS | playback/request/chat/reaction limiters |
| Room ID taken from socket state after join | PASS | `guard.ts` |
| User ID taken from verified JWT | PASS | `socketAuth` + `guard.ts` |
| Frontend XSS via raw HTML | PASS | React text rendering; source regression test |
| Stack/internal error details returned to client | PASS | generic `INTERNAL` response |
| Secrets committed as real values | PASS | scan only finds example placeholders |
| Dependency audit | PASS (lockfile audit) | `npm audit --package-lock-only --offline` => 0 vulnerabilities |
| Memory cleanup | PASS by code review | WeakMap rate buckets; timers disposed; room/request cleanup |

### Security review notes

The code review specifically checked `PlaybackHandler`, `RoleHandler`, `RequestHandler`, `ChatHandler`, room lifecycle handling, HTTP errors, socket errors, JWT middleware, and validation schemas. Protected realtime actions remain behind the central `guard()` path. The server never trusts a post-join payload `roomId`/`userId` for authorization.

## 3. Edge-case matrix

| Scenario | Automated coverage | Manual/infrastructure check |
|---|---|---|
| Host refresh | PASS | — |
| Host disconnect >30s | PASS | — |
| Same user opens second tab | PASS | — |
| Invalid YouTube URL | PASS | — |
| Private/removed/non-embeddable video | Code path covered | Browser YouTube error test |
| Room full | PASS | — |
| Expired request | PASS | — |
| Network off/on | Code supports reconnect | Browser/network toggle |
| Slow 3G | — | DevTools throttling |
| Redis cross-instance pause sync | Existing integration harness | Real Redis + 2 server instances |
| Instance restart + Redis state recovery | Code/integration harness | Docker/Redis restart |
| Mongo rehydration after process restart | Unit fallback coverage | Real Mongo restart test |
| 1000+ socket load | Load-test script present | Run Artillery with Docker/infra |

## 4. Requirement traceability R1-R67

| ID | PDF requirement | Type | Verification in Phase 15 |
|---|---|---|---|
| R1 | Real-time sync: play/pause, seek, current video | Must | Automated socket tests; 3-browser manual |
| R2 | Room-based model, unique link/code | Must | REST/socket tests; link+code manual |
| R3 | YouTube integration (sync) | Must | Client/player tests; browser manual |
| R4 | WebSockets real-time | Must | Socket tests; DevTools WS manual |
| R5 | Role-based access, host assigns | Must | RBAC tests |
| R6 | Host = room creator, full control | Must | Room/RBAC tests |
| R7 | Moderator playback control | Must | Playback socket tests |
| R8 | Participant default/watch-only | Must | Join/RBAC tests |
| R9 | Viewer role | Must | Permission tests |
| R10 | Host promotes participant to Moderator | Must | RBAC + UI tests |
| R11 | Host assign role | Must | RBAC tests |
| R12 | Host removes participant | Must | Remove/ban integration tests |
| R13 | Transfer host | Opt | Integration tests |
| R14 | Backend permission validation | Must | Negative RBAC tests |
| R15 | Role updates broadcast/UI controls disabled | Must | Socket/UI tests |
| R16 | React/Next/Vue frontend | Must | Build/source verification |
| R17 | Node + Express backend | Must | Build/source verification |
| R18 | WebSocket server | Must | Socket.IO integration tests |
| R19 | Database optional MVP | Opt | Phase 13/14 store coverage |
| R20 | YouTube IFrame API | Must | Player tests/browser |
| R21 | Chosen stack with WebSockets | Must | Source/docs |
| R22 | `join_room` contract | Must | Room socket tests |
| R23 | `leave_room` contract | Must | Room socket tests |
| R24 | `sync_state` contract | Must | Playback tests |
| R25 | `play` contract | Must | Playback tests |
| R26 | `pause` contract | Must | Playback tests |
| R27 | `seek` contract | Must | Playback + client sync tests |
| R28 | `change_video` contract | Must | Playback + parser tests |
| R29 | `assign_role` contract | Must | RBAC tests |
| R30 | `remove_participant` contract | Must | RBAC tests |
| R31 | `user_joined` payload | Must | Room payload assertions |
| R32 | `user_left` payload | Must | Room lifecycle assertions |
| R33 | `role_assigned` payload | Must | RBAC assertions |
| R34 | `participant_removed` payload | Must | Remove assertions |
| R35 | Creator Host; others cannot perform host actions | Must | Negative RBAC tests |
| R36 | Join via link/code; default Participant | Must | REST + room tests |
| R37 | Participants list with roles | Must | UI/socket tests |
| R38 | Host role assignment UI | Must | UI test/manual |
| R39 | Host removal UI | Must | UI test/manual |
| R40 | Playback controls Host/Mod only | Must | UI + server RBAC |
| R41 | Play/pause sync | Must | Playback integration + manual |
| R42 | Seek sync | Must | Playback/sync math + manual |
| R43 | Change video sync | Must | Playback/parser + manual |
| R44 | Basic chat | Bonus | Chat integration tests |
| R45 | Participant approval for playback + role request | Must | Request integration tests |
| R46 | Deployment on Render/Vercel/etc. | Must | Deployment docs; final infra manual |
| R47 | Public fully working URL | Must | Final production manual |
| R48 | Core features production | Must | Final production smoke test |
| R49 | Live URL in README | Must | README reviewed; final URL still deployment-dependent |
| R50 | Explain libraries | Must | Project docs/viva notes |
| R51 | Explain WebSocket sync | Must | Architecture/docs |
| R52 | Explain backend role logic | Must | RBAC tests/docs |
| R53 | Explain deployment/env/limits | Must | Deployment docs |
| R54 | Explain trade-offs/issues | Must | README/docs |
| R55 | Runs locally + deployed | Must | Local test infrastructure; deployed run is Phase 16 |
| R56 | README setup + live URL | Must | Setup present; URL finalized in Phase 16/17 |
| R57 | Architecture overview | Must | Existing architecture docs |
| R58 | Code walkthrough readiness | Must | Existing source comments/docs |
| R59 | Demo video/screenshots | Opt | Manual/demo deliverable |
| R60 | OOP Room/Participant/handlers | Bonus | Unit/source review |
| R61 | Scalability 1000+/100+/50+, horizontal scale | Bonus | Docker/load-test artifacts; real run pending |
| R62 | Persistent rooms | Bonus | Mongo rehydrate tests/manual restart |
| R63 | Authentication | Bonus | Auth/token tests; Mongo auth manual |
| R64 | Text chat | Bonus | Chat tests |
| R65 | Emoji reactions | Bonus | Reaction tests |
| R66 | Transfer host | Bonus | Integration tests |
| R67 | Reference resources | Info | Included in project plan/docs |

## 5. Commands for a dependency-enabled machine

```bash
npm ci
npm run build
npm test
npm run lint
npm audit
```

For Phase 13 infrastructure/load verification:

```bash
docker compose up --build --scale server=3
# In another shell, run the Artillery scenario from loadtest/artillery.yml
```

Record the actual p95/CPU/RAM output in `docs/LOADTEST.md` before claiming the 1000+ concurrent-socket target as verified.

## 6. Current Phase 15 verification outcome

- Lockfile security audit: **PASS — 0 reported vulnerabilities** using offline `npm audit --package-lock-only`.
- Static/source security checks: **PASS**.
- Existing unit/integration test coverage: **expanded for Phase 15**.
- Full dependency-backed test/build run: **BLOCKED in the current environment because the npm registry was not reachable / packages were not cached**.
- Browser/real-network/Mongo/Redis/1000-socket checks: **not claimable from this environment**.
