// pino: structured logging. Test mein chup rahta hai, taaki output saaf rahe.
import pino from 'pino';
import { config } from './config.js';

export const logger = pino({ level: config.NODE_ENV === 'test' ? 'silent' : 'info' });
