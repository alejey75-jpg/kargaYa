// db/memory.js — Simula PostgreSQL con datos reales de Medellín
const { v4: uuid } = require('uuid');

// ─── SEED DATA ────────────────────────────────────────────────
const OPERATORS = [
  { id: 'op1', name: 'EPM Energía', nit: '890.904.996-1', plan: 'enterprise' },
  { id: 'op2', name: 'Terpel Voltex', nit: '860.003.020-1', plan: 'pro' },
  { id: 'op3', name: 'Celsia', nit: '890.399.337-8', plan: 'pro' },
];

const STATIONS = [
  {
    id: 'st1', operator_id: 'op1',
    name: 'El Tesoro Parque Comercial',
    address: 'Cra. 25A #1A-Sur-45', neighborhood: 'El Poblado', city: 'Medellín',
    lat: 6.2006, lon: -75.5653,
    base_price: 1200, status: 'active',
    schedule: { open: '06:00', close: '23:00' },
    amenities: ['wifi', 'baños', 'cafetería', 'seguridad 24h'],
  },
  {
    id: 'st2', operator_id: 'op3',
    name: 'C.C. Santa Fe Medellín',
    address: 'Cra 48 Nro 16 Sur-44', neighborhood: 'Itagüi', city: 'Medellín',
    lat: 6.1635, lon: -75.6013,
    base_price: 1100, status: 'active',
    schedule: { open: '08:00', close: '22:00' },
    amenities: ['wifi', 'baños', 'parqueadero cubierto'],
  },
  {
    id: 'st3', operator_id: 'op1',
    name: 'EPM Edificio Inteligente',
    address: 'Av. Carabobo, La Alpujarra', neighborhood: 'Centro', city: 'Medellín',
    lat: 6.2442, lon: -75.5812,
    base_price: 1200, status: 'active',
    schedule: { open: '00:00', close: '23:59' },
    amenities: ['seguridad 24h', 'carga rápida DC'],
  },
  {
    id: 'st4', operator_id: 'op2',
    name: 'Oviedo Medellín',
    address: 'Cra. 43A Nro 6 Sur-15', neighborhood: 'El Poblado', city: 'Medellín',
    lat: 6.2087, lon: -75.5694,
    base_price: 1250, status: 'active',
    schedule: { open: '07:00', close: '22:00' },
    amenities: ['wifi', 'baños', 'valet disponible'],
  },
  {
    id: 'st5', operator_id: 'op3',
    name: 'Aeropuerto Olaya Herrera',
    address: 'Cra 65A Nro 13-157', neighborhood: 'Belén', city: 'Medellín',
    lat: 6.2195, lon: -75.5906,
    base_price: 1300, status: 'active',
    schedule: { open: '05:00', close: '23:00' },
    amenities: ['acceso 24h', 'viajeros frecuentes'],
  },
];

const SLOTS = [
  // El Tesoro
  { id: 'sl1', station_id: 'st1', slot_number: 1, connector: 'CCS2',  power_kw: 50,  status: 'charging' },
  { id: 'sl2', station_id: 'st1', slot_number: 2, connector: 'CCS2',  power_kw: 50,  status: 'charging' },
  { id: 'sl3', station_id: 'st1', slot_number: 3, connector: 'Type2', power_kw: 22,  status: 'available' },
  { id: 'sl4', station_id: 'st1', slot_number: 4, connector: 'Type2', power_kw: 22,  status: 'reserved' },
  // Santa Fe
  { id: 'sl5', station_id: 'st2', slot_number: 1, connector: 'CCS2',  power_kw: 50,  status: 'available' },
  { id: 'sl6', station_id: 'st2', slot_number: 2, connector: 'CCS2',  power_kw: 50,  status: 'available' },
  { id: 'sl7', station_id: 'st2', slot_number: 3, connector: 'Type2', power_kw: 22,  status: 'charging' },
  { id: 'sl8', station_id: 'st2', slot_number: 4, connector: 'Type2', power_kw: 22,  status: 'available' },
  // EPM Centro
  { id: 'sl9',  station_id: 'st3', slot_number: 1, connector: 'CCS2', power_kw: 150, status: 'charging' },
  { id: 'sl10', station_id: 'st3', slot_number: 2, connector: 'CCS2', power_kw: 150, status: 'charging' },
  { id: 'sl11', station_id: 'st3', slot_number: 3, connector: 'CCS2', power_kw: 150, status: 'charging' },
  // Oviedo
  { id: 'sl12', station_id: 'st4', slot_number: 1, connector: 'CCS2',  power_kw: 50, status: 'charging' },
  { id: 'sl13', station_id: 'st4', slot_number: 2, connector: 'CCS2',  power_kw: 50, status: 'charging' },
  { id: 'sl14', station_id: 'st4', slot_number: 3, connector: 'Type2', power_kw: 22, status: 'reserved' },
  { id: 'sl15', station_id: 'st4', slot_number: 4, connector: 'Type2', power_kw: 22, status: 'charging' },
  // Aeropuerto
  { id: 'sl16', station_id: 'st5', slot_number: 1, connector: 'CCS2',  power_kw: 50, status: 'charging' },
  { id: 'sl17', station_id: 'st5', slot_number: 2, connector: 'CCS2',  power_kw: 50, status: 'available' },
  { id: 'sl18', station_id: 'st5', slot_number: 3, connector: 'Type2', power_kw: 22, status: 'offline' },
];

const USERS = [
  { id: 'u1', name: 'Alejandro Lopez', email: 'alejandro@rotorr.co', phone: '+57 300 123 4567', wallet_balance: 85400 },
  { id: 'u2', name: 'Sebastián Pérez', email: 'sebas@bullish.co', phone: '+57 311 987 6543', wallet_balance: 42000 },
];

const VEHICLES = [
  { id: 'v1', user_id: 'u1', plate: 'MED-234', brand: 'BYD', model: 'Atto 3', year: 2024, battery_kwh: 60.5, connector: 'CCS2' },
  { id: 'v2', user_id: 'u2', plate: 'BOG-891', brand: 'Chery', model: 'Tiggo 7 EV', year: 2023, battery_kwh: 52.0, connector: 'CCS2' },
];

// Sesiones activas con telemetría simulada
const ACTIVE_SESSIONS = [
  { id: 'ses1', slot_id: 'sl1', user_id: 'u1', vehicle_id: 'v1', started_at: new Date(Date.now() - 22*60*1000), battery_start: 15, battery_current: 67, energy_kwh: 9.4, price_per_kwh: 1440, price_multiplier: 1.2, total_cost: 13536, payment_method: 'nequi', status: 'active' },
  { id: 'ses2', slot_id: 'sl2', user_id: 'u2', vehicle_id: 'v2', started_at: new Date(Date.now() - 35*60*1000), battery_start: 20, battery_current: 45, energy_kwh: 6.5, price_per_kwh: 1440, price_multiplier: 1.2, total_cost: 9360, payment_method: 'card', status: 'active' },
];

const RESERVATIONS = [
  { id: 'res1', slot_id: 'sl4', user_id: 'u1', vehicle_id: 'v1', reserved_for: new Date(Date.now() + 90*60*1000), window_minutes: 10, deposit_amount: 12000, status: 'active', created_at: new Date() },
];

// Pricing rules (espeja las del schema.sql)
const PRICING_RULES = [
  { type: 'time_of_day', condition: { hour_gte: 0,  hour_lt: 6  }, multiplier: 0.80, priority: 10, label: 'Valle nocturno' },
  { type: 'time_of_day', condition: { hour_gte: 7,  hour_lt: 9  }, multiplier: 1.25, priority: 8,  label: 'Pico mañana' },
  { type: 'time_of_day', condition: { hour_gte: 17, hour_lt: 20 }, multiplier: 1.20, priority: 8,  label: 'Pico tarde' },
  { type: 'occupancy',   condition: { occ_gt: 0.85 },              multiplier: 1.50, priority: 20, label: 'Muy alta demanda' },
  { type: 'occupancy',   condition: { occ_gt: 0.70 },              multiplier: 1.30, priority: 15, label: 'Alta demanda' },
  { type: 'occupancy',   condition: { occ_lt: 0.25 },              multiplier: 0.85, priority: 5,  label: 'Baja demanda' },
];

// ─── HELPERS ──────────────────────────────────────────────────
function getStationOccupancy(stationId) {
  const stSlots = SLOTS.filter(s => s.station_id === stationId);
  const occupied = stSlots.filter(s => ['charging', 'reserved'].includes(s.status));
  return stSlots.length ? occupied.length / stSlots.length : 0;
}

function getStationWithStats(station) {
  const slots = SLOTS.filter(s => s.station_id === station.id);
  const occ = getStationOccupancy(station.id);
  return {
    ...station,
    slots_total: slots.length,
    slots_available: slots.filter(s => s.status === 'available').length,
    slots_charging: slots.filter(s => s.status === 'charging').length,
    slots_reserved: slots.filter(s => s.status === 'reserved').length,
    occupancy: Math.round(occ * 100),
  };
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

module.exports = {
  OPERATORS, STATIONS, SLOTS, USERS, VEHICLES,
  ACTIVE_SESSIONS, RESERVATIONS, PRICING_RULES,
  getStationOccupancy, getStationWithStats, distanceKm,
  uuid,
};
