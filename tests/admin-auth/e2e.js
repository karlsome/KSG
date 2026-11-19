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
    if (mode !== '(unset)') { env.ADMIN_AUTH_MODE = mode; env.TABLET_AUTH_MODE = mode; } else { delete env.ADMIN_AUTH_MODE; delete env.TABLET_AUTH_MODE; }
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
    const tModeLine = (getLog().match(/Tablet API auth mode: (\w+)/) || [])[1];
    check(M, 'server logs tablet auth mode', tModeLine === (mode === '(unset)' ? 'report' : mode), `logged=${tModeLine}`);

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
    const enf = mode === 'enforce';
    r = await req('POST', '/api/tablet/login-info', { body: { dbName: 'KSG', tabletName: 'TAB1' } });
    check(M, 'tablet login page POST /api/tablet/login-info (no token, only this tablet)', ok2(r) && r.json?.tabletName === 'TAB1' && r.json?.設備名 === 'EQ1' && Object.keys(r.json).length === 4, JSON.stringify(r.json));
    r = await req('POST', '/api/tablet/login-info', { body: { dbName: 'KSG', tabletName: 'NOPE' } });
    check(M, 'login-info unknown tablet → 404', r.status === 404, `status ${r.status}`);
    r = await req('POST', '/getTablets', { body: { dbName: 'KSG' } });
    check(M, 'POST /getTablets without token', enf ? r.status === 401 : ok2(r), `status ${r.status}`);
    r = await req('POST', '/tabletLogin', { body: { dbName: 'KSG', username: 'op1', password: 'pw', tabletName: 'TAB1' } });
    const tabletToken = r.json?.token;
    check(M, 'tablet POST /tabletLogin', ok2(r) && !!tabletToken, `status ${r.status}`);
    const tH = { Authorization: `Bearer ${tabletToken}`, 'X-Tablet-Name': encodeURIComponent('TAB1') };
    r = await req('POST', '/validateToken', { headers: { Authorization: `Bearer ${tabletToken}` } });
    check(M, 'tablet POST /validateToken', ok2(r), `status ${r.status}`);
    const tabletReads = [
      ['GET', `/api/tablet/equipment-config/${encodeURIComponent('TAB1')}`, undefined, (j) => !!j],
      ['GET', `/api/tablet/users?factory=${encodeURIComponent('本社工場')}&equipment=EQ1`, undefined, (j) => j?.count >= 1],
      ['GET', '/api/tablet/product-by-kanban/A903', undefined, (j) => !!j],
      ['GET', `/api/tablet/products-by-equipment/EQ1?factory=${encodeURIComponent('本社工場')}`, undefined, (j) => !!j],
      ['GET', `/api/tablet/product/${productId}`, undefined, (j) => !!j],
      ['POST', '/getTabletTroubleOptions', { dbName: 'KSG', tabletName: 'TAB1' }, (j) => !!j],
    ];
    for (const [m, u, b, okJson] of tabletReads) {
      r = await req(m, u, { headers: tH, body: b });
      check(M, `tablet WITH token (new tablet.js): ${m} ${u.split('?')[0]}`, ok2(r) && okJson(r.json), `status ${r.status}`);
      r = await req(m, u, { body: b });
      check(M, `tablet WITHOUT token (old page): ${m} ${u.split('?')[0]}`, enf ? r.status === 401 : ok2(r), `status ${r.status}`);
    }
    // admin token is accepted on tablet reads too
    r = await req('GET', `/api/tablet/users?factory=${encodeURIComponent('本社工場')}&equipment=EQ1`, { headers: { Authorization: `Bearer ${adminToken()}` } });
    check(M, 'admin token accepted on tablet read', ok2(r), `status ${r.status}`);
    // other company's token on tablet read
    r = await req('POST', '/getTabletTroubleOptions', { headers: { Authorization: `Bearer ${adminToken({ username: 'x', dbName: 'OTHER' })}` }, body: { dbName: 'KSG', tabletName: 'TAB1' } });
    check(M, 'other-company token on tablet read', enf ? r.status === 403 : ok2(r), `status ${r.status}`);

    // tablet token renewal
    r = await req('POST', '/api/tablet/refresh-token', { headers: tH });
    const renewed = r.json?.token;
    const rd = renewed ? jwt.decode(renewed) : null;
    check(M, 'tablet refresh-token → new 1-year token, same tablet/user', ok2(r) && rd && rd.exp - Date.now() / 1000 > 364 * 86400 && rd.tabletName === 'TAB1' && rd.username === 'op1', `status ${r.status}`);
    r = await req('GET', `/api/tablet/users?factory=${encodeURIComponent('本社工場')}&equipment=EQ1`, { headers: { Authorization: `Bearer ${renewed}`, 'X-Tablet-Name': 'TAB1' } });
    check(M, 'renewed tablet token works on reads', ok2(r), `status ${r.status}`);
    r = await req('POST', '/api/tablet/refresh-token', { headers: { Authorization: `Bearer ${jwt.sign({ username: 'gone', role: 'admin', dbName: 'KSG', tabletId: 'x', tabletName: 'TAB1' }, SECRET, { expiresIn: '1d' })}`, 'X-Tablet-Name': 'TAB1' } });
    check(M, 'tablet refresh refused for disabled user', r.status === 403 || r.status === 401, `status ${r.status}`);
    r = await req('POST', '/api/tablet/refresh-token');
    check(M, 'tablet refresh refused without token', r.status === 401, `status ${r.status}`);
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

    // Live-connection rules for sockets that are NOT a logged-in tablet
    {
      const anon = ioc(BASE, { transports: ['websocket'], forceNew: true });
      let anonAuthErr = 0; anon.on('auth_error', () => anonAuthErr++);
      await new Promise((res) => anon.on('connect', res));
      const anonVars = waitFor(anon, 'opcua_variables_update', () => true, 2500);
      const anonErr = waitFor(anon, 'subscribe_error', () => true, 2500);
      anon.emit('subscribe_variables', { company: 'KSG' });
      const [gotVars, gotErr] = await Promise.all([anonVars, anonErr]);
      check(M, 'socket subscribe WITHOUT token', enf ? !gotVars && !!gotErr && anonAuthErr === 0 : !!gotVars, `vars=${!!gotVars} err=${!!gotErr}`);
      const anon2 = ioc(BASE, { transports: ['websocket'], forceNew: true });
      await new Promise((res) => anon2.on('connect', res));
      const rv = waitFor(anon2, 'opcua_variables_update', () => true, 2500);
      anon2.emit('requestVariables', { company: 'KSG' });
      check(M, 'socket requestVariables without subscribing', enf ? !(await rv) : !!(await rv));
      // realtime broadcast must not reach an anonymous socket in enforce; joined admin gets room data
      const admSock = ioc(BASE, { transports: ['websocket'], forceNew: true });
      await new Promise((res) => admSock.on('connect', res));
      admSock.emit('join', { room: 'opcua_KSG', token: adminToken() });
      const noTokJoin = ioc(BASE, { transports: ['websocket'], forceNew: true });
      await new Promise((res) => noTokJoin.on('connect', res));
      noTokJoin.emit('join', { room: 'opcua_KSG' });
      const mon = ioc(BASE, { transports: ['websocket'], forceNew: true });
      await new Promise((res) => mon.on('connect', res));
      mon.emit('monitor_register', { clientType: 'monitor', company: 'KSG', token: adminToken() });
      await new Promise((res) => setTimeout(res, 400));
      const anonRT = waitFor(anon2, 'opcua_realtime_update', () => true, 3000);
      const monRT = waitFor(mon, 'opcua_realtime_update', () => true, 3000);
      const admRoom = waitFor(admSock, 'opcua_discovered_nodes_update', () => true, 3000);
      const noTokRoom = waitFor(noTokJoin, 'opcua_discovered_nodes_update', () => true, 3000);
      const a2 = Array(30).fill(0); a2[27] = 333;
      pi.emit('opcua_data_change', { raspberryId: PI, discovered_nodes: [{ opcNodeId: 'ns=4;s=ARRAY6', value: a2, quality: 'Good', timestamp: new Date().toISOString() }] });
      const [gA, gM, gR, gN] = await Promise.all([anonRT, monRT, admRoom, noTokRoom]);
      check(M, 'opcua_realtime_update to anonymous socket', enf ? !gA : !!gA);
      check(M, 'opcua_realtime_update to logged-in monitor', !!gM);
      check(M, 'admin join WITH token gets live OPC room data', !!gR);
      check(M, 'join WITHOUT token gets live OPC room data', enf ? !gN : !!gN);
      // admin dashboard socket
      const dash = ioc(BASE, { transports: ['websocket'], forceNew: true });
      await new Promise((res) => dash.on('connect', res));
      const dOk = waitFor(dash, 'admin_dashboard_registered', () => true, 2500);
      dash.emit('admin_dashboard_register', { username: 'kasugai', role: 'masterUser', dbName: 'KSG', token: adminToken() });
      check(M, 'admin dashboard socket WITH token registers', !!(await dOk));
      const dash2 = ioc(BASE, { transports: ['websocket'], forceNew: true });
      await new Promise((res) => dash2.on('connect', res));
      const d2Ok = waitFor(dash2, 'admin_dashboard_registered', () => true, 2500);
      dash2.emit('admin_dashboard_register', { username: 'kasugai', role: 'masterUser', dbName: 'KSG' });
      check(M, 'admin dashboard socket WITHOUT token', enf ? !(await d2Ok) : !!(await d2Ok));
      [anon, anon2, admSock, noTokJoin, mon, dash, dash2].forEach((x) => x.close());
    }

    // Tablet still live after all of the above, then token renewed mid-shift: re-subscribe with new token
    {
      const a3 = Array(30).fill(0); a3[27] = 777;
      const g = waitFor(tab, 'opcua_variables_update', (d) => d?.variables?.cnt?.value == 777);
      await req('POST', '/api/opcua/data', { headers: piH, body: { raspberryId: PI, data: [{ opcNodeId: 'ns=4;s=ARRAY6', value: a3, quality: 'Good', timestamp: new Date().toISOString() }] } });
      check(M, 'tablet still receives live Pi value (cnt=777)', !!(await g));
      const g2 = waitFor(tab, 'opcua_variables_update');
      tab.emit('subscribe_variables', { company: 'KSG', token: renewed });
      check(M, 'tablet re-subscribes with RENEWED token', !!(await g2));
      // simulated sleep/wake: drop and reconnect, subscribe again (tablet.js connect handler)
      tab.disconnect();
      await new Promise((res) => setTimeout(res, 300));
      tab.connect();
      await new Promise((res) => tab.once('connect', res));
      const g3 = waitFor(tab, 'opcua_variables_update', (d) => d?.variables?.cnt?.value == 778);
      tab.emit('subscribe_variables', { company: 'KSG', token: renewed });
      await new Promise((res) => setTimeout(res, 400));
      const a4 = Array(30).fill(0); a4[27] = 778;
      pi.emit('opcua_data_change', { raspberryId: PI, discovered_nodes: [{ opcNodeId: 'ns=4;s=ARRAY6', value: a4, quality: 'Good', timestamp: new Date().toISOString() }] });
      check(M, 'after reconnect (sleep/wake) tablet receives live Pi value (cnt=778)', !!(await g3));
    }

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
    for (const u of ['/ping', '/api/status', '/tablet.html', '/tablet-login.html', '/index.html', '/js/tablet.js', '/js/adminAuth.js']) {
      r = await req('GET', u);
      check(M, `open: GET ${u}`, r.status !== 401 && !r.authErr, `status ${r.status}`);
    }
    for (const u of ['/api/opcua/monitor/dashboard?company=KSG', '/api/opcua/discovered-arrays?company=KSG', '/api/opcua/variables/values?company=KSG', '/api/opcua/raspberries']) {
      r = await req('GET', u);
      check(M, `monitor data WITHOUT token: GET ${u.split('?')[0]}`, enf ? r.status === 401 : r.status !== 401, `status ${r.status}`);
      r = await req('GET', u, { headers: { Authorization: `Bearer ${adminToken()}` } });
      check(M, `monitor data WITH admin token: GET ${u.split('?')[0]}`, r.status !== 401 && r.status !== 403, `status ${r.status}`);
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
      const mustStayOpen = /^(GET|POST) \/api\/opcua\/(config\/|data$|heartbeat|event-log|device-info)|^POST \/api\/opcua\/discovered-nodes$|^GET \/api\/opcua\/datapoints\/|\/api\/device\/|\/api\/devices|\/api\/company-devices|\/api\/functions|submit-production-data|\/api\/(products|users)\/:company|\/webapp\/|\/api\/webapp|\/ping|\/api\/status|validateToken|loginCustomer|tabletLogin|\/api\/tablet\/login-info|\/api\/tablet\/(session|submit|refresh-token)|\/api\/auth\//;
      const leaks = expectedProtected.filter((x) => mustStayOpen.test(x));
      check(M, `sweep: no Pi / ESP32 / login route is blocked (${expectedProtected.length} blocked total)`, leaks.length === 0, leaks.join(', '));
      const mustBlock = ['GET /api/tablet/users', 'GET /api/tablet/product/:productId', 'GET /api/tablet/products-by-equipment/:equipmentName',
        'GET /api/tablet/product-by-kanban/:kanbanId', 'GET /api/tablet/equipment-config/:tabletName', 'POST /getTabletTroubleOptions', 'POST /getTablets',
        'GET /api/opcua/monitor/dashboard', 'GET /api/layout/:layoutId', 'GET /api/opcua/variables/values', 'GET /api/opcua/realtime-data/:raspberryId',
        'GET /api/opcua/raspberries', 'GET /api/opcua/discovered-arrays', 'GET /api/opcua/data/latest', 'POST /getMasterDB', 'POST /customerGetUsers'];
      const missing = mustBlock.filter((x) => !expectedProtected.includes(x));
      check(M, 'sweep: tablet reads, /getTablets, monitor data and admin data are blocked without token', missing.length === 0, missing.join(', '));
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
