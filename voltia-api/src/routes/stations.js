// routes/stations.js
const { Router } = require('express');
const router = Router();
const db = require('../db/memory');
const { calcPrice } = require('../services/pricing.service');
const { getSlotTelemetry } = require('../ocpp/simulator');

// GET /stations — Lista todas las estaciones con filtros
// Query: ?lat=6.21&lon=-75.57&radius=5&available=true&connector=CCS2
router.get('/', (req, res) => {
  const { lat, lon, radius = 10, available, connector } = req.query;

  let stations = db.STATIONS.map(db.getStationWithStats);

  // Filtro por disponibilidad
  if (available === 'true') {
    stations = stations.filter(s => s.slots_available > 0);
  }

  // Filtro por tipo de conector
  if (connector) {
    stations = stations.filter(s =>
      db.SLOTS.some(sl => sl.station_id === s.id && sl.connector === connector)
    );
  }

  // Filtro por radio (km) si se pasan coordenadas
  if (lat && lon) {
    const userLat = parseFloat(lat);
    const userLon = parseFloat(lon);
    const radiusKm = parseFloat(radius);

    stations = stations
      .map(s => ({
        ...s,
        distance_km: Math.round(db.distanceKm(userLat, userLon, s.lat, s.lon) * 10) / 10,
      }))
      .filter(s => s.distance_km <= radiusKm)
      .sort((a, b) => a.distance_km - b.distance_km);
  }

  // Agregar precio actual a cada estación
  stations = stations.map(s => {
    const pricing = calcPrice(s.id);
    return { ...s, current_price: pricing.final_price, price_multiplier: pricing.multiplier };
  });

  res.json({
    ok: true,
    count: stations.length,
    data: stations,
  });
});

// GET /stations/:id — Detalle completo de una estación
router.get('/:id', (req, res) => {
  const station = db.STATIONS.find(s => s.id === req.params.id);
  if (!station) return res.status(404).json({ ok: false, error: 'Estación no encontrada' });

  const slots = db.SLOTS
    .filter(s => s.station_id === station.id)
    .map(slot => {
      const telem = getSlotTelemetry(slot.id);
      const activeSession = db.ACTIVE_SESSIONS.find(ses => ses.slot_id === slot.id && ses.status === 'active');
      const reservation = db.RESERVATIONS.find(r => r.slot_id === slot.id && r.status === 'active');

      return {
        ...slot,
        telemetry: telem ? {
          battery_pct:   Math.round(telem.battery_pct),
          power_kw:      Math.round(telem.power_kw * 10) / 10,
          energy_kwh:    Math.round(telem.energy_kwh * 100) / 100,
          temperature_c: Math.round(telem.temperature_c * 10) / 10,
          error_code:    telem.error_code,
          last_heartbeat: telem.last_heartbeat,
        } : null,
        session: activeSession ? {
          id:           activeSession.id,
          started_at:   activeSession.started_at,
          battery_pct:  Math.round(telem?.battery_pct || activeSession.battery_current),
          energy_kwh:   Math.round((telem?.energy_kwh || activeSession.energy_kwh) * 100) / 100,
          cost_so_far:  Math.round((telem?.energy_kwh || activeSession.energy_kwh) * activeSession.price_per_kwh),
        } : null,
        reservation: reservation ? {
          id:           reservation.id,
          reserved_for: reservation.reserved_for,
          expires_at:   reservation.expires_at,
          window_min:   reservation.window_minutes,
        } : null,
      };
    });

  const pricing = calcPrice(station.id);
  const operator = db.OPERATORS.find(o => o.id === station.operator_id);

  res.json({
    ok: true,
    data: {
      ...db.getStationWithStats(station),
      operator: { id: operator?.id, name: operator?.name },
      pricing,
      slots,
    },
  });
});

// GET /stations/:id/slots — Solo los slots con estado en tiempo real
router.get('/:id/slots', (req, res) => {
  const { status } = req.query;

  let slots = db.SLOTS.filter(s => s.station_id === req.params.id);
  if (status) slots = slots.filter(s => s.status === status);

  const enriched = slots.map(slot => {
    const telem = getSlotTelemetry(slot.id);
    return {
      ...slot,
      battery_pct: telem ? Math.round(telem.battery_pct) : null,
      power_kw_live: telem ? Math.round(telem.power_kw * 10) / 10 : null,
      temperature_c: telem ? Math.round(telem.temperature_c) : null,
    };
  });

  res.json({ ok: true, count: enriched.length, data: enriched });
});

module.exports = router;
