// Token bucket rate limiter: `capacity` events ek `windowMs` mein. Zyada hone par tryTake() false deta hai.
// Har socket ka apna bucket (RateLimiter WeakMap mein socket -> bucket rakhta hai, memory leak nahi).
import type { AppSocket } from './types.js';

export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly capacity: number,
    private readonly windowMs: number,
    now: number = Date.now(),
  ) {
    this.tokens = capacity;
    this.last = now;
  }

  tryTake(now: number = Date.now()): boolean {
    const refill = ((now - this.last) / this.windowMs) * this.capacity;
    this.tokens = Math.min(this.capacity, this.tokens + refill);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

export class RateLimiter {
  private readonly buckets = new WeakMap<AppSocket, TokenBucket>();

  constructor(
    private readonly capacity: number,
    private readonly windowMs: number,
  ) {}

  allow(socket: AppSocket, now: number = Date.now()): boolean {
    let b = this.buckets.get(socket);
    if (!b) {
      b = new TokenBucket(this.capacity, this.windowMs, now);
      this.buckets.set(socket, b);
    }
    return b.tryTake(now);
  }
}
