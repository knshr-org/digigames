const path = require('path');
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { runMigrations } = require('./migrate');

const app = express();
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'https://digigames.fun,https://www.digigames.fun').split(',');
app.use(cors({
  origin(origin, cb) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(null, false);
  },
}));
app.use(express.json());

const STATIC_ROOT = path.join(__dirname, '..', '..');
app.use(express.static(STATIC_ROOT));

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
    if (!Number.isInteger(score) || score < 0) {
      return res.status(400).json({ error: 'Score must be a non-negative integer' });
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
      `SELECT s.name, s.score, s.created_at
       FROM scores s
       INNER JOIN (
         SELECT name, MAX(id) AS latest_id FROM scores GROUP BY name
       ) latest ON s.id = latest.latest_id
       ORDER BY s.score DESC, s.created_at ASC
       LIMIT ?`,
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
