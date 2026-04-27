const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function getPool() {
  return mysql.createPool({
    host: process.env.MYSQL_HOST || process.env.MYSQLHOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || process.env.MYSQLPORT || '3306'),
    user: process.env.MYSQL_USER || process.env.MYSQLUSER || 'root',
    password: process.env.MYSQL_PASSWORD || process.env.MYSQLPASSWORD || '',
    database: process.env.MYSQL_DATABASE || process.env.MYSQLDATABASE || 'digigames',
    waitForConnections: true,
    connectionLimit: 2,
    multipleStatements: true,
  });
}

async function ensureMigrationsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function getApplied(pool) {
  const [rows] = await pool.query('SELECT name FROM migrations ORDER BY id');
  return new Set(rows.map(r => r.name));
}

function getPending(applied) {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
  return files.filter(f => !applied.has(f));
}

async function runMigrations() {
  const migrationPool = await getPool();
  try {
    await ensureMigrationsTable(migrationPool);
    const applied = await getApplied(migrationPool);
    const pending = getPending(applied);

    if (pending.length === 0) {
      console.log('No pending migrations.');
      return 0;
    }

    for (const file of pending) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8').trim();
      console.log(`Running migration: ${file}`);
      const conn = await migrationPool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query(sql);
        await conn.query('INSERT INTO migrations (name) VALUES (?)', [file]);
        await conn.commit();
        console.log(`  Applied: ${file}`);
      } catch (err) {
        await conn.rollback();
        console.error(`  FAILED: ${file}`, err.message);
        throw err;
      } finally {
        conn.release();
      }
    }

    console.log(`Applied ${pending.length} migration(s).`);
    return pending.length;
  } finally {
    await migrationPool.end();
  }
}

async function showStatus() {
  const pool = await getPool();
  try {
    await ensureMigrationsTable(pool);
    const applied = await getApplied(pool);
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log('Migration status:');
    for (const f of files) {
      console.log(`  ${applied.has(f) ? '[x]' : '[ ]'} ${f}`);
    }
    const pending = files.filter(f => !applied.has(f));
    console.log(`\n${applied.size} applied, ${pending.length} pending`);
  } finally {
    await pool.end();
  }
}

async function main() {
  const cmd = process.argv[2] || 'up';

  if (cmd === 'up') {
    await runMigrations();
  } else if (cmd === 'status') {
    await showStatus();
  } else {
    console.log('Usage: node migrate.js [up|status]');
  }
}

module.exports = { runMigrations, getPool };

if (require.main === module) {
  main().catch(err => {
    console.error('Migration failed:', err.message);
    process.exit(1);
  });
}
