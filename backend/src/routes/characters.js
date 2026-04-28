import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';

const router = new Hono();

// Exported so characterChat.js can look up personalities
export const characters = new Map();

router.get('/', (c) => c.json([...characters.values()]));

router.get('/:id', (c) => {
  const char = characters.get(c.req.param('id'));
  if (!char) return c.json({ error: 'Character not found.' }, 404);
  return c.json(char);
});

router.post('/', async (c) => {
  let body;
  try { body = await c.req.json(); }
  catch { return c.json({ error: 'Request body must be valid JSON.' }, 400); }

  const { name, description, personality, greeting, avatar } = body;
  if (!name?.trim())        return c.json({ error: 'name is required.' }, 400);
  if (!personality?.trim()) return c.json({ error: 'personality is required.' }, 400);
  if (!greeting?.trim())    return c.json({ error: 'greeting is required.' }, 400);

  // Accept a client-supplied id so the frontend can sync localStorage → backend
  const id = body.id || uuidv4();
  const character = {
    id,
    name:        name.trim(),
    description: description?.trim() ?? '',
    personality: personality.trim(),
    greeting:    greeting.trim(),
    avatar:      avatar?.trim() || name.trim()[0].toUpperCase(),
    createdAt:   body.createdAt || new Date().toISOString(),
  };

  characters.set(id, character);
  return c.json(character, 201);
});

router.put('/:id', async (c) => {
  const id = c.req.param('id');
  if (!characters.has(id)) return c.json({ error: 'Character not found.' }, 404);

  let body;
  try { body = await c.req.json(); }
  catch { return c.json({ error: 'Request body must be valid JSON.' }, 400); }

  const existing = characters.get(id);
  const updated = {
    ...existing,
    name:        body.name?.trim()        || existing.name,
    description: body.description?.trim() ?? existing.description,
    personality: body.personality?.trim() || existing.personality,
    greeting:    body.greeting?.trim()    || existing.greeting,
    avatar:      body.avatar?.trim()      || existing.avatar,
  };

  characters.set(id, updated);
  return c.json(updated);
});

router.delete('/:id', (c) => {
  const id = c.req.param('id');
  if (!characters.has(id)) return c.json({ error: 'Character not found.' }, 404);
  characters.delete(id);
  return c.json({ message: `Character ${id} deleted.` });
});

export { router as charactersRouter };
