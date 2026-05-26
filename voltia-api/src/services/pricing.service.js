// services/pricing.service.js — Motor de precios dinámicos VOLTIA
const { PRICING_RULES, STATIONS, getStationOccupancy } = require('../db/memory');

/**
 * Calcula el precio actual por kWh para una estación.
 * Replica la función SQL calc_price() del schema.
 *
 * Lógica:
 *   1. Obtiene precio base de la estación
 *   2. Evalúa todas las reglas activas (ocupación + hora)
 *   3. Aplica el multiplicador de mayor prioridad
 *   4. Devuelve precio final + desglose para transparencia
 */
function calcPrice(stationId) {
  const station = STATIONS.find(s => s.id === stationId);
  if (!station) throw new Error(`Estación ${stationId} no encontrada`);

  const base = station.base_price;
  const occ  = getStationOccupancy(stationId);
  const hour  = new Date().getHours();

  // Evaluar reglas — tomar la de mayor prioridad que aplique
  let appliedRule = null;
  let highestPriority = -1;

  for (const rule of PRICING_RULES) {
    let matches = false;

    if (rule.type === 'occupancy') {
      const { occ_gt, occ_lt } = rule.condition;
      if (occ_gt !== undefined && occ <= occ_gt) continue;
      if (occ_lt !== undefined && occ >= occ_lt) continue;
      matches = true;
    }

    if (rule.type === 'time_of_day') {
      const { hour_gte, hour_lt } = rule.condition;
      if (hour >= hour_gte && hour < hour_lt) matches = true;
    }

    if (matches && rule.priority > highestPriority) {
      highestPriority = rule.priority;
      appliedRule = rule;
    }
  }

  const multiplier = appliedRule ? appliedRule.multiplier : 1.0;
  const final = Math.round(base * multiplier);

  return {
    station_id:    stationId,
    station_name:  station.name,
    base_price:    base,
    multiplier,
    final_price:   final,
    occupancy_pct: Math.round(occ * 100),
    rule_applied:  appliedRule ? appliedRule.label : 'Tarifa base',
    hour_local:    hour,
    currency:      'COP',
    unit:          'kWh',
    calculated_at: new Date().toISOString(),
  };
}

/**
 * Proyección de precio para las próximas N horas.
 * Útil para mostrar al conductor cuándo es más barato cargar.
 */
function priceForecast(stationId, hours = 12) {
  const station = STATIONS.find(s => s.id === stationId);
  if (!station) throw new Error(`Estación ${stationId} no encontrada`);

  const base = station.base_price;
  const occ  = getStationOccupancy(stationId);
  const now  = new Date();
  const forecast = [];

  for (let i = 0; i < hours; i++) {
    const futureHour = (now.getHours() + i) % 24;
    let mult = 1.0;

    // Solo aplicar reglas de tiempo para el forecast
    for (const rule of PRICING_RULES.filter(r => r.type === 'time_of_day')) {
      const { hour_gte, hour_lt } = rule.condition;
      if (futureHour >= hour_gte && futureHour < hour_lt) {
        mult = rule.multiplier;
        break;
      }
    }

    // También aplicar regla de ocupación actual
    const occRule = PRICING_RULES
      .filter(r => r.type === 'occupancy')
      .sort((a, b) => b.priority - a.priority)
      .find(r => {
        const { occ_gt, occ_lt } = r.condition;
        if (occ_gt !== undefined && occ <= occ_gt) return false;
        if (occ_lt !== undefined && occ >= occ_lt) return false;
        return true;
      });

    if (occRule && occRule.multiplier > mult) mult = occRule.multiplier;

    const label = `${String(futureHour).padStart(2,'0')}:00`;
    forecast.push({ hour: label, price: Math.round(base * mult), multiplier: mult });
  }

  return forecast;
}

/**
 * Estima el costo total de una sesión de carga
 */
function estimateSessionCost(stationId, fromPct, toPct, batteryKwh) {
  const { final_price } = calcPrice(stationId);
  const energyNeeded = ((toPct - fromPct) / 100) * batteryKwh;
  const costCOP = Math.round(energyNeeded * final_price);
  const durationMin = Math.round((energyNeeded / 50) * 60); // estimado con 50kW

  return {
    energy_kwh: Math.round(energyNeeded * 10) / 10,
    price_per_kwh: final_price,
    total_cost_cop: costCOP,
    estimated_min: durationMin,
    battery_from: fromPct,
    battery_to: toPct,
  };
}

module.exports = { calcPrice, priceForecast, estimateSessionCost };
