const { Router } = require('express');
const router = Router();
const db = require('../db/memory');
const { calcPrice } = require('../services/pricing.service');
const { startTransaction, stopTransaction, getSlotTelemetry } = require('../ocpp/simulator');

router.post('/start', (req, res) => {
  const { slot_id, user_id, vehicle_id, battery_pct } = req.body;
  if (!slot_id || !user_id) return res.status(400).json({ ok:false, error:'slot_id y user_id son requeridos' });
  const slot = db.SLOTS.find(s=>s.id===slot_id);
  if (!slot) return res.status(404).json({ ok:false, error:'Slot no encontrado' });
  if (!['available','reserved'].includes(slot.status))
    return res.status(409).json({ ok:false, error:`Slot ${slot.status}` });
  const station = db.STATIONS.find(st => db.SLOTS.some(s=>s.id===slot_id && s.station_id===st.id));
  const pricing = calcPrice(station?.id || db.STATIONS[0].id);
  const {transaction_id} = startTransaction(slot_id, user_id, battery_pct||10);
  const session = { id:db.uuid(), slot_id, user_id, vehicle_id, started_at:new Date(), battery_start:battery_pct||10, battery_current:battery_pct||10, energy_kwh:0, price_per_kwh:pricing.final_price, price_multiplier:pricing.multiplier, total_cost:0, payment_method:'wallet', ocpp_tx_id:transaction_id, status:'active' };
  slot.status='charging';
  db.ACTIVE_SESSIONS.push(session);
  res.status(201).json({ ok:true, message:'Sesión iniciada. Cargador activado vía OCPP.', data:session, ocpp_transaction_id:transaction_id, pricing });
});

router.put('/:id/stop', (req, res) => {
  const session = db.ACTIVE_SESSIONS.find(s=>s.id===req.params.id);
  if (!session) return res.status(404).json({ ok:false, error:'Sesión no encontrada' });
  if (session.status!=='active') return res.status(409).json({ ok:false, error:'Sesión no activa' });
  const result = stopTransaction(session.slot_id);
  const telem  = getSlotTelemetry(session.slot_id);
  const finalKwh  = result?.energy_kwh || session.energy_kwh;
  const finalCost = Math.round(finalKwh * session.price_per_kwh);
  const finalBat  = telem?.battery_pct || session.battery_current;
  session.status='completed'; session.ended_at=new Date();
  session.energy_kwh=finalKwh; session.battery_end=Math.round(finalBat); session.total_cost=finalCost; session.payment_status='paid';
  const slot = db.SLOTS.find(s=>s.id===session.slot_id);
  if (slot) slot.status='available';
  const user = db.USERS.find(u=>u.id===session.user_id);
  if (user) user.wallet_balance -= finalCost;
  const durationMin = Math.round((new Date(session.ended_at)-new Date(session.started_at))/60000);
  res.json({ ok:true, message:'Sesión finalizada', summary:{ session_id:session.id, duration_min:durationMin, energy_kwh:finalKwh, battery_from:session.battery_start, battery_to:session.battery_end, price_per_kwh:session.price_per_kwh, total_cost:finalCost, wallet_balance:user?.wallet_balance } });
});

router.get('/history/:userId', (req, res) => {
  const list = db.ACTIVE_SESSIONS.filter(s=>s.user_id===req.params.userId)
    .map(s=>{ const slot=db.SLOTS.find(sl=>sl.id===s.slot_id); const station=db.STATIONS.find(st=>st.id===slot?.station_id); return {...s,slot,station_name:station?.name}; })
    .sort((a,b)=>new Date(b.started_at)-new Date(a.started_at));
  res.json({ ok:true, count:list.length, data:list });
});

module.exports = router;
