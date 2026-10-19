# Feature comparison: our platform vs Jibble

Jibble details are from its public website/app behaviour, not insider knowledge.
Legend: ✅ have · 🟡 partial · ❌ missing

---

## 1. What we already have (Jibble-like)

| Area | Feature | Status | Notes |
|---|---|---|---|
| Time clock | Clock in / out, breaks, resume | ✅ | Web app + API |
| | Always-visible clock button + live timer | ✅ | Header pill, slide-in tracker panel |
| | Activities ("what are you working on") | ✅ | Admin-managed list |
| | Work mode (Office / Field / Remote) | ✅ | |
| | GPS location captured at clock-in + map link | ✅ | Captured, not enforced |
| | Late detection with grace period | ✅ | Per shift, tenant timezone |
| | Early-leave reason required | ✅ | Rule toggle |
| | Half-day by minimum hours | ✅ | |
| Timesheets | Weekly grid, totals, overtime, day detail, CSV | ✅ | |
| Live view | Who's In board (working / break / out / not in / leave) | ✅ | Refreshes locally; not real-time across devices yet |
| Corrections | Regularization (missed punch, wrong time) with approval | ✅ | Jibble calls this time-entry edits |
| | On-duty / field-work requests | 🟡 | UI only, no API yet |
| Time off | Leave types, quotas, balances, apply / approve / cancel | ✅ | |
| | Holidays, branch-specific | ✅ | |
| Schedules | Shifts, grace, weekly offs | ✅ | |
| People | Employees, roles (admin / manager / employee), departments, branches | ✅ | Manager approvals not yet scoped to their team |
| Reports | Dashboard KPIs, trends, attendance-rate reports, latecomers, CSV / print | ✅ | |
| Notifications | In-app (leave / regularization pending & results) | ✅ | No email / push yet |
| Platform | Multi-tenant database & API, tenant timezone, audit log | ✅ | |
| Integration | SSO from host dashboards, embed SDK, clock widget | ✅ | **Our differentiator** |
| UX | Light / dark mode, mobile-responsive, lazy-loaded | ✅ | |

---

## 2. What's missing vs Jibble (prioritised)

### P1 — table stakes for selling to other companies
| Feature | Why it matters |
|---|---|
| **Frontend on the real API** | Today the UI still runs on demo data in the browser |
| **Tenant branding + no HMS hard-coding** | Every client must see their own name/logo |
| **Platform owner console** (create / suspend clients, plans, seats) | You can't onboard clients without it |
| **Invites + setup wizard + CSV import** | Self-onboarding like Jibble |
| **Geofencing enforcement** | Block or flag clock-ins outside the office / site radius |
| **Clock-in / clock-out reminders + auto clock-out** | Forgotten punches are the #1 attendance problem |
| **Email notifications** | Approvals and invites outside the app |
| **Manager scope** | Managers approve and see only their team |
| **Timesheet approval & period lock** | Payroll needs "approved, locked" hours |

### P2 — what makes Jibble feel complete
| Feature | Why it matters |
|---|---|
| **Mobile app** (installable PWA → Capacitor iOS/Android) | Field staff clock in from phones; real GPS; push |
| **Offline punches** | Field sites with poor signal |
| **Real-time sync** across devices | Clock in on phone → web updates instantly |
| **Kiosk mode** (shared tablet, PIN / QR) | Factories, warehouses, front desks |
| **Face recognition / selfie verification** | Stops buddy-punching; Jibble's signature feature |
| **Overtime rules** (daily / weekly, holiday & rest-day multipliers) | Payroll-accurate pay hours |
| **Break rules** (paid / unpaid, auto-deduct, max length) | Compliance |
| **Leave accruals & carry-forward** | Policies like "1.5 days per month, carry 5" |
| **Projects / clients / billable rates** | Service companies bill time to customers |
| **Manual time entry** (with approval) | Alternative to regularization for retro hours |
| **Scheduled & custom reports**, payroll export formats | HR wants a monthly file automatically |
| **Live location tracking** of field staff (route during shift) | Field service companies |

### P3 — ecosystem & scale
| Feature | Why it matters |
|---|---|
| Desktop app (Tauri) with tray "Clock in" | Office staff convenience |
| Slack / Microsoft Teams / WhatsApp bots | Clock in from chat |
| Payroll / accounting integrations (Tally, Zoho Payroll, Keka, QuickBooks, Xero) | India: Tally / Zoho matter more than QuickBooks |
| Public API docs + API keys UI + webhooks UI | Tables exist; no endpoints / UI yet |
| Google / Microsoft / SAML login | Enterprise clients |
| Self-serve signup + billing (per-user plans, free tier) | Growth |
| Multi-language (Tamil, Hindi, …) | Field workforce |
| Productivity tracking (idle time, apps / URLs, screenshots) | Optional, Jibble's newer add-on |

---

## 3. Why Jibble stays on top

1. **Free plan with unlimited users** — teams adopt it with zero friction, then upgrade for advanced features.
2. **Works on every device** — web, iOS, Android, Windows, Mac, shared kiosk, Slack/Teams, browser extension; all synced to one cloud.
3. **Face recognition + geofencing** — trustworthy attendance without hardware.
4. **Reliable offline mode** — punches never get lost on bad networks.
5. **Payroll-ready output** — overtime rules, approvals, locked timesheets, payroll integrations.
6. **Self-serve onboarding** — sign up, invite by link/QR, productive in minutes.
7. **Polished, simple UX** — one big button, everything else out of the way.

---

## 4. Where we can beat Jibble

1. **Embed into any ERP / dashboard with SSO** — Jibble is a separate app; we live *inside* the client's system, white-labelled. Already working.
2. **Indian workforce fit** — regularization, on-duty, comp-off, IST, Indian holidays, half-day rules, Tally / Zoho payroll exports.
3. **White-label for partners** — ERP vendors can resell it under their brand.
4. **Data residency / self-hosting** — client data in India or on their own server.
5. **Field service focus** — AMC visits, installations, customer-site check-ins tied to activities.

---

## 5. Recommended build order

1. Frontend on API + `/sso` page → de-HMS branding → platform console + invites *(sellable product)*
2. Geofencing, reminders + auto clock-out, email notifications, manager scope, timesheet approval
3. PWA + offline queue + real-time → kiosk with PIN → selfie / face verification
4. Overtime / break rules, leave accruals, payroll exports (Tally / Zoho)
5. Native mobile & desktop, chat bots, public API + webhooks UI, self-serve billing
