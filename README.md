# Groq Characters

A Character.ai-style chat platform built with **Node.js**, **Hono**, and **Groq**. Create characters with custom personalities, then chat with them in real time via streaming SSE. Three characters are pre-loaded on first visit.

---

## Project Structure

```
groq-streaming-chat/
├── backend/
│   ├── src/
│   │   ├── index.js              Entry point — mounts all routes, serves frontend
│   │   ├── config/index.js       Env config
│   │   ├── routes/
│   │   │   ├── characters.js     Character CRUD (in-memory Map)
│   │   │   ├── characterChat.js  Character-specific streaming chat + history
│   │   │   └── chat.js           Original session-based general chat
│   │   └── middleware/
│   │       ├── rateLimiter.js    10 req/min per IP
│   │       └── errorHandler.js   Global error handler
│   ├── nodemon.json
│   ├── package.json
│   ├── .env                      ← your API key goes here
│   └── .env.example
├── frontend/
│   ├── index.html                SPA shell (gallery / form / chat pages)
│   ├── style.css
│   └── script.js                 Hash router, localStorage sync, SSE streaming
└── package.json                  Root — delegates to backend
```

---

## Get a Free Groq API Key

1. Go to [https://console.groq.com](https://console.groq.com)
2. Sign up or log in (free tier, no credit card required)
3. **API Keys** → **Create API Key** → copy it

---

## Setup & Running

```bash
cd backend
npm install
cp .env.example .env        # then add your GROQ_API_KEY

# From project root:
npm run dev     # nodemon — auto-restarts on src/ changes
npm start       # production
```

Open **http://localhost:3000** — the backend serves the full frontend.

---

## Frontend

Three pages, zero frameworks — vanilla JS with hash-based routing.

| Hash | Page |
|---|---|
| `#/gallery` | Character gallery (default) |
| `#/create` | Create character form |
| `#/edit/:id` | Edit character form |
| `#/chat/:id` | Chat with a character |

**Characters are stored in `localStorage`** and synced to the backend on each page load, so they survive server restarts.

---

## API Reference

### Health

```
GET /health
```

---

### Characters

#### List all characters
```bash
GET /characters
curl http://localhost:3000/characters
```

#### Get one character
```bash
GET /characters/:id
curl http://localhost:3000/characters/<id>
```

#### Create a character
```bash
POST /characters
curl -X POST http://localhost:3000/characters \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Aria",
    "description": "A poetic dreamer who speaks in verse.",
    "personality": "You are Aria. You speak only in rhyming couplets and see beauty in everything. You are gentle, whimsical, and wise.",
    "greeting": "A new soul arrives, how bright the day! What brings you here, what do you say?",
    "avatar": "🌸"
  }'
```

**Fields:**

| Field | Required | Description |
|---|---|---|
| `name` | ✓ | Character name |
| `description` | ✓ | Short bio shown in gallery |
| `personality` | ✓ | System prompt — defines voice, style, knowledge |
| `greeting` | ✓ | First message the character sends |
| `avatar` | — | Emoji (defaults to first letter of name) |
| `id` | — | Client-supplied UUID (used for localStorage sync) |

#### Update a character
```bash
PUT /characters/:id
curl -X PUT http://localhost:3000/characters/<id> \
  -H "Content-Type: application/json" \
  -d '{"description": "Updated bio."}'
```

#### Delete a character
```bash
DELETE /characters/:id
curl -X DELETE http://localhost:3000/characters/<id>
```

---

### Character Chat (streaming SSE)

#### Chat with a character — streams tokens via SSE
```bash
POST /chat/:characterId
curl -N -X POST http://localhost:3000/chat/<characterId> \
  -H "Content-Type: application/json" \
  -d '{"message": "Tell me your story."}'
```

The character's personality is injected as the system prompt. The greeting is automatically added as the first assistant turn so the AI maintains conversational continuity.

**Stream events:**

| Data | Meaning |
|---|---|
| `{"token": "..."}` | Streamed token |
| `[DONE]` | Stream complete |
| `event: error` / `{"error": "..."}` | Error mid-stream |

#### Get conversation history
```bash
GET /chat/:characterId/history
curl http://localhost:3000/chat/<characterId>/history
```

#### Clear conversation history
```bash
DELETE /chat/:characterId/history
curl -X DELETE http://localhost:3000/chat/<characterId>/history
```

---

### General Session Chat (original API)

The original session-based chat is still available for programmatic use.

```bash
POST   /chat/session          # create session
GET    /chat/session/:id      # get history
DELETE /chat/session/:id      # delete session
POST   /chat                  # stream response (body: { message, sessionId? })
```

---

### Full end-to-end curl example

```bash
# 1. Create a character
CHAR=$(curl -s -X POST http://localhost:3000/characters \
  -H "Content-Type: application/json" \
  -d '{"name":"Sage","personality":"You are Sage, a calm Zen philosopher.","greeting":"Be still. What seeks your mind?","avatar":"🍃","description":"A Zen philosopher"}')

CID=$(echo $CHAR | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Character: $CID"

# 2. Chat (streams tokens)
curl -N -X POST http://localhost:3000/chat/$CID \
  -H "Content-Type: application/json" \
  -d '{"message": "How do I find peace?"}'

# 3. View history
curl http://localhost:3000/chat/$CID/history

# 4. Clear history
curl -X DELETE http://localhost:3000/chat/$CID/history
```

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `GROQ_API_KEY` | — | **Required.** Your Groq API key |
| `PORT` | `3000` | Server port |
| `MODEL` | `llama-3.1-8b-instant` | Groq model |
| `MAX_TOKENS` | `1024` | Max tokens per response |

---

## Rate Limiting & Retry

- **Rate limit:** 10 requests/minute per IP on all `/chat` routes. Returns HTTP 429 + `Retry-After` header.
- **Retry:** Groq API calls retry up to 3× with exponential backoff (1 s → 2 s → 4 s).
