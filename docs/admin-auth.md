# Admin API authentication (ADMIN_AUTH_MODE)

Written 2026-11-19, branch `feature/server-jwt-auth`.

## Why

Before this change the admin pages only checked the login in the browser. The server
trusted `dbName`, `username` and `role` sent in the request body or `X-Session-*` headers,
so anyone who knew the URL could read or change master data, users and passwords
without a login.

## What changed

| Part | Change |
|---|---|
| `ksgServer.js` | One middleware (after CORS) checks `Authorization: Bearer <jwt>` on **admin routes only** (`isAdminProtectedRoute`, 97 routes). New `POST /api/auth/refresh`, `GET /api/auth/report`. `/loginCustomer` now also returns a token. |
| `public/js/adminAuth.js` | Loaded only by admin pages. Adds the Bearer token to every request to this server, refreshes it when < 12 h left, shows a "log in again" banner on 401. |
| `index.html` | Loads `adminAuth.js`; a `?token=` link no longer overwrites a newer stored token, and the token is removed from the address bar. Logout uses the same login URL logic. |
| `public/login.html` | Local admin login. Talks to `API_URL` from `config.js` and stays on the current host. |
| `masterDB.html`, `opcManagement.html`, `submittedDB.html`, `opcua-admin.html` | Load `adminAuth.js` when opened directly. |

**Not changed (on purpose):** every tablet route and the tablet pages, every Raspberry Pi / device
route (including routes only older Pi scripts used), all Socket.IO handlers, monitor/display pages
(`opcua-monitor`, `layout-renderer`, `array-viewer`), `/getTablets`, `/tabletLogin`,
`/getTabletTroubleOptions`, `/validateToken`, static files.

Where the admin token comes from: FreyaAccess login → Kurachi server `/loginCustomer`
signs a 24 h JWT with the shared `JWT_SECRET` → redirect to `ksg.freyaaccess.com?token=…`.
ksgServer must have the **same `JWT_SECRET`** as Kurachi (true for the local `.env` files).

## Modes

| `ADMIN_AUTH_MODE` | Behaviour |
|---|---|
| `off` | Exactly the old behaviour. |
| `report` (default when unset) | Never blocks. Logs `🔐 [ADMIN AUTH report] would block: <reason> \| <route> \| <user>` once per combination; totals at `GET /api/auth/report` (admin token required). |
| `enforce` | Blocks: no/expired/invalid token → 401, tablet token → 401, other company's token → 403. Handlers then see only the verified username/role/dbName (body `role` / `creatorRole` and `X-Session-*` headers are overwritten). |

## Rollout (production)

1. Deploy with `ADMIN_AUTH_MODE` unset (= `report`). Nothing is blocked.
2. Ask admins to reload the admin site once (so they get `adminAuth.js`). A screen that stays open
   (dashboard monitor) also needs one reload.
3. Watch the server log / `GET /api/auth/report` for a few working days. Expected entries:
   old browser tabs without the new JS (`missing-token`), expired tokens from people who never
   re-logged in (`expired-token`). Anything else (a route or caller you don't recognise) → look at it
   before step 4.
4. Set `ADMIN_AUTH_MODE=enforce` and restart. Rollback = set it to `report` or `off` and restart.
   No data or client change is needed to roll back.

What users notice in enforce mode: an admin whose token is expired sees a red banner
"ログインの有効期限が切れました" with a login link. While a page is open the token is renewed
automatically, so only someone away more than ~24 h (laptop asleep, browser closed) has to log in again.
Tablets and Raspberry Pis notice nothing.

## Local testing

- Run the server locally as usual. With `ADMIN_AUTH_MODE` unset nothing is blocked.
- To test like production: put `ADMIN_AUTH_MODE=enforce` in `.env`.
- Log in at **`http://localhost:3000/login.html`** (it posts to `API_URL` in `config.js` and then stays
  on localhost instead of redirecting to ksg.freyaaccess.com). The banner and the logout button also
  point to `/login.html` whenever the host is not `*.freyaaccess.com`. To force another login page,
  define `const KSG_LOGIN_URL = '…'` (e.g. in `config.js`).
- Automated tests (in-memory MongoDB, never the real DB): see `tests/admin-auth/`.
  ```bash
  cd tests/admin-auth && npm install
  npm test                  # server + Pi (HTTP + socket) + tablet + admin, in off/unset/report/enforce
  npm run serve &           # local enforce-mode server on :3999 with test data
  npm run browser           # headless Chrome: admin pages + tablet in the same browser
  ```
  `npm test` needs the main repo `node_modules` (run `npm install` in the repo root). The browser test
  needs `config.js` pointed at `http://localhost:3999` while it runs (revert afterwards) and Google Chrome.

## Later (not in this change)

- Tablet read endpoints (`/api/tablet/users`, `/product…`, `/equipment-config`, `/getTabletTroubleOptions`,
  `/getTablets`) are still open; the tablet sends no token on them. To lock them: first make tablet.js send its
  token, deploy, wait until every tablet has reloaded, then require it.
- Device/ESP32 routes without auth (`/api/devices*`, `/api/company-devices/:company`, `/api/device/check/:id`,
  `/api/functions/update`, `/api/device/register-rpi`) and display endpoints (`/api/opcua/monitor/dashboard`,
  `/api/layout/:id`, `/api/opcua/variables/values`, `/api/opcua/realtime-data/:id`, `/api/opcua/raspberries`,
  `/api/opcua/discovered-arrays`, `/api/opcua/data/latest`).
- Role limits: any enabled user of the company can still use the admin API with their token (as before).
- CORS is still `*`.
