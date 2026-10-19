# HMS Enterprises Attendance Portal

Production-ready demo SPA for **HMS Enterprises** (Chennai HO) — field + office attendance, leave, roster, and reports.

All data lives in **browser `sessionStorage`** (`hms_attendance_*`). Closing the tab resets data; use **Settings → Reset Demo Data** or JSON export/import for migration practice.

## Quick start

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

API (separate process):

```bash
cd server && npm install && npm run dev
```

**Deploy (staging/prod):** see [`DEPLOY.md`](./DEPLOY.md) — Vercel web + Render API + MySQL.

## Demo login

Password for all accounts: `Demo@12345`

| Email | Role |
|-------|------|
| admin@hmsenterprises.in | Admin |
| manager.chennai@hmsenterprises.in | Manager |
| engineer1@hmsenterprises.in | Field Engineer |
| engineer2@hmsenterprises.in | Field Engineer |
| desk@hmsenterprises.in | Front Desk |
| warehouse@hmsenterprises.in | Warehouse |

Credentials are also listed on the login screen.

## Roles

| Role | Access |
|------|--------|
| **Admin** | Full access — Team, Employees, Leaves approvals, Regularization approvals, Shifts & Holidays, Reports, Settings |
| **Manager / Employee** | Personal only — Dashboard (own), Clock, Attendance Summary, apply Leave / Regularization, Profile |

Only **admin@hmsenterprises.in** can manage the organization.

## Database (future backend)

MySQL schema is ready at [`sql/schema.sql`](sql/schema.sql). It includes employees, attendance, breaks, **regularization**, on-duty, hourly permission, overtime, leave, notifications, and audit logs.

```bash
mysql -u root -p < sql/schema.sql
```

Until the API is wired, the SPA continues to use `sessionStorage` with the same domain model.

## Structure

- `src/types` — domain models
- `src/lib/storage.ts` — sessionStorage namespace
- `src/lib/services/*` — Promise-based services (UI never touches storage)
- `src/data/seed.ts` — rich demo seed
- `sql/schema.sql` — MySQL tables for later backend
- `src/pages/*` — route modules

## Scripts

- `npm run dev` — local development
- `npm run build` — typecheck + production build
- `npm run preview` — serve `dist/`
