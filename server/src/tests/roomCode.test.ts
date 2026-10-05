import { describe, it, expect } from 'vitest';
import { generateRoomCode, ROOM_CODE_REGEX } from '../utils/roomCode.js';

describe('room code', () => {
  it('6 chars ka hota hai aur confusing characters nahi hote', () => {
    for (let i = 0; i < 500; i++) {
      const code = generateRoomCode();
      expect(code).toMatch(ROOM_CODE_REGEX);
      expect(code).not.toMatch(/[O0I1]/);
    }
  });
  it('codes unique nikalte hain', () => {
    const set = new Set(Array.from({ length: 1000 }, () => generateRoomCode()));
    expect(set.size).toBeGreaterThan(995);
  });
});
