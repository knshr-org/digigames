# Auth & Multi-Game Leaderboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user registration/login (name, username, password) and per-game leaderboards (pipes + snake), with optional auth — guests can still submit scores with a manual name.

**Architecture:** JWT auth stored in localStorage, shared across iframe-loaded games (same origin). Server validates JWT on score submit to link scores to user_id. Scores table gains `game_id` and nullable `user_id` columns. A shared `auth.js` client module handles login state across all pages.

**Tech Stack:** Express, MySQL, bcryptjs, jsonwebtoken, existing migration system

---

### Task 1: Install bcryptjs and jsonwebtoken

**Files:**
- Modify: `pipes/api/package.json`

- [ ] **Step 1: Install dependencies**

Run:
```bash
cd pipes/api && npm install bcryptjs jsonwebtoken
```

- [ ] **Step 2: Verify package.json updated**

Run:
```bash
cat pipes/api/package.json
```

Expected: `bcryptjs` and `jsonwebtoken` in dependencies.

---

### Task 2: Create users table migration

**Files:**
- Create: `pipes/api/migrations/002_create_users.sql`

- [ ] **Step 1: Write migration**

```sql
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  username VARCHAR(30) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_username (username)
);
```

- [ ] **Step 2: Verify migration file exists**

Run:
```bash
cat pipes/api/migrations/002_create_users.sql
```

---

### Task 3: Add game_id and user_id to scores table

**Files:**
- Create: `pipes/api/migrations/003_add_game_user_to_scores.sql`

- [ ] **Step 1: Write migration**

```sql
ALTER TABLE scores
  ADD COLUMN game_id VARCHAR(20) NOT NULL DEFAULT 'pipes' AFTER id,
  ADD COLUMN user_id INT NULL AFTER game_id,
  ADD INDEX idx_game_score (game_id, score DESC),
  ADD INDEX idx_user_game (user_id, game_id),
  ADD CONSTRAINT fk_scores_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
```

- [ ] **Step 2: Verify migration file exists**

Run:
```bash
cat pipes/api/migrations/003_add_game_user_to_scores.sql
```

---

### Task 4: Add auth routes to server

**Files:**
- Modify: `pipes/api/server.js`

- [ ] **Step 1: Add imports and JWT_SECRET**

At top of `server.js`, after existing requires, add:

```js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'digigames-dev-secret-change-in-prod';
```

- [ ] **Step 2: Add auth middleware helper**

After the `pool` definition, add:

```js
function authenticateOptional(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
  } catch {
    req.user = null;
  }
  next();
}
```

- [ ] **Step 3: Add POST /api/auth/register**

Before the `app.post('/api/scores', ...)` block, add:

```js
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many requests, try again later' },
});

app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { name, username, password } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 50) {
      return res.status(400).json({ error: 'Name must be 1-50 characters' });
    }
    if (!username || typeof username !== 'string' || username.trim().length < 3 || username.trim().length > 30) {
      return res.status(400).json({ error: 'Username must be 3-30 characters' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores' });
    }
    if (!password || typeof password !== 'string' || password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }
    const cleanName = name.trim();
    const cleanUsername = username.trim().toLowerCase();
    const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [cleanUsername]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Username already taken' });
    }
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (name, username, password_hash) VALUES (?, ?, ?)',
      [cleanName, cleanUsername, hash]
    );
    const token = jwt.sign({ id: result.insertId, name: cleanName, username: cleanUsername }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: result.insertId, name: cleanName, username: cleanUsername } });
  } catch (err) {
    console.error('POST /api/auth/register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});
```

- [ ] **Step 4: Add POST /api/auth/login**

```js
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    const cleanUsername = username.trim().toLowerCase();
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [cleanUsername]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const token = jwt.sign({ id: user.id, name: user.name, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, name: user.name, username: user.username } });
  } catch (err) {
    console.error('POST /api/auth/login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});
```

- [ ] **Step 5: Add GET /api/auth/me**

```js
app.get('/api/auth/me', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token' });
  }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET);
    const [rows] = await pool.query('SELECT id, name, username FROM users WHERE id = ?', [payload.id]);
    if (rows.length === 0) return res.status(401).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});
```

---

### Task 5: Update score endpoints for game_id and auth

**Files:**
- Modify: `pipes/api/server.js`

- [ ] **Step 1: Update POST /api/scores**

Replace the existing `app.post('/api/scores', ...)` handler with:

```js
app.post('/api/scores', submitLimiter, authenticateOptional, async (req, res) => {
  try {
    const { name, score, game_id } = req.body;
    const gameId = game_id || 'pipes';
    if (!['pipes', 'snake'].includes(gameId)) {
      return res.status(400).json({ error: 'Invalid game_id' });
    }

    let cleanName;
    let userId = null;

    if (req.user) {
      cleanName = req.user.name;
      userId = req.user.id;
    } else {
      if (!name || typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 20) {
        return res.status(400).json({ error: 'Name must be 1-20 characters' });
      }
      cleanName = name.trim();
    }

    if (!Number.isInteger(score) || score < 0) {
      return res.status(400).json({ error: 'Score must be a non-negative integer' });
    }

    const [result] = await pool.query(
      'INSERT INTO scores (game_id, user_id, name, score) VALUES (?, ?, ?, ?)',
      [gameId, userId, cleanName, score]
    );
    const [rankRows] = await pool.query(
      'SELECT COUNT(*) AS rank FROM scores WHERE game_id = ? AND score > ?',
      [gameId, score]
    );
    const rank = (rankRows[0].rank || 0) + 1;
    res.json({ id: result.insertId, rank });
  } catch (err) {
    console.error('POST /api/scores error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});
```

- [ ] **Step 2: Update GET /api/scores/top**

Replace the existing handler with:

```js
app.get('/api/scores/top', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
    const gameId = req.query.game_id || 'pipes';
    const [rows] = await pool.query(
      `SELECT name, MAX(score) AS score, MAX(created_at) AS created_at
       FROM scores
       WHERE game_id = ?
       GROUP BY name
       ORDER BY score DESC, created_at ASC
       LIMIT ?`,
      [gameId, limit]
    );
    const ranked = rows.map((r, i) => ({ rank: i + 1, ...r }));
    res.json(ranked);
  } catch (err) {
    console.error('GET /api/scores/top error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});
```

- [ ] **Step 3: Update GET /api/scores/player**

Replace the existing handler with:

```js
app.get('/api/scores/player', authenticateOptional, async (req, res) => {
  try {
    const gameId = req.query.game_id || 'pipes';
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);

    let rows;
    if (req.user) {
      [rows] = await pool.query(
        'SELECT score, created_at FROM scores WHERE user_id = ? AND game_id = ? ORDER BY score DESC LIMIT ?',
        [req.user.id, gameId, limit]
      );
    } else {
      const { name } = req.query;
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Name is required' });
      }
      [rows] = await pool.query(
        'SELECT score, created_at FROM scores WHERE name = ? AND game_id = ? ORDER BY score DESC LIMIT ?',
        [name.trim(), gameId, limit]
      );
    }
    res.json(rows);
  } catch (err) {
    console.error('GET /api/scores/player error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});
```

---

### Task 6: Create shared auth client module

**Files:**
- Create: `js/auth.js`

This module lives at the project root's `js/` folder so it's accessible to all games (same origin, served by Express static).

- [ ] **Step 1: Write auth.js**

```js
const DigiAuth = (() => {
  const LS_TOKEN_KEY = 'digigames_token';
  const LS_USER_KEY = 'digigames_user';

  function getApiBase() {
    const params = new URLSearchParams(window.location.search);
    return params.get('api') || window.DIGIGAMES_API_BASE || '';
  }

  function getToken() {
    return localStorage.getItem(LS_TOKEN_KEY);
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem(LS_USER_KEY));
    } catch { return null; }
  }

  function setAuth(token, user) {
    localStorage.setItem(LS_TOKEN_KEY, token);
    localStorage.setItem(LS_USER_KEY, JSON.stringify(user));
  }

  function clearAuth() {
    localStorage.removeItem(LS_TOKEN_KEY);
    localStorage.removeItem(LS_USER_KEY);
  }

  function isLoggedIn() {
    return !!getToken();
  }

  function authHeaders() {
    const token = getToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  async function register(name, username, password) {
    const res = await fetch(`${getApiBase()}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    setAuth(data.token, data.user);
    return data.user;
  }

  async function login(username, password) {
    const res = await fetch(`${getApiBase()}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    setAuth(data.token, data.user);
    return data.user;
  }

  function logout() {
    clearAuth();
  }

  async function verify() {
    const token = getToken();
    if (!token) return null;
    try {
      const res = await fetch(`${getApiBase()}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) { clearAuth(); return null; }
      const user = await res.json();
      localStorage.setItem(LS_USER_KEY, JSON.stringify(user));
      return user;
    } catch {
      return getUser();
    }
  }

  return { getToken, getUser, isLoggedIn, authHeaders, register, login, logout, verify };
})();
```

---

### Task 7: Add login/register UI to main menu

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add auth CSS**

Before the closing `</style>` tag, add:

```css
  /* ===== Auth UI ===== */
  #authArea {
    position: absolute;
    top: 16px;
    right: 20px;
    display: flex;
    align-items: center;
    gap: 10px;
    z-index: 50;
  }
  #authArea .auth-user {
    font-size: 0.7rem;
    color: #888;
    letter-spacing: 1px;
  }
  #authArea button {
    background: none;
    border: 1px solid #1a1a2e;
    border-radius: 8px;
    color: #888;
    font-family: inherit;
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 1.5px;
    padding: 6px 14px;
    cursor: pointer;
    transition: color 0.2s, border-color 0.2s;
  }
  #authArea button:hover {
    color: #ddd;
    border-color: #333;
  }

  #authModal {
    display: none;
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(0,0,0,0.7);
    align-items: center;
    justify-content: center;
  }
  #authModal.active { display: flex; }
  #authModal .modal {
    background: #12121c;
    border: 1px solid #1a1a2e;
    border-radius: 16px;
    padding: 32px 28px;
    width: min(360px, 90vw);
  }
  #authModal h3 {
    font-size: 0.9rem;
    letter-spacing: 3px;
    color: #ddd;
    margin-bottom: 20px;
    text-align: center;
  }
  #authModal input {
    display: block;
    width: 100%;
    padding: 10px 14px;
    margin-bottom: 12px;
    background: #0a0a0f;
    border: 1px solid #1a1a2e;
    border-radius: 8px;
    color: #eee;
    font-family: inherit;
    font-size: 0.8rem;
    outline: none;
  }
  #authModal input:focus { border-color: #333; }
  #authModal .modal-btns {
    display: flex;
    gap: 10px;
    margin-top: 16px;
  }
  #authModal .modal-btns button {
    flex: 1;
    padding: 10px;
    border-radius: 8px;
    font-family: inherit;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 1.5px;
    cursor: pointer;
    border: 1px solid #1a1a2e;
    transition: all 0.2s;
  }
  #authModal .btn-primary {
    background: linear-gradient(135deg, #ff6b5b, #ffd66b);
    color: #0a0a0f;
    border: none;
  }
  #authModal .btn-secondary {
    background: none;
    color: #888;
  }
  #authModal .btn-secondary:hover { color: #ddd; border-color: #333; }
  #authModal .auth-error {
    color: #ff4a4a;
    font-size: 0.7rem;
    text-align: center;
    margin-top: 8px;
    min-height: 1em;
  }
  #authModal .auth-switch {
    text-align: center;
    margin-top: 14px;
    font-size: 0.65rem;
    color: #555;
  }
  #authModal .auth-switch a {
    color: #888;
    cursor: pointer;
    text-decoration: underline;
  }
  #authModal .auth-switch a:hover { color: #ddd; }
```

- [ ] **Step 2: Add auth HTML**

After `<body>` and before `<div id="menuView">`, add:

```html
<div id="authArea">
  <span class="auth-user" id="authUserDisplay"></span>
  <button id="authLoginBtn">LOGIN</button>
  <button id="authLogoutBtn" style="display:none">LOGOUT</button>
</div>

<div id="authModal">
  <div class="modal">
    <h3 id="authModalTitle">LOGIN</h3>
    <div id="registerFields" style="display:none">
      <input id="authName" type="text" placeholder="Display Name" maxlength="50" autocomplete="name">
    </div>
    <input id="authUsername" type="text" placeholder="Username" maxlength="30" autocomplete="username">
    <input id="authPassword" type="password" placeholder="Password" autocomplete="current-password">
    <div class="auth-error" id="authError"></div>
    <div class="modal-btns">
      <button class="btn-secondary" id="authCancelBtn">CANCEL</button>
      <button class="btn-primary" id="authSubmitBtn">LOGIN</button>
    </div>
    <div class="auth-switch" id="authSwitch">
      No account? <a id="authSwitchLink">Register</a>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Add auth.js script tag and auth logic**

Before the closing `</body>` tag, before the existing `<script>`, add:

```html
<script src="js/auth.js"></script>
```

Then, inside the existing `<script>` block, after the `navigate();` call at the end, add:

```js
// ===== Auth UI =====
const authArea = document.getElementById('authArea');
const authUserDisplay = document.getElementById('authUserDisplay');
const authLoginBtn = document.getElementById('authLoginBtn');
const authLogoutBtn = document.getElementById('authLogoutBtn');
const authModal = document.getElementById('authModal');
const authModalTitle = document.getElementById('authModalTitle');
const registerFields = document.getElementById('registerFields');
const authName = document.getElementById('authName');
const authUsername = document.getElementById('authUsername');
const authPassword = document.getElementById('authPassword');
const authError = document.getElementById('authError');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const authCancelBtn = document.getElementById('authCancelBtn');
const authSwitchLink = document.getElementById('authSwitchLink');
const authSwitch = document.getElementById('authSwitch');

let authMode = 'login';

function updateAuthUI() {
  const user = DigiAuth.getUser();
  if (user) {
    authUserDisplay.textContent = user.name;
    authLoginBtn.style.display = 'none';
    authLogoutBtn.style.display = '';
  } else {
    authUserDisplay.textContent = '';
    authLoginBtn.style.display = '';
    authLogoutBtn.style.display = 'none';
  }
}

function showAuthModal(mode) {
  authMode = mode;
  authError.textContent = '';
  authUsername.value = '';
  authPassword.value = '';
  authName.value = '';
  if (mode === 'register') {
    authModalTitle.textContent = 'REGISTER';
    registerFields.style.display = '';
    authSubmitBtn.textContent = 'REGISTER';
    authSwitch.innerHTML = 'Have an account? <a id="authSwitchLink">Login</a>';
  } else {
    authModalTitle.textContent = 'LOGIN';
    registerFields.style.display = 'none';
    authSubmitBtn.textContent = 'LOGIN';
    authSwitch.innerHTML = 'No account? <a id="authSwitchLink">Register</a>';
  }
  document.getElementById('authSwitchLink').addEventListener('click', () => {
    showAuthModal(mode === 'login' ? 'register' : 'login');
  });
  authModal.classList.add('active');
}

authLoginBtn.addEventListener('click', () => showAuthModal('login'));
authLogoutBtn.addEventListener('click', () => {
  DigiAuth.logout();
  updateAuthUI();
});
authCancelBtn.addEventListener('click', () => authModal.classList.remove('active'));
authModal.addEventListener('click', (e) => {
  if (e.target === authModal) authModal.classList.remove('active');
});

authSubmitBtn.addEventListener('click', async () => {
  authError.textContent = '';
  const username = authUsername.value.trim();
  const password = authPassword.value;

  if (!username || !password) {
    authError.textContent = 'Fill in all fields';
    return;
  }

  authSubmitBtn.disabled = true;
  authSubmitBtn.textContent = '...';

  try {
    if (authMode === 'register') {
      const name = authName.value.trim();
      if (!name) {
        authError.textContent = 'Name is required';
        authSubmitBtn.disabled = false;
        authSubmitBtn.textContent = 'REGISTER';
        return;
      }
      await DigiAuth.register(name, username, password);
    } else {
      await DigiAuth.login(username, password);
    }
    authModal.classList.remove('active');
    updateAuthUI();
  } catch (err) {
    authError.textContent = err.message;
  }

  authSubmitBtn.disabled = false;
  authSubmitBtn.textContent = authMode === 'register' ? 'REGISTER' : 'LOGIN';
});

authPassword.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') authSubmitBtn.click();
});

updateAuthUI();
DigiAuth.verify().then(updateAuthUI);
```

---

### Task 8: Update LeaderboardAPI for game_id and auth

**Files:**
- Modify: `pipes/js/leaderboard.js`

- [ ] **Step 1: Update submitScore to include game_id and auth token**

Replace the entire `leaderboard.js` content with:

```js
const LeaderboardAPI = (() => {
  const params = new URLSearchParams(window.location.search);
  const API_BASE = params.get('api') || window.PIPES_API_BASE || '';
  const LS_NAME_KEY = 'pipes_player_name';
  const LS_SCORES_KEY = 'pipes_local_scores';
  const GAME_ID = 'pipes';

  function getStoredName() {
    if (typeof DigiAuth !== 'undefined' && DigiAuth.isLoggedIn()) {
      return DigiAuth.getUser()?.name || '';
    }
    return localStorage.getItem(LS_NAME_KEY) || '';
  }

  function setStoredName(name) {
    localStorage.setItem(LS_NAME_KEY, name);
  }

  function isLoggedIn() {
    return typeof DigiAuth !== 'undefined' && DigiAuth.isLoggedIn();
  }

  function getLocalScores() {
    try {
      return JSON.parse(localStorage.getItem(LS_SCORES_KEY)) || [];
    } catch { return []; }
  }

  function saveLocalScore(name, score) {
    const scores = getLocalScores();
    scores.push({ name, score, created_at: new Date().toISOString() });
    if (scores.length > 100) scores.shift();
    localStorage.setItem(LS_SCORES_KEY, JSON.stringify(scores));
  }

  async function submitScore(name, score) {
    saveLocalScore(name, score);
    setStoredName(name);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (typeof DigiAuth !== 'undefined') {
        Object.assign(headers, DigiAuth.authHeaders());
      }
      const res = await fetch(`${API_BASE}/api/scores`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name, score, game_id: GAME_ID }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('Score submit failed, saved locally:', err);
      return { id: null, rank: null, offline: true };
    }
  }

  async function getTopScores(limit = 10) {
    try {
      const res = await fetch(`${API_BASE}/api/scores/top?limit=${limit}&game_id=${GAME_ID}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('Failed to fetch top scores, using local:', err);
      const local = getLocalScores();
      const bestByName = new Map();
      for (const s of local) {
        const prev = bestByName.get(s.name);
        if (!prev || s.score > prev.score) bestByName.set(s.name, s);
      }
      const deduped = [...bestByName.values()];
      deduped.sort((a, b) => b.score - a.score);
      return deduped.slice(0, limit).map((s, i) => ({ rank: i + 1, ...s }));
    }
  }

  async function getPlayerScores(name, limit = 10) {
    try {
      const headers = {};
      if (typeof DigiAuth !== 'undefined') {
        Object.assign(headers, DigiAuth.authHeaders());
      }
      const url = `${API_BASE}/api/scores/player?game_id=${GAME_ID}&name=${encodeURIComponent(name)}&limit=${limit}`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('Failed to fetch player scores, using local:', err);
      const local = getLocalScores().filter(s => s.name === name);
      local.sort((a, b) => b.score - a.score);
      return local.slice(0, limit);
    }
  }

  return { submitScore, getTopScores, getPlayerScores, getStoredName, setStoredName, isLoggedIn };
})();
```

---

### Task 9: Update pipes game-over to use auth name

**Files:**
- Modify: `pipes/index.html`

- [ ] **Step 1: Add auth.js script to pipes index.html**

In `pipes/index.html`, find the line:
```html
<script src="js/leaderboard.js"></script>
```

Replace with:
```html
<script src="../js/auth.js"></script>
<script src="js/leaderboard.js"></script>
```

- [ ] **Step 2: Update game-over name input behavior**

In `pipes/index.html`, find the `showGameOver` function where it sets `scoreNameInput.value`. The current code around line 1377 is:

```js
if (scoreNameInput) {
    scoreNameInput.value = LeaderboardAPI.getStoredName();
    scoreNameInput.disabled = false;
}
```

Replace with:

```js
if (scoreNameInput) {
    scoreNameInput.value = LeaderboardAPI.getStoredName();
    if (LeaderboardAPI.isLoggedIn()) {
      scoreNameInput.disabled = true;
    } else {
      scoreNameInput.disabled = false;
    }
}
```

- [ ] **Step 3: Update build-bundle.js to include auth.js**

In `pipes/build-bundle.js`, after the existing file reads at the top, add:

```js
const authJs = fs.readFileSync(path.join(PIPES_DIR, '..', 'js', 'auth.js'), 'utf-8');
```

Update the inline replacement to include auth.js:

Replace:
```js
indexHtml = indexHtml.replace(
  '<script src="js/audio.js"></script>\n<script src="js/leaderboard.js"></script>',
  `<script>\n${audioJs}\n${leaderboardJs}\n</script>`
);
```

With:
```js
indexHtml = indexHtml.replace(
  '<script src="../js/auth.js"></script>\n<script src="js/audio.js"></script>\n<script src="js/leaderboard.js"></script>',
  `<script>\n${authJs}\n${audioJs}\n${leaderboardJs}\n</script>`
);
```

Wait — the bundle replaces the script tags from `pipes/index.html`. Since we added `../js/auth.js` in step 1, the build-bundle needs to match that new pattern. Let me correct:

Actually, looking at the build-bundle more carefully: it reads `pipes/index.html`, inlines scripts, then embeds into `pipes/pipes.html`. The script tag pattern needs to match exactly.

Replace the script replace line in `build-bundle.js`:

From:
```js
indexHtml = indexHtml.replace(
  '<script src="js/audio.js"></script>\n<script src="js/leaderboard.js"></script>',
  `<script>\n${audioJs}\n${leaderboardJs}\n</script>`
);
```

To:
```js
indexHtml = indexHtml.replace(
  '<script src="../js/auth.js"></script>\n<script src="js/audio.js"></script>\n<script src="js/leaderboard.js"></script>',
  `<script>\n${authJs}\n${audioJs}\n${leaderboardJs}\n</script>`
);
```

- [ ] **Step 4: Rebuild bundle**

Run:
```bash
node pipes/build-bundle.js
```

Expected: `Bundle built successfully!`

---

### Task 10: Add leaderboard to snake game

**Files:**
- Modify: `snake-merge.html`

- [ ] **Step 1: Add auth.js script tag**

In `snake-merge.html`, before the `<script>` tag (line 104), add:

```html
<script src="js/auth.js"></script>
```

- [ ] **Step 2: Add leaderboard CSS**

Before the closing `</style>` tag in `snake-merge.html`, add:

```css
  #snake-lb-overlay {
    display: none;
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(0,0,0,0.85);
    align-items: center;
    justify-content: center;
    font-family: 'Segoe UI', system-ui, sans-serif;
  }
  #snake-lb-overlay.active { display: flex; }
  .lb-panel {
    background: #12121c;
    border: 1px solid #1a1a2e;
    border-radius: 16px;
    padding: 24px 20px;
    width: min(380px, 92vw);
    max-height: 80vh;
    overflow-y: auto;
    color: #eee;
  }
  .lb-panel h3 {
    text-align: center;
    font-size: 0.9rem;
    letter-spacing: 3px;
    margin-bottom: 16px;
    color: #ddd;
  }
  .lb-panel .lb-score-display {
    text-align: center;
    font-size: 1.4rem;
    font-weight: 700;
    color: #4CAF50;
    margin-bottom: 16px;
  }
  .lb-panel .lb-name-row {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }
  .lb-panel input {
    flex: 1;
    padding: 8px 12px;
    background: #0a0a0f;
    border: 1px solid #1a1a2e;
    border-radius: 8px;
    color: #eee;
    font-family: inherit;
    font-size: 0.8rem;
    outline: none;
  }
  .lb-panel input:focus { border-color: #333; }
  .lb-panel .lb-submit-btn {
    padding: 8px 16px;
    background: #4CAF50;
    color: #fff;
    border: none;
    border-radius: 8px;
    font-family: inherit;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 1px;
    cursor: pointer;
  }
  .lb-panel .lb-submit-btn:disabled { opacity: 0.5; }
  .lb-panel .lb-tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
  }
  .lb-panel .lb-tab {
    flex: 1;
    padding: 6px;
    text-align: center;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 1.5px;
    border: 1px solid #1a1a2e;
    border-radius: 6px;
    background: none;
    color: #666;
    cursor: pointer;
    font-family: inherit;
  }
  .lb-panel .lb-tab.active {
    background: rgba(76,175,80,0.15);
    color: #4CAF50;
    border-color: rgba(76,175,80,0.3);
  }
  .lb-panel .lb-list { list-style: none; padding: 0; margin: 0; }
  .lb-panel .lb-list li {
    display: flex;
    align-items: center;
    padding: 6px 4px;
    font-size: 0.75rem;
    border-bottom: 1px solid #1a1a2e;
    gap: 8px;
  }
  .lb-panel .lb-rank { width: 24px; color: #555; font-weight: 700; }
  .lb-panel .lb-name-col { flex: 1; color: #ccc; }
  .lb-panel .lb-score-col { color: #4CAF50; font-weight: 700; }
  .lb-panel .lb-date-col { color: #444; font-size: 0.65rem; }
  .lb-panel .lb-close-btn {
    display: block;
    margin: 16px auto 0;
    padding: 10px 32px;
    background: none;
    border: 1px solid #1a1a2e;
    border-radius: 8px;
    color: #888;
    font-family: inherit;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 2px;
    cursor: pointer;
  }
  .lb-panel .lb-close-btn:hover { color: #ddd; border-color: #333; }
```

- [ ] **Step 3: Add leaderboard HTML**

Before `<script>` (or before `<script src="js/auth.js">` added in step 1), add:

```html
<div id="snake-lb-overlay">
  <div class="lb-panel">
    <h3>GAME OVER</h3>
    <div class="lb-score-display" id="snakeLbScore">0</div>
    <div class="lb-name-row" id="snakeLbNameRow">
      <input id="snakeLbName" type="text" maxlength="20" placeholder="Your name">
      <button class="lb-submit-btn" id="snakeLbSubmit">SUBMIT</button>
    </div>
    <div class="lb-tabs">
      <button class="lb-tab active" id="snakeLbGlobal">GLOBAL</button>
      <button class="lb-tab" id="snakeLbMine">MY SCORES</button>
    </div>
    <ul class="lb-list" id="snakeLbList"></ul>
    <button class="lb-close-btn" id="snakeLbClose">PLAY AGAIN</button>
  </div>
</div>
```

- [ ] **Step 4: Add snake leaderboard JS**

At the end of the existing `<script>` block in `snake-merge.html`, add:

```js
// ===== Snake Leaderboard =====
const SNAKE_API_BASE = (function() {
  var p = new URLSearchParams(window.location.search);
  return p.get('api') || window.DIGIGAMES_API_BASE || '';
})();
const SNAKE_GAME_ID = 'snake';
const SNAKE_LS_NAME = 'snake_player_name';

var snakeLbOverlay = document.getElementById('snake-lb-overlay');
var snakeLbScore = document.getElementById('snakeLbScore');
var snakeLbName = document.getElementById('snakeLbName');
var snakeLbSubmit = document.getElementById('snakeLbSubmit');
var snakeLbList = document.getElementById('snakeLbList');
var snakeLbNameRow = document.getElementById('snakeLbNameRow');
var snakeLbClose = document.getElementById('snakeLbClose');
var snakeLbGlobal = document.getElementById('snakeLbGlobal');
var snakeLbMine = document.getElementById('snakeLbMine');
var snakeLbTab = 'global';
var snakeLastScore = 0;

function snakeGetName() {
  if (typeof DigiAuth !== 'undefined' && DigiAuth.isLoggedIn()) {
    return DigiAuth.getUser()?.name || '';
  }
  return localStorage.getItem(SNAKE_LS_NAME) || '';
}

function snakeShowLeaderboard(finalScore) {
  snakeLastScore = finalScore;
  snakeLbScore.textContent = finalScore;
  var loggedIn = typeof DigiAuth !== 'undefined' && DigiAuth.isLoggedIn();
  snakeLbName.value = snakeGetName();
  snakeLbName.disabled = loggedIn;
  snakeLbSubmit.disabled = false;
  snakeLbSubmit.textContent = 'SUBMIT';
  snakeLbTab = 'global';
  snakeLbGlobal.classList.add('active');
  snakeLbMine.classList.remove('active');
  snakeLoadScores();
  snakeLbOverlay.classList.add('active');
}

async function snakeSubmitScore() {
  var name = snakeLbName.value.trim();
  if (!name || name.length > 20) {
    snakeLbName.style.borderColor = '#ff4a4a';
    setTimeout(function() { snakeLbName.style.borderColor = '#1a1a2e'; }, 800);
    return;
  }
  localStorage.setItem(SNAKE_LS_NAME, name);
  snakeLbSubmit.disabled = true;
  snakeLbSubmit.textContent = '...';
  try {
    var headers = { 'Content-Type': 'application/json' };
    if (typeof DigiAuth !== 'undefined') {
      var ah = DigiAuth.authHeaders();
      for (var k in ah) headers[k] = ah[k];
    }
    var res = await fetch(SNAKE_API_BASE + '/api/scores', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ name: name, score: snakeLastScore, game_id: SNAKE_GAME_ID }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    snakeLbSubmit.textContent = data.rank ? 'RANK #' + data.rank : 'DONE';
  } catch (err) {
    snakeLbSubmit.textContent = 'SAVED';
  }
  snakeLoadScores();
}

async function snakeLoadScores() {
  snakeLbList.innerHTML = '<li style="justify-content:center;color:#555">Loading...</li>';
  try {
    var url;
    var headers = {};
    if (snakeLbTab === 'global') {
      url = SNAKE_API_BASE + '/api/scores/top?limit=10&game_id=' + SNAKE_GAME_ID;
    } else {
      if (typeof DigiAuth !== 'undefined') {
        Object.assign(headers, DigiAuth.authHeaders());
      }
      var name = snakeGetName();
      url = SNAKE_API_BASE + '/api/scores/player?game_id=' + SNAKE_GAME_ID + '&name=' + encodeURIComponent(name) + '&limit=10';
    }
    var res = await fetch(url, { headers: headers });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var rows = await res.json();
    snakeRenderScores(rows);
  } catch (err) {
    snakeLbList.innerHTML = '<li style="justify-content:center;color:#555">Could not load scores</li>';
  }
}

function snakeRenderScores(rows) {
  if (!rows.length) {
    snakeLbList.innerHTML = '<li style="justify-content:center;color:#555">No scores yet</li>';
    return;
  }
  snakeLbList.innerHTML = '';
  rows.forEach(function(r, i) {
    var li = document.createElement('li');
    var rank = r.rank || (i + 1);
    var d = r.created_at ? new Date(r.created_at) : null;
    var dateStr = d ? (d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })) : '';
    li.innerHTML = '<span class="lb-rank">#' + rank + '</span>'
      + '<span class="lb-name-col">' + (r.name || snakeGetName()) + '</span>'
      + '<span class="lb-score-col">' + r.score + '</span>'
      + '<span class="lb-date-col">' + dateStr + '</span>';
    snakeLbList.appendChild(li);
  });
}

snakeLbSubmit.addEventListener('click', snakeSubmitScore);
snakeLbClose.addEventListener('click', function() {
  snakeLbOverlay.classList.remove('active');
  startGame();
});
snakeLbGlobal.addEventListener('click', function() {
  snakeLbTab = 'global';
  snakeLbGlobal.classList.add('active');
  snakeLbMine.classList.remove('active');
  snakeLoadScores();
});
snakeLbMine.addEventListener('click', function() {
  snakeLbTab = 'mine';
  snakeLbMine.classList.add('active');
  snakeLbGlobal.classList.remove('active');
  snakeLoadScores();
});
```

- [ ] **Step 5: Update endGame function to show leaderboard**

Replace the existing `endGame` function:

```js
function endGame() {
  running = false;
  clearInterval(timer);
  olTitle.textContent = 'GAME OVER';
  olSub.textContent   = 'Score: ' + score;
  olBtn.textContent   = 'RETRY';
  overlay.style.display = 'flex';
}
```

With:

```js
function endGame() {
  running = false;
  clearInterval(timer);
  snakeShowLeaderboard(score);
}
```

- [ ] **Step 6: Update snakeLbClose to hide the old overlay on initial play**

The initial overlay (with "PLAY" button) needs to work as before. The `startGame` function already hides it. The leaderboard close button calls `startGame()` which hides the original overlay. This should work without changes.

---

### Task 11: Test and rebuild

- [ ] **Step 1: Rebuild pipes bundle**

Run:
```bash
node pipes/build-bundle.js
```

Expected: `Bundle built successfully!`

- [ ] **Step 2: Verify all files are saved**

Check that these files exist:
- `js/auth.js`
- `pipes/api/migrations/002_create_users.sql`
- `pipes/api/migrations/003_add_game_user_to_scores.sql`
- Updated `pipes/api/server.js`
- Updated `pipes/js/leaderboard.js`
- Updated `pipes/index.html`
- Updated `pipes/build-bundle.js`
- Updated `index.html`
- Updated `snake-merge.html`
- Updated `pipes/pipes.html` (rebuilt)

- [ ] **Step 3: Stage all changes for review**

Run:
```bash
git add -A && git status
```

Review the staged files to ensure nothing unexpected is included.
