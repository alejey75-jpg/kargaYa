// ocpp/simulator.js — Simula el protocolo OCPP 1.6 de cargadores físicos
// En producción, esto sería un servidor OCPP-J recibiendo mensajes reales
// de los cargadores (ABB, Schneider, KEBA, etc.)

const { SLOTS, ACTIVE_SESSIONS } = require('../db/memory');

// Estado interno de telemetría por slot
const telemetryState = {};

// Inicializar estado para sesiones activas
ACTIVE_SESSIONS.forEach(ses => {
  telemetryState[ses.slot_id] = {
    session_id: ses.id,
    power_kw: SLOTS.find(s => s.id === ses.slot_id)?.power_kw || 50,
    voltage_v: 380 + Math.random() * 10,
    current_a: 0,
    energy_kwh: ses.energy_kwh,
    battery_pct: ses.battery_current,
    temperature_c: 38 + Math.random() * 8,
    error_code: null,
    last_heartbeat: new Date(),
  };
});

/**
 * Simula los mensajes OCPP que llegan de los cargadores.
 * En producción: ws.on('message', handleOcppMessage)
 *
 * Tipos de mensaje OCPP 1.6:
 *   BootNotification   — el cargador se conecta al sistema
 *   Heartbeat          — ping cada 30s para verificar conexión
 *   StatusNotification — cambio de estado (Available/Charging/Faulted)
 *   MeterValues        — telemetría: kW, kWh, voltaje, temperatura
 *   StartTransaction   — inicio de sesión de carga
 *   StopTransaction    — fin de sesión
 */
function simulateOcppMessage(slotId, messageType) {
  const slot = SLOTS.find(s => s.id === slotId);
  if (!slot) return null;

  const state = telemetryState[slotId];
  const now = new Date().toISOString();

  switch (messageType) {
    case 'BootNotification':
      return {
        messageTypeId: 2,
        uniqueId: `boot_${slotId}_${Date.now()}`,
        action: 'BootNotification',
        payload: {
          chargePointVendor: 'ABB',
          chargePointModel: 'Terra DC Wallbox',
          chargePointSerialNumber: `ABB-${slotId.toUpperCase()}`,
          firmwareVersion: '3.12.0',
          iccid: '8957100021012345678',
        }
      };

    case 'Heartbeat':
      if (state) state.last_heartbeat = new Date();
      return {
        messageTypeId: 3,
        uniqueId: `hb_${Date.now()}`,
        action: 'Heartbeat',
        payload: { currentTime: now }
      };

    case 'MeterValues':
      if (!state) return null;
      // Simular carga de batería progresiva
      state.battery_pct = Math.min(95, state.battery_pct + 0.3 + Math.random() * 0.4);
      state.energy_kwh += (state.power_kw / 3600) * 5; // cada 5s
      state.temperature_c = 35 + Math.random() * 15;
      state.current_a = (state.power_kw * 1000) / state.voltage_v;

      // Alerta si temperatura > 65°C
      if (state.temperature_c > 65) state.error_code = 'OverTemperature';
      else state.error_code = null;

      return {
        messageTypeId: 2,
        uniqueId: `mv_${Date.now()}`,
        action: 'MeterValues',
        payload: {
          connectorId: slot.slot_number,
          transactionId: state.session_id,
          meterValue: [{
            timestamp: now,
            sampledValue: [
              { value: String(Math.round(state.power_kw * 10) / 10),    unit: 'kW',      measurand: 'Power.Active.Import' },
              { value: String(Math.round(state.energy_kwh * 1000) / 1000), unit: 'kWh', measurand: 'Energy.Active.Import.Register' },
              { value: String(Math.round(state.voltage_v)),              unit: 'V',       measurand: 'Voltage' },
              { value: String(Math.round(state.current_a * 10) / 10),   unit: 'A',       measurand: 'Current.Import' },
              { value: String(Math.round(state.temperature_c * 10) / 10), unit: 'Celsius', measurand: 'Temperature' },
              { value: String(Math.round(state.battery_pct)),            unit: 'Percent', measurand: 'SoC' },
            ]
          }]
        }
      };

    case 'StatusNotification':
      const ocppStatus = {
        available: 'Available',
        charging:  'Charging',
        reserved:  'Reserved',
        offline:   'Faulted',
      }[slot.status] || 'Unavailable';

      return {
        messageTypeId: 2,
        uniqueId: `sn_${Date.now()}`,
        action: 'StatusNotification',
        payload: {
          connectorId: slot.slot_number,
          errorCode: state?.error_code || 'NoError',
          status: ocppStatus,
          timestamp: now,
        }
      };

    default:
      return null;
  }
}

// Obtener telemetría actual de un slot
function getSlotTelemetry(slotId) {
  return telemetryState[slotId] || null;
}

// Iniciar una sesión OCPP (simula StartTransaction)
function startTransaction(slotId, userId, batteryPct) {
  telemetryState[slotId] = {
    session_id: null,
    power_kw: SLOTS.find(s => s.id === slotId)?.power_kw || 50,
    voltage_v: 380,
    current_a: 0,
    energy_kwh: 0,
    battery_pct: batteryPct || 10,
    temperature_c: 32,
    error_code: null,
    last_heartbeat: new Date(),
  };
  return { transaction_id: Math.floor(Math.random() * 90000) + 10000 };
}

// Terminar sesión OCPP (simula StopTransaction)
function stopTransaction(slotId) {
  const state = telemetryState[slotId];
  if (!state) return null;
  const finalEnergy = state.energy_kwh;
  delete telemetryState[slotId];
  return { energy_kwh: Math.round(finalEnergy * 100) / 100 };
}

module.exports = {
  simulateOcppMessage, getSlotTelemetry,
  startTransaction, stopTransaction, telemetryState,
};
