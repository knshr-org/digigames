# Pipes Menu, Leaderboard & Audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a main menu, leaderboard with MySQL API, audio system, and improved death/pause screens to the pipes game.

**Architecture:** The game stays as a single HTML file with SVG overlays for all screens. Two new JS modules (`audio.js`, `leaderboard.js`) are loaded via `<script>` tags. A small Express API server (`api/`) connects to MySQL on Railway for leaderboard persistence.

**Tech Stack:** Vanilla JS, SVG, Web Audio API, Node/Express, mysql2, Railway (MySQL + deployment)

**Spec:** `docs/superpowers/specs/2026-04-28-pipes-menu-leaderboard-audio-design.md`

---

### Task 1: API Server + MySQL Schema

**Files:**
- Create: `pipes/api/package.json`
- Create: `pipes/api/server.js`
- Create: `pipes/api/.env.example`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "pipes-api",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.21.0",
    "mysql2": "^3.11.0",
    "cors": "^2.8.5",
    "express-rate-limit": "^7.4.0"
  }
}
```

- [ ] **Step 2: Create .env.example**

```
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=digigames
PORT=3000
```

- [ ] **Step 3: Create server.js**

```js
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(cors());
app.use(express.json());

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || process.env.MYSQLHOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || process.env.MYSQLPORT || '3306'),
  user: process.env.MYSQL_USER || process.env.MYSQLUSER || 'root',
  password: process.env.MYSQL_PASSWORD || process.env.MYSQLPASSWORD || '',
  database: process.env.MYSQL_DATABASE || process.env.MYSQLDATABASE || 'digigames',
  waitForConnections: true,
  connectionLimit: 10,
});

async function initDB() {
  const conn = await pool.getConnection();
  await conn.query(`
    CREATE TABLE IF NOT EXISTS scores (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(20) NOT NULL,
      score INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_score (score DESC),
      INDEX idx_name_score (name, score DESC)
    )
  `);
  conn.release();
}

const submitLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many submissions, try again later' },
});

app.post('/api/scores', submitLimiter, async (req, res) => {
  try {
    const { name, score } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 20) {
      return res.status(400).json({ error: 'Name must be 1-20 characters' });
    }
    if (!Number.isInteger(score) || score < 1) {
      return res.status(400).json({ error: 'Score must be a positive integer' });
    }
    const cleanName = name.trim();
    const [result] = await pool.query('INSERT INTO scores (name, score) VALUES (?, ?)', [cleanName, score]);
    const [rankRows] = await pool.query('SELECT COUNT(*) AS rank FROM scores WHERE score > ?', [score]);
    const rank = (rankRows[0].rank || 0) + 1;
    res.json({ id: result.insertId, rank });
  } catch (err) {
    console.error('POST /api/scores error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/scores/top', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
    const [rows] = await pool.query(
      'SELECT name, score, created_at FROM scores ORDER BY score DESC, created_at ASC LIMIT ?',
      [limit]
    );
    const ranked = rows.map((r, i) => ({ rank: i + 1, ...r }));
    res.json(ranked);
  } catch (err) {
    console.error('GET /api/scores/top error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/scores/player', async (req, res) => {
  try {
    const { name } = req.query;
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
    const [rows] = await pool.query(
      'SELECT score, created_at FROM scores WHERE name = ? ORDER BY score DESC LIMIT ?',
      [name.trim(), limit]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /api/scores/player error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
initDB().then(() => {
  app.listen(PORT, () => console.log(`Pipes API listening on port ${PORT}`));
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
```

- [ ] **Step 4: Install dependencies and test locally**

```bash
cd pipes/api
npm install
```

Create a `.env` file with the Railway MySQL credentials, then:

```bash
node server.js
```

Expected: `Pipes API listening on port 3000`

Test the endpoints:
```bash
curl http://localhost:3000/health
# {"status":"ok"}

curl -X POST http://localhost:3000/api/scores -H "Content-Type: application/json" -d '{"name":"Test","score":10}'
# {"id":1,"rank":1}

curl http://localhost:3000/api/scores/top
# [{"rank":1,"name":"Test","score":10,"created_at":"..."}]

curl "http://localhost:3000/api/scores/player?name=Test"
# [{"score":10,"created_at":"..."}]
```

---

### Task 2: Leaderboard Client (`js/leaderboard.js`)

**Files:**
- Create: `pipes/js/leaderboard.js`

- [ ] **Step 1: Create leaderboard.js**

```js
const LeaderboardAPI = (() => {
  const params = new URLSearchParams(window.location.search);
  const API_BASE = params.get('api') || 'https://YOUR-RAILWAY-APP.railway.app';
  const LS_NAME_KEY = 'pipes_player_name';
  const LS_SCORES_KEY = 'pipes_local_scores';

  function getStoredName() {
    return localStorage.getItem(LS_NAME_KEY) || '';
  }

  function setStoredName(name) {
    localStorage.setItem(LS_NAME_KEY, name);
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
      const res = await fetch(`${API_BASE}/api/scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, score }),
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
      const res = await fetch(`${API_BASE}/api/scores/top?limit=${limit}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('Failed to fetch top scores, using local:', err);
      const local = getLocalScores();
      local.sort((a, b) => b.score - a.score);
      return local.slice(0, limit).map((s, i) => ({ rank: i + 1, ...s }));
    }
  }

  async function getPlayerScores(name, limit = 10) {
    try {
      const res = await fetch(`${API_BASE}/api/scores/player?name=${encodeURIComponent(name)}&limit=${limit}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('Failed to fetch player scores, using local:', err);
      const local = getLocalScores().filter(s => s.name === name);
      local.sort((a, b) => b.score - a.score);
      return local.slice(0, limit);
    }
  }

  return { submitScore, getTopScores, getPlayerScores, getStoredName, setStoredName };
})();
```

- [ ] **Step 2: Add script tag to index.html**

In `pipes/index.html`, add before the closing `</body>` tag, BEFORE the inline `<script>` block:

```html
<script src="js/leaderboard.js"></script>
```

---

### Task 3: Audio Manager (`js/audio.js`)

**Files:**
- Create: `pipes/js/audio.js`

- [ ] **Step 1: Create audio.js**

```js
const AudioManager = (() => {
  const LS_KEY = 'pipes_settings';
  let ctx = null;
  let bgmElement = null;
  let bgmGain = null;
  let sfxGain = null;
  let fadeInterval = null;
  let settings = { bgmVolume: 0.7, sfxVolume: 0.8, bgmMuted: false, sfxMuted: false };

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY));
      if (saved) Object.assign(settings, saved);
    } catch {}
  }

  function saveSettings() {
    localStorage.setItem(LS_KEY, JSON.stringify(settings));
  }

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    sfxGain = ctx.createGain();
    sfxGain.gain.value = settings.sfxMuted ? 0 : settings.sfxVolume;
    sfxGain.connect(ctx.destination);

    bgmElement = document.getElementById('bgmAudio');
    if (bgmElement) {
      const source = ctx.createMediaElementSource(bgmElement);
      bgmGain = ctx.createGain();
      bgmGain.gain.value = settings.bgmMuted ? 0 : settings.bgmVolume;
      source.connect(bgmGain);
      bgmGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function playBGM() {
    if (!bgmElement) return;
    init();
    if (bgmGain) bgmGain.gain.value = settings.bgmMuted ? 0 : settings.bgmVolume;
    bgmElement.play().catch(() => {});
  }

  function stopBGM() {
    if (bgmElement) bgmElement.pause();
  }

  function fadeBGM(targetVol, duration) {
    if (!bgmGain) return;
    clearInterval(fadeInterval);
    const startVol = bgmGain.gain.value;
    const steps = 20;
    const stepTime = duration / steps;
    let step = 0;
    fadeInterval = setInterval(() => {
      step++;
      const t = step / steps;
      bgmGain.gain.value = startVol + (targetVol - startVol) * t;
      if (step >= steps) {
        clearInterval(fadeInterval);
        bgmGain.gain.value = targetVol;
      }
    }, stepTime);
  }

  function setBGMVolume(v) {
    settings.bgmVolume = v;
    if (bgmGain && !settings.bgmMuted) bgmGain.gain.value = v;
    saveSettings();
  }

  function setSFXVolume(v) {
    settings.sfxVolume = v;
    if (sfxGain && !settings.sfxMuted) sfxGain.gain.value = v;
    saveSettings();
  }

  function toggleBGMMute() {
    settings.bgmMuted = !settings.bgmMuted;
    if (bgmGain) bgmGain.gain.value = settings.bgmMuted ? 0 : settings.bgmVolume;
    saveSettings();
    return settings.bgmMuted;
  }

  function toggleSFXMute() {
    settings.sfxMuted = !settings.sfxMuted;
    if (sfxGain) sfxGain.gain.value = settings.sfxMuted ? 0 : settings.sfxVolume;
    saveSettings();
    return settings.sfxMuted;
  }

  function osc(type, freq, duration, startTime) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.3, startTime);
    g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    o.connect(g);
    g.connect(sfxGain);
    o.start(startTime);
    o.stop(startTime + duration);
  }

  const sfxMap = {
    click() {
      const t = ctx.currentTime;
      osc('square', 800, 0.05, t);
    },
    flap() {
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(400, t);
      o.frequency.linearRampToValueAtTime(700, t + 0.08);
      g.gain.setValueAtTime(0.25, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      o.connect(g); g.connect(sfxGain);
      o.start(t); o.stop(t + 0.08);
    },
    score() {
      const t = ctx.currentTime;
      osc('sine', 523, 0.1, t);
      osc('sine', 659, 0.1, t + 0.07);
    },
    powerup() {
      const t = ctx.currentTime;
      osc('sine', 523, 0.06, t);
      osc('sine', 659, 0.06, t + 0.05);
      osc('sine', 784, 0.06, t + 0.1);
      osc('sine', 1047, 0.08, t + 0.15);
    },
    hit() {
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
      g.gain.setValueAtTime(0.4, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g); g.connect(sfxGain);
      o.start(t); o.stop(t + 0.3);
    },
    milestone() {
      const t = ctx.currentTime;
      osc('sine', 523, 0.15, t);
      osc('sine', 659, 0.15, t + 0.12);
      osc('sine', 784, 0.2, t + 0.24);
    },
    submit() {
      const t = ctx.currentTime;
      osc('sine', 880, 0.1, t);
      osc('sine', 1320, 0.12, t + 0.08);
    },
  };

  function playSFX(name) {
    if (!ctx) return;
    if (settings.sfxMuted) return;
    const fn = sfxMap[name];
    if (fn) fn();
  }

  function getSettings() {
    return { ...settings };
  }

  loadSettings();

  return {
    init, playBGM, stopBGM, fadeBGM, playSFX,
    setBGMVolume, setSFXVolume, toggleBGMMute, toggleSFXMute,
    getSettings, loadSettings, saveSettings,
  };
})();
```

- [ ] **Step 2: Add audio element and script tag to index.html**

In `pipes/index.html`, add inside `<body>` before the stage div:

```html
<audio id="bgmAudio" src="assets/bgm.mp3" loop preload="auto" style="display:none"></audio>
```

Add the script tag before leaderboard.js (before closing `</body>`, before the inline script):

```html
<script src="js/audio.js"></script>
<script src="js/leaderboard.js"></script>
```

- [ ] **Step 3: Place a placeholder BGM file**

Either download a royalty-free chiptune MP3 and save it to `pipes/assets/bgm.mp3`, or create a silent placeholder so the game doesn't error. The audio manager handles missing BGM gracefully (the `play().catch(() => {})` call).

---

### Task 4: Replace Start Screen with Main Menu SVG

**Files:**
- Modify: `pipes/index.html` (SVG overlays section, lines ~299-308)

- [ ] **Step 1: Replace the startHintG SVG group**

Find the existing start hint block:
```html
<!-- Start hint -->
<g id="startHintG" opacity="1">
  <rect x="90" y="370" width="360" height="220" rx="22" fill="#20201f" opacity="0.78"/>
  <text x="270" y="460" ...>PIPES</text>
  <text x="270" y="498" ...>TAP OR PRESS SPACE TO FLAP</text>
  <g transform="translate(270 548)">
    <rect x="-80" y="-16" width="160" height="36" rx="18" fill="#ff6b5b"/>
    <text ...>START</text>
  </g>
</g>
```

Replace it with:

```html
<!-- Main menu -->
<g id="menuG" opacity="1">
  <rect width="540" height="960" fill="#000" opacity="0.3"/>
  <rect x="90" y="260" width="360" height="380" rx="22" fill="#20201f" opacity="0.82"/>
  <text x="270" y="350" text-anchor="middle" font-family="Rubik" font-weight="900" font-size="52" fill="#fff" letter-spacing="4">PIPES</text>
  <text x="270" y="385" text-anchor="middle" font-family="Rubik" font-weight="500" font-size="12" fill="#9aa0ae" letter-spacing="3">FLAPPY PIPES GAME</text>

  <!-- Start button -->
  <g id="menuStartBtn" style="cursor:pointer">
    <rect x="150" y="420" width="240" height="50" rx="25" fill="#ff6b5b"/>
    <text x="270" y="452" text-anchor="middle" font-family="Rubik" font-weight="700" font-size="18" fill="#fff" letter-spacing="2">START</text>
  </g>

  <!-- Leaderboards button -->
  <g id="menuLeaderBtn" style="cursor:pointer">
    <rect x="150" y="485" width="240" height="50" rx="25" fill="#4aa8e8"/>
    <text x="270" y="517" text-anchor="middle" font-family="Rubik" font-weight="700" font-size="18" fill="#fff" letter-spacing="2">LEADERBOARDS</text>
  </g>

  <!-- Settings button -->
  <g id="menuSettingsBtn" style="cursor:pointer">
    <rect x="150" y="550" width="240" height="50" rx="25" fill="#6e7486"/>
    <text x="270" y="582" text-anchor="middle" font-family="Rubik" font-weight="700" font-size="18" fill="#fff" letter-spacing="2">SETTINGS</text>
  </g>
</g>
```

- [ ] **Step 2: Add Leaderboard overlay SVG**

Add after the `menuG` group, inside the SVG:

```html
<!-- Leaderboard overlay -->
<g id="leaderboardG" opacity="0" style="pointer-events:none">
  <rect width="540" height="960" fill="#000" opacity="0.55"/>
  <rect x="40" y="80" width="460" height="760" rx="24" fill="#fffbef" stroke="#2a1a10" stroke-width="4"/>
  <text x="270" y="140" text-anchor="middle" font-family="Rubik" font-weight="900" font-size="32" fill="#2a1a10">LEADERBOARDS</text>
  <line x1="80" y1="160" x2="460" y2="160" stroke="#2a1a10" stroke-opacity="0.15" stroke-width="2"/>

  <!-- Tabs -->
  <g id="lbTabGlobal" style="cursor:pointer">
    <rect x="80" y="175" width="180" height="40" rx="12" fill="#ff6b5b"/>
    <text x="170" y="201" text-anchor="middle" font-family="Rubik" font-weight="700" font-size="14" fill="#fff" letter-spacing="1">GLOBAL</text>
  </g>
  <g id="lbTabMine" style="cursor:pointer">
    <rect x="280" y="175" width="180" height="40" rx="12" fill="#cdd1dc"/>
    <text x="370" y="201" text-anchor="middle" font-family="Rubik" font-weight="700" font-size="14" fill="#2a1a10" letter-spacing="1">MY SCORES</text>
  </g>

  <!-- Score rows container -->
  <g id="lbRows" transform="translate(0 230)"></g>

  <!-- Loading / error state -->
  <text id="lbStatus" x="270" y="450" text-anchor="middle" font-family="Rubik" font-weight="500" font-size="16" fill="#6e7486" opacity="0"></text>

  <!-- Back button -->
  <g id="lbBackBtn" style="cursor:pointer">
    <rect x="170" y="770" width="200" height="44" rx="22" fill="#ff6b5b"/>
    <text x="270" y="798" text-anchor="middle" font-family="Rubik" font-weight="700" font-size="15" fill="#fff" letter-spacing="1.5">BACK</text>
  </g>
</g>
```

- [ ] **Step 3: Add Settings overlay SVG**

Add after the leaderboard overlay:

```html
<!-- Settings overlay -->
<g id="settingsG" opacity="0" style="pointer-events:none">
  <rect width="540" height="960" fill="#000" opacity="0.55"/>
  <rect x="70" y="260" width="400" height="380" rx="24" fill="#fffbef" stroke="#2a1a10" stroke-width="4"/>
  <text x="270" y="320" text-anchor="middle" font-family="Rubik" font-weight="900" font-size="32" fill="#2a1a10">SETTINGS</text>
  <line x1="120" y1="340" x2="420" y2="340" stroke="#2a1a10" stroke-opacity="0.15" stroke-width="2"/>

  <!-- Music label + mute button -->
  <text x="120" y="385" font-family="Rubik" font-weight="700" font-size="16" fill="#2a1a10">MUSIC</text>
  <g id="bgmMuteBtn" style="cursor:pointer">
    <rect x="370" y="367" width="60" height="28" rx="14" fill="#44c4a9"/>
    <text id="bgmMuteText" x="400" y="386" text-anchor="middle" font-family="Rubik" font-weight="700" font-size="11" fill="#fff">ON</text>
  </g>

  <!-- Music volume (HTML range input will overlay this area) -->
  <rect x="120" y="400" width="310" height="8" rx="4" fill="#e0ddd4"/>
  <rect id="bgmFill" x="120" y="400" width="217" height="8" rx="4" fill="#44c4a9"/>
  <circle id="bgmKnob" cx="337" cy="404" r="14" fill="#fff" stroke="#44c4a9" stroke-width="3" style="cursor:pointer"/>

  <!-- SFX label + mute button -->
  <text x="120" y="470" font-family="Rubik" font-weight="700" font-size="16" fill="#2a1a10">SOUND FX</text>
  <g id="sfxMuteBtn" style="cursor:pointer">
    <rect x="370" y="452" width="60" height="28" rx="14" fill="#4aa8e8"/>
    <text id="sfxMuteText" x="400" y="471" text-anchor="middle" font-family="Rubik" font-weight="700" font-size="11" fill="#fff">ON</text>
  </g>

  <!-- SFX volume -->
  <rect x="120" y="485" width="310" height="8" rx="4" fill="#e0ddd4"/>
  <rect id="sfxFill" x="120" y="485" width="248" height="8" rx="4" fill="#4aa8e8"/>
  <circle id="sfxKnob" cx="368" cy="489" r="14" fill="#fff" stroke="#4aa8e8" stroke-width="3" style="cursor:pointer"/>

  <!-- Back button -->
  <g id="settingsBackBtn" style="cursor:pointer">
    <rect x="170" y="540" width="200" height="44" rx="22" fill="#ff6b5b"/>
    <text x="270" y="568" text-anchor="middle" font-family="Rubik" font-weight="700" font-size="15" fill="#fff" letter-spacing="1.5">BACK</text>
  </g>
</g>
```

---

### Task 5: Redesign Game Over + Pause SVG Overlays

**Files:**
- Modify: `pipes/index.html` (game over and pause SVG groups)

- [ ] **Step 1: Replace the game over overlay**

Find the existing `gameOverG` group (lines ~317-338) and replace with:

```html
<!-- Game over overlay -->
<g id="gameOverG" opacity="0" style="pointer-events:none">
  <rect width="540" height="960" fill="#000" opacity="0.55"/>
  <rect x="50" y="200" width="440" height="540" rx="24" fill="#fffbef" stroke="#2a1a10" stroke-width="4"/>
  <text x="270" y="270" text-anchor="middle" font-family="Rubik" font-weight="900" font-size="42" fill="#2a1a10" letter-spacing="1">GAME OVER</text>
  <line x1="100" y1="290" x2="440" y2="290" stroke="#2a1a10" stroke-opacity="0.15" stroke-width="2"/>

  <!-- Medal slot -->
  <g id="medalSlot" transform="translate(140 380)"></g>

  <g transform="translate(260 340)">
    <text font-family="Rubik" font-weight="500" font-size="14" fill="#6e7486" letter-spacing="2">SCORE</text>
    <text id="finalScore" y="38" font-family="Rubik" font-weight="900" font-size="38" fill="#2a1a10">0</text>
    <text y="72" font-family="Rubik" font-weight="500" font-size="14" fill="#6e7486" letter-spacing="2">BEST</text>
    <text id="finalBest" y="100" font-family="Rubik" font-weight="900" font-size="24" fill="#ff6b5b">0</text>
  </g>

  <!-- Name input area (foreignObject for HTML input inside SVG) -->
  <foreignObject x="100" y="470" width="340" height="45">
    <input id="scoreNameInput" type="text" maxlength="20" placeholder="Enter your name"
      style="width:100%;height:40px;border:2px solid #cdd1dc;border-radius:12px;padding:0 14px;
      font-family:Rubik,sans-serif;font-size:15px;font-weight:600;color:#2a1a10;background:#fff;
      outline:none;box-sizing:border-box;" />
  </foreignObject>

  <!-- Submit button -->
  <g id="goSubmitBtn" style="cursor:pointer">
    <rect x="100" y="525" width="340" height="44" rx="22" fill="#44c4a9"/>
    <text id="goSubmitText" x="270" y="553" text-anchor="middle" font-family="Rubik" font-weight="700" font-size="15" fill="#fff" letter-spacing="1.5">SUBMIT SCORE</text>
  </g>

  <!-- Retry button -->
  <g id="goRetryBtn" style="cursor:pointer">
    <rect x="100" y="585" width="160" height="44" rx="22" fill="#ff6b5b"/>
    <text x="180" y="613" text-anchor="middle" font-family="Rubik" font-weight="700" font-size="15" fill="#fff" letter-spacing="1.5">RETRY</text>
  </g>

  <!-- Menu button -->
  <g id="goMenuBtn" style="cursor:pointer">
    <rect x="280" y="585" width="160" height="44" rx="22" fill="#6e7486"/>
    <text x="360" y="613" text-anchor="middle" font-family="Rubik" font-weight="700" font-size="15" fill="#fff" letter-spacing="1.5">MENU</text>
  </g>
</g>
```

- [ ] **Step 2: Replace the pause overlay**

Find the existing `pauseG` group (lines ~310-315) and replace with:

```html
<!-- Pause overlay -->
<g id="pauseG" opacity="0" style="pointer-events:none">
  <rect width="540" height="960" fill="#000" opacity="0.45"/>
  <rect x="120" y="340" width="300" height="280" rx="22" fill="#20201f" opacity="0.9"/>
  <text x="270" y="410" text-anchor="middle" font-family="Rubik" font-weight="900" font-size="42" fill="#fff">PAUSED</text>

  <!-- Resume button -->
  <g id="pauseResumeBtn" style="cursor:pointer">
    <rect x="170" y="440" width="200" height="44" rx="22" fill="#44c4a9"/>
    <text x="270" y="468" text-anchor="middle" font-family="Rubik" font-weight="700" font-size="15" fill="#fff" letter-spacing="1.5">RESUME</text>
  </g>

  <!-- Menu button -->
  <g id="pauseMenuBtn" style="cursor:pointer">
    <rect x="170" y="500" width="200" height="44" rx="22" fill="#6e7486"/>
    <text x="270" y="528" text-anchor="middle" font-family="Rubik" font-weight="700" font-size="15" fill="#fff" letter-spacing="1.5">MENU</text>
  </g>

  <!-- Quit confirm (hidden by default) -->
  <g id="pauseConfirmG" opacity="0" style="pointer-events:none">
    <text x="270" y="570" text-anchor="middle" font-family="Rubik" font-weight="500" font-size="12" fill="#cdd1dc">Quit to menu? Progress will be lost.</text>
    <g id="pauseConfirmYes" style="cursor:pointer">
      <rect x="150" y="580" width="110" height="36" rx="18" fill="#ff6b5b"/>
      <text x="205" y="604" text-anchor="middle" font-family="Rubik" font-weight="700" font-size="13" fill="#fff">YES</text>
    </g>
    <g id="pauseConfirmNo" style="cursor:pointer">
      <rect x="280" y="580" width="110" height="36" rx="18" fill="#44c4a9"/>
      <text x="335" y="604" text-anchor="middle" font-family="Rubik" font-weight="700" font-size="13" fill="#fff">NO</text>
    </g>
  </g>
</g>
```

---

### Task 6: Game State Machine + Menu Navigation Logic

**Files:**
- Modify: `pipes/index.html` (JavaScript section)

This is the core wiring task — connecting all the new overlays to the game state machine.

- [ ] **Step 1: Update state mode and add DOM refs**

In the state object, change the initial mode:
```js
mode: 'menu',        // 'menu' | 'play' | 'pause' | 'over'
```

Add DOM refs after existing refs (near line ~492):
```js
const menuG = document.getElementById('menuG');
const leaderboardG = document.getElementById('leaderboardG');
const settingsG = document.getElementById('settingsG');
const scoreNameInput = document.getElementById('scoreNameInput');
```

- [ ] **Step 2: Add showMenu function**

Add after the existing `resetGame` function:

```js
function showMenu() {
  state.mode = 'menu';
  // Reset game visuals
  obstacleLayer.innerHTML = '';
  powerupLayer.innerHTML = '';
  state.obstacles = [];
  state.powerups = [];
  state.trail = [];
  state.ball = { x: BALL_X, y: 480, vy: 0, rot: 0 };
  state.score = 0;
  state.fx = { shield: 0, slowmo: 0, x2: 0 };
  updateFXHUD();
  _lastTierShown = -1;
  updateTierHUD(0);
  updateSky(0);
  scoreText.textContent = '0';

  // Hide all overlays, show menu
  gameOverG.setAttribute('opacity', '0');
  gameOverG.style.pointerEvents = 'none';
  pauseG.setAttribute('opacity', '0');
  pauseG.style.pointerEvents = 'none';
  leaderboardG.setAttribute('opacity', '0');
  leaderboardG.style.pointerEvents = 'none';
  settingsG.setAttribute('opacity', '0');
  settingsG.style.pointerEvents = 'none';
  menuG.setAttribute('opacity', '1');
  menuG.style.pointerEvents = 'auto';

  if (pauseBtn) pauseBtn.style.display = 'none';

  // Hide score/tier HUD on menu
  document.getElementById('uiLayer').setAttribute('opacity', '0');

  AudioManager.fadeBGM(AudioManager.getSettings().bgmMuted ? 0 : AudioManager.getSettings().bgmVolume, 400);
}
```

- [ ] **Step 3: Update startGame to hide menu and show HUD**

In the existing `startGame()` function, add at the top (after `state.mode = 'play'`):

```js
menuG.setAttribute('opacity', '0');
menuG.style.pointerEvents = 'none';
document.getElementById('uiLayer').setAttribute('opacity', '1');
```

Also add audio calls:
```js
AudioManager.init();
AudioManager.playSFX('click');
AudioManager.playBGM();
```

- [ ] **Step 4: Update gameOver to show new buttons and prefill name**

In the existing `gameOver()` function, add:

```js
gameOverG.style.pointerEvents = 'auto';

// Prefill name input
if (scoreNameInput) {
  scoreNameInput.value = LeaderboardAPI.getStoredName();
  scoreNameInput.disabled = false;
}
// Reset submit button
const submitText = document.getElementById('goSubmitText');
if (submitText) submitText.textContent = 'SUBMIT SCORE';
const submitRect = document.querySelector('#goSubmitBtn rect');
if (submitRect) submitRect.setAttribute('fill', '#44c4a9');

AudioManager.playSFX('hit');
AudioManager.fadeBGM(0, 500);
```

- [ ] **Step 5: Update togglePause**

Replace the existing `togglePause` function:

```js
function togglePause() {
  if (state.mode === 'play') {
    state.mode = 'pause';
    pauseG.setAttribute('opacity', '1');
    pauseG.style.pointerEvents = 'auto';
    // Reset confirm state
    const confirmG = document.getElementById('pauseConfirmG');
    if (confirmG) { confirmG.setAttribute('opacity', '0'); confirmG.style.pointerEvents = 'none'; }
    if (pauseBtn) pauseBtn.textContent = '▶';
  } else if (state.mode === 'pause') {
    state.mode = 'play';
    pauseG.setAttribute('opacity', '0');
    pauseG.style.pointerEvents = 'none';
    if (pauseBtn) pauseBtn.textContent = '⏸';
    state.lastT = performance.now();
  }
}
```

- [ ] **Step 6: Update flap to not auto-start from menu**

Replace the `flap` function:

```js
function flap() {
  if (state.mode === 'menu') return;
  if (state.mode === 'over') return;
  if (state.mode !== 'play') return;
  state.ball.vy = -tweaks.flap;
  state.trail.push({ x: state.ball.x, y: state.ball.y, t: performance.now() });
  if (state.trail.length > 6) state.trail.shift();
  AudioManager.playSFX('flap');
}
```

- [ ] **Step 7: Update input handlers**

Replace the keyboard handler:

```js
function onKey(e) {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.key === ' ' || e.key === 'Spacebar') {
    e.preventDefault();
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    flap();
  } else if (e.code === 'KeyP') {
    if (state.mode === 'play' || state.mode === 'pause') togglePause();
  } else if (e.code === 'Escape') {
    if (state.mode === 'pause') togglePause();
  }
}
```

Update the stage pointerdown handler:

```js
stage.addEventListener('pointerdown', (e) => {
  if (e.target.closest('#pauseBtn')) return;
  if (e.target.closest('#menuG')) return;
  if (e.target.closest('#gameOverG')) return;
  if (e.target.closest('#pauseG')) return;
  if (e.target.closest('#leaderboardG')) return;
  if (e.target.closest('#settingsG')) return;
  e.preventDefault();
  stage.focus();
  if (state.mode === 'play') flap();
});
```

- [ ] **Step 8: Wire menu button click handlers**

Add after the input section:

```js
// ===== Menu button handlers =====
document.getElementById('menuStartBtn')?.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  AudioManager.init();
  startGame();
});

document.getElementById('menuLeaderBtn')?.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  AudioManager.init();
  AudioManager.playSFX('click');
  showLeaderboard();
});

document.getElementById('menuSettingsBtn')?.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  AudioManager.init();
  AudioManager.playSFX('click');
  showSettings();
});

// Game over buttons
document.getElementById('goSubmitBtn')?.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  submitScore();
});

document.getElementById('goRetryBtn')?.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  AudioManager.playSFX('click');
  gameOverG.setAttribute('opacity', '0');
  gameOverG.style.pointerEvents = 'none';
  startGame();
});

document.getElementById('goMenuBtn')?.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  AudioManager.playSFX('click');
  showMenu();
});

// Pause buttons
document.getElementById('pauseResumeBtn')?.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  AudioManager.playSFX('click');
  togglePause();
});

document.getElementById('pauseMenuBtn')?.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  AudioManager.playSFX('click');
  const confirmG = document.getElementById('pauseConfirmG');
  if (confirmG) { confirmG.setAttribute('opacity', '1'); confirmG.style.pointerEvents = 'auto'; }
});

document.getElementById('pauseConfirmYes')?.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  AudioManager.playSFX('click');
  pauseG.setAttribute('opacity', '0');
  pauseG.style.pointerEvents = 'none';
  showMenu();
});

document.getElementById('pauseConfirmNo')?.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  AudioManager.playSFX('click');
  const confirmG = document.getElementById('pauseConfirmG');
  if (confirmG) { confirmG.setAttribute('opacity', '0'); confirmG.style.pointerEvents = 'none'; }
});
```

- [ ] **Step 9: Add score audio hooks in the update function**

In the `update()` function, find the scoring block where `state.score += inc` and add after `updateSky`:

```js
AudioManager.playSFX('score');
```

Find the milestone `triggerBanner(m)` call and add after it:

```js
AudioManager.playSFX('milestone');
```

Find the `collectPowerup` function and add inside it:

```js
AudioManager.playSFX('powerup');
```

- [ ] **Step 10: Update boot to start in menu mode**

Replace the boot function:

```js
function boot() {
  applyBallPalette();
  initTrailPool();
  initClouds();
  initHills();
  updateSky(0);
  bindTweaks();
  if (IS_MOBILE) {
    const controls = document.getElementById('controls');
    if (controls) controls.style.display = 'none';
  }
  // Start in menu mode
  showMenu();
  state.lastT = performance.now();
  requestAnimationFrame(loop);
  stage.focus();
}
```

---

### Task 7: Leaderboard Screen Logic

**Files:**
- Modify: `pipes/index.html` (JavaScript section)

- [ ] **Step 1: Add leaderboard display functions**

```js
// ===== Leaderboard screen =====
let lbActiveTab = 'global';

function showLeaderboard() {
  menuG.setAttribute('opacity', '0');
  menuG.style.pointerEvents = 'none';
  leaderboardG.setAttribute('opacity', '1');
  leaderboardG.style.pointerEvents = 'auto';
  lbActiveTab = 'global';
  updateLBTabs();
  loadLeaderboardData();
}

function updateLBTabs() {
  const globalRect = document.querySelector('#lbTabGlobal rect');
  const globalText = document.querySelector('#lbTabGlobal text');
  const mineRect = document.querySelector('#lbTabMine rect');
  const mineText = document.querySelector('#lbTabMine text');
  if (lbActiveTab === 'global') {
    globalRect.setAttribute('fill', '#ff6b5b');
    globalText.setAttribute('fill', '#fff');
    mineRect.setAttribute('fill', '#cdd1dc');
    mineText.setAttribute('fill', '#2a1a10');
  } else {
    globalRect.setAttribute('fill', '#cdd1dc');
    globalText.setAttribute('fill', '#2a1a10');
    mineRect.setAttribute('fill', '#ff6b5b');
    mineText.setAttribute('fill', '#fff');
  }
}

async function loadLeaderboardData() {
  const rows = document.getElementById('lbRows');
  const status = document.getElementById('lbStatus');
  rows.innerHTML = '';
  status.setAttribute('opacity', '1');
  status.textContent = 'Loading...';

  try {
    let data;
    if (lbActiveTab === 'global') {
      data = await LeaderboardAPI.getTopScores(10);
    } else {
      const name = LeaderboardAPI.getStoredName();
      if (!name) {
        status.textContent = 'Play a game and submit your score first!';
        return;
      }
      data = await LeaderboardAPI.getPlayerScores(name, 10);
    }

    status.setAttribute('opacity', '0');
    if (data.length === 0) {
      status.setAttribute('opacity', '1');
      status.textContent = 'No scores yet!';
      return;
    }

    data.forEach((entry, i) => {
      const y = i * 48;
      const rank = entry.rank || (i + 1);
      const name = entry.name || LeaderboardAPI.getStoredName();
      const date = new Date(entry.created_at);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const bg = i % 2 === 0 ? '#f5f0e0' : '#fffbef';
      rows.innerHTML += `
        <g transform="translate(0 ${y})">
          <rect x="80" y="0" width="380" height="44" rx="8" fill="${bg}"/>
          <text x="100" y="28" font-family="Rubik" font-weight="900" font-size="16" fill="#6e7486">#${rank}</text>
          ${lbActiveTab === 'global' ? `<text x="150" y="28" font-family="Rubik" font-weight="700" font-size="15" fill="#2a1a10">${name.length > 12 ? name.slice(0, 12) + '...' : name}</text>` : ''}
          <text x="380" y="28" text-anchor="end" font-family="Rubik" font-weight="900" font-size="18" fill="#ff6b5b">${entry.score}</text>
          <text x="440" y="28" text-anchor="end" font-family="Rubik" font-weight="500" font-size="11" fill="#9aa0ae">${dateStr}</text>
        </g>
      `;
    });
  } catch (err) {
    status.textContent = 'Could not load scores';
  }
}

// Tab click handlers
document.getElementById('lbTabGlobal')?.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  if (lbActiveTab === 'global') return;
  AudioManager.playSFX('click');
  lbActiveTab = 'global';
  updateLBTabs();
  loadLeaderboardData();
});

document.getElementById('lbTabMine')?.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  if (lbActiveTab === 'mine') return;
  AudioManager.playSFX('click');
  lbActiveTab = 'mine';
  updateLBTabs();
  loadLeaderboardData();
});

document.getElementById('lbBackBtn')?.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  AudioManager.playSFX('click');
  leaderboardG.setAttribute('opacity', '0');
  leaderboardG.style.pointerEvents = 'none';
  menuG.setAttribute('opacity', '1');
  menuG.style.pointerEvents = 'auto';
});
```

- [ ] **Step 2: Add score submission function**

```js
async function submitScore() {
  const input = document.getElementById('scoreNameInput');
  const submitText = document.getElementById('goSubmitText');
  const submitRect = document.querySelector('#goSubmitBtn rect');
  if (!input || !submitText) return;

  const name = input.value.trim();
  if (!name || name.length > 20) {
    input.style.borderColor = '#ff4a4a';
    setTimeout(() => input.style.borderColor = '#cdd1dc', 800);
    return;
  }

  submitText.textContent = 'SUBMITTING...';
  input.disabled = true;

  const result = await LeaderboardAPI.submitScore(name, state.score);

  if (result.offline) {
    submitText.textContent = 'SAVED LOCALLY';
  } else {
    submitText.textContent = result.rank ? `RANK #${result.rank}` : 'SUBMITTED';
  }
  submitRect.setAttribute('fill', '#6e7486');
  AudioManager.playSFX('submit');
}
```

---

### Task 8: Settings Screen Logic

**Files:**
- Modify: `pipes/index.html` (JavaScript section)

- [ ] **Step 1: Add settings screen functions**

```js
// ===== Settings screen =====
function showSettings() {
  menuG.setAttribute('opacity', '0');
  menuG.style.pointerEvents = 'none';
  settingsG.setAttribute('opacity', '1');
  settingsG.style.pointerEvents = 'auto';
  syncSettingsUI();
}

function syncSettingsUI() {
  const s = AudioManager.getSettings();
  const bgmFill = document.getElementById('bgmFill');
  const bgmKnob = document.getElementById('bgmKnob');
  const sfxFill = document.getElementById('sfxFill');
  const sfxKnob = document.getElementById('sfxKnob');
  const bgmMuteText = document.getElementById('bgmMuteText');
  const sfxMuteText = document.getElementById('sfxMuteText');
  const bgmMuteRect = document.querySelector('#bgmMuteBtn rect');
  const sfxMuteRect = document.querySelector('#sfxMuteBtn rect');

  const sliderW = 310;
  const sliderX = 120;

  if (bgmFill) bgmFill.setAttribute('width', s.bgmVolume * sliderW);
  if (bgmKnob) bgmKnob.setAttribute('cx', sliderX + s.bgmVolume * sliderW);
  if (sfxFill) sfxFill.setAttribute('width', s.sfxVolume * sliderW);
  if (sfxKnob) sfxKnob.setAttribute('cx', sliderX + s.sfxVolume * sliderW);

  if (bgmMuteText) bgmMuteText.textContent = s.bgmMuted ? 'OFF' : 'ON';
  if (bgmMuteRect) bgmMuteRect.setAttribute('fill', s.bgmMuted ? '#6e7486' : '#44c4a9');
  if (sfxMuteText) sfxMuteText.textContent = s.sfxMuted ? 'OFF' : 'ON';
  if (sfxMuteRect) sfxMuteRect.setAttribute('fill', s.sfxMuted ? '#6e7486' : '#4aa8e8');
}

// SVG slider drag handling
function setupSliderDrag(knobId, fillId, y, onChange) {
  const knob = document.getElementById(knobId);
  const fill = document.getElementById(fillId);
  if (!knob) return;

  const sliderX = 120, sliderW = 310;
  let dragging = false;

  function getVal(clientX) {
    const svgRect = world.getBoundingClientRect();
    const svgX = (clientX - svgRect.left) / svgRect.width * 540;
    return Math.max(0, Math.min(1, (svgX - sliderX) / sliderW));
  }

  function update(clientX) {
    const v = getVal(clientX);
    knob.setAttribute('cx', sliderX + v * sliderW);
    if (fill) fill.setAttribute('width', v * sliderW);
    onChange(v);
  }

  knob.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    dragging = true;
    knob.setPointerCapture(e.pointerId);
  });

  knob.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    e.stopPropagation();
    update(e.clientX);
  });

  knob.addEventListener('pointerup', (e) => {
    dragging = false;
  });
}

setupSliderDrag('bgmKnob', 'bgmFill', 404, (v) => AudioManager.setBGMVolume(v));
setupSliderDrag('sfxKnob', 'sfxFill', 489, (v) => AudioManager.setSFXVolume(v));

document.getElementById('bgmMuteBtn')?.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  AudioManager.toggleBGMMute();
  syncSettingsUI();
  AudioManager.playSFX('click');
});

document.getElementById('sfxMuteBtn')?.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  AudioManager.toggleSFXMute();
  syncSettingsUI();
  AudioManager.playSFX('click');
});

document.getElementById('settingsBackBtn')?.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  AudioManager.playSFX('click');
  settingsG.setAttribute('opacity', '0');
  settingsG.style.pointerEvents = 'none';
  menuG.setAttribute('opacity', '1');
  menuG.style.pointerEvents = 'auto';
});
```

---

### Task 9: Persist Best Score via localStorage

**Files:**
- Modify: `pipes/index.html`

- [ ] **Step 1: Load and save best score**

Add after the state declaration:

```js
state.best = parseInt(localStorage.getItem('pipes_best_score')) || 0;
```

In the `gameOver()` function, after `state.best = Math.max(state.best, state.score)`, add:

```js
localStorage.setItem('pipes_best_score', state.best);
```

Update `bestText` on boot:

In the `boot()` function, add:
```js
bestText.textContent = state.best;
```

---

### Task 10: Integration Testing

**Files:** None (manual testing)

- [ ] **Step 1: Test main menu flow**

1. Open `pipes/index.html` in browser
2. Verify menu shows: PIPES title, START, LEADERBOARDS, SETTINGS buttons
3. Background scenery (clouds, hills, sky) should animate
4. Score/tier HUD should be hidden

- [ ] **Step 2: Test gameplay flow**

1. Click START — game begins, menu disappears, HUD appears
2. Flap works (tap/space), scoring works
3. Pause button (mobile) or P key shows pause overlay with Resume and Menu
4. Pause → Menu shows confirmation → Yes goes to main menu
5. Game over shows medal, score, name input, submit, retry, menu buttons

- [ ] **Step 3: Test leaderboard**

1. From menu click LEADERBOARDS
2. Global tab loads (may show "No scores yet" or real data)
3. My Scores tab shows "Play a game first" if no name saved
4. Back button returns to menu
5. Submit a score from game over, then check leaderboard shows it

- [ ] **Step 4: Test settings**

1. From menu click SETTINGS
2. Drag BGM slider — music volume changes
3. Drag SFX slider — click sounds change volume
4. Mute toggles work
5. Settings persist after page reload
6. Back button returns to menu

- [ ] **Step 5: Test audio**

1. First tap/click initializes audio context
2. Flap produces chirp sound
3. Scoring produces ding
4. Game over produces thud
5. BGM loops during gameplay
6. BGM fades on game over

- [ ] **Step 6: Test mobile**

1. Open on phone-sized viewport
2. Keyboard hints hidden
3. Pause button visible during gameplay
4. All menu buttons are tappable (adequate touch targets)
5. Name input works on mobile keyboard
6. Settings sliders draggable on touch
