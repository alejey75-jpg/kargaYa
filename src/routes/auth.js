// routes/auth.js — Register y Login
const { Router } = require('express');
const router = Router();
const { UserRepo } = require('../db/repositories');
const { signToken, signRefreshToken, hashPassword, verifyPassword } = require('../middleware/auth');

// POST /api/v1/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ ok: false, error: 'name, email y password son requeridos' });
    if (password.length < 8)
      return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 8 caracteres' });

    const existing = await UserRepo.findByEmail(email);
    if (existing)
      return res.status(409).json({ ok: false, error: 'Ya existe una cuenta con ese email' });

    const passwordHash = await hashPassword(password);
    const user = await UserRepo.create({ name, email, phone, passwordHash });

    const token   = signToken({ userId: user.id, email: user.email, name: user.name });
    const refresh = signRefreshToken(user.id);

    res.status(201).json({
      ok: true,
      message: `¡Bienvenido a KargaYa, ${user.name}!`,
      token,
      refresh_token: refresh,
      user: { id: user.id, name: user.name, email: user.email, wallet_balance: 0 },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/v1/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ ok: false, error: 'email y password son requeridos' });

    const user = await UserRepo.findByEmail(email);
    if (!user)
      return res.status(401).json({ ok: false, error: 'Credenciales incorrectas' });

    // En modo memoria no hay hash — aceptar cualquier contraseña para dev
    const valid = user.password_hash
      ? await verifyPassword(password, user.password_hash)
      : true; // modo dev

    if (!valid)
      return res.status(401).json({ ok: false, error: 'Credenciales incorrectas' });

    const token   = signToken({ userId: user.id, email: user.email, name: user.name });
    const refresh = signRefreshToken(user.id);

    res.json({
      ok: true,
      token,
      refresh_token: refresh,
      user: { id: user.id, name: user.name, email: user.email, wallet_balance: user.wallet_balance },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/v1/auth/me — Perfil del usuario autenticado
router.get('/me', require('../middleware/auth').protect, async (req, res) => {
  try {
    const user = await UserRepo.findById(req.user.userId);
    if (!user) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const { password_hash, ...safe } = user;
    res.json({ ok: true, data: safe });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
