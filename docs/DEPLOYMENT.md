# Deployment guide (Phase 12: MVP deploy)

Backend = **Render** (Express + Socket.IO, long-running, WebSocket support). Frontend = **Vercel** (static Vite build).
Vercel serverless hai, isliye WebSocket server wahan nahi chalta. MVP mein DB/Redis nahi chahiye (in-memory store).

> Free tier: Render service 15 min idle ke baad sleep karti hai. Pehla request 30-60 sec le sakta hai, aur restart par saare rooms
> (memory mein hain) chale jaate hain. Persistent rooms Phase 14 mein aayenge.

## 0. Pehle local mein production-jaisa check
```bash
npm install --include=dev && npm run build            # teeno packages build
NODE_ENV=production PORT=5555 CLIENT_URL=http://localhost:5173 \
  JWT_SECRET=$(openssl rand -hex 32) npm run start -w server
curl localhost:5555/health                       # {"ok":true,...}
```

## 1. GitHub
Repo push karo (`main` branch). `.env` kabhi commit mat karo (`.gitignore` mein hai).

## 2. Render (backend)
**Option A: Blueprint (aasan):** Dashboard -> New -> **Blueprint** -> repo chuno. `render.yaml` apne aap padh liya jaata hai.
**Option B: manual:** New -> **Web Service** -> repo, phir:

| Field | Value |
|---|---|
| Runtime | Node |
| Region | Singapore |
| Root Directory | *(khali = repo root)* |
| Build Command | `npm install --include=dev && npm run build -w shared && npm run build -w server` |
| Start Command | `npm run start -w server` |
| Health Check Path | `/health` |
| Plan | Free |

`--include=dev` zaroori hai: Render build mein `NODE_ENV=production` hota hai aur bina isse `typescript` install nahi hota (build fail).

**Environment variables (Render):**

| Key | Value | Note |
|---|---|---|
| `NODE_ENV` | `production` | |
| `NODE_VERSION` | `20` | |
| `JWT_SECRET` | lamba random (`openssl rand -hex 32`) | Blueprint mein auto-generate. Weak/dev secret production mein reject hota hai (server start nahi hoga). |
| `CLIENT_URL` | `https://<your-app>.vercel.app` | **Trailing slash nahi.** Comma se kai origins chalte hain (jaise preview URL). Production mein ye set karna zaroori hai. |
| `PORT` | *(Render khud deta hai)* | Server `process.env.PORT` par listen karta hai. Set mat karo. |

Deploy ke baad `https://<render-app>.onrender.com/health` kholo: `{"ok":true,...}` aana chahiye. Ye URL note karo.

## 3. Vercel (frontend)
Dashboard -> Add New -> Project -> repo import. Settings:

| Field | Value |
|---|---|
| Framework | Vite |
| **Root Directory** | `client` |
| Build / Install / Output | `client/vercel.json` se: install `cd .. && npm install --include=dev`, build `cd .. && npm run build -w shared && npm run build -w client`, output `dist` |
| Env var `VITE_SERVER_URL` | `https://<render-app>.onrender.com` (https, trailing slash nahi) |

Root Directory `client` hone par bhi "Include source files outside of the Root Directory" **ON** rehna chahiye (default ON), kyunki `shared/` package repo root mein hai.
`client/vercel.json` mein SPA rewrite hai: `/room/ABC123` refresh par 404 nahi aata. (Netlify ke liye `client/public/_redirects` hai.)

> `VITE_*` variables **build time** par bake hote hain. Value badalne ke baad Vercel par **Redeploy** karo.

## 4. CORS ka loop band karo
Vercel URL milne ke baad Render mein `CLIENT_URL` ko wahi URL do -> Render redeploy hota hai.
(Pehli baar Render ko placeholder se start karna ho to `CLIENT_URL=https://placeholder.vercel.app` rakho, baad mein badlo.)

## 5. Verify checklist (2 alag devices / networks)
- [ ] Frontend URL khulta hai; `https://<vercel>/room/ZZZZZZ` refresh par app dikhta hai ("Room not found"), Vercel 404 nahi.
- [ ] Browser DevTools -> Network -> WS: `wss://<render>/socket.io/...` **101 Switching Protocols**, koi CORS / mixed-content error nahi.
- [ ] Device A: Create room. Device B: link se join + code se join. Participants list roles ke saath.
- [ ] Host: play / pause / seek / change video: B par sync. B (participant) ke controls disabled.
- [ ] Host: B ko Moderator banao -> B ke controls turant enable; B ka play kaam kare.
- [ ] Participant request -> Host/Mod approve -> sab sync. "Request moderator role" -> sirf Host approve.
- [ ] Remove participant (B ko "You were removed"), dobara join par "can't join".
- [ ] Transfer host. Chat + reactions. Refresh par role same.

## 6. Troubleshooting
| Symptom | Karan / fix |
|---|---|
| Frontend par "Server tak nahi pahunch paaye" | Render sleep se uth raha hai (30-60s) ya `VITE_SERVER_URL` galat. `/health` khol ke wake karo. |
| Console: CORS error | `CLIENT_URL` Vercel URL se match nahi karta (http vs https, trailing slash, galat subdomain). Render env sudharo, redeploy. |
| Socket connect hi nahi (production) | Server production mein WebSocket par bhi Origin check karta hai: `CLIENT_URL` mein exact frontend origin hona chahiye. |
| Mixed content blocked | `VITE_SERVER_URL` `https://` hona chahiye (http nahi). |
| `/room/ABC` refresh par 404 | `client/vercel.json` rewrite deploy nahi hua (Root Directory `client` hai?). |
| Render build: `tsc: not found` | Build Command mein `--include=dev` missing. |
| Server start hi nahi hota | Render logs: `JWT_SECRET` weak/missing ya `CLIENT_URL` missing (production check). |
| Sab users ko 429 (rate limit) | Proxy ke peeche trust proxy zaroori hai: production mein default `TRUST_PROXY=1`. |
| Rooms gayab ho gaye | Free tier restart/sleep: in-memory store. Persistence: Phase 14. |

Demo se pehle: URL kholke server wake karo, ek test room banao, backup ke liye screen recording rakho.
Optional: UptimeRobot se `/health` har 5 min ping (sleep rokta hai).
