import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { JarvisAI } from './jarvis.js';
const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
const env = { ...process.env, JARVIS_DATA_DIR: process.env.JARVIS_DATA_DIR || fileURLToPath(new URL('../.data/', import.meta.url)) };
createApp(new JarvisAI(env), env).listen(port, '127.0.0.1', () => console.log(`Jarvis local API: http://127.0.0.1:${port}`));
