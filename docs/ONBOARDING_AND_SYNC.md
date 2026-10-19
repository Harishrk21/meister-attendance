# Onboarding clients & syncing across devices

**Meister Solutions** owns and runs the platform (like Jibble the company).
**Clients** (HMS Enterprises, and every company after it) are *tenants* — each one is an isolated organization inside the same system, with its own employees, rules, branding and data.

```
Meister Solutions (platform owner)
└── Attendance Platform (one codebase, one API, one database)
    ├── Tenant: HMS Enterprises   → admins, employees, shifts, attendance …
    ├── Tenant: Client B          → its own everything
    └── Tenant: Client C          → its own everything
```

Nothing is built "for HMS". HMS is seeded as sample tenant #1.

---

## 1. Who is who

| Level | Who | Can do |
|---|---|---|
| **Platform owner** | Meister Solutions staff | Create/suspend tenants, set plans and limits, see usage, support access |
| **Tenant admin** | Client's HR/owner | Everything inside *their* company: people, shifts, holidays, rules, reports, integrations |
| **Manager** | Client's team leads | Approve their team's requests, see their team |
| **Employee** | Client's staff | Clock in/out, timesheet, leave, regularization |

A tenant admin can never see another tenant. Meister staff act through a separate, audited platform console.

---

## 2. How Jibble onboards customers (general public behaviour)

1. **Self-serve sign-up** — owner signs up with email / Google / Microsoft, names the organization. No salesperson needed.
2. **Setup wizard** — timezone, work schedule, locations (geofences), activities/projects, time-off policies.
3. **Invite the team** — email invites, SMS, a shareable join link/QR code, or CSV bulk import; employees can also join with an organization code from the app.
4. **Pick how people track** — mobile app, web, desktop, shared kiosk tablet, Slack/Teams bot.
5. **Plan & billing** — free tier, paid tiers priced per user; upgrade anytime.
6. **Integrations** — payroll/HR/SSO connectors and an API.

Larger customers get a sales-assisted version of the same steps.

---

## 3. How *we* onboard a client (three paths, same result)

All three paths end in the same thing: one row in `tenants` plus its settings, one tenant admin, and a configured organization.

### Path A — Sales-assisted (Meister creates it) · *build first*
1. Meister staff open the **Platform Console** → "New client".
2. Enter company name, short code/slug (e.g. `acme`), timezone, plan, seat limit, admin's name + email.
3. System creates the tenant, default settings, a default branch, default shift, default leave types and activities.
4. Admin receives an **invite email** with a one-time link → sets password → lands in the **setup wizard**.
5. Admin completes setup (section 4) and invites staff.

### Path B — Self-serve sign-up (like Jibble)
1. Public page `signup` → company name, your name, work email, password, country/timezone.
2. Verify email → tenant created on a trial plan → same setup wizard.
3. Meister console shows the new tenant for review, upgrade or suspension.

### Path C — Embedded in a client's existing ERP/dashboard (the HMS model)
1. Create the tenant via Path A.
2. In the tenant's **Integrations** page: register their dashboard as an SSO issuer and get a shared secret (or upload their public key).
3. Their backend mints a short-lived ticket when a user clicks "Attendance"; the user opens straight into our app, already signed in — **no second login**. Unknown users are auto-created as employees (optional).
4. They paste `embed.js` (full module or clock widget). Optionally they receive webhooks (clock-in/out, leave approved) and use API keys to sync employees from their HR system.

Already in the database: `sso_configs`, `sso_ticket_uses`, `api_keys`, `webhook_endpoints`, `webhook_deliveries`.

---

## 4. Client setup wizard (what every new tenant fills in)

1. **Company profile** — name, logo, brand colour, address, timezone.
2. **Locations** — branches, optional geofence (lat/lng + radius) to restrict where people can clock in.
3. **Work schedules** — shifts, grace minutes, weekly offs.
4. **Rules** — half-day threshold, overtime after, early-leave note required.
5. **Time off** — leave types, yearly quotas, paid/unpaid.
6. **Holidays** — import a country/state list, edit.
7. **Activities** — what people pick at clock-in.
8. **People** — invite by email, CSV import, join link/code, or sync from their HR via API/SSO.
9. **Tracking methods** — web, mobile, kiosk, embedded widget.

---

## 5. How each client finds *their* company

| Method | Example | When |
|---|---|---|
| Email lookup | `user@acme.com` → tenant `acme` | Default; if one email exists in two tenants, ask which (API already returns `TENANT_REQUIRED`) |
| Company code | "Join code: ACME-4821" | Mobile app first login, kiosk setup |
| Subdomain | `acme.attendance.meister.app` | Branded login page per client |
| SSO ticket | issuer → tenant | Embedded in their dashboard |

---

## 6. Branding per client (white-label)

The app should read **name, logo and colour from the tenant**, not from code. Today the frontend still hard-codes "HMS", the HMS logo and "Chennai" in ~30 places (outside the demo seed). Fix plan: the server already returns `tenant { name, logoUrl, primaryColor }` on login/bootstrap → the shell, login page and widget render from that; platform name ("Meister Attendance" or your chosen product name) is the fallback.

---

## 7. How Jibble stays in sync across web, desktop and mobile

Jibble's apps don't sync with *each other* — they all sync with **one cloud backend** that is the single source of truth.

```
 Web app ─┐
 Desktop ─┼──►  Cloud API + database  ◄──┬─ Mobile (iOS/Android)
 Kiosk ───┘    (one record per punch)    └─ Slack / Teams bot
                     │
                     └─► push to every other open device (real-time)
```

1. **One account, one token per device** — logging in on phone and laptop gives each device its own session against the same user.
2. **Every punch is a server write** — clock in on the phone → the server records it → web and desktop show "Working 00:00:12" within seconds because the server pushes an update (WebSocket/push notification) or the app refreshes on focus.
3. **Timers are computed, not counted** — each device shows `now − clock-in time − breaks`, so all devices show the same number without sending ticks.
4. **Offline first on mobile/kiosk** — no network? The punch is saved on the device with its real timestamp and a unique ID, then uploaded later; the unique ID prevents duplicates if it is sent twice.
5. **Conflict rule** — the server decides (e.g. already clocked in from another device → reject or treat as no-op) and every device updates to the server's answer.
6. **Same features everywhere** — desktop and mobile apps are shells around the same API (and largely the same UI code).

---

## 8. How we get the same sync

| Piece | Status | How |
|---|---|---|
| Single source of truth (API + MySQL) | 🟡 built (`server/`) | Every client calls the same `/v1/*` API |
| Same-number timers on every device | ✅ | UI already computes from clock-in time and breaks |
| Web app | ✅ | Current React app |
| Embedded in client dashboards | ✅ widget/SDK, 🟡 SSO server side | `embed.js` + SSO ticket exchange |
| Installable mobile + desktop (fastest) | ⏳ | Make the web app a **PWA** (install to home screen / desktop, works offline) |
| Native mobile app | ⏳ | Wrap the same React code with **Capacitor** (iOS/Android, real GPS, push) |
| Native desktop app | ⏳ | Wrap with **Tauri** (small download, tray icon "Clock in") |
| Real-time updates | ⏳ | Server-Sent Events/WebSocket channel per tenant; refresh on window focus as fallback |
| Offline punches | ⏳ | Device queue + `clientEventId` (UUID) + device timestamp; server ignores duplicates |
| Kiosk (shared tablet) | ⏳ | Tenant kiosk token + employee PIN/QR; offline queue |
| Push notifications | ⏳ | "Forgot to clock out?", approvals — via web push / FCM / APNs |

---

## 9. Build order (recommended)

1. **Connect the frontend to the API** + `/sso` page; run migrate/seed. *(needs MySQL credentials)*
2. **De-HMS the app** — tenant-driven name/logo/colour; login asks for email (and company if needed).
3. **Platform Console for Meister** — `platform_admins` table, create/suspend tenants, plans, seat limits, usage, audited support access.
4. **Invitations + setup wizard** — invite emails, join code, CSV import.
5. **Integrations page per tenant** — SSO issuer/secret, API keys, webhooks (tables already exist).
6. **PWA + real-time + offline queue** → then Capacitor mobile and Tauri desktop.
7. **Self-serve signup + billing** (per-user plans).
