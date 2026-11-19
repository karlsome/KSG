// End-to-end test of ksgServer admin auth in off / report / enforce modes.
// Real ksgServer.js + in-memory MongoDB. Simulates: Raspberry Pi (HTTP + socket), tablet, admin pages.
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { io: ioc } = require('socket.io-client');
const KSG = path.resolve(process.argv[2] || path.join(__dirname, '..', '..'));
const NM = path.join(KSG, 'node_modules');
const { MongoClient, ObjectId } = require(path.join(NM, 'mongodb'));
const jwt = require(path.join(NM, 'jsonwebtoken'));
const bcrypt = require(path.join(NM, 'bcrypt'));

const SECRET = 'e2e-secret';
const PORT = 3999;
const BASE = `http://127.0.0.1:${PORT}`;
const PI = 'TESTPI';
let failures = 0, passes = 0;
const results = [];
function check(mode, name, ok, detail = '') {
  if (ok) passes++; else failures++;
  results.push(`${ok ? 'PASS' : 'FAIL'} [${mode}] ${name}${detail ? ' — ' + detail : ''}`);
}

async function seed(uri) {
  const c = await MongoClient.connect(uri);
  const pw = await bcrypt.hash('pw', 10);
  const future = new Date(Date.now() + 365 * 864e5);
  await c.db('Sasaki_Coating_MasterDB').collection('masterUsers').insertOne({
    username: 'kasugai', password: pw, role: 'masterUser', dbName: 'KSG', company: 'KSG', validUntil: future,
    devices: [{ uniqueId: PI, name: 'test pi' }],
  });
  const db = c.db('KSG');
  await db.collection('users').insertMany([
    { username: 'adminuser', password: pw, role: 'admin', enable: 'enabled', factory: ['本社工場'], equipment: ['EQ1'], firstName: 'A', lastName: 'Admin' },
    { username: 'op1', password: pw, role: 'member', enable: 'enabled', factory: ['本社工場'], equipment: ['EQ1'], firstName: 'Taro', lastName: 'Op' },
    { username: 'gone', password: pw, role: 'admin', enable: 'disabled', factory: ['本社工場'], equipment: ['EQ1'] },
  ]);
  await db.collection('tabletDB').insertOne({ tabletName: 'TAB1', tabletBrand: 'x', factoryLocation: '本社工場', 設備名: 'EQ1', authorizedUsers: [] });
  await db.collection('equipment').insertOne({ 設備名: 'EQ1', 工場: ['本社工場'], opcVariables: { kanbanVariable: '', productionCountVariable: 'cnt' } });
  const prod = await db.collection('masterDB').insertOne({ 品番: 'P-1', 製品名: 'Test Part', kanbanID: 'A903', 設備: 'EQ1', 工場: '本社工場', 収容数: 50 });
  await db.collection('deviceInfo').insertOne({ device_id: PI, device_name: 'pi', company: 'KSG' });
  await db.collection('opcua_discovered_nodes').insertOne({ raspberryId: PI, opcNodeId: 'ns=4;s=ARRAY6', value: Array(30).fill(0), discoveredAt: new Date().toISOString() });
  await db.collection('opcua_conversions').insertOne({ variableName: 'cnt', raspberryId: PI, opcNodeId: 'ns=4;s=ARRAY6', arrayIndex: 27, sourceType: 'single' });
  await db.collection('opcua_config').insertOne({ raspberryId: PI, company: 'KSG', opcua_server_ip: '127.0.0.1', opcua_server_port: 4840, enabled: true, status: 'offline' });
  await c.close();
  return prod.insertedId.toString();
}

function startServer(uri, mode) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, MONGODB_URI: uri, JWT_SECRET: SECRET, PORT: String(PORT), NODE_ENV: 'production' };
    if (mode !== '(unset)') env.ADMIN_AUTH_MODE = mode; else delete env.ADMIN_AUTH_MODE;
    const p = spawn('node', ['ksgServer.js'], { cwd: KSG, env });
    let log = '';
    const onData = (d) => { log += d; if (/Server running|listening|running on/i.test(log) && /MongoDB|Connected/i.test(log)) { done(); } };
    let finished = false;
    const done = () => { if (!finished) { finished = true; setTimeout(() => resolve({ p, getLog: () => log }), 1500); } };
    p.stdout.on('data', onData); p.stderr.on('data', onData);
    setTimeout(() => { if (!finished) { finished = true; resolve({ p, getLog: () => log }); } }, 15000);
    p.on('exit', (c) => { if (!finished) reject(new Error('server exited ' + c + '\n' + log)); });
  });
}

async function req(method, url, { body, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const r = await fetch(BASE + url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  let json = null; const text = await r.text(); try { json = JSON.parse(text); } catch {}
  return { status: r.status, authErr: r.headers.get('x-auth-error'), json, text };
}
const ok2 = (r) => r.status >= 200 && r.status < 300;

function adminToken(over = {}, opts = { expiresIn: '24h' }) {
  return jwt.sign({ username: 'kasugai', role: 'masterUser', company: 'KSG', dbName: 'KSG', ...over }, SECRET, opts);
}

function waitFor(sock, event, pred = () => true, ms = 6000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => { sock.off(event, h); resolve(null); }, ms);
    const h = (d) => { if (pred(d)) { clearTimeout(t); sock.off(event, h); resolve(d); } };
    sock.on(event, h);
  });
}

async function runMode(uri, mode, productId) {
  const { p, getLog } = await startServer(uri, mode);
  const M = mode;
  try {
    const modeLine = (getLog().match(/Admin API auth mode: (\w+)/) || [])[1];
    check(M, 'server logs auth mode', modeLine === (mode === '(unset)' ? 'report' : mode), `logged=${modeLine}`);

    // ---------------- Raspberry Pi (HTTP, exactly like opcua_client.py) ----------------
    const piH = { 'X-Raspberry-ID': PI };
    let r = await req('POST', '/api/opcua/device-info', { headers: piH, body: { device_id: PI, device_name: 'pi', local_ip: '10.0.0.2', company: 'KSG' } });
    check(M, 'Pi POST /api/opcua/device-info', ok2(r), `status ${r.status}`);
    r = await req('GET', `/api/opcua/config/${PI}`, { headers: piH });
    check(M, 'Pi GET /api/opcua/config/:id', r.status !== 401 && r.status !== 403 && !r.authErr, `status ${r.status}`);
    r = await req('POST', '/api/opcua/heartbeat', { headers: piH, body: { raspberryId: PI, status: 'online', timestamp: new Date().toISOString() } });
    check(M, 'Pi POST /api/opcua/heartbeat', ok2(r), `status ${r.status}`);
    r = await req('POST', '/api/opcua/event-log', { headers: piH, body: { raspberryId: PI, events: [{ type: 'info', message: 'e2e', timestamp: new Date().toISOString() }] } });
    check(M, 'Pi POST /api/opcua/event-log', ok2(r), `status ${r.status}`);
    r = await req('POST', '/api/opcua/discovered-nodes', { headers: piH, body: { raspberryId: PI, nodes: [{ opcNodeId: 'ns=4;s=ARRAY6', browseName: 'ARRAY6', dataType: 'UInt16', value: Array(30).fill(0) }] } });
    check(M, 'Pi POST /api/opcua/discovered-nodes', ok2(r), `status ${r.status} ${r.text.slice(0, 80)}`);
    r = await req('GET', `/api/opcua/datapoints/${PI}`, { headers: piH });
    check(M, 'Pi GET /api/opcua/datapoints/:id', ok2(r), `status ${r.status}`);

    // ---------------- Tablet ----------------
    r = await req('POST', '/getTablets', { body: { dbName: 'KSG' } });
    check(M, 'tablet login page POST /getTablets (no token)', ok2(r) && Array.isArray(r.json), `status ${r.status}`);
    r = await req('POST', '/tabletLogin', { body: { dbName: 'KSG', username: 'op1', password: 'pw', tabletName: 'TAB1' } });
    const tabletToken = r.json?.token;
    check(M, 'tablet POST /tabletLogin', ok2(r) && !!tabletToken, `status ${r.status}`);
    const tH = { Authorization: `Bearer ${tabletToken}`, 'X-Tablet-Name': encodeURIComponent('TAB1') };
    r = await req('POST', '/validateToken', { headers: { Authorization: `Bearer ${tabletToken}` } });
    check(M, 'tablet POST /validateToken', ok2(r), `status ${r.status}`);
    r = await req('GET', `/api/tablet/equipment-config/${encodeURIComponent('TAB1')}`);
    check(M, 'tablet GET equipment-config (no token, like tablet.js)', ok2(r), `status ${r.status}`);
    r = await req('GET', `/api/tablet/users?factory=${encodeURIComponent('本社工場')}&equipment=EQ1`);
    check(M, 'tablet GET /api/tablet/users (no token)', ok2(r) && r.json?.count >= 1, `status ${r.status} count ${r.json?.count}`);
    r = await req('GET', '/api/tablet/product-by-kanban/A903');
    check(M, 'tablet GET product-by-kanban (no token)', ok2(r), `status ${r.status}`);
    r = await req('GET', `/api/tablet/products-by-equipment/EQ1?factory=${encodeURIComponent('本社工場')}`);
    check(M, 'tablet GET products-by-equipment (no token)', ok2(r), `status ${r.status}`);
    r = await req('GET', `/api/tablet/product/${productId}`);
    check(M, 'tablet GET /api/tablet/product/:id (no token)', ok2(r), `status ${r.status}`);
    r = await req('POST', '/getTabletTroubleOptions', { body: { dbName: 'KSG', tabletName: 'TAB1' } });
    check(M, 'tablet POST /getTabletTroubleOptions (no token)', ok2(r), `status ${r.status}`);
    r = await req('POST', '/api/tablet/session', { headers: tH, body: { tabletName: 'TAB1', 設備: 'EQ1', status: 'working', startTime: '08:00' } });
    check(M, 'tablet POST /api/tablet/session (tablet token)', ok2(r), `status ${r.status} ${r.text.slice(0, 80)}`);

    // Tablet socket: subscribe and receive OPC values
    const tab = ioc(BASE, { transports: ['websocket'], forceNew: true });
    let authErrors = 0; tab.on('auth_error', () => authErrors++);
    await new Promise((res) => tab.on('connect', res));
    const firstVars = waitFor(tab, 'opcua_variables_update');
    tab.emit('subscribe_variables', { company: 'KSG', token: tabletToken });
    const v0 = await firstVars;
    check(M, 'tablet socket subscribe_variables → receives variables', !!v0 && 'cnt' in (v0.variables || {}), JSON.stringify(v0?.variables?.cnt || null));

    // Pi pushes a new counter over HTTP → tablet must get it
    let arr = Array(30).fill(0); arr[27] = 123;
    const gotHttp = waitFor(tab, 'opcua_variables_update', (d) => d?.variables?.cnt?.value == 123);
    r = await req('POST', '/api/opcua/data', { headers: piH, body: { raspberryId: PI, data: [{ opcNodeId: 'ns=4;s=ARRAY6', value: arr, quality: 'Good', timestamp: new Date().toISOString() }] } });
    check(M, 'Pi POST /api/opcua/data', ok2(r), `status ${r.status}`);
    check(M, 'tablet receives Pi HTTP value (cnt=123)', !!(await gotHttp));

    // Pi pushes over its socket (raspberry_register + opcua_data_change) → tablet must get it
    const pi = ioc(BASE, { transports: ['websocket'], forceNew: true });
    await new Promise((res) => pi.on('connect', res));
    pi.emit('raspberry_register', { raspberryId: PI, status: 'online', timestamp: new Date().toISOString() });
    await new Promise((res) => setTimeout(res, 400));
    arr = Array(30).fill(0); arr[27] = 456;
    const gotSock = waitFor(tab, 'opcua_variables_update', (d) => d?.variables?.cnt?.value == 456);
    pi.emit('opcua_data_change', { raspberryId: PI, discovered_nodes: [{ opcNodeId: 'ns=4;s=ARRAY6', value: arr, quality: 'Good', timestamp: new Date().toISOString() }] });
    check(M, 'tablet receives Pi socket value (cnt=456)', !!(await gotSock));

    // Re-subscribe (what tablet.js does every 5 min / on wake) keeps working
    const again = waitFor(tab, 'opcua_variables_update');
    tab.emit('subscribe_variables', { company: 'KSG', token: tabletToken });
    check(M, 'tablet re-subscribe (5-min / wake) still receives', !!(await again));

    // A tablet token that is 300 days old (still valid) keeps working
    const oldTabletToken = jwt.sign({ username: 'op1', role: 'member', dbName: 'KSG', tabletId: 'x', tabletName: 'TAB1', iat: Math.floor(Date.now() / 1000) - 300 * 86400 }, SECRET, { expiresIn: '365d' });
    const tab2 = ioc(BASE, { transports: ['websocket'], forceNew: true });
    let tab2AuthErr = 0; tab2.on('auth_error', () => tab2AuthErr++);
    await new Promise((res) => tab2.on('connect', res));
    const v2 = waitFor(tab2, 'opcua_variables_update');
    tab2.emit('subscribe_variables', { company: 'KSG', token: oldTabletToken });
    check(M, '300-day-old tablet token: socket gets OPC values', !!(await v2) && tab2AuthErr === 0);
    r = await req('POST', '/api/tablet/session', { headers: { Authorization: `Bearer ${oldTabletToken}`, 'X-Tablet-Name': 'TAB1' }, body: { tabletName: 'TAB1', status: 'working' } });
    check(M, '300-day-old tablet token: session heartbeat ok', ok2(r), `status ${r.status}`);

    r = await req('POST', '/api/tablet/submit', { headers: tH, body: { 品番: 'P-1', 製品名: 'Test Part', kanbanID: 'A903', 設備: 'EQ1', 工場: '本社工場', 開始時間: '08:00', 終了時間: '09:00', 作業数: 10, 合格数: 10, '技能員①': 'op1', tabletName: 'TAB1' } });
    check(M, 'tablet POST /api/tablet/submit', ok2(r), `status ${r.status} ${r.text.slice(0, 100)}`);
    check(M, 'tablet got no auth_error during the whole run', authErrors === 0, `auth_errors=${authErrors}`);
    tab.close(); tab2.close(); pi.close();

    // ---------------- Display / monitor pages (no login) ----------------
    for (const u of ['/ping', '/api/status', '/tablet.html', '/tablet-login.html', '/index.html', '/js/tablet.js', '/js/adminAuth.js',
      '/api/opcua/monitor/dashboard?company=KSG', '/api/opcua/discovered-arrays?company=KSG', '/api/opcua/variables/values?company=KSG', '/api/opcua/raspberries']) {
      r = await req('GET', u);
      check(M, `open: GET ${u}`, r.status !== 401 && !r.authErr, `status ${r.status}`);
    }

    // ---------------- Admin pages ----------------
    const good = adminToken();
    const adminH = { Authorization: `Bearer ${good}`, 'x-session-user': 'kasugai', 'x-session-db-name': 'KSG', 'x-session-role': 'masterUser' };
    const adminCalls = [
      ['POST', '/getMasterDB', { dbName: 'KSG' }],
      ['POST', '/customerGetUsers', { dbName: 'KSG', role: 'masterUser' }],
      ['POST', '/getFactories', { dbName: 'KSG' }],
      ['POST', '/getEquipment', { dbName: 'KSG' }],
      ['GET', '/api/admin/dashboard-machine-status'],
      ['GET', '/api/admin/submitted-db'],
      ['GET', '/api/opcua/admin/raspberries'],
      ['GET', '/api/opcua/conversions?company=KSG'],
      ['GET', '/api/deviceInfo?company=KSG'],
    ];
    for (const [m, u, b] of adminCalls) {
      r = await req(m, u, { headers: adminH, body: b });
      check(M, `admin with valid token: ${m} ${u}`, ok2(r), `status ${r.status} ${r.text.slice(0, 60)}`);
    }
    // Same calls exactly as the OLD admin page sent them (headers only, no token)
    const oldPageH = { 'x-session-user': 'kasugai', 'x-session-db-name': 'KSG', 'x-session-role': 'masterUser' };
    for (const [m, u, b] of adminCalls) {
      r = await req(m, u, { headers: oldPageH, body: b });
      if (mode === 'enforce') check(M, `admin NO token blocked: ${m} ${u}`, r.status === 401 && r.authErr === 'missing-token', `status ${r.status}`);
      else check(M, `admin NO token still works (not enforcing): ${m} ${u}`, ok2(r), `status ${r.status}`);
    }
    // expired admin token
    const expired = adminToken({}, { expiresIn: -10 });
    r = await req('POST', '/getMasterDB', { headers: { Authorization: `Bearer ${expired}` }, body: { dbName: 'KSG' } });
    check(M, 'expired admin token', mode === 'enforce' ? r.status === 401 && r.authErr === 'expired-token' : ok2(r), `status ${r.status} ${r.authErr}`);
    // other company's token asking for KSG data
    const otherCo = adminToken({ username: 'someone', role: 'admin', company: 'OTHER', dbName: 'OTHER' });
    r = await req('POST', '/getMasterDB', { headers: { Authorization: `Bearer ${otherCo}` }, body: { dbName: 'KSG' } });
    check(M, 'other-company token on KSG data', mode === 'enforce' ? r.status === 403 : ok2(r), `status ${r.status}`);
    // tablet token on admin route
    r = await req('POST', '/getMasterDB', { headers: { Authorization: `Bearer ${tabletToken}` }, body: { dbName: 'KSG' } });
    check(M, 'tablet token on admin route', mode === 'enforce' ? r.status === 401 && r.authErr === 'tablet-token' : ok2(r), `status ${r.status}`);
    // header spoof of masterUser with an operator token
    const opTok = adminToken({ username: 'op1', role: 'member' });
    r = await req('GET', '/api/opcua/admin/raspberries', { headers: { Authorization: `Bearer ${opTok}`, 'x-session-user': 'kasugai' } });
    check(M, 'operator token + spoofed x-session-user', mode === 'enforce' ? r.status === 403 : ok2(r), `status ${r.status}`);
    // body role spoof on password reset
    const target = await req('POST', '/customerGetUsers', { headers: adminH, body: { dbName: 'KSG', role: 'masterUser', search: 'adminuser' } });
    const targetId = (target.json?.users || target.json?.data || []).find?.((u) => u.username === 'adminuser')?._id;
    r = await req('POST', '/customerResetUserPassword', { headers: { Authorization: `Bearer ${opTok}` }, body: { userId: targetId || new ObjectId().toString(), newPassword: 'x', dbName: 'KSG', role: 'admin', username: 'op1' } });
    check(M, 'operator token + body role "admin" on password reset', mode === 'enforce' ? r.status === 403 : r.status !== 403, `status ${r.status}`);

    // local login (/login.html → POST /loginCustomer)
    r = await req('GET', '/login.html');
    check(M, 'open: GET /login.html', ok2(r) && r.text.includes('loginCustomer'), `status ${r.status}`);
    r = await req('POST', '/loginCustomer', { body: { username: 'kasugai', password: 'pw' } });
    const localTok = r.json?.token;
    check(M, 'local login masterUser returns token', ok2(r) && jwt.decode(localTok || '')?.dbName === 'KSG', `status ${r.status}`);
    r = await req('POST', '/getMasterDB', { headers: { Authorization: `Bearer ${localTok}` }, body: { dbName: 'KSG' } });
    check(M, 'local login token works on admin route', ok2(r), `status ${r.status}`);
    r = await req('POST', '/loginCustomer', { body: { username: 'op1', password: 'pw' } });
    check(M, 'local login sub-user returns KSG token', ok2(r) && jwt.decode(r.json?.token || '')?.dbName === 'KSG' && jwt.decode(r.json.token).role === 'member', `status ${r.status}`);
    r = await req('POST', '/loginCustomer', { body: { username: 'op1', password: 'wrong' } });
    check(M, 'local login wrong password refused', r.status === 401, `status ${r.status}`);
    r = await req('POST', '/loginCustomer', { body: { username: 'gone', password: 'pw' } });
    check(M, 'local login disabled user refused', r.status === 403, `status ${r.status}`);

    // refresh endpoint
    const soon = adminToken({}, { expiresIn: '1h' });
    r = await req('POST', '/api/auth/refresh', { headers: { Authorization: `Bearer ${soon}` } });
    const newExp = r.json?.token ? jwt.decode(r.json.token).exp : 0;
    check(M, 'refresh: 1h token → new 24h token', ok2(r) && newExp - Date.now() / 1000 > 23 * 3600 && jwt.decode(r.json.token).dbName === 'KSG');
    r = await req('POST', '/api/auth/refresh', { headers: { Authorization: `Bearer ${expired}` } });
    check(M, 'refresh: expired token refused', r.status === 401, `status ${r.status}`);
    r = await req('POST', '/api/auth/refresh', { headers: { Authorization: `Bearer ${adminToken({ username: 'gone', role: 'admin' })}` } });
    check(M, 'refresh: disabled user refused', r.status === 403, `status ${r.status}`);
    r = await req('POST', '/api/auth/refresh', { headers: { Authorization: `Bearer ${tabletToken}` } });
    check(M, 'refresh: tablet token refused', r.status === 401, `status ${r.status}`);
    r = await req('GET', '/api/auth/report', { headers: { Authorization: `Bearer ${good}` } });
    check(M, 'report endpoint', ok2(r) && Array.isArray(r.json?.entries), `entries=${r.json?.entries?.length}`);
    if (mode === 'report' || mode === '(unset)') check(M, 'report lists would-block entries', (r.json?.entries || []).some((e) => e.reason === 'missing-token'));
    if (mode === 'off') check(M, 'off mode records nothing', (r.json?.entries || []).length === 0);
    {
      const mc = await MongoClient.connect(uri);
      const docs = await mc.db('KSG').collection('adminAuthReport').find({}).toArray();
      const idx = (await mc.db('KSG').collection('adminAuthReport').indexes().catch(() => [])).map((i) => Object.keys(i.key).join(','));
      await mc.close();
      const mt = docs.find((d) => d.reason === 'missing-token' && d.path === '/getMasterDB' && d.who === 'kasugai');
      if (mode === 'off') check(M, 'MongoDB KSG.adminAuthReport: nothing written in off mode', docs.length === 0, `docs=${docs.length}`);
      if (mode === '(unset)' || mode === 'report') check(M, 'MongoDB KSG.adminAuthReport has would-block entry with counts', !!mt && mt.wouldBlockCount >= 1 && mt.count >= mt.wouldBlockCount && mt.firstSeen instanceof Date && mt.lastSeen >= mt.firstSeen && typeof mt.lastUserAgent === 'string', JSON.stringify(mt && { count: mt.count, wouldBlockCount: mt.wouldBlockCount, lastMode: mt.lastMode }));
      if (mode === 'report') check(M, 'MongoDB entry survived a server restart (count kept growing)', !!mt && mt.wouldBlockCount >= 2, `wouldBlockCount=${mt?.wouldBlockCount}`);
      if (mode === 'enforce') check(M, 'MongoDB entry has blockedCount in enforce mode', !!mt && mt.blockedCount >= 1 && mt.lastMode === 'enforce', JSON.stringify(mt && { blockedCount: mt.blockedCount, lastMode: mt.lastMode }));
      if (mode !== 'off') check(M, 'MongoDB indexes key (unique) + lastSeen', idx.includes('key') && idx.includes('lastSeen'), idx.join(' / '));
      if (mode !== 'off') check(M, '/api/auth/report reads the collection', r.json?.collection === 'KSG.adminAuthReport' && (r.json?.entries || []).length === docs.length, `api=${r.json?.entries?.length} db=${docs.length}`);
    }

    // ---------------- Sweep: every route, no token ----------------
    const src = fs.readFileSync(path.join(KSG, 'ksgServer.js'), 'utf8');
    const routes = [...src.matchAll(/^\s*app\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/gm)].map((m) => [m[1].toUpperCase(), m[2]]);
    let wronglyBlocked = [], wronglyOpen = [];
    const expectedProtected = [];
    for (const [m, u] of routes) {
      const url = u.replace(/:([A-Za-z_]+)\??/g, 'x').replace('*', 'x');
      if (/register-rpi|functions\/update|deleteMultiple|delete|Delete|permanent|reset|Reset|create|Create|update|Update|save|Save|soft-delete|restore|trigger-scan|addDivision/.test(u) && mode !== 'enforce') continue; // don't run destructive calls unauthenticated except where blocked
      const rr = await req(m, url, { body: m === 'GET' ? undefined : {} });
      const blocked = rr.status === 401 && !!rr.authErr;
      if (mode === 'enforce') {
        if (blocked) expectedProtected.push(`${m} ${u}`);
      } else if (blocked) wronglyBlocked.push(`${m} ${u}`);
    }
    if (mode === 'enforce') {
      fs.writeFileSync(path.join(require('os').tmpdir(), 'ksg_protected_routes.txt'), expectedProtected.join('\n') + '\n');
      const leaks = expectedProtected.filter((x) => /\/api\/tablet\/|tabletLogin|getTablets |getTabletTroubleOptions|\/api\/opcua\/(config|data|heartbeat|event-log|device-info|datapoints\/)|POST \/api\/opcua\/discovered-nodes$|\/api\/device\/|\/api\/devices|\/api\/company-devices|\/api\/functions|submit-production-data|\/ping|\/api\/status|validateToken|loginCustomer|monitor|\/api\/layout|discovered-arrays|variables\/values|realtime-data|\/api\/opcua\/raspberries/.test(x));
      check(M, `sweep: no tablet / Pi / display route is blocked (${expectedProtected.length} blocked total)`, leaks.length === 0, leaks.join(', '));
    } else {
      check(M, 'sweep: nothing blocked when not enforcing', wronglyBlocked.length === 0, wronglyBlocked.join(', '));
    }

    const crash = /TypeError|ReferenceError|Unhandled/.test(getLog());
    check(M, 'server log has no TypeError/ReferenceError', !crash, crash ? getLog().match(/.*(TypeError|ReferenceError|Unhandled).*/)[0] : '');
    fs.writeFileSync(path.join(require('os').tmpdir(), `ksg_server_${mode.replace(/[()]/g, '')}.log`), getLog());
  } finally {
    p.kill();
    await new Promise((res) => setTimeout(res, 800));
  }
}

module.exports = { seed, startServer };
if (require.main === module) (async () => {
  const mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();
  const productId = await seed(uri);
  for (const mode of ['off', '(unset)', 'report', 'enforce']) {
    try { await runMode(uri, mode, productId); } catch (e) { failures++; results.push(`FAIL [${mode}] crashed: ${e.stack}`); }
  }
  await mongo.stop();
  console.log(results.join('\n'));
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})();
