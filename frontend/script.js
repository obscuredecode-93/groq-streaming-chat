(() => {
'use strict';

// ── Config ───────────────────────────────────────────────────────────────────

const STORAGE_KEY  = 'groq-characters-v2';
const DICEBEAR_BASE = 'https://api.dicebear.com/7.x/avataaars/svg';

const DEFAULT_CHARACTERS = [
  {
    id: 'default-mentor',
    name: 'Theron',
    description: 'An ancient, wise mentor who speaks in measured truths and timeless metaphors.',
    personality: `You are Theron, an ageless sage and mentor who has witnessed the rise and fall of civilizations. You speak calmly, with depth and measured wisdom. You favor Socratic questions to help people find their own answers rather than giving them directly. You draw from philosophy, nature, history, and metaphor. You never rush. You acknowledge complexity and uncertainty. When someone is frustrated, you are gently grounding. You often end your responses with a reflective question that invites the person to think deeper.`,
    greeting: 'Ah, another seeker arrives. I sense curiosity in you — that is a fine beginning. What is it that weighs on your mind, or what truth are you searching for today?',
    createdAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'default-tech',
    name: 'Max',
    description: 'A brilliantly sarcastic tech expert who has seen every bad decision twice.',
    personality: `You are Max, a senior software engineer with 20 years of experience and exactly zero patience for buzzwords or hype. You are sarcastic, blunt, and deeply knowledgeable. You express exasperation at bad practices but underneath the snark you genuinely care about helping people write better code. You use dry wit freely. You sometimes sigh (*sighs*). Despite the sarcasm, you always eventually answer the question thoroughly and correctly. You have strong opinions but can be persuaded by good arguments.`,
    greeting: `*looks up from three monitors*\n\nOh great, another question. Fine. Let me guess — something's broken and Stack Overflow didn't have the exact answer? Alright, what is it.`,
    createdAt: '2024-01-01T00:00:01.000Z',
  },
  {
    id: 'default-coach',
    name: 'Nova',
    description: 'An explosively energetic motivational coach who believes in you more than you do.',
    personality: `You are Nova, a high-energy, genuinely enthusiastic motivational coach. You believe every person has untapped greatness inside them. You are warm, loud (you use CAPS for emphasis sometimes), and relentlessly positive — but not fake. You give concrete, actionable advice, not just platitudes. You celebrate small wins as loudly as big ones. You push back gently when people are too hard on themselves. You structure advice into steps when helpful. You believe progress beats perfection every time.`,
    greeting: `YES!! You showed up — and that already means you're ahead of the person who didn't! 🎉\n\nI'm Nova, and I am SO ready to help you crush whatever you're working on. Tell me — what are we tackling today, champion?`,
    createdAt: '2024-01-01T00:00:02.000Z',
  },
];

// ── State ────────────────────────────────────────────────────────────────────

let currentCharacterId = null;
let isStreaming        = false;

// ── DOM ───────────────────────────────────────────────────────────────────────

const pages = {
  gallery: document.getElementById('page-gallery'),
  form:    document.getElementById('page-form'),
  chat:    document.getElementById('page-chat'),
};

const $ = (id) => document.getElementById(id);

// ── Avatar URL ────────────────────────────────────────────────────────────────

function avatarUrl(name) {
  const seed = encodeURIComponent((name || 'character').trim());
  return `${DICEBEAR_BASE}?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1f4e0,ffdfbf,ffd5dc&backgroundType=circle`;
}

// ── localStorage ──────────────────────────────────────────────────────────────

function loadCharacters() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function saveCharacters(chars) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chars));
}
function getCharacter(id) {
  return loadCharacters().find(c => c.id === id) || null;
}

// ── Backend sync ──────────────────────────────────────────────────────────────

async function syncToBackend(chars) {
  try {
    const res     = await fetch('/characters');
    const server  = await res.json();
    const serverIds = new Set(server.map(c => c.id));
    for (const c of chars) {
      if (!serverIds.has(c.id)) {
        await fetch('/characters', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(c),
        });
      }
    }
  } catch (e) { console.warn('Backend sync failed:', e.message); }
}

// ── Router ────────────────────────────────────────────────────────────────────

function navigate(hash) { window.location.hash = hash; }

function showPage(name) {
  Object.entries(pages).forEach(([k, el]) => el.classList.toggle('hidden', k !== name));
}

function handleRoute() {
  const raw   = window.location.hash.replace(/^#\/?/, '') || 'gallery';
  const parts = raw.split('/');
  const page  = parts[0];

  if (page === 'gallery' || !page) {
    renderGallery();
    showPage('gallery');
  } else if (page === 'create') {
    renderForm(null);
    showPage('form');
  } else if (page === 'edit' && parts[1]) {
    const char = getCharacter(parts[1]);
    if (!char) { navigate('gallery'); return; }
    renderForm(char);
    showPage('form');
  } else if (page === 'chat' && parts[1]) {
    const char = getCharacter(parts[1]);
    if (!char) { navigate('gallery'); return; }
    renderChatPage(char);
    showPage('chat');
  } else {
    navigate('gallery');
  }
}

window.addEventListener('hashchange', handleRoute);

// ── Toast / confirm ───────────────────────────────────────────────────────────

let _toastTimer;
function showError(msg) {
  const el = $('error-toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 4500);
}

function confirmDialog(message, confirmLabel = 'Confirm') {
  return new Promise((resolve) => {
    $('modal-message').textContent = message;
    $('modal-confirm').textContent = confirmLabel;
    $('confirm-modal').classList.remove('hidden');
    const cleanup = (result) => {
      $('confirm-modal').classList.add('hidden');
      $('modal-cancel').removeEventListener('click', onNo);
      $('modal-confirm').removeEventListener('click', onYes);
      resolve(result);
    };
    const onNo  = () => cleanup(false);
    const onYes = () => cleanup(true);
    $('modal-cancel').addEventListener('click', onNo);
    $('modal-confirm').addEventListener('click', onYes);
  });
}

// ── Gallery ───────────────────────────────────────────────────────────────────

function renderGallery() {
  let allChars = loadCharacters();
  const search = ($('gallery-search')?.value || '').toLowerCase().trim();
  const chars  = search
    ? allChars.filter(c =>
        c.name.toLowerCase().includes(search) ||
        c.description.toLowerCase().includes(search))
    : allChars;

  const grid      = $('character-grid');
  const emptyEl   = $('gallery-empty');
  const noResults = $('gallery-no-results');
  const countEl   = $('gallery-count');

  countEl.textContent = `${allChars.length} character${allChars.length !== 1 ? 's' : ''}`;

  grid.innerHTML = '';

  if (allChars.length === 0) {
    grid.classList.add('hidden');
    emptyEl.classList.remove('hidden');
    noResults.classList.add('hidden');
    return;
  }

  emptyEl.classList.add('hidden');

  if (chars.length === 0) {
    grid.classList.add('hidden');
    noResults.classList.remove('hidden');
    return;
  }

  grid.classList.remove('hidden');
  noResults.classList.add('hidden');

  chars.forEach(char => {
    const card = document.createElement('div');
    card.className = 'char-card';
    card.innerHTML = `
      <div class="char-card-top">
        <img class="char-avatar-img" src="${avatarUrl(char.name)}" alt="${escHtml(char.name)}" loading="lazy" />
        <div class="char-info">
          <div class="char-name">${escHtml(char.name)}</div>
          <div class="char-desc">${escHtml(char.description)}</div>
        </div>
      </div>
      <div class="char-card-actions">
        <button class="btn-chat"   data-id="${char.id}" data-action="chat">Chat</button>
        <button class="btn-edit"   data-id="${char.id}" data-action="edit">Edit</button>
        <button class="btn-delete" data-id="${char.id}" data-action="delete">Delete</button>
      </div>`;
    grid.appendChild(card);
  });

  grid.onclick = async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const { id, action } = btn.dataset;
    if (action === 'chat')   { navigate(`chat/${id}`); }
    if (action === 'edit')   { navigate(`edit/${id}`); }
    if (action === 'delete') {
      const char = getCharacter(id);
      const ok = await confirmDialog(`Delete "${char?.name}"? This cannot be undone.`, 'Delete');
      if (ok) deleteCharacter(id);
    }
  };
}

// Buttons wired once
$('btn-create-character').onclick = () => navigate('create');
$('btn-empty-create')?.addEventListener && ($('btn-empty-create').onclick = () => navigate('create'));

$('btn-suggest-character').onclick = async () => {
  const btn = $('btn-suggest-character');
  btn.disabled = true;
  btn.textContent = 'Thinking…';
  try {
    const res  = await fetch('/ai/suggest-character', { method: 'POST' });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    navigate('create');
    // Pre-fill form after slight delay so form renders first
    setTimeout(() => prefillForm(data), 50);
  } catch (err) {
    showError('Could not get suggestion: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Suggest`;
  }
};

// Live search
document.getElementById('gallery-search')?.addEventListener('input', renderGallery);

// ── Character CRUD ────────────────────────────────────────────────────────────

function deleteCharacter(id) {
  saveCharacters(loadCharacters().filter(c => c.id !== id));
  fetch(`/characters/${id}`, { method: 'DELETE' }).catch(() => {});
  fetch(`/chat/${id}/history`, { method: 'DELETE' }).catch(() => {});
  renderGallery();
}

// ── Form ──────────────────────────────────────────────────────────────────────

let _avatarDebounce;

function renderForm(existingChar) {
  $('form-title').textContent = existingChar ? 'Edit Character' : 'Create Character';

  // Clone form to wipe all previous listeners
  const oldForm = $('character-form');
  const newForm = oldForm.cloneNode(true);
  oldForm.replaceWith(newForm);

  const form = $('character-form');

  if (existingChar) {
    $('f-name').value        = existingChar.name        || '';
    $('f-description').value = existingChar.description || '';
    $('f-personality').value = existingChar.personality || '';
    $('f-greeting').value    = existingChar.greeting    || '';
  }

  // Set initial avatar preview
  updateAvatarPreview($('f-name').value || existingChar?.name || '');

  $('form-back-btn').onclick   = () => navigate('gallery');
  $('form-cancel-btn').onclick = () => navigate('gallery');

  // Live avatar preview as name changes
  $('f-name').addEventListener('input', () => {
    clearTimeout(_avatarDebounce);
    _avatarDebounce = setTimeout(() => updateAvatarPreview($('f-name').value), 300);
  });

  // AI generate button
  $('btn-ai-generate').addEventListener('click', () => aiGenerateCharacter());

  // Form submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorDiv = $('form-error');
    errorDiv.classList.add('hidden');

    const name        = $('f-name').value.trim();
    const description = $('f-description').value.trim();
    const personality = $('f-personality').value.trim();
    const greeting    = $('f-greeting').value.trim();

    if (!name || !description || !personality || !greeting) {
      errorDiv.textContent = 'Please fill in all required fields.';
      errorDiv.classList.remove('hidden');
      errorDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    const char = {
      id:          existingChar?.id || crypto.randomUUID(),
      name, description, personality, greeting,
      createdAt:   existingChar?.createdAt || new Date().toISOString(),
    };

    const chars = loadCharacters();
    if (existingChar) {
      const idx = chars.findIndex(c => c.id === existingChar.id);
      if (idx !== -1) chars[idx] = char;
      fetch(`/characters/${char.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(char),
      }).catch(() => {});
    } else {
      chars.push(char);
      fetch('/characters', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(char),
      }).catch(() => {});
    }

    saveCharacters(chars);
    navigate('gallery');
  });
}

function updateAvatarPreview(name) {
  const img = $('f-avatar-preview');
  if (!img) return;
  img.src = avatarUrl(name || 'preview');
}

function prefillForm(data) {
  if (data.name)        $('f-name').value        = data.name;
  if (data.description) $('f-description').value = data.description;
  if (data.personality) $('f-personality').value = data.personality;
  if (data.greeting)    $('f-greeting').value    = data.greeting;
  if (data.name)        updateAvatarPreview(data.name);
}

async function aiGenerateCharacter() {
  const name = $('f-name').value.trim();
  if (!name) {
    showError('Enter a character name first.');
    $('f-name').focus();
    return;
  }

  const btn = $('btn-ai-generate');
  btn.disabled = true;
  btn.classList.add('loading');
  btn.textContent = 'Generating…';

  try {
    const res  = await fetch('/ai/generate-character', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    prefillForm(data);
  } catch (err) {
    showError('Generation failed: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Generate`;
  }
}

// ── Chat page ─────────────────────────────────────────────────────────────────

function renderChatPage(char) {
  currentCharacterId = char.id;
  isStreaming = false;

  $('chat-avatar-img').src = avatarUrl(char.name);
  $('chat-avatar-img').alt = char.name;
  $('chat-name').textContent        = char.name;
  $('chat-description').textContent = char.description;

  $('chat-back-btn').onclick = () => { currentCharacterId = null; navigate('gallery'); };

  $('chat-clear-btn').onclick = async () => {
    if (isStreaming) return;
    const ok = await confirmDialog('Clear this conversation? The character will forget everything.', 'Clear');
    if (!ok) return;
    await fetch(`/chat/${char.id}/history`, { method: 'DELETE' }).catch(() => {});
    loadHistory(char);
  };

  // Re-clone input to clear stale listeners
  const oldInput = $('chat-input');
  const newInput = oldInput.cloneNode(true);
  oldInput.replaceWith(newInput);

  $('chat-input').addEventListener('input', () => {
    const ta = $('chat-input');
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
    $('chat-send-btn').disabled = !ta.value.trim() || isStreaming;
  });

  $('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!$('chat-send-btn').disabled) sendMessage(char);
    }
  });

  $('chat-send-btn').addEventListener('click', () => sendMessage(char));

  loadHistory(char);
  $('chat-input').focus();
}

async function loadHistory(char) {
  const container = $('chat-messages');
  container.innerHTML = '';

  try {
    const res  = await fetch(`/chat/${char.id}/history`);
    const data = await res.json();
    const msgs = data.messages || [];

    if (msgs.length === 0) {
      // No history — determine greeting
      let greeting = char.greeting;

      if (!greeting) {
        // Generate one dynamically
        appendChip(container, 'Generating greeting…');
        try {
          const r = await fetch('/ai/generate-greeting', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: char.name, personality: char.personality }),
          });
          const d = await r.json();
          greeting = d.greeting || `Hello! I'm ${char.name}. How can I help you?`;
        } catch {
          greeting = `Hello! I'm ${char.name}. How can I help you?`;
        }
        container.innerHTML = '';
      }

      appendChip(container, 'New conversation');
      appendBubble(container, 'ai', char, greeting, null);
    } else {
      appendChip(container, `${msgs.length} message${msgs.length !== 1 ? 's' : ''} in this conversation`);
      msgs.forEach(m => appendBubble(container, m.role === 'user' ? 'user' : 'ai', char, m.content, m.timestamp));
    }
  } catch {
    appendChip(container, 'Could not load history');
    appendBubble(container, 'ai', char, char.greeting || `Hello! I'm ${char.name}.`, null);
  }

  scrollBottom(container);
}

// ── Streaming ─────────────────────────────────────────────────────────────────

async function sendMessage(char) {
  const input   = $('chat-input');
  const sendBtn = $('chat-send-btn');
  const container = $('chat-messages');

  const text = input.value.trim();
  if (!text || isStreaming) return;

  input.value = '';
  input.style.height = 'auto';
  sendBtn.disabled = true;

  appendBubble(container, 'user', char, text, new Date().toISOString());
  const { bubble: aiBubble } = appendStreamingBubble(container, char);
  scrollBottom(container);

  setStreaming(true);
  let firstToken = true;
  let fullText   = '';

  try {
    const response = await fetch(`/chat/${char.id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${response.status}`);
    }

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') { aiBubble.classList.remove('cursor'); break; }

        let parsed;
        try { parsed = JSON.parse(payload); } catch { continue; }

        if (parsed.error) throw new Error(parsed.error);

        if (parsed.token) {
          if (firstToken) { aiBubble.innerHTML = ''; firstToken = false; }
          fullText += parsed.token;
          aiBubble.innerHTML = escHtml(fullText);
          scrollBottom(container);
        }
      }
    }
  } catch (err) {
    aiBubble.classList.remove('cursor');
    aiBubble.innerHTML = `<span style="color:var(--danger)">⚠ ${escHtml(err.message)}</span>`;
    showError(err.message);
  } finally {
    setStreaming(false);
    $('chat-input')?.focus();
  }
}

// ── Chat DOM helpers ──────────────────────────────────────────────────────────

function appendChip(container, text) {
  const chip = document.createElement('div');
  chip.className = 'chat-chip';
  chip.textContent = text;
  container.appendChild(chip);
}

function appendBubble(container, role, char, content, timestamp) {
  const isUser = role === 'user';
  const row = document.createElement('div');
  row.className = `message-row ${isUser ? 'user' : 'ai'}`;

  const avatarEl = isUser
    ? `<div class="msg-avatar-you">You</div>`
    : `<img class="msg-avatar-img" src="${avatarUrl(char.name)}" alt="${escHtml(char.name)}" loading="lazy" />`;

  const timeStr = timestamp ? formatTime(timestamp) : '';

  row.innerHTML = `
    ${avatarEl}
    <div class="msg-body">
      <div class="bubble">${escHtml(content)}</div>
      ${timeStr ? `<div class="msg-timestamp">${timeStr}</div>` : ''}
    </div>`;

  container.appendChild(row);
  return row.querySelector('.bubble');
}

function appendStreamingBubble(container, char) {
  const row = document.createElement('div');
  row.className = 'message-row ai';
  row.innerHTML = `
    <img class="msg-avatar-img" src="${avatarUrl(char.name)}" alt="${escHtml(char.name)}" />
    <div class="msg-body">
      <div class="bubble cursor">
        <div class="loading-dots"><span></span><span></span><span></span></div>
      </div>
      <div class="msg-timestamp">${formatTime(new Date().toISOString())}</div>
    </div>`;
  container.appendChild(row);
  return { row, bubble: row.querySelector('.bubble') };
}

function scrollBottom(container) {
  container.scrollTop = container.scrollHeight;
}

function setStreaming(state) {
  isStreaming = state;
  const btn   = $('chat-send-btn');
  const input = $('chat-input');
  if (btn)   btn.disabled   = state || !input?.value.trim();
  if (input) input.disabled = state;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/\n/g, '<br>');
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot() {
  let chars = loadCharacters();
  if (chars.length === 0) {
    chars = DEFAULT_CHARACTERS;
    saveCharacters(chars);
  }

  // Wire gallery search (must exist in DOM before routing)
  const searchInput = $('gallery-search');
  if (searchInput) searchInput.addEventListener('input', renderGallery);

  syncToBackend(chars);
  handleRoute();
}

boot();

})();
