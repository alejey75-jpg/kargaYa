// middleware/auth.js — Autenticación JWT para KargaYa API
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { UserRepo } = require('../db/repositories');

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET es obligatorio en producción. Configúralo en las variables de entorno.');
}
const SECRET = process.env.JWT_SECRET || 'kargaya_dev_secret_solo_local';
const EXPIRES = process.env.JWT_EXPIRES_IN || '7d';

// ── GENERAR TOKENS ────────────────────────────────────────────
function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES });
}

function signRefreshToken(userId) {
  return jwt.sign({ userId, type: 'refresh' }, SECRET, { expiresIn: '30d' });
}

// ── MIDDLEWARE de protección ──────────────────────────────────
// Uso: router.get('/ruta', auth.protect, (req, res) => { req.user ... })
function protect(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ ok: false, error: 'Token requerido — Authorization: Bearer <token>' });

  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? 'Token expirado' : 'Token inválido';
    return res.status(401).json({ ok: false, error: msg });
  }
}

// Middleware opcional: no bloquea si no hay token, pero lo decodifica si existe
function optionalAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (header?.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(header.slice(7), SECRET);
    } catch (_) { /* silencioso */ }
  }
  next();
}

// ── HASH DE CONTRASEÑAS ───────────────────────────────────────
async function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

module.exports = { protect, optionalAuth, signToken, signRefreshToken, hashPassword, verifyPassword };
