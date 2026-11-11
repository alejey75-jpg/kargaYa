const { Router } = require('express');
const router = Router();
const { SessionRepo, SlotRepo, UserRepo } = require('../db/repositories');
const { calcPrice } = require('../services/pricing.service');
const { startTransaction, stopTransaction, getSlotTelemetry } = require('../ocpp/simulator');
const { protect } = require('../middleware/auth');

router.post('/start', protect, async (req, res) => {
  try {
    const { slot_id, vehicle_id, battery_pct } = req.body;
    const user_id = req.user.userId;
    if (!slot_id) return res.status(400).json({ ok:false, error:'slot_id es requerido' });
    const slot = await SlotRepo.findById(slot_id);
    if (!slot) return res.status(404).json({ ok:false, error:'Slot no encontrado' });
    if (!['available','reserved'].includes(slot.status)) return res.status(409).json({ ok:false, error:`Slot ${slot.status}` });
    const mem = require('../db/memory');
    const station = mem.STATIONS.find(st => mem.SLOTS.some(s => s.id === slot_id && s.station_id === st.id));
    const pricing = calcPrice(station?.id || mem.STATIONS[0].id);
    const {transaction_id} = startTransaction(slot_id, user_id, battery_pct || 10);
    const session = await SessionRepo.create({ slot_id, user_id, vehicle_id, battery_start: battery_pct||10, battery_current: battery_pct||10, price_per_kwh: pricing.final_price, price_multiplier: pricing.multiplier, payment_method:'wallet', ocpp_tx_id: transaction_id });
    await SlotRepo.updateStatus(slot_id, 'charging');
    res.status(201).json({ ok:true, message:'Sesión iniciada. Cargador activado vía OCPP.', data:session, ocpp_transaction_id:transaction_id, pricing });
  } catch (err) { res.status(500).json({ ok:false, error:err.message }); }
});

router.put('/:id/stop', protect, async (req, res) => {
  try {
    const session = await SessionRepo.findActive(req.params.id);
    if (!session) return res.status(404).json({ ok:false, error:'Sesión activa no encontrada' });
    if (session.user_id !== req.user.userId) return res.status(403).json({ ok:false, error:'No autorizado' });
    const result = stopTransaction(session.slot_id);
    const telem  = getSlotTelemetry(session.slot_id);
    const finalKwh  = result?.energy_kwh || session.energy_kwh || 0;
    const finalCost = Math.round(finalKwh * session.price_per_kwh);
    const finalBat  = Math.round(telem?.battery_pct || session.battery_current || 50);
    await SessionRepo.complete(req.params.id, { energy_kwh: finalKwh, battery_end: finalBat, total_cost: finalCost });
    await SlotRepo.updateStatus(session.slot_id, 'available');
    const newBalance = await UserRepo.updateWallet(session.user_id, -finalCost);
    const durationMin = Math.round((Date.now() - new Date(session.started_at)) / 60000);
    res.json({ ok:true, message:'Sesión finalizada', summary:{ session_id:req.params.id, duration_min:durationMin, energy_kwh:finalKwh, battery_from:session.battery_start, battery_to:finalBat, price_per_kwh:session.price_per_kwh, total_cost:finalCost, payment:'Debitado de billetera KargaYa', wallet_balance:newBalance } });
  } catch (err) { res.status(500).json({ ok:false, error:err.message }); }
});

router.get('/history/me', protect, async (req, res) => {
  try {
    const list = await SessionRepo.historyByUser(req.user.userId);
    res.json({ ok:true, count:list.length, data:list });
  } catch (err) { res.status(500).json({ ok:false, error:err.message }); }
});

module.exports = router;
