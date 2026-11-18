import express from 'express';
import cors from 'cors';
import { JarvisAI } from './jarvis.js';
export function createApp(jarvis = new JarvisAI(), env: NodeJS.ProcessEnv = process.env) {
  const app = express();
  const origins = new Set([env.CLIENT_ORIGIN || 'http://localhost:5173', 'http://127.0.0.1:5173']);
  app.use((req, res, next) => {
    if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(req.get('host') || '')) { res.status(403).json({ error: 'Local host required.' }); return; }
    if (['POST', 'PUT', 'DELETE'].includes(req.method) && req.path !== '/api/webhook/notify' && req.get('origin') && !origins.has(req.get('origin')!)) { res.status(403).json({ error: 'Origin refused.' }); return; }
    next();
  });
  app.use(cors({ origin: (origin, callback) => callback(null, !origin || origins.has(origin)) }));
  app.use(express.json({ limit: '16kb' }));
  app.get('/api/health', (_req, res) => { res.json(jarvis.health()); });
  app.get('/api/workspace', (_req, res) => { res.json(jarvis.workspace()); });
  app.put('/api/settings', (req, res) => { try { res.json(jarvis.updateSettings(req.body)); } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid settings' }); } });
  // Serialize chat turns to keep the conversation and proposed tool groups coherent.
  let queue = Promise.resolve();
  app.post('/api/chat', (req, res) => {
    const message = req.body?.message;
    if (typeof message !== 'string' || !message.trim() || message.length > 4000) { res.status(400).json({ error: 'Message must contain 1 to 4000 characters.' }); return; }
    queue = queue.then(async () => {
      try {
        await jarvis.saveMessage(message.trim(), 'user');
        const result = await jarvis.processMessage(message.trim());
        await jarvis.saveMessage(result.message, 'jarvis'); res.json(result);
      } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : 'Assistant unavailable.' }); }
    }).catch(() => { if (!res.headersSent) res.status(503).json({ error: 'Assistant unavailable.' }); });
  });
  app.get('/api/messages', async (req, res) => {
    const limit = req.query.limit === undefined ? 50 : Number(req.query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) { res.status(400).json({ error: 'Limit must be between 1 and 100.' }); return; }
    try { res.json(await jarvis.getMessages(limit)); } catch { res.status(503).json({ error: 'Storage unavailable.' }); }
  });
  app.get('/api/actions', (_req, res) => { res.json(jarvis.listActions()); });
  app.post('/api/actions/:id/confirm', async (req, res) => { try { res.json(await jarvis.confirm(req.params.id)); } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Action unavailable.' }); } });
  app.post('/api/actions/:id/cancel', (req, res) => { try { jarvis.cancel(req.params.id); res.json({ success: true }); } catch { res.status(400).json({ error: 'Action unavailable.' }); } });
  app.post('/api/webhook/notify', async (req, res) => {
    if (!env.WEBHOOK_TOKEN) { res.status(503).json({ error: 'Notification webhook is not configured.' }); return; }
    if (req.get('Authorization') !== `Bearer ${env.WEBHOOK_TOKEN}`) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const event = req.body?.event;
    if (typeof event !== 'string' || !event.trim() || event.length > 200) { res.status(400).json({ error: 'Invalid event.' }); return; }
    try { await jarvis.saveMessage(`Notification reçue : ${event.trim()}`, 'jarvis'); res.json({ success: true }); } catch { res.status(503).json({ error: 'Storage unavailable.' }); }
  });
  return app;
}
