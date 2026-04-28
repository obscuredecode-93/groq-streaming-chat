import { Hono } from 'hono';
import Groq from 'groq-sdk';
import { config } from '../config/index.js';

const router = new Hono();
const groq = new Groq({ apiKey: config.groqApiKey });

async function jsonCompletion(messages, maxTokens = 900) {
  const completion = await groq.chat.completions.create({
    model: config.model,
    messages,
    response_format: { type: 'json_object' },
    max_tokens: maxTokens,
    temperature: 0.9,
  });
  const text = completion.choices[0].message.content;
  // Strip markdown code fences if the model wraps the JSON
  const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(clean);
}

// POST /ai/generate-character  { name } → { description, personality, greeting }
router.post('/generate-character', async (c) => {
  let body;
  try { body = await c.req.json(); }
  catch { return c.json({ error: 'Invalid JSON.' }, 400); }

  const name = body.name?.trim();
  if (!name) return c.json({ error: 'name is required.' }, 400);

  try {
    const result = await jsonCompletion([
      {
        role: 'system',
        content: 'You are a creative character designer for an AI chat platform. Always respond with a single valid JSON object — no extra text.',
      },
      {
        role: 'user',
        content: `Design a character profile for an AI named "${name}". Return a JSON object with exactly these three string fields:
- "description": A compelling 1–2 sentence bio shown on a gallery card (max 120 characters).
- "personality": A detailed system prompt (180–280 words) that defines how this character speaks, thinks, behaves, and what makes them unique. Write it in second-person ("You are…").
- "greeting": An in-character opening message (2–4 sentences) sent when a new conversation begins.`,
      },
    ]);

    return c.json({
      description: String(result.description || ''),
      personality:  String(result.personality  || ''),
      greeting:     String(result.greeting     || ''),
    });
  } catch (err) {
    console.error('[AI generate-character]', err.message);
    return c.json({ error: err.message }, 500);
  }
});

// POST /ai/suggest-character  {} → { name, description, personality, greeting }
router.post('/suggest-character', async (c) => {
  try {
    const result = await jsonCompletion([
      {
        role: 'system',
        content: 'You are a creative character designer for an AI chat platform. Always respond with a single valid JSON object — no extra text.',
      },
      {
        role: 'user',
        content: `Invent a unique, surprising, and interesting character concept for an AI chat platform. Avoid generic assistants or simple archetypes. Think unexpected combinations — a rogue cartographer from a dystopian future, a retired sea-monster, a jazz musician who solves crimes. Return a JSON object with exactly these four string fields:
- "name": The character's name (1–3 words).
- "description": A compelling 1–2 sentence bio for a gallery card (max 120 characters).
- "personality": A detailed system prompt (180–280 words) in second-person ("You are…") defining voice, quirks, knowledge, and behavior.
- "greeting": An in-character opening message (2–4 sentences).`,
      },
    ]);

    return c.json({
      name:         String(result.name        || 'Mystery Character'),
      description:  String(result.description || ''),
      personality:  String(result.personality  || ''),
      greeting:     String(result.greeting     || ''),
    });
  } catch (err) {
    console.error('[AI suggest-character]', err.message);
    return c.json({ error: err.message }, 500);
  }
});

// POST /ai/generate-greeting  { name, personality } → { greeting }
router.post('/generate-greeting', async (c) => {
  let body;
  try { body = await c.req.json(); }
  catch { return c.json({ error: 'Invalid JSON.' }, 400); }

  const name        = body.name?.trim();
  const personality = body.personality?.trim();
  if (!name || !personality) return c.json({ error: 'name and personality are required.' }, 400);

  try {
    const result = await jsonCompletion([
      {
        role: 'system',
        content: 'You are a creative character designer for an AI chat platform. Always respond with a single valid JSON object — no extra text.',
      },
      {
        role: 'user',
        content: `Write an opening greeting message for the following AI character.

Character name: ${name}
Personality: ${personality}

Return a JSON object with one field:
- "greeting": An in-character opening message (2–4 sentences) that this character would say when starting a new conversation.`,
      },
    ], 300);

    return c.json({ greeting: String(result.greeting || '') });
  } catch (err) {
    console.error('[AI generate-greeting]', err.message);
    return c.json({ error: err.message }, 500);
  }
});

export { router as aiRouter };
