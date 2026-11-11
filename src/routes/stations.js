const { Router } = require('express');
const router = Router();
const { StationRepo, SlotRepo } = require('../db/repositories');
const { calcPrice } = require('../services/pricing.service');
const { getSlotTelemetry } = require('../ocpp/simulator');
const { optionalAuth } = require('../middleware/auth');

router.get('/', optionalAuth, async (req, res) => {
  try {
    const { lat, lon, radius, available, connector } = req.query;
    const stations = await StationRepo.findMany({ lat, lon, radiusKm: radius, available, connector });
    res.json({ ok: true, count: stations.length, data: stations });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const station = await StationRepo.findById(req.params.id);
    if (!station) return res.status(404).json({ ok: false, error: 'Estación no encontrada' });
    const enrichedSlots = station.slots.map(slot => {
      const telem = getSlotTelemetry(slot.id);
      return { ...slot, telemetry: telem ? { battery_pct: Math.round(telem.battery_pct), power_kw: Math.round(telem.power_kw*10)/10, temperature_c: Math.round(telem.temperature_c*10)/10, error_code: telem.error_code } : null };
    });
    res.json({ ok: true, data: { ...station, slots: enrichedSlots, pricing: calcPrice(req.params.id) } });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

router.get('/:id/slots', async (req, res) => {
  try {
    const slots = await SlotRepo.findByStation(req.params.id, { status: req.query.status });
    const enriched = slots.map(s => { const t=getSlotTelemetry(s.id); return {...s,battery_pct:t?Math.round(t.battery_pct):null}; });
    res.json({ ok: true, count: enriched.length, data: enriched });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

module.exports = router;
