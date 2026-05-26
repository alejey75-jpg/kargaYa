const { Router } = require('express');
const router = Router();
const db = require('../db/memory');
const { calcPrice } = require('../services/pricing.service');

router.post('/', (req, res) => {
  const { slot_id, user_id, vehicle_id, reserved_for } = req.body;
  if (!slot_id || !user_id || !reserved_for)
    return res.status(400).json({ ok:false, error:'slot_id, user_id y reserved_for son requeridos' });
  const slot = db.SLOTS.find(s => s.id === slot_id);
  if (!slot) return res.status(404).json({ ok:false, error:'Slot no encontrado' });
  if (slot.status !== 'available')
    return res.status(409).json({ ok:false, error:`Slot no disponible — estado: ${slot.status}` });
  const user = db.USERS.find(u => u.id === user_id);
  if (!user) return res.status(404).json({ ok:false, error:'Usuario no encontrado' });
  const station = db.STATIONS.find(st => db.SLOTS.some(s => s.id === slot_id && s.station_id === st.id));
  const pricing = calcPrice(station?.id || db.STATIONS[0].id);
  const deposit = Math.round(pricing.final_price * 10);
  if (user.wallet_balance < deposit)
    return res.status(402).json({ ok:false, error:`Saldo insuficiente. Necesitas ${deposit} COP` });
  const reservedAt = new Date(reserved_for);
  const expiresAt  = new Date(reservedAt.getTime() + 10*60*1000);
  const reservation = { id:db.uuid(), slot_id, user_id, vehicle_id, reserved_for:reservedAt, expires_at:expiresAt, window_minutes:10, deposit_amount:deposit, status:'active', created_at:new Date() };
  slot.status = 'reserved';
  user.wallet_balance -= deposit;
  db.RESERVATIONS.push(reservation);
  res.status(201).json({ ok:true, message:'Reserva creada', data:reservation, deposit_charged:deposit, wallet_balance:user.wallet_balance });
});

router.get('/user/:userId', (req, res) => {
  const list = db.RESERVATIONS.filter(r => r.user_id === req.params.userId)
    .map(r => { const slot=db.SLOTS.find(s=>s.id===r.slot_id); const station=db.STATIONS.find(st=>st.id===slot?.station_id); return {...r,slot,station_name:station?.name}; })
    .sort((a,b) => new Date(b.created_at)-new Date(a.created_at));
  res.json({ ok:true, count:list.length, data:list });
});

router.delete('/:id', (req, res) => {
  const r = db.RESERVATIONS.find(r => r.id === req.params.id);
  if (!r) return res.status(404).json({ ok:false, error:'Reserva no encontrada' });
  if (r.status !== 'active') return res.status(409).json({ ok:false, error:'Reserva no activa' });
  const minsUntil = (new Date(r.reserved_for)-Date.now())/60000;
  const penalty = minsUntil < 30 ? r.deposit_amount*0.5 : 0;
  const refund  = r.deposit_amount - penalty;
  const slot = db.SLOTS.find(s=>s.id===r.slot_id);
  if (slot) slot.status='available';
  const user = db.USERS.find(u=>u.id===r.user_id);
  if (user) user.wallet_balance += refund;
  r.status='cancelled'; r.cancelled_at=new Date();
  res.json({ ok:true, message:'Reserva cancelada', refund_amount:refund, penalty_amount:penalty, wallet_balance:user?.wallet_balance });
});

module.exports = router;
