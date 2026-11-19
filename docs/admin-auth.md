# ksgServer authentication (ADMIN_AUTH_MODE / TABLET_AUTH_MODE)

Written 2026-11-19, branch `feature/server-jwt-auth`.

## Rule

| Connection | Needs a login token? |
|---|---|
| Admin site → ksgServer (HTTP and live connection) | **Yes**, admin token (`ADMIN_AUTH_MODE`) |
| Tablet → ksgServer (HTTP and live OPC connection) | **Yes**, tablet token (`TABLET_AUTH_MODE`) |
| Raspberry Pi → ksgServer | No (the Pi has no secret; it is checked by its registered `uniqueId` as before) |
| ESP32 devices | Out of scope, unchanged |

## Why

Before this change the server trusted `dbName`, `username` and `role` sent in the request, and
master data, worker names and live OPC values could be read without any login.

## What changed

| Part | Change |
|---|---|
| `ksgServer.js` middleware (after CORS) | Admin routes (`isAdminProtectedRoute`): admin token. Tablet read routes (`isTabletProtectedRoute`): tablet token (admin token also accepted). Everything else unchanged. |
| `ksgServer.js` live connection (Socket.IO) | `subscribe_variables` / `requestVariables` (tablet OPC feed): tablet token. `join`, `monitor_register`, `admin_dashboard_register` (admin pages): admin token. `opcua_realtime_update` goes only to logged-in monitors/admins in enforce mode (before: every connected socket). Pi events (`raspberry_register`, `opcua_data_change`) unchanged. |
| New routes | `POST /api/auth/refresh` (admin token renewal), `POST /api/tablet/refresh-token` (tablet token renewal), `POST /api/tablet/login-info` (tablet login page: one tablet's name/factory/equipment, replaces the full `/getTablets` list), `GET /api/auth/report`. `/loginCustomer` also returns a token. |
| `public/js/tablet.js` | Sends `Authorization` + `X-Tablet-Name` on every request. Renews its 1-year token automatically when < 30 days left. If renewal keeps failing and ≤ 3 days are left, shows a bottom notice (never blocks taps, never logs out). |
| `public/tablet-login.html` | Uses `/api/tablet/login-info`. |
| `public/js/adminAuth.js` | Admin pages only. Adds the admin token to requests, renews it when < 12 h left, red "log in again" banner on 401. |
| Admin pages | `index.html`, `masterDB.html`, `opcManagement.html`, `submittedDB.html`, `opcua-admin.html`, `opcua-monitor.html`, `layout-renderer.html`, `array-viewer.html` load `adminAuth.js`; their live-connection events send the token. `index.html`: old `?token=` bookmark can't replace a newer token; token removed from the address bar. |
| `public/login.html` | Local admin login (stays on the current host, uses `API_URL` from `config.js`). |

**Still open on purpose:** Raspberry Pi routes and events, ESP32/device routes, `/tabletLogin`,
`/loginCustomer`, `/validateToken`, `/api/tablet/login-info`, `/ping`, `/api/status`, static files
(pages themselves contain no data).

Where the admin token comes from: FreyaAccess login → Kurachi `/loginCustomer` signs a 24 h JWT with
the shared `JWT_SECRET` → `ksg.freyaaccess.com?token=…`. ksgServer must have the **same `JWT_SECRET`**
as Kurachi. The tablet token is signed by ksgServer `/tabletLogin` (1 year).

## Modes (each switch separately)

| Value | Behaviour |
|---|---|
| `off` | Exactly the old behaviour. |
| `report` (default when unset) | Never blocks. Records everything that would be blocked (see **Report log**). |
| `enforce` | Blocks. HTTP: 401 (no/expired/invalid token), 403 (other company). Live connection: no subscription (`subscribe_error`, **not** `auth_error`, so a tablet is never force-logged-out by this). Admin handlers see only the verified identity. |

`TABLET_AUTH_MODE` covers the tablet's HTTP reads and its OPC subscription. `/api/tablet/session` and
`/api/tablet/submit` already required the tablet token before this change (all modes).

## Tablet login lifetime

- Login gives a 1-year token (unchanged).
- From 30 days before expiry, the tablet renews it on its own (checked 5 s after the page opens and every
  hour). A tablet used at least once a month never needs to log in again. Renewal is refused for a
  disabled user or a user who lost access to that tablet.
- If renewal fails and ≤ 3 days are left: bottom notice
  「ログインの有効期限まであとN日です。作業が終わったら、ログアウトしてもう一度ログインしてください。」
- The live OPC feed always uses the newest token (read from storage on every subscribe / reconnect).

## Report log (MongoDB `KSG.adminAuthReport`)

One document per area + reason + method + path + who, kept permanently:

| Field | Meaning |
|---|---|
| `area` | `admin` or `tablet` |
| `reason` | `missing-token`, `expired-token`, `invalid-token`, `tablet-token`, `incomplete-token`, `not-subscribed`, `db-mismatch(...)`, `room-mismatch(...)`, `user-mismatch(...)`, `role-mismatch(...)` |
| `method`, `path` | HTTP method + route, or `SOCKET` + event name |
| `who` | Username (`user@tablet` for tablets), `tablet:<name>` if known without a token, else IP |
| `count`, `wouldBlockCount`, `blockedCount` | Totals; in report mode / in enforce mode |
| `firstSeen`, `lastSeen`, `lastMode`, `lastIp`, `lastUserAgent` | When, which mode, which device |

Batched and written every 30 s and on shutdown; a database error never affects a request. Nothing is
written in `off` mode. First occurrence per server run also goes to the server log
(`🔐 [AUTH tablet report] would block: …`).

Read it in Atlas (`KSG` → `adminAuthReport`, sort by `lastSeen`) or in the admin site console:
`fetch('/api/auth/report?days=1').then(r => r.json()).then(d => console.table(d.entries))`.

## Rollout (production stops at 18:00)

**Evening 1**
1. After 18:00, deploy with both modes unset (= `report`).
2. Reload every tablet (pull down / reload, or close and reopen the home-screen icon) and every open admin
   page / monitor screen. Tablets stay logged in.
3. On one tablet: check the product shows, 作業数 moves when the machine runs, NG buttons work.

**Day 2 (production in report mode)** — nothing is blocked.

**Evening 2**
4. Check `KSG.adminAuthReport` with `?days=1`:
   - `area: tablet` entries with `lastSeen` during today's shift = a tablet still on the old page → reload it.
   - `area: admin` `missing-token` = an admin tab not reloaded; `expired-token` = someone who has not logged in for > 24 h.
   - Anything you don't recognise → check before enforcing.
5. Set `TABLET_AUTH_MODE=enforce` and `ADMIN_AUTH_MODE=enforce`, restart, repeat the one-tablet check.

Rollback at any time: set the mode back to `report` (or `off`) and restart. No tablet, Pi or data change
is needed. The two switches are independent, so tablets can be rolled back alone.

## Local testing

- Nothing is blocked with the modes unset. To test like production put `ADMIN_AUTH_MODE=enforce` and
  `TABLET_AUTH_MODE=enforce` in `.env`.
- Admin login on localhost: **`http://localhost:3000/login.html`** (stays on localhost). Banner and
  logout also go to `/login.html` whenever the host is not `*.freyaaccess.com`; override with
  `const KSG_LOGIN_URL = '…'` (e.g. in `config.js`).
- Automated tests (in-memory MongoDB, never the real DB) in `tests/admin-auth/`:
  ```bash
  cd tests/admin-auth && npm install
  npm test        # 427 checks: Pi (HTTP + socket) → tablet live OPC, tablet, admin, sockets, all modes, route sweep
  npm run serve & # local enforce-mode server on :3999 with test data
  npm run browser # 43 checks in headless Chrome: admin pages, tablet login, live OPC, renewal, 3-day notice
  ```
  `npm test` needs the repo `node_modules`. The browser test needs `config.js` pointed at
  `http://localhost:3999` while it runs (revert afterwards) and Google Chrome.

## Not covered

- Raspberry Pi: anyone who knows a Pi's `uniqueId` can still send data (needs a per-Pi secret = Pi update).
- ESP32/device routes (out of scope).
- `raspberry_status_update` (Pi online/offline only) is still broadcast to every socket.
- Role limits: any enabled user of the company can use the admin API with their token (as before).
- CORS is still `*`.
