import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import Groq from 'groq-sdk';
import { config } from '../config/index.js';
import { characters } from './characters.js';

const router = new Hono();
const groq = new Groq({ apiKey: config.groqApiKey });

// characterId -> messages[] (user/assistant turns; system prompt injected at request time)
const chatHistories = new Map();

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function withRetry(fn, maxRetries = config.maxRetries) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try { return await fn(); }
    catch (err) {
      lastError = err;
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`[Retry] attempt ${attempt + 1}: ${err.message}. Retrying in ${delay}ms…`);
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

// GET /chat/:characterId/history
router.get('/:characterId/history', (c) => {
  const { characterId } = c.req.param();
  const messages = chatHistories.get(characterId) || [];
  return c.json({ characterId, messages });
});

// DELETE /chat/:characterId/history
router.delete('/:characterId/history', (c) => {
  const { characterId } = c.req.param();
  chatHistories.delete(characterId);
  return c.json({ message: `History for ${characterId} cleared.` });
});

// POST /chat/:characterId — stream a character response
router.post('/:characterId', async (c) => {
  const { characterId } = c.req.param();

  const character = characters.get(characterId);
  if (!character) return c.json({ error: `Character "${characterId}" not found.` }, 404);

  let body;
  try { body = await c.req.json(); }
  catch { return c.json({ error: 'Request body must be valid JSON.' }, 400); }

  const { message } = body;
  if (!message || typeof message !== 'string' || !message.trim()) {
    return c.json({ error: 'Field "message" is required and must be a non-empty string.' }, 400);
  }

  // Seed history with greeting on the very first turn
  if (!chatHistories.has(characterId)) {
    chatHistories.set(characterId, [
      { role: 'assistant', content: character.greeting, timestamp: new Date().toISOString() },
    ]);
  }

  const history = chatHistories.get(characterId);
  history.push({ role: 'user', content: message.trim(), timestamp: new Date().toISOString() });

  const messages = [
    { role: 'system', content: character.personality },
    ...history,
  ];

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

      history.push({ role: 'assistant', content: fullContent, timestamp: new Date().toISOString() });
      await stream.writeSSE({ data: '[DONE]' });
    } catch (err) {
      console.error('[Character Stream Error]', err.message);
      if (history.at(-1)?.role === 'user') history.pop();
      await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: err.message }) });
    }
  });
});

export { router as characterChatRouter };
