-- ============================================================
-- VOLTIA — Schema PostgreSQL completo
-- Motor: PostgreSQL 15+  |  Charset: UTF-8
-- ============================================================

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";       -- Para coordenadas GPS
CREATE EXTENSION IF NOT EXISTS "timescaledb";   -- Para telemetría IoT

-- ──────────────────────────────────────────
-- USUARIOS Y VEHÍCULOS
-- ──────────────────────────────────────────
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(180) UNIQUE NOT NULL,
  phone         VARCHAR(20),
  wallet_balance NUMERIC(12,2) DEFAULT 0.00,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE vehicles (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plate       VARCHAR(10) UNIQUE NOT NULL,         -- "MED-234"
  brand       VARCHAR(60),
  model       VARCHAR(60),
  year        SMALLINT,
  battery_kwh NUMERIC(6,1),                        -- Capacidad total kWh
  connector   VARCHAR(20),                         -- CCS2, CHAdeMO, Type2
  active      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- OPERADORES Y ESTACIONES
-- ──────────────────────────────────────────
CREATE TABLE operators (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       VARCHAR(120) NOT NULL,
  nit        VARCHAR(20) UNIQUE,                   -- NIT Colombia
  email      VARCHAR(180),
  plan       VARCHAR(20) DEFAULT 'basic',          -- basic | pro | enterprise
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE stations (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operator_id  UUID REFERENCES operators(id),
  name         VARCHAR(150) NOT NULL,
  address      VARCHAR(300) NOT NULL,
  neighborhood VARCHAR(80),
  city         VARCHAR(60) DEFAULT 'Medellín',
  location     GEOGRAPHY(POINT, 4326),             -- PostGIS: lat/lon
  schedule     JSONB,                              -- {"mon":{"open":"06:00","close":"22:00"}, ...}
  amenities    TEXT[],                             -- ["wifi", "baños", "cafetería"]
  base_price   NUMERIC(10,2) NOT NULL DEFAULT 1200, -- COP / kWh
  status       VARCHAR(20) DEFAULT 'active',       -- active | maintenance | inactive
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Índice espacial para búsquedas por radio
CREATE INDEX idx_stations_location ON stations USING GIST(location);

-- ──────────────────────────────────────────
-- CONECTORES / SLOTS
-- ──────────────────────────────────────────
CREATE TABLE slots (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  station_id   UUID NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  slot_number  SMALLINT NOT NULL,                  -- Número visible en la estación
  connector    VARCHAR(20) NOT NULL,               -- CCS2 | CCS1 | CHAdeMO | Type2 | GB_AC
  power_kw     NUMERIC(6,1) NOT NULL,              -- Potencia máxima
  status       VARCHAR(20) DEFAULT 'available',    -- available | charging | reserved | offline
  ocpp_id      VARCHAR(60),                        -- ID en el protocolo OCPP
  last_seen    TIMESTAMPTZ,                        -- Último heartbeat del cargador
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(station_id, slot_number)
);

-- ──────────────────────────────────────────
-- SESIONES DE CARGA
-- ──────────────────────────────────────────
CREATE TABLE sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slot_id         UUID NOT NULL REFERENCES slots(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  vehicle_id      UUID REFERENCES vehicles(id),
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  battery_start   SMALLINT,                        -- % batería al inicio
  battery_end     SMALLINT,                        -- % batería al terminar
  energy_kwh      NUMERIC(8,3) DEFAULT 0,          -- kWh consumidos
  price_per_kwh   NUMERIC(10,2) NOT NULL,          -- Precio fijado al inicio
  price_multiplier NUMERIC(4,2) DEFAULT 1.0,       -- Multiplicador aplicado
  total_cost      NUMERIC(12,2) DEFAULT 0,         -- COP total
  payment_method  VARCHAR(20),                     -- nequi | pse | card | wallet
  payment_status  VARCHAR(20) DEFAULT 'pending',   -- pending | paid | failed
  ocpp_tx_id      INTEGER,                         -- Transaction ID de OCPP
  status          VARCHAR(20) DEFAULT 'active'     -- active | completed | aborted
);

-- ──────────────────────────────────────────
-- RESERVAS
-- ──────────────────────────────────────────
CREATE TABLE reservations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slot_id         UUID NOT NULL REFERENCES slots(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  vehicle_id      UUID REFERENCES vehicles(id),
  reserved_for    TIMESTAMPTZ NOT NULL,            -- Hora pactada de llegada
  window_minutes  SMALLINT DEFAULT 10,             -- Ventana garantizada
  expires_at      TIMESTAMPTZ NOT NULL,            -- = reserved_for + window_minutes
  deposit_amount  NUMERIC(10,2) DEFAULT 0,         -- COP bloqueados
  status          VARCHAR(20) DEFAULT 'active',    -- active | completed | cancelled | expired
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  cancelled_at    TIMESTAMPTZ,
  cancel_reason   VARCHAR(200)
);

-- Índice para buscar reservas activas por slot
CREATE INDEX idx_reservations_slot_active
  ON reservations(slot_id, status, reserved_for)
  WHERE status = 'active';

-- ──────────────────────────────────────────
-- REGLAS DE PRECIOS DINÁMICOS
-- ──────────────────────────────────────────
CREATE TABLE pricing_rules (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  station_id   UUID REFERENCES stations(id),      -- NULL = regla global
  rule_type    VARCHAR(40) NOT NULL,               -- occupancy | time_of_day | event | maintenance
  condition    JSONB NOT NULL,                     -- {"occ_gt": 0.70}
  multiplier   NUMERIC(4,2) NOT NULL,              -- ej: 1.30
  priority     SMALLINT DEFAULT 0,                 -- Mayor prioridad gana si hay conflicto
  active       BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Reglas por defecto al insertar
INSERT INTO pricing_rules (station_id, rule_type, condition, multiplier, priority) VALUES
  (NULL, 'time_of_day', '{"hour_gte": 0,  "hour_lt": 6}',  0.80, 10),  -- Valle nocturno
  (NULL, 'time_of_day', '{"hour_gte": 7,  "hour_lt": 9}',  1.25, 8),   -- Pico mañana
  (NULL, 'time_of_day', '{"hour_gte": 17, "hour_lt": 20}', 1.20, 8),   -- Pico tarde
  (NULL, 'occupancy',   '{"occ_gt": 0.85}',                1.50, 20),  -- Muy alta demanda
  (NULL, 'occupancy',   '{"occ_gt": 0.70}',                1.30, 15),  -- Alta demanda
  (NULL, 'occupancy',   '{"occ_lt": 0.25}',                0.85, 5);   -- Baja demanda

-- ──────────────────────────────────────────
-- TELEMETRÍA IoT (TimescaleDB)
-- ──────────────────────────────────────────
CREATE TABLE telemetry (
  time         TIMESTAMPTZ NOT NULL,
  slot_id      UUID NOT NULL REFERENCES slots(id),
  power_kw     NUMERIC(8,3),                       -- kW actuales
  voltage_v    NUMERIC(8,2),
  current_a    NUMERIC(8,2),
  energy_kwh   NUMERIC(10,3),                      -- kWh acumulados en sesión
  temperature  NUMERIC(6,2),                       -- °C del cargador
  soc_pct      SMALLINT,                           -- State of Charge %
  error_code   VARCHAR(50)
);

-- Convertir a hipertabla TimescaleDB (particionada por tiempo)
SELECT create_hypertable('telemetry', 'time');
CREATE INDEX idx_telemetry_slot ON telemetry(slot_id, time DESC);

-- ──────────────────────────────────────────
-- NOTIFICACIONES
-- ──────────────────────────────────────────
CREATE TABLE notifications (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES users(id),
  type         VARCHAR(40),    -- charge_complete | reservation_reminder | payment_failed
  title        VARCHAR(120),
  body         TEXT,
  data         JSONB,
  read         BOOLEAN DEFAULT FALSE,
  sent_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- WALLET TRANSACTIONS
-- ──────────────────────────────────────────
CREATE TABLE wallet_transactions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES users(id),
  type         VARCHAR(20) NOT NULL,  -- topup | charge | refund | deposit
  amount       NUMERIC(12,2) NOT NULL,
  balance_after NUMERIC(12,2) NOT NULL,
  reference    VARCHAR(100),
  description  VARCHAR(200),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- FUNCIONES ÚTILES
-- ──────────────────────────────────────────

-- Estaciones más cercanas a un punto (metros de radio)
CREATE OR REPLACE FUNCTION stations_nearby(
  lat FLOAT, lon FLOAT, radius_m INT DEFAULT 5000
) RETURNS TABLE(id UUID, name TEXT, distance_m FLOAT) AS $$
  SELECT s.id, s.name::TEXT,
    ST_Distance(s.location, ST_MakePoint(lon, lat)::GEOGRAPHY) AS distance_m
  FROM stations s
  WHERE s.status = 'active'
    AND ST_DWithin(s.location, ST_MakePoint(lon, lat)::GEOGRAPHY, radius_m)
  ORDER BY distance_m;
$$ LANGUAGE SQL STABLE;

-- Calcular precio en tiempo real para un slot
CREATE OR REPLACE FUNCTION calc_price(p_station_id UUID, p_occ FLOAT)
RETURNS NUMERIC AS $$
DECLARE
  base NUMERIC;
  mult NUMERIC := 1.0;
  rule RECORD;
  h    INT := EXTRACT(HOUR FROM NOW());
BEGIN
  SELECT base_price INTO base FROM stations WHERE id = p_station_id;
  FOR rule IN
    SELECT multiplier FROM pricing_rules
    WHERE (station_id = p_station_id OR station_id IS NULL)
      AND active = TRUE
      AND (
        (rule_type = 'occupancy' AND
          (condition->>'occ_gt' IS NULL OR p_occ > (condition->>'occ_gt')::FLOAT) AND
          (condition->>'occ_lt' IS NULL OR p_occ < (condition->>'occ_lt')::FLOAT))
        OR
        (rule_type = 'time_of_day' AND
          h >= (condition->>'hour_gte')::INT AND h < (condition->>'hour_lt')::INT)
      )
    ORDER BY priority DESC LIMIT 1
  LOOP
    mult := rule.multiplier;
  END LOOP;
  RETURN ROUND(base * mult, 0);
END;
$$ LANGUAGE plpgsql;
