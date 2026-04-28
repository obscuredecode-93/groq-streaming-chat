import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/index.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import { chatRouter } from './routes/chat.js';
import { charactersRouter } from './routes/characters.js';
import { characterChatRouter } from './routes/characterChat.js';
import { aiRouter } from './routes/ai.js';

const app = new Hono();

app.use('*', errorHandler());
app.use('/chat/*', rateLimiter());
app.use('/chat', rateLimiter());
app.use('/ai/*', rateLimiter());

app.get('/health', (c) =>
  c.json({
    status: 'ok',
    model: config.model,
    maxTokens: config.maxTokens,
    timestamp: new Date().toISOString(),
  })
);

// AI generation helpers
app.route('/ai', aiRouter);

// Character CRUD
app.route('/characters', charactersRouter);

// General session-based chat — mount first so /chat/session beats /chat/:characterId
app.route('/chat', chatRouter);

// Character-specific streaming chat
app.route('/chat', characterChatRouter);

// Serve frontend — absolute path so this works regardless of CWD
const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendPath = join(__dirname, '../../frontend');
app.use('/*', serveStatic({ root: frontendPath }));
app.get('/', serveStatic({ path: join(frontendPath, 'index.html') }));

app.notFound((c) => c.json({ error: 'Route not found.' }, 404));

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Server:   http://localhost:${info.port}`);
  console.log(`Frontend: http://localhost:${info.port}`);
  console.log(`Model:    ${config.model} | Max tokens: ${config.maxTokens}`);
});
