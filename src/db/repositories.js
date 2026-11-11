// db/repositories.js — Patrón Repository
// Cada función aquí puede usar PostgreSQL real O la memoria según lo que esté disponible.
// Cuando conectes Postgres, el comportamiento cambia automáticamente sin tocar las rutas.

const pg = require('./pg');
const mem = require('./memory');
const { calcPrice } = require('../services/pricing.service');

// ─────────────────────────────────────────────────────────────
// STATIONS
// ─────────────────────────────────────────────────────────────
const StationRepo = {

  // Lista estaciones con filtros opcionales
  async findMany({ lat, lon, radiusKm = 10, available, connector } = {}) {
    if (!pg.isMemory()) {
      // ── POSTGRESQL REAL ──────────────────────────────────
      let sql = `
        SELECT
          s.id, s.name, s.address, s.neighborhood, s.city,
          ST_Y(s.location::geometry) AS lat,
          ST_X(s.location::geometry) AS lon,
          s.base_price, s.status, s.schedule, s.amenities,
          o.name AS operator_name,
          COUNT(sl.id) FILTER (WHERE sl.status = 'available') AS slots_available,
          COUNT(sl.id) FILTER (WHERE sl.status = 'charging')  AS slots_charging,
          COUNT(sl.id) FILTER (WHERE sl.status = 'reserved')  AS slots_reserved,
          COUNT(sl.id) AS slots_total
          ${lat && lon ? `, ST_Distance(s.location, ST_MakePoint($1, $2)::GEOGRAPHY) / 1000 AS distance_km` : ''}
        FROM stations s
        LEFT JOIN operators o ON o.id = s.operator_id
        LEFT JOIN slots sl    ON sl.station_id = s.id
        WHERE s.status = 'active'
          ${lat && lon ? `AND ST_DWithin(s.location, ST_MakePoint($1, $2)::GEOGRAPHY, $3 * 1000)` : ''}
          ${available === 'true' ? `AND EXISTS (SELECT 1 FROM slots WHERE station_id = s.id AND status = 'available')` : ''}
          ${connector ? `AND EXISTS (SELECT 1 FROM slots WHERE station_id = s.id AND connector = $4)` : ''}
        GROUP BY s.id, o.name
        ORDER BY ${lat && lon ? 'distance_km ASC' : 's.name ASC'}
      `;
      const params = [];
      if (lat && lon) { params.push(parseFloat(lon), parseFloat(lat), parseFloat(radiusKm)); }
      if (connector)  { params.push(connector); }

      const { rows } = await pg.query(sql, params);
      return rows.map(r => ({
        ...r,
        current_price: calcPrice(r.id).final_price,
        price_multiplier: calcPrice(r.id).multiplier,
        occupancy: r.slots_total > 0 ? Math.round((parseInt(r.slots_charging) + parseInt(r.slots_reserved)) / r.slots_total * 100) : 0,
      }));
    }

    // ── MEMORIA ───────────────────────────────────────────
    let stations = mem.STATIONS.map(mem.getStationWithStats);
    if (available === 'true') stations = stations.filter(s => s.slots_available > 0);
    if (connector) {
      stations = stations.filter(s =>
        mem.SLOTS.some(sl => sl.station_id === s.id && sl.connector === connector));
    }
    if (lat && lon) {
      stations = stations
        .map(s => ({ ...s, distance_km: Math.round(mem.distanceKm(parseFloat(lat), parseFloat(lon), s.lat, s.lon) * 10) / 10 }))
        .filter(s => s.distance_km <= parseFloat(radiusKm))
        .sort((a, b) => a.distance_km - b.distance_km);
    }
    return stations.map(s => ({ ...s, current_price: calcPrice(s.id).final_price, price_multiplier: calcPrice(s.id).multiplier }));
  },

  // Detalle de una estación con slots enriquecidos
  async findById(id) {
    if (!pg.isMemory()) {
      const { rows } = await pg.query(`
        SELECT s.*, o.name AS operator_name,
          ST_Y(s.location::geometry) AS lat, ST_X(s.location::geometry) AS lon
        FROM stations s LEFT JOIN operators o ON o.id = s.operator_id
        WHERE s.id = $1
      `, [id]);
      if (!rows[0]) return null;
      const slots = await SlotRepo.findByStation(id);
      return { ...rows[0], slots };
    }
    const station = mem.STATIONS.find(s => s.id === id);
    if (!station) return null;
    const slots = await SlotRepo.findByStation(id);
    return { ...mem.getStationWithStats(station), slots };
  },
};

// ─────────────────────────────────────────────────────────────
// SLOTS
// ─────────────────────────────────────────────────────────────
const SlotRepo = {
  async findByStation(stationId, { status } = {}) {
    if (!pg.isMemory()) {
      let sql = `
        SELECT sl.*,
          ses.id AS session_id, ses.started_at, ses.price_per_kwh,
          res.id AS reservation_id, res.reserved_for
        FROM slots sl
        LEFT JOIN sessions ses ON ses.slot_id = sl.id AND ses.status = 'active'
        LEFT JOIN reservations res ON res.slot_id = sl.id AND res.status = 'active'
        WHERE sl.station_id = $1 ${status ? 'AND sl.status = $2' : ''}
        ORDER BY sl.slot_number
      `;
      const params = status ? [stationId, status] : [stationId];
      const { rows } = await pg.query(sql, params);
      return rows;
    }
    let slots = mem.SLOTS.filter(s => s.station_id === stationId);
    if (status) slots = slots.filter(s => s.status === status);
    return slots;
  },

  async findById(id) {
    if (!pg.isMemory()) {
      const { rows } = await pg.query('SELECT * FROM slots WHERE id = $1', [id]);
      return rows[0] || null;
    }
    return mem.SLOTS.find(s => s.id === id) || null;
  },

  async updateStatus(id, status) {
    if (!pg.isMemory()) {
      await pg.query('UPDATE slots SET status = $1 WHERE id = $2', [status, id]);
      return;
    }
    const slot = mem.SLOTS.find(s => s.id === id);
    if (slot) slot.status = status;
  },
};

// ─────────────────────────────────────────────────────────────
// USERS
// ─────────────────────────────────────────────────────────────
const UserRepo = {
  async findById(id) {
    if (!pg.isMemory()) {
      const { rows } = await pg.query('SELECT * FROM users WHERE id = $1', [id]);
      return rows[0] || null;
    }
    return mem.USERS.find(u => u.id === id) || null;
  },

  async findByEmail(email) {
    if (!pg.isMemory()) {
      const { rows } = await pg.query('SELECT * FROM users WHERE email = $1', [email]);
      return rows[0] || null;
    }
    return mem.USERS.find(u => u.email === email) || null;
  },

  async create({ name, email, phone, passwordHash }) {
    if (!pg.isMemory()) {
      const { rows } = await pg.query(
        `INSERT INTO users (name, email, phone, password_hash, wallet_balance)
         VALUES ($1, $2, $3, $4, 0) RETURNING id, name, email, phone, wallet_balance, created_at`,
        [name, email, phone, passwordHash]
      );
      return rows[0];
    }
    const user = { id: mem.uuid(), name, email, phone, wallet_balance: 0, created_at: new Date() };
    mem.USERS.push(user);
    return user;
  },

  async updateWallet(id, delta) {
    if (!pg.isMemory()) {
      const { rows } = await pg.query(
        `UPDATE users SET wallet_balance = wallet_balance + $1, updated_at = NOW()
         WHERE id = $2 RETURNING wallet_balance`,
        [delta, id]
      );
      return rows[0]?.wallet_balance;
    }
    const user = mem.USERS.find(u => u.id === id);
    if (user) user.wallet_balance += delta;
    return user?.wallet_balance;
  },
};

// ─────────────────────────────────────────────────────────────
// SESSIONS
// ─────────────────────────────────────────────────────────────
const SessionRepo = {
  async create(data) {
    const { slot_id, user_id, vehicle_id, battery_start, price_per_kwh, price_multiplier, payment_method, ocpp_tx_id } = data;
    if (!pg.isMemory()) {
      const { rows } = await pg.query(
        `INSERT INTO sessions (slot_id, user_id, vehicle_id, battery_start, price_per_kwh, price_multiplier, payment_method, ocpp_tx_id, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active') RETURNING *`,
        [slot_id, user_id, vehicle_id, battery_start, price_per_kwh, price_multiplier, payment_method, ocpp_tx_id]
      );
      return rows[0];
    }
    const session = { id: mem.uuid(), ...data, energy_kwh: 0, total_cost: 0, status: 'active', started_at: new Date() };
    mem.ACTIVE_SESSIONS.push(session);
    return session;
  },

  async findActive(id) {
    if (!pg.isMemory()) {
      const { rows } = await pg.query(
        `SELECT ses.*, sl.station_id, st.name AS station_name
         FROM sessions ses
         JOIN slots sl ON sl.id = ses.slot_id
         JOIN stations st ON st.id = sl.station_id
         WHERE ses.id = $1 AND ses.status = 'active'`, [id]);
      return rows[0] || null;
    }
    return mem.ACTIVE_SESSIONS.find(s => s.id === id && s.status === 'active') || null;
  },

  async complete(id, { energy_kwh, battery_end, total_cost }) {
    if (!pg.isMemory()) {
      return pg.transaction(async (q) => {
        const { rows } = await q(
          `UPDATE sessions SET status='completed', ended_at=NOW(), energy_kwh=$1, battery_end=$2, total_cost=$3, payment_status='paid'
           WHERE id=$4 RETURNING *`,
          [energy_kwh, battery_end, total_cost, id]
        );
        return rows[0];
      });
    }
    const session = mem.ACTIVE_SESSIONS.find(s => s.id === id);
    if (session) {
      session.status = 'completed'; session.ended_at = new Date();
      session.energy_kwh = energy_kwh; session.battery_end = battery_end;
      session.total_cost = total_cost; session.payment_status = 'paid';
    }
    return session;
  },

  async historyByUser(userId) {
    if (!pg.isMemory()) {
      const { rows } = await pg.query(
        `SELECT ses.*, st.name AS station_name, sl.connector, sl.power_kw
         FROM sessions ses
         JOIN slots sl ON sl.id = ses.slot_id
         JOIN stations st ON st.id = sl.station_id
         WHERE ses.user_id = $1 ORDER BY ses.started_at DESC LIMIT 50`, [userId]);
      return rows;
    }
    return mem.ACTIVE_SESSIONS
      .filter(s => s.user_id === userId)
      .map(s => {
        const slot = mem.SLOTS.find(sl => sl.id === s.slot_id);
        const station = mem.STATIONS.find(st => st.id === slot?.station_id);
        return { ...s, station_name: station?.name, connector: slot?.connector, power_kw: slot?.power_kw };
      })
      .sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
  },
};

// ─────────────────────────────────────────────────────────────
// RESERVATIONS
// ─────────────────────────────────────────────────────────────
const ReservationRepo = {
  async create(data) {
    const { slot_id, user_id, vehicle_id, reserved_for, window_minutes = 10, deposit_amount } = data;
    const expires_at = new Date(new Date(reserved_for).getTime() + window_minutes * 60 * 1000);
    if (!pg.isMemory()) {
      const { rows } = await pg.query(
        `INSERT INTO reservations (slot_id, user_id, vehicle_id, reserved_for, expires_at, window_minutes, deposit_amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [slot_id, user_id, vehicle_id, reserved_for, expires_at, window_minutes, deposit_amount]
      );
      return rows[0];
    }
    const r = { id: mem.uuid(), ...data, expires_at, window_minutes, status: 'active', created_at: new Date() };
    mem.RESERVATIONS.push(r);
    return r;
  },

  async findActiveByUser(userId) {
    if (!pg.isMemory()) {
      const { rows } = await pg.query(
        `SELECT r.*, st.name AS station_name, sl.connector, sl.power_kw
         FROM reservations r
         JOIN slots sl ON sl.id = r.slot_id
         JOIN stations st ON st.id = sl.station_id
         WHERE r.user_id = $1 ORDER BY r.created_at DESC`, [userId]);
      return rows;
    }
    return mem.RESERVATIONS
      .filter(r => r.user_id === userId)
      .map(r => {
        const slot = mem.SLOTS.find(s => s.id === r.slot_id);
        const station = mem.STATIONS.find(s => s.id === slot?.station_id);
        return { ...r, station_name: station?.name, connector: slot?.connector };
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  async cancel(id) {
    if (!pg.isMemory()) {
      const { rows } = await pg.query(
        `UPDATE reservations SET status='cancelled', cancelled_at=NOW() WHERE id=$1 AND status='active' RETURNING *`,
        [id]
      );
      return rows[0] || null;
    }
    const r = mem.RESERVATIONS.find(r => r.id === id);
    if (r && r.status === 'active') { r.status = 'cancelled'; r.cancelled_at = new Date(); }
    return r;
  },

  // Expirar reservas vencidas — llamado por el scheduler
  async expireOld() {
    if (!pg.isMemory()) {
      const { rows } = await pg.query(
        `UPDATE reservations SET status='expired'
         WHERE status='active' AND expires_at < NOW() RETURNING slot_id, user_id, deposit_amount`
      );
      return rows;
    }
    const expired = mem.RESERVATIONS.filter(r => r.status === 'active' && new Date(r.expires_at) < new Date());
    expired.forEach(r => { r.status = 'expired'; });
    return expired;
  },
};

module.exports = { StationRepo, SlotRepo, UserRepo, SessionRepo, ReservationRepo };
