const express = require('express');
const cors    = require('cors');
const http    = require('http');
const { WebSocketServer } = require('ws');
const { simulateOcppMessage, telemetryState } = require('./ocpp/simulator');
const { calcPrice } = require('./services/pricing.service');
const db = require('./db/memory');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());
app.use((req,_,next)=>{ console.log(`[${new Date().toISOString().slice(11,19)}] ${req.method} ${req.path}`); next(); });

app.use('/api/v1/stations',     require('./routes/stations'));
app.use('/api/v1/reservations', require('./routes/reservations'));
app.use('/api/v1/sessions',     require('./routes/sessions'));
app.use('/api/v1/pricing',      require('./routes/pricing'));

app.get('/health', (req,res) => res.json({ ok:true, service:'VOLTIA API', version:'1.0.0', uptime:Math.round(process.uptime())+'s', stations:db.STATIONS.length, active_sessions:db.ACTIVE_SESSIONS.filter(s=>s.status==='active').length, timestamp:new Date().toISOString() }));

app.use((err,req,res,_) => res.status(500).json({ ok:false, error:err.message }));

// WebSocket — suscripciones en tiempo real
const subscriptions = new Map();
wss.on('connection', (ws) => {
  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw);
      if (msg.action==='subscribe' && msg.station_id) {
        subscriptions.set(ws, msg.station_id);
        ws.send(JSON.stringify({ type:'subscribed', station_id:msg.station_id }));
      }
    } catch(e) { ws.send(JSON.stringify({ type:'error', message:'JSON inválido' })); }
  });
  ws.on('close', () => subscriptions.delete(ws));
});

// IoT loop — actualizar telemetría y emitir a suscriptores cada 5s
setInterval(() => {
  db.ACTIVE_SESSIONS.filter(s=>s.status==='active').forEach(ses => {
    simulateOcppMessage(ses.slot_id, 'MeterValues');
    const state = telemetryState[ses.slot_id];
    if (state?.battery_pct >= 95) {
      const slot = db.SLOTS.find(s=>s.id===ses.slot_id);
      if (slot) slot.status='available';
      ses.status='completed'; ses.ended_at=new Date();
    }
  });
  subscriptions.forEach((sid, ws) => {
    if (ws.readyState!==1) return;
    const slots = db.SLOTS.filter(s=>s.station_id===sid).map(slot => {
      const st = telemetryState[slot.id];
      return { id:slot.id, slot_number:slot.slot_number, connector:slot.connector, power_kw:slot.power_kw, status:slot.status, battery_pct:st?Math.round(st.battery_pct):null, temperature:st?Math.round(st.temperature_c):null, error:st?.error_code||null };
    });
    ws.send(JSON.stringify({ type:'slots_update', station_id:sid, slots, pricing:{ price:calcPrice(sid).final_price }, timestamp:new Date().toISOString() }));
  });
}, 5000);

// Expirar reservas cada minuto
setInterval(() => {
  db.RESERVATIONS.filter(r=>r.status==='active' && new Date(r.expires_at)<new Date()).forEach(r => {
    r.status='expired';
    const slot=db.SLOTS.find(s=>s.id===r.slot_id);
    if(slot&&slot.status==='reserved') slot.status='available';
    const user=db.USERS.find(u=>u.id===r.user_id);
    if(user) user.wallet_balance+=r.deposit_amount;
  });
}, 60000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n  VOLTIA API  →  http://localhost:${PORT}`);
  console.log(`  WebSocket   →  ws://localhost:${PORT}`);
  console.log(`  Estaciones: ${db.STATIONS.length}  |  Slots: ${db.SLOTS.length}  |  Sesiones activas: ${db.ACTIVE_SESSIONS.filter(s=>s.status==='active').length}\n`);
});
module.exports = { app, server };
