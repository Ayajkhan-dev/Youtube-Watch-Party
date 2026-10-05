# SPEC: YouTube Watch Party (source: full_stack_task_1.pdf)

Har phase ke saath ye file AI ko do. Full detail: Watch_Party_Complete_Build_Plan.pdf

## Core requirements
1. Real-time sync: play/pause, seek position, current video sab ko same
2. Room model: unique link/code se create/join
3. YouTube IFrame API se synced playback
4. WebSockets (Socket.IO) real-time communication
5. Role-based access; Host roles assign karta hai

## Roles
| Action | Host | Moderator | Participant | Viewer |
|---|---|---|---|---|
| play/pause/seek/change_video | yes | yes | no (request) | no (request) |
| resolve_request (approve/reject) | yes | yes | no | no |
| assign_role / remove_participant / transfer_host | yes | no | no | no |
| request_action (playback ya become_moderator), chat, reaction | yes | yes | yes | yes |
| resolve role request (become_moderator) | yes | no | no | no |

Rules: Host role sirf transfer_host se badalta hai; Host khud ko remove nahi kar sakta; Moderator host-only actions nahi kar sakta;
server har event par permission check karta hai (frontend par bharosa nahi).

## PDF ke 13 events (exact naam, payload)
- join_room C->S {roomId, username} (creator = Host, baaki Participant)
- leave_room C->S {roomId}
- sync_state S->C {playState, currentTime, videoId} (+ updatedAt, serverTime, version)
- play C->S {} (+ optional time), pause C->S {} (+ optional time), seek C->S {time}, change_video C->S {videoId}: Host/Moderator only
- assign_role C->S {userId, role}: Host only
- remove_participant C->S {userId}: Host only
- user_joined S->C {username, userId, role, participants}
- user_left S->C {username, userId, participants}
- role_assigned S->C {userId, username, role, participants}
- participant_removed S->C {userId, participants}

Extra: request_sync, time_sync, transfer_host, host_transferred, request_action, action_requested, resolve_request,
request_resolved, chat_message, reaction, error_event, removed.

## Functional requirements
- Room create (creator Host, uske actions koi aur nahi kar sakta); link/code se join (default Participant)
- Participants list with roles; Host assign role + remove participant
- Playback controls sirf Host/Moderator; play/pause, seek, change video (URL paste) sync
- Basic chat (bonus)
- Participant ko change ke liye admin/mod se approval request karni hogi; approve hone par hi change lagu
  (FINAL: playback requests play/pause/seek/change_video = Host ya Moderator approve; role request become_moderator = sirf Host approve)

## Decisions
- Room create REST se (POST /api/rooms); join_room par creatorId match = Host
- Guest identity JWT (localStorage), refresh par role bachta hai
- FINAL: Moderator roles/participants manage NAHI karta (Host ke actions koi aur nahi kar sakta)
- FINAL: DB optional; REDIS_URL/MONGO_URI na ho to in-memory store. Set ho to Redis (scale) + MongoDB (persistent rooms)
- YouTube controls:0 + custom controls; emit kabhi onStateChange se nahi
- Host disconnect: 30s grace, phir auto-transfer; removed user banned
- Server stateless; RoomStore interface (memory -> Redis); MongoDB persistent rooms

## Deployment (PDF)
Render/Vercel/Netlify/Railway par public URL; core features production mein chalein; live URL README mein.

## Deliverables
Working app (local + deployed), README (setup + live URL), architecture overview, code walkthrough readiness, demo (optional).

## Bonus
OOP structure, scalability (1000+ users, 100+ rooms, 50+/room; Redis adapter, load balancer, pooling), persistent rooms,
auth, chat, reactions, transfer host.

## Phases
0 prep | 1 scaffolding | 2 server foundation | 3 domain OOP | 4 join/leave | 5 RBAC | 6 playback sync | 7 approval flow |
8 frontend foundation | 9 YouTube sync | 10 roles UI | 11 chat/reactions | 12 MVP deploy | 13 Redis scale | 14 Mongo+auth |
15 testing | 16 final deploy | 17 docs/viva

## Status
- Phase 1 done (scaffolding, ping/pong verified)
- Phase 2 done (REST rooms API, JWT guest identity, socket auth middleware, 14 tests pass)
- Phase 0: SPEC.md + AGENTS.md done; 3 decisions final (mentor ka intezaar nahi); GitHub repo/accounts user ko karne hain
