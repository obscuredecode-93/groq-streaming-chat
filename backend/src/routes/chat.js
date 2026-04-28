import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import Groq from 'groq-sdk';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/index.js';

const router = new Hono();
const groq = new Groq({ apiKey: config.groqApiKey });

// sessionId -> { messages: Array, createdAt: Date, lastAccess: Date }
const sessions = new Map();

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(fn, maxRetries = config.maxRetries) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        console.warn(`[Retry] Attempt ${attempt + 1} failed: ${err.message}. Retrying in ${delay}ms…`);
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

// ── Routes ───────────────────────────────────────────────────────────────────

// POST /chat/session — create a new session
router.post('/session', (c) => {
  const id = uuidv4();
  sessions.set(id, { messages: [], createdAt: new Date(), lastAccess: new Date() });
  return c.json({ sessionId: id, message: 'Session created successfully.' });
});

// GET /chat/session/:id — retrieve conversation history
router.get('/session/:id', (c) => {
  const session = sessions.get(c.req.param('id'));
  if (!session) return c.json({ error: 'Session not found.' }, 404);
  session.lastAccess = new Date();
  return c.json({
    sessionId: c.req.param('id'),
    messages: session.messages,
    createdAt: session.createdAt,
    lastAccess: session.lastAccess,
  });
});

// DELETE /chat/session/:id — clear a session
router.delete('/session/:id', (c) => {
  const id = c.req.param('id');
  if (!sessions.has(id)) return c.json({ error: 'Session not found.' }, 404);
  sessions.delete(id);
  return c.json({ message: `Session ${id} deleted.` });
});

// POST /chat — stream a response token by token via SSE
router.post('/', async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Request body must be valid JSON.' }, 400);
  }

  const { message, sessionId } = body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return c.json({ error: 'Field "message" is required and must be a non-empty string.' }, 400);
  }

  let session = null;
  let messages = [];

  if (sessionId) {
    session = sessions.get(sessionId);
    if (!session) {
      return c.json(
        { error: `Session "${sessionId}" not found. Create one with POST /chat/session.` },
        404
      );
    }
    session.lastAccess = new Date();
    messages = session.messages;
  }

  messages.push({ role: 'user', content: message.trim() });

  return streamSSE(c, async (stream) => {
    let fullContent = '';
    try {
      const groqStream = await withRetry(() =>
        groq.chat.completions.create({
          model: config.model,
          messages,
          max_tokens: config.maxTokens,
          stream: true,
        })
      );

      for await (const chunk of groqStream) {
        const token = chunk.choices[0]?.delta?.content || '';
        if (token) {
          fullContent += token;
          await stream.writeSSE({ data: JSON.stringify({ token }) });
        }
      }

      if (session) {
        session.messages.push({ role: 'assistant', content: fullContent });
      } else {
        messages.pop(); // stateless — discard user turn
      }

      await stream.writeSSE({ data: '[DONE]' });
    } catch (err) {
      console.error('[Stream Error]', err.message);
      if (session && session.messages.at(-1)?.role === 'user') session.messages.pop();
      await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: err.message }) });
    }
  });
});

export { router as chatRouter };
