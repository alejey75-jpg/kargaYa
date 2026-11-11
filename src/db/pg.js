// db/pg.js — Pool de conexión a PostgreSQL
// Si DB_URL no está configurada, usa la base en memoria automáticamente

const { Pool } = require('pg');

let pool = null;
let usingMemory = false;

function createPool() {
  const url = process.env.DB_URL || process.env.DATABASE_URL; // DATABASE_URL: Railway, Render, Neon, Supabase
  const ssl  = process.env.DB_SSL === 'true';

  const config = url
    ? { connectionString: url, ssl: ssl ? { rejectUnauthorized: false } : false }
    : {
        host:     process.env.DB_HOST     || 'localhost',
        port:     parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME     || 'kargaya_db',
        user:     process.env.DB_USER     || 'kargaya_user',
        password: process.env.DB_PASSWORD || 'kargaya_pass',
        ssl:      ssl ? { rejectUnauthorized: false } : false,
      };

  config.min = parseInt(process.env.DB_POOL_MIN || '2');
  config.max = parseInt(process.env.DB_POOL_MAX || '10');
  config.idleTimeoutMillis = 30000;
  config.connectionTimeoutMillis = 5000;

  return new Pool(config);
}

// Inicializar y verificar conexión al arrancar
async function initDb() {
  // Si no hay config de DB, usar memoria
  if (!process.env.DB_URL && !process.env.DATABASE_URL && !process.env.DB_HOST) {
    console.log('[DB] Sin config PostgreSQL — usando base en memoria');
    usingMemory = true;
    return false;
  }

  try {
    pool = createPool();
    const client = await pool.connect();
    const res = await client.query('SELECT version()');
    client.release();

    const version = res.rows[0].version.split(' ').slice(0, 2).join(' ');
    console.log(`[DB] PostgreSQL conectado — ${version}`);
    console.log(`[DB] Pool: min=${pool.options.min} max=${pool.options.max}`);
    return true;
  } catch (err) {
    console.warn(`[DB] No se pudo conectar a PostgreSQL: ${err.message}`);
    console.warn('[DB] Fallback → base en memoria activa');
    pool = null;
    usingMemory = true;
    return false;
  }
}

// ── QUERY WRAPPER ─────────────────────────────────────────────
// Ejecuta una query y libera la conexión automáticamente
async function query(sql, params = []) {
  if (!pool) throw new Error('PostgreSQL no está conectado');
  const start = Date.now();
  try {
    const res = await pool.query(sql, params);
    const duration = Date.now() - start;
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[DB] ${sql.trim().split('\n')[0].substring(0, 60)} — ${duration}ms (${res.rowCount} rows)`);
    }
    return res;
  } catch (err) {
    console.error(`[DB] Error en query: ${err.message}`);
    console.error(`[DB] SQL: ${sql.substring(0, 200)}`);
    throw err;
  }
}

// ── TRANSACTION HELPER ────────────────────────────────────────
// Ejecuta múltiples queries en una transacción atómica
// Uso: await transaction(async (q) => { await q('INSERT...'); await q('UPDATE...'); })
async function transaction(fn) {
  if (!pool) throw new Error('PostgreSQL no está conectado');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn((sql, params) => client.query(sql, params));
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Estado del pool para el health check
function poolStats() {
  if (!pool) return { connected: false, mode: 'memory' };
  return {
    connected: true,
    mode: 'postgresql',
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
}

module.exports = { initDb, query, transaction, poolStats, isMemory: () => usingMemory };
