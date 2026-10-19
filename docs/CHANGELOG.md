# Changelog — Attendance Platform (Meister Solutions)

The product is a **multi-tenant attendance platform**. HMS Enterprises is the first client (tenant), not the product.

Status legend: ✅ done · 🟡 built, not yet run end-to-end · ⏳ next

---

## 2026-10-07 — Meister client console, invites, and per-client branding (steps 2–3)

### Meister client console (`/platform`)
- ✅ **Separate login for Meister staff** (`/platform/login`). These accounts are not part of any client company; their tokens are rejected by client APIs and vice versa. Create one with `npm run platform:admin -- you@meistersolutions.com "Your Name"` (in `server/`).
- ✅ **Onboard a client in one form**: company name, workspace ID (e.g. `acme`), timezone, first branch, employee code prefix, plan, seat limit, trial or paid, and their admin. The workspace is created with a 9:00–18:00 shift, standard leave types and the branch, and you get an **invite link** to send their admin.
- ✅ **Client list**: status (trial with days left / active / suspended), plan, seats used vs limit, setup progress, last activity; overview of total clients, active people and clock-ins in the last 24 h.
- ✅ **Client panel**: change plan, seats, trial end, contact and internal notes; set logo/colour; **suspend** (blocks sign-in immediately) or reactivate; add more client admins; resend invite / password-reset links; **single sign-on connections** for the client's own ERP (generate, rotate, enable/disable, delete — secret shown once).
- ✅ Every console action is recorded in the audit log.

### Invites and setup
- ✅ **Invite links** (`/invite/…`) — one-time, 7-day links where a person sets their own password and is signed straight in. Issuing a new link cancels the old one. Only a hash is stored.
- ✅ Client admins can **invite employees** too (People → Invite, or automatically after adding someone); share by copy or WhatsApp.
- ✅ **Seat limits** enforced when adding, reactivating, or auto-creating people via SSO.
- ✅ **Getting-started checklist** on a new client's dashboard: logo & colour, shifts & holidays, add team, optional embedding.

### Branding — no more HMS hard-coding
- ✅ Company name, logo and **brand colour** come from each client's settings (sidebar, mobile header, login page, widget, dashboard, profile, roster, reports, print sheet, CSV file names, browser tab title). Clients without a logo get a coloured initials tile.
- ✅ **Branded login**: `/login?workspace=acme` shows that client's logo and colour; a bare `/login` shows the neutral "Meister Attendance" brand.
- ✅ Settings → **Branding** card: logo URL, colour picker, employee code prefix (new people get `PREFIX-0001`…).
- ✅ Branches and departments are per-company (no fixed "Chennai" list).
- ✅ Embed SDK renamed `MeisterAttendance.mount(...)`; `HMSAttendance` still works as an alias.
- ✅ Migration `003_platform.sql`. Verified end-to-end (40/40): console login and isolation, onboarding, invites, seat limits, branding, SSO from a client ERP, suspend/reactivate, HMS data untouched.

⏳ Not yet: billing/payments, automatic action when a trial ends (currently shown as "Trial ended" only), email delivery of invites (links are copied/shared for now), CSV bulk import of employees.

---

## 2026-10-07 — Web app runs on the real API (step 1 of the plan)

- ✅ **API mode** — when `VITE_API_URL` is set (see `.env.example`; `.env.local` points at `http://127.0.0.1:4000`), every screen reads and writes MySQL through the API instead of browser demo data. Leave it unset to keep the offline demo.
  - All services switched: auth, employees, attendance and breaks, leaves, regularizations, shifts, holidays, settings, notifications.
  - The data layer loads one role-scoped snapshot from `/v1/bootstrap`, refreshes after every action, when the tab comes back into view, and every 60 s (so changes from phone or desktop show up).
  - An expired or invalid session signs the user out automatically.
- ✅ **SSO landing page** (`/sso?ticket=…&redirect=/clock`) — host dashboards send users here with a one-time ticket. The ticket is removed from the address bar immediately and exchanged once; redirects are limited to paths inside this app; `embed=1` is kept for iframes.
- ✅ **Login for multiple companies** — if the same email exists in more than one company, the login form asks for the company workspace (e.g. `hms`).
- ✅ **Demo-only tools hidden in API mode** — demo account list on the login page; backup / import / reset in Settings.
- ✅ Verified against the running API: CORS from `localhost:5173`, login, snapshot shape, every list endpoint, shift create/update/delete, settings save, 401 handling (17/17).

---

## 2026-10-07 — Jibble-style experience, embedding, lightweight build

### Time tracking (Jibble-style)
- ✅ **Clock in from anywhere** — a "Clock in" button is always in the header; once clocked in it becomes a live timer pill (green = working, amber = break). `src/components/tracker/TrackerButton.tsx`
- ✅ **Slide-in Time Tracker panel** — pick activity, work mode (Office / Field / Remote), optional note; Clock In / Break / Resume / Clock Out; today's punch list; early-leave reason prompt before shift end. `src/components/tracker/TimeTrackerPanel.tsx`
- ✅ **Shared tracker state** — one hook drives the header pill, panel, Clock page and widget so timers never disagree. `src/hooks/useTimeTracker.ts`
- ✅ **Activities** — "What are you working on?" at clock-in; admins manage the list in Settings; shown in Timesheets and Who's In; demo data includes activities.

### New pages
- ✅ **Timesheets** (`/timesheets`) — weekly grid (people × days), hours per cell with progress bar, leave/absent/holiday colours, per-person and per-day totals, overtime, week navigation, search + department filter, day detail dialog, CSV export. Employees see only themselves.
- ✅ **Who's In** (`/live`, admin) — live board: Working / On break / Clocked out / Not in yet / On leave, running timers, current activity, clock-in map link.
- ✅ **Clock widget** (`/widget/clock`) — compact clock-in card for embedding in other dashboards.

### Look & feel
- ✅ Light sidebar grouped into **Track** (everyone) and **Manage** (admin), Jibble-style; profile + logout in sidebar footer.
- ✅ Mobile bottom nav: Home, Tracker, Timesheets, Time Off, Profile.

### Embed anywhere
- ✅ **`public/embed.js`** — dependency-free SDK: `HMSAttendance.mount('#el', { src, view: 'app' | 'clock', onEvent })`; auto-resizes the widget; emits `ready`, `clock-in`, `clock-out`, `break-start`, `break-end`; only talks to the embedding origin.
- ✅ **Embed mode** — inside an iframe or with `?embed=1` the app hides its own sidebar and shows a compact tab strip.
- ✅ **Settings → Embed in another dashboard** — copy-ready snippets + preview.
- ✅ **`public/embed-demo.html`** — mock host ERP showing the full module and the clock widget embedded.
- ✅ Login now returns the user to the page they came from (e.g. the widget).

### Lightweight
- ✅ Every page is lazy-loaded; demo seed loads only when needed.
- ✅ First load ~130 KB gzipped (was 302 KB in one 1 MB file). Charts (~103 KB gz) load only on chart pages.

---

## 2026-10-07 — Local database live

- ✅ Local MySQL 9.5: database `attendance_platform`, dedicated user `attendance_app` (credentials in `server/.env`, gitignored).
- ✅ Migrations `001_init.sql` + `002_activities.sql` applied.
- ✅ Sample tenant **HMS Enterprises** seeded: 14 employees, 490 attendance records, 10 leave requests, 3 shifts, 11 holidays, SSO issuer `hms-dashboard`.
- ✅ API running at `http://127.0.0.1:4000` — end-to-end test 21/21 passed (login, role scoping, breaks, early-leave rule, clock-out, leave approval + balance, notifications, SSO exchange + replay block).
- Reset sample data anytime: `cd server && npm run seed -- --reset`.

## 2026-10-07 — Phase 1 backend (multi-tenant API)

Location: `server/` — Node.js + TypeScript, Fastify 5, MySQL 8.

- 🟡 **Multi-tenant schema** (`migrations/001_init.sql`) — every table carries `tenant_id`: tenants, settings, branches, departments, shifts, holidays, employees, users, attendance + breaks, regularization, on-duty, hourly permission, overtime, leave types/balances/requests, notifications, audit logs, SSO configs, ticket replay log, API keys, webhooks.
- 🟡 **`002_activities.sql`** — activity on attendance, per-tenant activity list.
- 🟡 **Auth** — email/password login (rate-limited, timing-safe), `/v1/auth/me`; every request re-checks user active, employee active, tenant not suspended.
- 🟡 **SSO for host dashboards** — `/v1/auth/sso/exchange`: host signs a 2–5 min one-time ticket (HS256 secret or RS256/ES256 public key), replay-protected, optional auto-provisioning and role sync.
- 🟡 **APIs** — bootstrap snapshot, attendance (clock in/out, breaks, bulk status), leaves (apply/review/cancel, balances, types), regularizations, employees, shifts, holidays, settings, notifications, `/health`.
- 🟡 **Tenant timezone** — "today", late and early-leave checks use each tenant's timezone, not the server's.
- 🟡 **Scripts** — `npm run migrate`, `npm run seed` (loads HMS as a sample tenant), `npm run sso:ticket <email>` (simulates a host dashboard).
- ✅ Server + scripts typecheck clean.

---

## Earlier (same project)
- ✅ Colourful clock page (ring timer, shift progress, day timeline).
- ✅ Responsive sidebar/header fixes.
- ✅ Admin company overview: filters, KPIs, charts, CSV export; Reports with per-employee attendance rates.
- ✅ Dashboard with 7-day trend, rate donut, who's in, recent activity, approvals, quick actions.
- ✅ Regularization flow instead of auto-absent; on-duty requests.

---

## ⏳ Next
1. Frontend **API mode** + `/sso` page (app talks to the server instead of demo data).
2. **Remove HMS hard-coding** from the app — name, logo, "Chennai", sample accounts come from the tenant instead (~30 places outside the demo seed).
3. **Platform owner console** (Meister Solutions super-admin) + client self-signup + invitations — see `docs/ONBOARDING_AND_SYNC.md`.
4. Kiosk mode (shared device + PIN), real-time updates, offline punches, installable mobile/desktop app.
