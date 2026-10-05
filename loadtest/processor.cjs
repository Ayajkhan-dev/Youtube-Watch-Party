const rooms = [];
let seedPromise;

async function seedRooms(target) {
  const base = target.replace(/\/+$/, '');
  for (let i = 0; i < 100; i += 1) {
    const username = `LoadSeed-${i}`;
    const res = await fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    if (!res.ok) throw new Error(`room seed failed: ${res.status}`);
    const data = await res.json();
    rooms.push({ roomId: data.roomId });
  }
}

async function ensureSeed(context) {
  if (!seedPromise) seedPromise = seedRooms(context.config.target);
  await seedPromise;
}

function indexFor(context) {
  const id = String(context.vars.$uuid || Math.random());
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return hash % rooms.length;
}

function setUser(context, room) {
  const uuid = String(context.vars.$uuid || Date.now());
  context.vars.roomId = room.roomId;
  context.vars.username = `LoadUser-${uuid.slice(0, 12)}`;
}

async function prepareUser(context) {
  await ensureSeed(context);
  setUser(context, rooms[indexFor(context)]);
}

async function prepareHotRoomUser(context) {
  await ensureSeed(context);
  // Room 0 receives the hot-room VUs. The dedicated host-event smoke test is documented in docs/LOADTEST.md.
  setUser(context, rooms[0]);
}

module.exports = { prepareUser, prepareHotRoomUser };
