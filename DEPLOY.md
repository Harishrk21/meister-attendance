# Deploy Meister Attendance — Vercel (web) + Render (API) + MySQL

Same split as HMS Dashboard (`nova_crm`).

```
HMS_ATT/                 ← WEB (Vite + React) → Vercel
  public/
  src/
  vercel.json
  package.json           npm run build → dist/

HMS_ATT/server/          ← API (Fastify) → Render
  migrations/
  src/
  package.json           npm run build → dist/
```

| Piece | Host | Example staging name |
|--------|------|----------------------|
| SPA | **Vercel** | `meister-attendance.vercel.app` |
| API | **Render** Web Service | `meister-attendance-api.onrender.com` |
| MySQL | **AWS RDS** (or Aiven) — **separate DB** from HMS `novacrm` | database `attendance_platform` |

**Known HMS live URLs (CORS / HMS env):**

| HMS | URL |
|-----|-----|
| Web | `https://novacrms.vercel.app` |
| API | `https://novacrm-api.onrender.com` |

---

## Prerequisites

1. **GitHub repo whose root is `HMS_ATT/`** (this folder is not inside `novacrm` today).  
   Create e.g. `meister-attendance` and push this directory.
2. Accounts: Vercel, Render, MySQL reachable from Render.
3. Create empty MySQL database `attendance_platform` (utf8mb4) on RDS — do **not** reuse the HMS schema.

---

## Step 1 — MySQL

Create DB + user (RDS console or SQL). Point `DATABASE_URL` at it:

```text
mysql://USER:PASSWORD@HOST:3306/attendance_platform
```

Allow Render egress (or `0.0.0.0/0` for staging). Prefer SSL params your host requires (`sslaccept=accept_invalid_certs` if using Prisma-style URLs; mysql2 often works with default SSL on RDS).

---

## Step 2 — API on Render (first)

### Option A — Blueprint

1. Push repo → Render → **New** → **Blueprint** → select repo (`render.yaml`).
2. Fill sync:false secrets when prompted.

### Option B — Manual Web Service

| Setting | Value |
|---------|--------|
| **Root Directory** | `server` ← **must be `server`, not repo root** |
| **Runtime** | Node |
| **Build Command** | `npm install --include=dev && npm run build` |
| **Start Command** | `npm start` |
| **Health Check** | `/health` |
| **Instance** | Free (staging) |

If you see `vite/client` / `tsconfig.app.json` errors on Render, the Root Directory is wrong (it’s building the SPA). Set Root to **`server`** and redeploy.

### Environment

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=10000
DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/attendance_platform
JWT_SECRET=<64+ random chars>
ACCESS_TOKEN_TTL=12h
SSO_AUDIENCE=attendance-platform
# HMS live + local; add preview URLs as needed
CORS_ORIGINS=https://novacrms.vercel.app,https://meister-attendance.vercel.app,http://localhost:5190,http://localhost:5173
APP_URL=https://meister-attendance.vercel.app
```

After first deploy:

```bash
# Render Shell (or local with DATABASE_URL pointing at staging)
cd server
npm run migrate:ci
PLATFORM_ADMIN_PASSWORD='…strong…' npm run platform:admin -- admin@meistersolutions.com "Meister Admin"
```

**Optional one-time seed** (demo tenant `hms` + SSO) — staging only:

```env
SEED_SSO_ISSUER=hms-dashboard
SEED_SSO_SECRET=<same value you will store on HMS for Enterprises>
```

```bash
npm run seed
```

Then remapping HMS Enterprises → that tenant (Phase 1 script / re-enable Attendance).

Health: `https://YOUR-ATT-API.onrender.com/health` → `{ "ok": true }`

---

## Step 3 — Web on Vercel

1. **Add New Project** → import Attendance GitHub repo.
2. Settings:

| Setting | Value |
|---------|--------|
| **Root Directory** | `.` (repo root = `HMS_ATT`, not `server`) |
| **Framework** | Vite |
| **Build** | `npm run build` |
| **Output** | `dist` |

3. Env:

| Name | Value |
|------|--------|
| `VITE_API_URL` | `https://YOUR-ATT-API.onrender.com` |

No `/api` suffix (Attendance routes are `/v1/...`).

4. Deploy → copy URL → set Render `APP_URL` + add origin to `CORS_ORIGINS` → restart API.

---

## Step 4 — Point HMS at Attendance staging

On **HMS Render** (`novacrm-api`) environment:

```env
ATTENDANCE_API_URL=https://YOUR-ATT-API.onrender.com
ATTENDANCE_APP_URL=https://YOUR-ATT-WEB.vercel.app
ATTENDANCE_SSO_AUDIENCE=attendance-platform
ATTENDANCE_SSO_ISSUER_PREFIX=hms-dashboard
ATTENDANCE_PLATFORM_EMAIL=admin@meistersolutions.com
ATTENDANCE_PLATFORM_PASSWORD=<platform admin password from Step 2>
ATTENDANCE_SUSPEND_ON_DISABLE=false
```

Redeploy / restart HMS API.

**HMS Enterprises link:** staging Attendance is a **new** DB — production `attendance_tenant_id` / secret from local Phase 1 will not match. Either:

1. Seed `hms` on staging + run `map-attendance-hms.ts` with staging IDs/secrets, or  
2. Turn **Attendance** off then on in platform Client Detail (re-provision) — for Enterprises prefer (1) so slug stays `hms`.

---

## Step 5 — Verify

| Check | Expect |
|-------|--------|
| `GET …/health` on Attendance API | `{ ok: true }` |
| Open Attendance web | Login / SSO pages load |
| HMS platform → enable Attendance on a **test** client | Tenant created (Phase 2) |
| HMS staff → sidebar Attendance | SSO, no second login (Phase 4) |
| Reused ticket | Rejected |

---

## Production notes

- Do **not** run demo `seed` on production except controlled one-time `hms` map.
- New clients: HMS provision only (Phase 2).
- Free Render sleeps — wake with `/health` before demos.
- Rotate `JWT_SECRET` / SSO secrets independently of HMS CRM secrets.
