// routes/reservations.js
const { Router } = require('express');
const router = Router();
const db = require('../db/memory');
const { calcPrice } = require('../services/pricing.service');

// POST /reservations — Crear reserva
router.post('/', (req, res) => {
  const { slot_id, user_id, vehicle_id, reserved_for } = req.body;

  if (!slot_id || !user_id || !reserved_for)
    return res.status(400).json({ ok: false, error: 'slot_id, user_id y reserved_for son requeridos' });

  const slot = db.SLOTS.find(s => s.id === slot_id);
  if (!slot) return res.status(404).json({ ok: false, error: 'Slot no encontrado' });
  if (slot.status !== 'available')
    return res.status(409).json({ ok: false, error: `Slot no disponible — estado actual: ${slot.status}` });

  const user = db.USERS.find(u => u.id === user_id);
  if (!user) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

  // Calcular precio actual y depósito (equivale a 10 kWh)
  const pricing = calcPrice(db.STATIONS.find(st => db.SLOTS.find(s => s.id === slot_id && s.station_id === st.id))?.id);
  const deposit = Math.round(pricing.final_price * 10);

  if (user.wallet_balance < deposit)
    return res.status(402).json({ ok: false, error: `Saldo insuficiente. Necesitas ${deposit} COP, tienes ${user.wallet_balance} COP` });

  const reservedAt = new Date(reserved_for);
  const expiresAt  = new Date(reservedAt.getTime() + 10 * 60 * 1000); // +10 min

  const reservation = {
    id: db.uuid(),
    slot_id, user_id, vehicle_id,
    reserved_for: reservedAt,
    expires_at:   expiresAt,
    window_minutes: 10,
    deposit_amount: deposit,
    status: 'active',
    created_at: new Date(),
  };

  // Bloquear slot y debitar depósito
  slot.status = 'reserved';
  user.wallet_balance -= deposit;
  db.RESERVATIONS.push(reservation);

  res.status(201).json({
    ok: true,
    message: 'Reserva creada exitosamente',
    data: reservation,
    deposit_charged: deposit,
    wallet_balance: user.wallet_balance,
  });
});

// GET /reservations/user/:userId — Reservas de un usuario
router.get('/user/:userId', (req, res) => {
  const reservations = db.RESERVATIONS
    .filter(r => r.user_id === req.params.userId)
    .map(r => ({
      ...r,
      slot: db.SLOTS.find(s => s.id === r.slot_id),
      station: db.STATIONS.find(st => {
        const slot = db.SLOTS.find(s => s.id === r.slot_id);
        return st.id === slot?.station_id;
      }),
    }))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  res.json({ ok: true, count: reservations.length, data: reservations });
});

// DELETE /reservations/:id — Cancelar reserva
router.delete('/:id', (req, res) => {
  const res_ = db.RESERVATIONS.find(r => r.id === req.params.id);
  if (!res_) return res.status(404).json({ ok: false, error: 'Reserva no encontrada' });
  if (res_.status !== 'active') return res.status(409).json({ ok: false, error: 'Reserva no está activa' });

  const minsUntil = (new Date(res_.reserved_for) - Date.now()) / 60000;
  const penalty = minsUntil < 30 ? res_.deposit_amount * 0.5 : 0; // Penalidad < 30 min
  const refund  = res_.deposit_amount - penalty;

  // Liberar slot y devolver depósito
  const slot = db.SLOTS.find(s => s.id === res_.slot_id);
  if (slot) slot.status = 'available';

  const user = db.USERS.find(u => u.id === res_.user_id);
  if (user) user.wallet_balance += refund;

  res_.status = 'cancelled';
  res_.cancelled_at = new Date();

  res.json({
    ok: true,
    message: 'Reserva cancelada',
    refund_amount: refund,
    penalty_amount: penalty,
    wallet_balance: user?.wallet_balance,
  });
});

module.exports = router;


// ─── routes/sessions.js ───────────────────────────────────────
const sessRouter = Router();
const { startTransaction, stopTransaction, getSlotTelemetry } = require('../ocpp/simulator');

// POST /sessions/start — Iniciar sesión de carga
sessRouter.post('/start', (req, res) => {
  const { slot_id, user_id, vehicle_id, battery_pct } = req.body;
  if (!slot_id || !user_id)
    return res.status(400).json({ ok: false, error: 'slot_id y user_id son requeridos' });

  const slot = db.SLOTS.find(s => s.id === slot_id);
  if (!slot) return res.status(404).json({ ok: false, error: 'Slot no encontrado' });
  if (!['available', 'reserved'].includes(slot.status))
    return res.status(409).json({ ok: false, error: `Slot ${slot.status} — no se puede iniciar sesión` });

  const station = db.STATIONS.find(st => db.SLOTS.some(s => s.id === slot_id && s.station_id === st.id));
  const pricing = calcPrice(station?.id);

  // Iniciar transacción OCPP
  const { transaction_id } = startTransaction(slot_id, user_id, battery_pct || 10);

  const session = {
    id: db.uuid(),
    slot_id, user_id, vehicle_id,
    started_at: new Date(),
    battery_start: battery_pct || 10,
    battery_current: battery_pct || 10,
    energy_kwh: 0,
    price_per_kwh: pricing.final_price,
    price_multiplier: pricing.multiplier,
    total_cost: 0,
    payment_method: 'wallet',
    ocpp_tx_id: transaction_id,
    status: 'active',
  };

  slot.status = 'charging';
  db.ACTIVE_SESSIONS.push(session);

  res.status(201).json({
    ok: true,
    message: 'Sesión iniciada. El cargador ha sido activado.',
    data: session,
    ocpp_transaction_id: transaction_id,
    pricing,
  });
});

// PUT /sessions/:id/stop — Terminar sesión
sessRouter.put('/:id/stop', (req, res) => {
  const session = db.ACTIVE_SESSIONS.find(s => s.id === req.params.id);
  if (!session) return res.status(404).json({ ok: false, error: 'Sesión no encontrada' });
  if (session.status !== 'active') return res.status(409).json({ ok: false, error: 'Sesión no está activa' });

  const result = stopTransaction(session.slot_id);
  const telem = getSlotTelemetry(session.slot_id);

  const finalKwh  = result?.energy_kwh || session.energy_kwh;
  const finalCost = Math.round(finalKwh * session.price_per_kwh);
  const finalBat  = telem?.battery_pct || session.battery_current;

  session.status     = 'completed';
  session.ended_at   = new Date();
  session.energy_kwh = finalKwh;
  session.battery_end = Math.round(finalBat);
  session.total_cost = finalCost;
  session.payment_status = 'paid';

  // Liberar slot
  const slot = db.SLOTS.find(s => s.id === session.slot_id);
  if (slot) slot.status = 'available';

  // Debitar de billetera
  const user = db.USERS.find(u => u.id === session.user_id);
  if (user) user.wallet_balance -= finalCost;

  const durationMin = Math.round((new Date(session.ended_at) - new Date(session.started_at)) / 60000);

  res.json({
    ok: true,
    message: 'Sesión finalizada exitosamente',
    summary: {
      session_id:    session.id,
      duration_min:  durationMin,
      energy_kwh:    finalKwh,
      battery_from:  session.battery_start,
      battery_to:    session.battery_end,
      price_per_kwh: session.price_per_kwh,
      total_cost:    finalCost,
      payment:       'Debitado de billetera VOLTIA',
      wallet_balance: user?.wallet_balance,
    },
  });
});

// GET /sessions/history/:userId — Historial del conductor
sessRouter.get('/history/:userId', (req, res) => {
  const sessions = db.ACTIVE_SESSIONS
    .filter(s => s.user_id === req.params.userId)
    .map(s => {
      const slot    = db.SLOTS.find(sl => sl.id === s.slot_id);
      const station = db.STATIONS.find(st => st.id === slot?.station_id);
      return { ...s, slot, station_name: station?.name };
    })
    .sort((a, b) => new Date(b.started_at) - new Date(a.started_at));

  res.json({ ok: true, count: sessions.length, data: sessions });
});

module.exports = { reservationsRouter: router, sessionsRouter: sessRouter };


// ─── routes/pricing.js ────────────────────────────────────────
const priceRouter = Router();
const { calcPrice: cp, priceForecast, estimateSessionCost } = require('../services/pricing.service');

// GET /pricing/current?stationId=st1
priceRouter.get('/current', (req, res) => {
  const { stationId } = req.query;
  if (!stationId) return res.status(400).json({ ok: false, error: 'stationId requerido' });
  try {
    res.json({ ok: true, data: cp(stationId) });
  } catch (e) {
    res.status(404).json({ ok: false, error: e.message });
  }
});

// GET /pricing/forecast?stationId=st1&hours=12
priceRouter.get('/forecast', (req, res) => {
  const { stationId, hours = 12 } = req.query;
  if (!stationId) return res.status(400).json({ ok: false, error: 'stationId requerido' });
  try {
    res.json({ ok: true, data: priceForecast(stationId, parseInt(hours)) });
  } catch (e) {
    res.status(404).json({ ok: false, error: e.message });
  }
});

// POST /pricing/estimate — Estimar costo de una carga
priceRouter.post('/estimate', (req, res) => {
  const { stationId, from_pct = 10, to_pct = 85, battery_kwh = 60 } = req.body;
  if (!stationId) return res.status(400).json({ ok: false, error: 'stationId requerido' });
  try {
    res.json({ ok: true, data: estimateSessionCost(stationId, from_pct, to_pct, battery_kwh) });
  } catch (e) {
    res.status(404).json({ ok: false, error: e.message });
  }
});

// GET /pricing/all — Precio actual de todas las estaciones
priceRouter.get('/all', (req, res) => {
  const prices = db.STATIONS.map(s => cp(s.id));
  res.json({ ok: true, data: prices });
});

module.exports = priceRouter;
