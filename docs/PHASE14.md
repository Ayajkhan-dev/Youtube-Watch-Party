# Phase 14 - MongoDB Persistence + Authentication

Phase 14 adds the PDF's bonus persistence and optional account authentication without removing the Phase 12/13 guest flow.

## Persistence

- `MONGO_URI` enables MongoDB.
- `rooms` stores `roomId`, `creatorUserId`, `lastVideoId`, `createdAt`, and `lastActiveAt`.
- Room creation writes metadata immediately.
- `change_video` persistence is debounced for 5 seconds.
- When Redis/in-memory state is missing but Mongo has the room, the server rehydrates a paused room using `lastVideoId` and `creatorUserId` as the host.
- Empty-room cleanup updates `lastActiveAt`; Mongo metadata is retained so the room code can be rehydrated later.
- Mongo uses `maxPoolSize: 20`.

## Authentication

- `POST /api/auth/register` -> `{ email, password, name }`.
- `POST /api/auth/login` -> `{ email, password }`.
- Passwords are hashed with bcrypt cost 10.
- Account JWTs expire in 7 days and are marked with `authType=account`.
- `REQUIRE_AUTH=false` (default): guest create/join remains fully supported.
- `REQUIRE_AUTH=true`: room create requires an account token, `/guest` is disabled, and Socket.IO rejects guest tokens.

## Frontend

`/login` provides login/register UI. An account session is stored globally and reused for room creation and direct room links; existing room-scoped guest sessions remain compatible.

## Verification note

The implementation was syntax-checked locally. A full npm build and live MongoDB integration require installing the new `mongoose` and `bcrypt` dependencies and providing `MONGO_URI`. The execution environment used to prepare this phase had no npm registry DNS access, so those dependency-backed runtime checks could not be completed here.
