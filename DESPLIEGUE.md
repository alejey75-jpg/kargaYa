# Cómo publicar KargaYa

## Recomendación
- **Opción rápida (hoy): todo en Railway o Render.**
  - El backend necesita un proceso que corra siempre: WebSocket, el scheduler que expira reservas y, más adelante, el servidor OCPP.
  - Railway y Render están hechos para eso.
  - El mismo servidor ya sirve la página en `/`.
- **Vercel: para el frontend.**
  - Vercel es ideal para la página o la futura app Next.js.
  - Ya acepta Express y WebSockets en sus Functions, pero las conexiones se cierran al llegar al tiempo máximo de la función.
  - Los `setInterval` del servidor no corren de forma permanente.
  - Para OCPP y para el tiempo real continuo, el backend debe vivir fuera de Vercel.
- **Arquitectura final sugerida:** frontend en Vercel + API/OCPP en Railway o Render + Postgres en Neon, Supabase o Railway.

## Paso 0: subir este código a GitHub
```bash
git clone https://github.com/alejey75-jpg/kargaYa.git
cd kargaYa
# Copia aquí TODO el contenido de este ZIP (reemplaza voltia-api/, que era la versión vieja)
git rm -r --cached voltia-api kargaya-github-ready.zip 2>/dev/null
rm -rf voltia-api kargaya-github-ready.zip
git add .
git commit -m "KargaYa v1.1: backend completo, rename, DATABASE_URL, JWT seguro, CLAUDE.md"
git push origin main
```

## Paso 1: probar en tu computador
```bash
npm install
cp .env.example .env      # en local puedes dejarlo así (modo memoria)
npm run dev
# Abre http://localhost:3000  (página)  y  http://localhost:3000/health
```

## Paso 2: publicar el backend y la página en Railway (o Render)
1. Entra a railway.app e inicia sesión con GitHub.
2. Selecciona New Project → Deploy from GitHub repo → `kargaYa`.
3. Si quieres base de datos real, agrega Add → Database → PostgreSQL. Railway crea `DATABASE_URL` sola.
4. En Variables, configura:
   - `NODE_ENV=production`
   - `JWT_SECRET=` (genéralo con `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`)
   - `DB_SSL=true` (solo si usas Postgres)
5. En Settings → Networking → Generate Domain, obtienes una URL `https://...up.railway.app`.
6. Prueba la URL con `/health`.
- En Render es igual: New Web Service, Start Command `npm start` y las mismas variables.

## Paso 3: crear las tablas (si usas Postgres)
- Abre `src/schema.sql`.
- Si el proveedor no tiene TimescaleDB, borra la línea `CREATE EXTENSION ... timescaledb` y la de `create_hypertable`.
- Ejecútalo en la consola SQL del proveedor.

## Paso 4: Vercel para la página
1. Entra a vercel.com e inicia sesión con GitHub.
2. Selecciona Add New → Project → `kargaYa`.
3. Framework Preset: **Other**. Build Command: vacío.
4. Vercel publica `KARGAYA.html`. Para que abra en la raíz, renómbralo `index.html` o crea un `vercel.json` con un rewrite de `/` a `/KARGAYA.html`.
5. Cuando la página ya llame a la API (pendiente 1 del CLAUDE.md), pon la URL de Railway como variable o constante `API_URL`.

## Paso 5: dominio
- Compra `kargaya.co` en un registrador (revisa disponibilidad y precio).
- Apunta `kargaya.co` a Vercel (frontend) y `api.kargaya.co` a Railway (backend).

## Costos aproximados (verifícalos antes de pagar)
- Vercel Hobby: gratis, pero su uso es personal y no comercial. Para algo comercial, el plan Pro es pago.
- Railway y Render: tienen capa gratuita o de prueba limitada. Un servicio pequeño 24/7 suele costar pocos dólares al mes.
- Dominio `.co`: pago anual.
