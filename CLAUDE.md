# KargaYa: contexto para continuar el proyecto

> Este archivo es el prompt maestro. Claude Code lo lee automáticamente al abrir esta carpeta.
> En otro chat, copia y pega todo el contenido como primer mensaje.

## Quién soy y qué quiero
- Soy Alejandro López, administrador financiero en Medellín y especialista en formación en Gerencia de Proyectos.
- KargaYa es mi proyecto: una plataforma inteligente de electrolineras (carga de carros eléctricos) para Medellín y Colombia.
- Quiero **terminar el MVP, conectarlo de punta a punta y dejarlo publicado** para mostrárselo a un inversionista.
- Respóndeme en español, con viñetas, directo y sin inventar. Si algo no lo sabes o no lo probaste, dilo.

## El problema y la propuesta de valor
- Colombia tiene cerca de 45.000 vehículos eléctricos y unas 445 electrolineras públicas, unos 174 por cargador (datos que reuní en junio de 2026; hay que verificarlos antes de presentarlos).
- El conductor no sabe dónde hay un cargador libre, cuánto le falta al carro que está cargando ni cuánto va a pagar.
- KargaYa le permite:
  - ver en un mapa las electrolineras y sus slots en tiempo real;
  - ver cuánto le falta a cada carro y cuándo se libera el slot;
  - reservar un slot con una ventana garantizada de 10 minutos;
  - conocer el precio antes de llegar, con tarifas dinámicas;
  - pagar desde la app (Nequi, PSE, tarjeta, vía Wompi).
- Para el operador: un panel con KPIs, ajuste de precios y alertas del hardware por OCPP.
- Diferenciador: un CSMS propio sobre OCPP con reservas, precios dinámicos y telemetría. Un mapa lo hace cualquiera.

## Decisiones tomadas
- Nombre: **KargaYa**. "Voltia" se descartó porque ya existía.
- Repositorio: https://github.com/alejey75-jpg/kargaYa
- Propuesta al inversionista escogida: **Opción B, $30M COP**.
  - ~$10M para terminar la plataforma: app nativa, pagos Wompi, servidor OCPP real y nube.
  - ~$8M para 2 cargadores AC de 22 kW.
  - El resto para instalación, permisos RETIE, constitución legal, marca y capital de trabajo.
- Mercado inicial: Medellín y Oriente Antioqueño (Rionegro, El Retiro, La Ceja, Guarne, Marinilla). Primer sitio sugerido: C.C. San Nicolás, Rionegro.
- Modelo: arriendo con revenue share, sin comprar predio.

## Qué existe hoy (probado el 11-nov-2026)
- `KARGAYA.html`: demo visual completa en un solo archivo.
  - Incluye landing, mapa de Medellín con 5 estaciones, reserva en 3 pasos, panel del operador y app del conductor.
  - ⚠️ **No llama al backend.** Todos los datos son simulados dentro del HTML.
- Backend Node.js + Express (`src/`):
  - `index.js`: servidor HTTP, WebSocket y schedulers. Sirve el HTML en `/`.
  - `routes/`: auth, stations, reservations, sessions y pricing (API REST `/api/v1/...`).
  - `middleware/auth.js`: JWT y bcrypt. Exige `JWT_SECRET` en producción.
  - `services/pricing.service.js`: motor de precios dinámicos.
  - `ocpp/simulator.js`: simula mensajes OCPP 1.6 de los cargadores.
  - `db/pg.js`: usa PostgreSQL si hay `DB_URL`, `DATABASE_URL` o `DB_HOST`; si no, cae a memoria.
  - `db/memory.js`: datos semilla (5 estaciones, 18 slots).
  - `db/repositories.js`: patrón Repository.
  - `schema.sql`: tablas de PostgreSQL con PostGIS y TimescaleDB.
- Probado en modo memoria y funcionando:
  - `/health`, estaciones, slots, precio actual;
  - registro, login y `/auth/me`;
  - la página en `/`.
- **No probado:** el modo PostgreSQL de punta a punta.

## Endpoints
```
GET  /health
POST /api/v1/auth/register  {name,email,phone,password}
POST /api/v1/auth/login     {email,password}
GET  /api/v1/auth/me        (Bearer)
GET  /api/v1/stations?lat=&lon=&radius=&available=
GET  /api/v1/stations/:id
GET  /api/v1/stations/:id/slots?status=
GET  /api/v1/pricing/current?stationId=
GET  /api/v1/pricing/forecast?stationId=&hours=
GET  /api/v1/pricing/all
POST /api/v1/pricing/estimate {stationId,from_pct,to_pct,battery_kwh}
POST /api/v1/reservations   {slot_id,reserved_for,vehicle_id} (Bearer)
GET  /api/v1/reservations/user/me (Bearer)
DELETE /api/v1/reservations/:id (Bearer)
POST /api/v1/sessions/start {slot_id,battery_pct,vehicle_id} (Bearer)
PUT  /api/v1/sessions/:id/stop (Bearer)
GET  /api/v1/sessions/history/me (Bearer)
WS   ws://host  -> {action:'subscribe', station_id:'st1'}  (slots_update cada 5 s)
```

## Reglas de precio (precio base ≈ $1.200 COP/kWh)
- Valle nocturno, 12am a 6am: ×0.80
- Baja demanda, menos del 25% de ocupación: ×0.85
- Pico de la mañana, 7 a 9am: ×1.25
- Pico de la tarde, 5 a 8pm: ×1.20
- Ocupación mayor al 70%: ×1.30
- Ocupación mayor al 85%: ×1.50
- Si aplican varias reglas, gana la de mayor prioridad.

## Lo que falta, en orden
1. **Conectar el HTML con la API real.** Reemplazar los datos simulados por `fetch` a `/api/v1/...` y la suscripción por WebSocket. Usar una URL base configurable.
2. **Base de datos real.**
   - Usar Postgres administrado (Neon, Supabase o Railway).
   - Hacer TimescaleDB opcional, porque muchos proveedores no lo tienen.
   - Probar todos los endpoints con Postgres.
3. **Seguridad básica:**
   - CORS restringido al dominio;
   - rate limiting en login y registro;
   - validación de entradas;
   - `helmet`;
   - nunca subir `.env`.
4. **Pagos con Wompi** en modo sandbox: recarga de billetera y cobro al cerrar la sesión, con webhook firmado.
5. **Reservas sin choques:** bloqueo atómico del slot (transacción en Postgres o Redis).
6. **Pasar el frontend a una app real** (Next.js o React con Vite), con mapa real (Leaflet/OpenStreetMap o Google Maps) y PWA para celular.
7. **OCPP real:** reemplazar el simulador por un servidor OCPP 1.6J (WebSocket) para cargadores ABB, Schneider, Wallbox o KEBA.
8. Notificaciones push (Firebase), panel de operador con datos reales, pruebas automáticas y CI.

## Cómo trabajar conmigo
- Antes de cambiar algo grande, muéstrame el plan en viñetas.
- Haz commits pequeños con mensajes claros.
- Después de cada paso, dime cómo probarlo yo mismo.
- Si una decisión cuesta plata (hosting, dominio, pasarela), avísame el costo antes.

**Primera tarea:** revisa el repo, corre `npm install` y `npm run dev`, y empieza por el punto 1 de "Lo que falta".
