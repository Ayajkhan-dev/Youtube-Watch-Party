// 6-character room code. O/0/I/1 jaise confusing characters nahi rakhe, taaki code bolke bataya ja sake.
import { customAlphabet } from 'nanoid';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const generateRoomCode = customAlphabet(ALPHABET, 6);
export const ROOM_CODE_REGEX = /^[A-HJ-NP-Z2-9]{6}$/;
