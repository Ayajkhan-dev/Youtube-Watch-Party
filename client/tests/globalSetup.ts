// UI tests ke liye ek hi asli server process (server/src/index.ts, port 4517); saare test files isse share karte hain.
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

const PORT = 4517;
let server: ChildProcess | undefined;

export async function setup() {
  server = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: path.resolve(__dirname, '../../server'),
    env: {
      ...process.env,
      PORT: String(PORT),
      JWT_SECRET: 'ui-test-secret-ui-test-secret',
      CLIENT_URL: 'http://localhost:5173',
      NODE_ENV: 'test',
      GRACE_PERIOD_MS: '300',
      REST_RATE_LIMIT_PER_MIN: '100000',
    },
    stdio: 'ignore',
    detached: true, // own process group, so teardown can stop npx AND the tsx/node children
  });
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) return;
    } catch {
      /* abhi start ho raha hai */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('UI test server failed to start');
}

export async function teardown() {
  // Kill the whole process group; killing only the npx wrapper leaves the real server running between test runs.
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      server.kill('SIGTERM');
    }
  }
}
