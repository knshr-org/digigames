const path = require('path');
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { runMigrations } = require('./migrate');

const app = express();
app.set('trust proxy', 1);
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'https://digigames.fun,https://www.digigames.fun').split(',');
app.use(cors({
  origin(origin, cb) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(null, false);
  },
}));
app.use(express.json());

const STATIC_ROOT = path.join(__dirname, '..');
app.use(express.static(STATIC_ROOT));

const JWT_SECRET = process.env.JWT_SECRET || 'digigames-dev-secret-change-in-prod';

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
  await runMigrations();
}

// --- Middleware ---

function authenticateOptional(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) { req.user = null; return next(); }
  try { req.user = jwt.verify(auth.slice(7), JWT_SECRET); } catch { req.user = null; }
  next();
}

// --- Rate limiters ---

const submitLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many submissions, try again later' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many requests, try again later' },
});

// --- Valid game IDs ---

const VALID_GAME_IDS = ['pipes', 'snake'];

// --- Auth routes ---

app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { name, username, password } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 50) {
      return res.status(400).json({ error: 'Name must be 1-50 characters' });
    }
    if (!username || typeof username !== 'string' || username.length < 3 || username.length > 30 || !/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({ error: 'Username must be 3-30 characters (letters, numbers, underscore only)' });
    }
    if (!password || typeof password !== 'string' || password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }

    const cleanName = name.trim();
    const cleanUsername = username.toLowerCase();

    const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [cleanUsername]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (name, username, password_hash) VALUES (?, ?, ?)',
      [cleanName, cleanUsername, hash]
    );

    const user = { id: result.insertId, name: cleanName, username: cleanUsername };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ token, user });
  } catch (err) {
    console.error('POST /api/auth/register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || typeof username !== 'string' || !password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const [rows] = await pool.query(
      'SELECT id, name, username, password_hash FROM users WHERE username = ?',
      [username.toLowerCase()]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const dbUser = rows[0];
    const match = await bcrypt.compare(password, dbUser.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = { id: dbUser.id, name: dbUser.name, username: dbUser.username };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user });
  } catch (err) {
    console.error('POST /api/auth/login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    let payload;
    try {
      payload = jwt.verify(auth.slice(7), JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const [rows] = await pool.query('SELECT id, name, username FROM users WHERE id = ?', [payload.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/auth/me error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Score routes ---

app.post('/api/scores', submitLimiter, authenticateOptional, async (req, res) => {
  try {
    const { score } = req.body;
    const game_id = req.body.game_id || 'pipes';

    if (!VALID_GAME_IDS.includes(game_id)) {
      return res.status(400).json({ error: `game_id must be one of: ${VALID_GAME_IDS.join(', ')}` });
    }

    if (!Number.isInteger(score) || score < 0) {
      return res.status(400).json({ error: 'Score must be a non-negative integer' });
    }

    let playerName, userId;

    if (req.user) {
      playerName = req.user.name;
      userId = req.user.id;
    } else {
      const { name } = req.body;
      if (!name || typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 20) {
        return res.status(400).json({ error: 'Name must be 1-20 characters' });
      }
      playerName = name.trim();
      userId = null;
    }

    const [result] = await pool.query(
      'INSERT INTO scores (name, score, game_id, user_id) VALUES (?, ?, ?, ?)',
      [playerName, score, game_id, userId]
    );
    const [rankRows] = await pool.query(
      'SELECT COUNT(*) AS `rank` FROM scores WHERE score > ? AND game_id = ?',
      [score, game_id]
    );
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
    const game_id = req.query.game_id || 'pipes';

    if (!VALID_GAME_IDS.includes(game_id)) {
      return res.status(400).json({ error: `game_id must be one of: ${VALID_GAME_IDS.join(', ')}` });
    }

    const [rows] = await pool.query(
      `SELECT name, MAX(score) AS score, MAX(created_at) AS created_at
       FROM scores
       WHERE game_id = ?
       GROUP BY name
       ORDER BY score DESC, created_at ASC
       LIMIT ?`,
      [game_id, limit]
    );
    const ranked = rows.map((r, i) => ({ rank: i + 1, ...r }));
    res.json(ranked);
  } catch (err) {
    console.error('GET /api/scores/top error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/scores/player', authenticateOptional, async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
    const game_id = req.query.game_id || 'pipes';

    if (!VALID_GAME_IDS.includes(game_id)) {
      return res.status(400).json({ error: `game_id must be one of: ${VALID_GAME_IDS.join(', ')}` });
    }

    let rows;
    if (req.user) {
      [rows] = await pool.query(
        'SELECT score, created_at FROM scores WHERE user_id = ? AND game_id = ? ORDER BY score DESC LIMIT ?',
        [req.user.id, game_id, limit]
      );
    } else {
      const { name } = req.query;
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Name is required' });
      }
      [rows] = await pool.query(
        'SELECT score, created_at FROM scores WHERE name = ? AND game_id = ? ORDER BY score DESC LIMIT ?',
        [name.trim(), game_id, limit]
      );
    }
    res.json(rows);
  } catch (err) {
    console.error('GET /api/scores/player error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'db_error' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(STATIC_ROOT, 'index.html'));
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
initDB().then(() => {
  app.listen(PORT, HOST, () => console.log(`Pipes API listening on ${HOST}:${PORT}`));
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
