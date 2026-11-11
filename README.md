<div align="center">

<!-- Logo / Banner -->
<img src="https://img.shields.io/badge/KARGA-YA-00F082?style=for-the-badge&labelColor=070C14&color=00F082&logoColor=white" alt="KargaYa" height="40"/>

# KargaYa

### La primera plataforma inteligente de electrolineras para Colombia

Reservas en tiempo real · Precios dinámicos · Telemetría IoT · Protocolo OCPP 1.6

<br/>

[![Node.js](https://img.shields.io/badge/Node.js-22+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.18-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://postgresql.org)
[![WebSocket](https://img.shields.io/badge/WebSocket-OCPP_1.6-FF6B6B?style=flat-square)](https://github.com/alejey75-jpg/kargaYa)
[![JWT](https://img.shields.io/badge/Auth-JWT-000000?style=flat-square&logo=jsonwebtokens&logoColor=white)](https://jwt.io)
[![Colombia](https://img.shields.io/badge/Hecho_en-Colombia_🇨🇴-FFCD00?style=flat-square)](https://github.com/alejey75-jpg/kargaYa)
[![License](https://img.shields.io/badge/Licencia-MIT-blue?style=flat-square)](LICENSE)
[![Estado](https://img.shields.io/badge/Estado-v1.0_MVP-00F082?style=flat-square)](https://github.com/alejey75-jpg/kargaYa/releases)

<br/>

> **45.000 vehículos eléctricos. 445 electrolineras. 174:1.** Ese es el déficit que KargaYa resuelve.

</div>

---

## ¿Qué es KargaYa?

KargaYa es una plataforma tecnológica que conecta a los conductores de vehículos eléctricos en Colombia con las electrolineras disponibles en su ciudad, permitiéndoles:

- 📍 **Ver en un mapa** todas las estaciones de carga con disponibilidad en tiempo real
- ⚡ **Saber exactamente** cuándo se libera un slot y cuánto tiempo le falta a cada vehículo
- 📅 **Reservar un slot** con anticipación y garantía de llegada de 10 minutos
- 💰 **Conocer el precio antes** de llegar — con tarifas dinámicas transparentes
- 📲 **Pagar desde la app** con Nequi, PSE o tarjeta

Y a los operadores de electrolineras, les da un panel completo para gestionar su red, ajustar precios en tiempo real y recibir alertas del hardware vía OCPP.

---

## Demo rápida

> Abre `KARGAYA.html` directamente en tu navegador — sin servidor, sin instalación.

El archivo incluye:
- **Landing page** animada con estadísticas del mercado colombiano
- **Mapa interactivo** con 5 electrolineras reales de Medellín
- **Slots en tiempo real** con baterías que se actualizan cada 5 segundos
- **Flujo de reserva** completo en 3 pasos (horario → pago → confirmación con QR)
- **Panel del operador** con KPIs, gráficas de ocupación e ingresos y alertas IoT
- **App del conductor** en phone frame con 5 pantallas navegables
- **Backend embebido** con motor de precios dinámicos funcionando

---

## Contexto del mercado

| Indicador | Dato | Fuente |
|-----------|------|--------|
| Vehículos eléctricos en Colombia | **45.000** | RUNT sep 2025 |
| Electrolineras públicas hoy | **445** | UPME 2025 |
| Relación VE por cargador | **174:1** | Cálculo propio |
| Crecimiento VE Q1 2025 vs 2024 | **+247%** | ANDEMOS |
| Meta gobierno 2026 | **6.000 cargadores** | MinTransporte |
| Brecha a cubrir | **5.555 puntos** | — |

El mercado crece **mucho más rápido** que la infraestructura. KargaYa entra ahí.

---

## Arquitectura del sistema

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENTES                               │
│   App móvil  │  Dashboard web  │  Panel operador  │  OCPP  │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP / WebSocket
┌──────────────────────▼──────────────────────────────────────┐
│                   API GATEWAY                               │
│              Auth · Rate limiting · Versioning              │
└──────┬──────────┬───────────┬───────────┬───────────────────┘
       │          │           │           │
   Stations   Reservations Sessions   Pricing
   /slots      (JWT)       (JWT)     (dinámico)
       │          │           │           │
┌──────▼──────────▼───────────▼───────────▼───────────────────┐
│                  CAPA DE DATOS                              │
│  PostgreSQL + PostGIS  │  Redis (cache)  │  TimescaleDB     │
│     Usuarios · Slots   │  Locks · Live   │  Telemetría IoT  │
└─────────────────────────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                INTEGRACIONES                                │
│  Google Maps  │  Wompi / Nequi  │  Firebase FCM  │  OCPP   │
└─────────────────────────────────────────────────────────────┘
```

---

## Estructura del proyecto

```
kargaYa/
│
├── KARGAYA.html                 # Demo visual completa (abrir en navegador)
├── package.json
├── .env.example                 # Variables de entorno — copiar como .env
├── README.md
│
└── src/
    ├── index.js                 # Servidor Express + WebSocket + schedulers
    ├── schema.sql               # Schema PostgreSQL (PostGIS + TimescaleDB)
    │
    ├── db/
    │   ├── pg.js                # Pool PostgreSQL con fallback a memoria
    │   ├── memory.js            # Seed data: 5 estaciones de Medellín
    │   └── repositories.js      # Patrón Repository por entidad
    │
    ├── routes/
    │   ├── auth.js              # POST /register  POST /login  GET /me
    │   ├── stations.js          # GET /stations  GET /:id  GET /:id/slots
    │   ├── reservations.js      # POST /  GET /user/me  DELETE /:id
    │   ├── sessions.js          # POST /start  PUT /:id/stop  GET /history/me
    │   └── pricing.js           # GET /current  /forecast  /all  POST /estimate
    │
    ├── services/
    │   └── pricing.service.js   # Motor de precios dinámicos
    │
    ├── middleware/
    │   └── auth.js              # JWT protect · optionalAuth · bcrypt
    │
    └── ocpp/
        └── simulator.js         # Protocolo OCPP 1.6 — telemetría cargadores
```

---

## Instalación rápida

### Sin base de datos (recomendado para empezar)

```bash
git clone https://github.com/alejey75-jpg/kargaYa.git
cd kargaYa
npm install
node src/index.js
```

```
  KargaYa API  →  http://localhost:3000
  WebSocket    →  ws://localhost:3000
  DB Mode      →  memory (5 estaciones, 18 slots, Medellín)
```

### Con PostgreSQL real

```bash
# 1. Configurar entorno
cp .env.example .env
# Editar .env con tus credenciales de PostgreSQL

# 2. Crear la base de datos
psql -U postgres -c "CREATE DATABASE kargaya_db"
psql -U kargaya_user -d kargaya_db -f src/schema.sql

# 3. Arrancar
node src/index.js
# DB Mode: postgresql ✓
```

### Con Railway / Render (deploy en la nube)

```bash
# Solo configura estas variables de entorno en el panel de Railway:
DATABASE_URL=postgresql://...
DB_SSL=true
JWT_SECRET=tu_secret_de_64_caracteres
NODE_ENV=production
PORT=3000
```

---

## API Reference

### Health check
```
GET /health
```

### Autenticación
```
POST /api/v1/auth/register    { name, email, phone, password }
POST /api/v1/auth/login       { email, password }
GET  /api/v1/auth/me          Authorization: Bearer <token>
```

### Estaciones
```
GET /api/v1/stations?lat=6.21&lon=-75.57&radius=5&available=true
GET /api/v1/stations/:id
GET /api/v1/stations/:id/slots?status=available
```

### Precios dinámicos
```
GET  /api/v1/pricing/current?stationId=st1
GET  /api/v1/pricing/forecast?stationId=st1&hours=12
GET  /api/v1/pricing/all
POST /api/v1/pricing/estimate  { stationId, from_pct, to_pct, battery_kwh }
```

### Reservas (requiere JWT)
```
POST   /api/v1/reservations    { slot_id, reserved_for, vehicle_id }
GET    /api/v1/reservations/user/me
DELETE /api/v1/reservations/:id
```

### Sesiones de carga (requiere JWT)
```
POST /api/v1/sessions/start    { slot_id, battery_pct, vehicle_id }
PUT  /api/v1/sessions/:id/stop
GET  /api/v1/sessions/history/me
```

### WebSocket — tiempo real
```javascript
const ws = new WebSocket('ws://localhost:3000');
ws.onopen = () => ws.send(JSON.stringify({
  action: 'subscribe',
  station_id: 'st1'
}));
ws.onmessage = ({ data }) => {
  const { type, slots, pricing } = JSON.parse(data);
  // type: 'slots_update' cada 5 segundos
};
```

---

## Motor de precios dinámicos

```
Precio final = precio_base × multiplicador

Reglas activas (mayor prioridad gana):
┌──────────────────────────────┬──────────┬──────────┐
│ Condición                    │ ×        │ Ejemplo  │
├──────────────────────────────┼──────────┼──────────┤
│ Ocupación > 85%              │ ×1.50    │ $1.800   │
│ Ocupación > 70%              │ ×1.30    │ $1.560   │
│ Hora pico mañana (7–9am)     │ ×1.25    │ $1.500   │
│ Hora pico tarde (5–8pm)      │ ×1.20    │ $1.440   │
│ Tarifa base                  │ ×1.00    │ $1.200   │
│ Baja demanda (< 25%)         │ ×0.85    │ $1.020   │
│ Valle nocturno (12am–6am)    │ ×0.80    │ $960     │
└──────────────────────────────┴──────────┴──────────┘
```

---

## Hoja de ruta

- [x] **v1.0** — MVP: mapa, slots real-time, reservas, precios dinámicos, JWT auth
- [ ] **v1.1** — Integración Wompi (pagos con tarjeta, PSE, Nequi)
- [ ] **v1.2** — Firebase FCM (notificaciones push iOS/Android)
- [ ] **v1.3** — Redis (cache de precios, bloqueo atómico de slots)
- [ ] **v1.4** — OCPP real (cargadores físicos ABB, Schneider, KEBA)
- [ ] **v2.0** — App móvil nativa (React Native) + expansión nacional

---

## Contribuir

```bash
# 1. Fork del repositorio
# 2. Crear rama para tu feature
git checkout -b feature/nombre-de-tu-feature

# 3. Hacer commit con mensaje descriptivo
git commit -m "feat: descripción clara de lo que hace"

# 4. Push y Pull Request hacia main
git push origin feature/nombre-de-tu-feature
```

**Convención de commits:**
- `feat:` nueva funcionalidad
- `fix:` corrección de bug
- `docs:` cambios en documentación
- `refactor:` refactorización sin cambio funcional
- `test:` agregar o modificar tests

---

## Equipo

| Rol | Responsabilidad |
|-----|----------------|
| **Alejandro Lopez** — Fundador / Admin | Arquitectura, producto, finanzas |
| Dev Backend | API, OCPP, PostgreSQL, WebSocket |
| Dev Frontend | App conductor, mapa, dashboard operador |
| Inversionista / Asesor | Acceso Read — visibilidad del código |

---

## Variables de entorno

Ver `.env.example` para la lista completa. Las mínimas para arrancar:

```bash
PORT=3000
JWT_SECRET=genera_con_node_-e_"console.log(require('crypto').randomBytes(64).toString('hex'))"

# PostgreSQL (opcional — sin esto usa memoria)
DB_URL=postgresql://user:pass@localhost:5432/kargaya_db
```

---

## Licencia

MIT © 2026 KargaYa — Medellín, Colombia 🇨🇴

---

<div align="center">

**KargaYa** · Transformando la movilidad eléctrica de Colombia

[🐛 Reportar bug](https://github.com/alejey75-jpg/kargaYa/issues/new?template=bug_report.md) · [💡 Proponer feature](https://github.com/alejey75-jpg/kargaYa/issues/new?template=feature_request.md) · [📧 Contacto](mailto:alejandro@kargaya.co)

</div>
