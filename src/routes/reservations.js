const { Router } = require('express');
const router = Router();
const { ReservationRepo, SlotRepo, UserRepo } = require('../db/repositories');
const { calcPrice } = require('../services/pricing.service');
const { protect } = require('../middleware/auth');
const mem = require('../db/memory');

router.post('/', protect, async (req, res) => {
  try {
    const { slot_id, vehicle_id, reserved_for } = req.body;
    const user_id = req.user.userId;
    if (!slot_id || !reserved_for) return res.status(400).json({ ok:false, error:'slot_id y reserved_for son requeridos' });
    const slot = await SlotRepo.findById(slot_id);
    if (!slot) return res.status(404).json({ ok:false, error:'Slot no encontrado' });
    if (slot.status !== 'available') return res.status(409).json({ ok:false, error:`Slot no disponible — estado: ${slot.status}` });
    const user = await UserRepo.findById(user_id);
    if (!user) return res.status(404).json({ ok:false, error:'Usuario no encontrado' });
    const station = mem.STATIONS.find(st => mem.SLOTS.some(s => s.id === slot_id && s.station_id === st.id));
    const pricing = calcPrice(station?.id || mem.STATIONS[0].id);
    const deposit = Math.round(pricing.final_price * 10);
    if (user.wallet_balance < deposit) return res.status(402).json({ ok:false, error:`Saldo insuficiente. Necesitas ${deposit} COP, tienes ${user.wallet_balance} COP` });
    const reservation = await ReservationRepo.create({ slot_id, user_id, vehicle_id, reserved_for, deposit_amount: deposit });
    await SlotRepo.updateStatus(slot_id, 'reserved');
    const newBalance = await UserRepo.updateWallet(user_id, -deposit);
    res.status(201).json({ ok:true, message:'Reserva creada', data:reservation, deposit_charged:deposit, wallet_balance:newBalance });
  } catch (err) { res.status(500).json({ ok:false, error:err.message }); }
});

router.get('/user/me', protect, async (req, res) => {
  try {
    const list = await ReservationRepo.findActiveByUser(req.user.userId);
    res.json({ ok:true, count:list.length, data:list });
  } catch (err) { res.status(500).json({ ok:false, error:err.message }); }
});

router.delete('/:id', protect, async (req, res) => {
  try {
    const r = mem.RESERVATIONS.find(r => r.id === req.params.id);
    if (!r) return res.status(404).json({ ok:false, error:'Reserva no encontrada' });
    if (r.user_id !== req.user.userId) return res.status(403).json({ ok:false, error:'No autorizado' });
    if (r.status !== 'active') return res.status(409).json({ ok:false, error:'Reserva no activa' });
    const minsUntil = (new Date(r.reserved_for) - Date.now()) / 60000;
    const penalty = minsUntil < 30 ? Math.round(r.deposit_amount * 0.5) : 0;
    const refund  = r.deposit_amount - penalty;
    await ReservationRepo.cancel(req.params.id);
    await SlotRepo.updateStatus(r.slot_id, 'available');
    const newBalance = await UserRepo.updateWallet(r.user_id, refund);
    res.json({ ok:true, message:'Reserva cancelada', refund_amount:refund, penalty_amount:penalty, wallet_balance:newBalance });
  } catch (err) { res.status(500).json({ ok:false, error:err.message }); }
});

module.exports = router;
