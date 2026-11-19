// Headless Chrome test of admin pages + tablet against the local enforce-mode server on :3999.
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const jwt = require(path.join(__dirname, '..', '..', 'node_modules', 'jsonwebtoken'));
const BASE = 'http://localhost:3999';
const SECRET = 'e2e-secret';
const SHOTS = path.join(require('os').tmpdir(), 'ksg-admin-auth-shots');
fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0; const out = [];
const check = (n, ok, d = '') => { if (!ok) fails++; out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function open(pg, url) { await pg.goto('about:blank'); await pg.goto(url, { waitUntil: 'networkidle2' }); }

(async () => {
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, userDataDir: path.join(require('os').tmpdir(), 'ksg-admin-auth-chrome-' + Date.now()), args: ['--no-first-run'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  const reqs = []; const errors = [];
  page.on('response', (res) => {
    const u = res.url(); if (res.request().resourceType() === 'document' || !u.startsWith(BASE) || /\.(js|css|png|html|mp3|wav)(\?|$)|socket\.io/.test(u)) return;
    reqs.push({ url: u.replace(BASE, ''), status: res.status(), auth: !!res.request().headers().authorization });
  });
  page.on('pageerror', (e) => errors.push(e.message));

  // A. no token → protected calls 401 + banner pointing at local login
  await open(page, BASE + '/#dashboard'); await sleep(2000);
  const a401 = reqs.filter((r) => r.status === 401);
  const banner = await page.$eval('#ksgAuthBanner a', (a) => a.getAttribute('href')).catch(() => null);
  check('A. no token: admin API calls get 401', a401.length > 0, `${a401.length} x 401`);
  check('A. no token: banner shown, login link stays local (/login.html)', banner === '/login.html', `href=${banner}`);
  await page.screenshot({ path: path.join(SHOTS, 'a_no_token.png') });

  // B. local login → dashboard works
  await open(page, BASE + '/login.html');
  await page.type('#u', 'kasugai'); await page.type('#p', 'pw');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.click('#b')]);
  check('B. login.html redirects to same host', page.url().startsWith(BASE + '/'), page.url());
  const tok = await page.evaluate(() => localStorage.getItem('ksgToken'));
  check('B. token stored', !!tok);

  for (const p of ['dashboard', 'master-db', 'user-management', 'opc-management', 'submitted-db', 'analytics']) {
    reqs.length = 0;
    await open(page, BASE + '/#' + p); await sleep(3500);
    const bad = reqs.filter((r) => r.status === 401 || r.status === 403);
    const noAuth = reqs.filter((r) => !r.auth);
    const hasBanner = !!(await page.$('#ksgAuthBanner'));
    check(`B. page ${p}: ${reqs.length} API calls, none 401/403`, bad.length === 0 && reqs.length > 0, bad.map((r) => `${r.status} ${r.url}`).join(', '));
    check(`B. page ${p}: every API call carried the token`, noAuth.length === 0, noAuth.map((r) => r.url).join(', '));
    check(`B. page ${p}: no login banner`, !hasBanner);
    await page.screenshot({ path: path.join(SHOTS, `b_${p}.png`) });
  }
  // Master DB tablet tab creates/deletes go through too
  reqs.length = 0;
  const created = await page.evaluate(async () => {
    const r = await fetch(BASE_URL + 'createTablet', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dbName: 'KSG', username: 'kasugai', tabletData: { tabletName: 'BROWSER-TEST', tabletBrand: 'x', factoryLocation: '本社工場', 設備名: 'EQ1' } }) });
    return r.status;
  });
  check('B. admin write (createTablet) via page fetch', created >= 200 && created < 300, `status ${created}`);

  // C. token close to expiry is refreshed automatically
  const shortTok = jwt.sign({ username: 'kasugai', role: 'masterUser', company: 'KSG', dbName: 'KSG' }, SECRET, { expiresIn: '1h' });
  await page.evaluate((t) => localStorage.setItem('ksgToken', t), shortTok);
  await open(page, BASE + '/#dashboard'); await sleep(3000);
  const afterTok = await page.evaluate(() => localStorage.getItem('ksgToken'));
  const exp = jwt.decode(afterTok).exp - Date.now() / 1000;
  check('C. 1h-left token refreshed to ~24h on page load', afterTok !== shortTok && exp > 23 * 3600, `left=${Math.round(exp / 3600)}h`);

  // D. old bookmark with ?token=<older> does not replace newer stored token; URL is cleaned
  const olderTok = jwt.sign({ username: 'kasugai', role: 'masterUser', company: 'KSG', dbName: 'KSG' }, SECRET, { expiresIn: '2h' });
  await open(page, BASE + '/?token=' + encodeURIComponent(olderTok) + '#dashboard'); await sleep(1500);
  const keptTok = await page.evaluate(() => localStorage.getItem('ksgToken'));
  check('D. older bookmarked token does not replace newer one', keptTok === afterTok);
  check('D. token removed from address bar', !page.url().includes('token='), page.url());
  // a NEWER url token (fresh FreyaAccess login) is accepted
  const newerTok = jwt.sign({ username: 'kasugai', role: 'masterUser', company: 'KSG', dbName: 'KSG' }, SECRET, { expiresIn: '30h' });
  await open(page, BASE + '/?token=' + encodeURIComponent(newerTok) + '#dashboard'); await sleep(1500);
  check('D. newer token from a fresh login is accepted', (await page.evaluate(() => localStorage.getItem('ksgToken'))) === newerTok);

  // E. expired token → banner, no crash
  const expTok = jwt.sign({ username: 'kasugai', role: 'masterUser', company: 'KSG', dbName: 'KSG' }, SECRET, { expiresIn: -5 });
  await page.evaluate((t) => localStorage.setItem('ksgToken', t), expTok);
  await open(page, BASE + '/#dashboard'); await sleep(2000);
  check('E. expired token → login banner', !!(await page.$('#ksgAuthBanner')));
  await page.screenshot({ path: path.join(SHOTS, 'e_expired.png') });
  // restore a valid admin token in this browser for the tablet test (worst case: admin + tablet in one browser)
  await page.evaluate((t) => localStorage.setItem('ksgToken', t), newerTok);

  // F. tablet in the SAME browser (admin token present in localStorage)
  reqs.length = 0;
  const tab = await browser.newPage();
  await tab.setViewport({ width: 1280, height: 800 });
  const treqs = [];
  tab.on('response', (res) => { const u = res.url(); if (u.startsWith(BASE) && !/\.(js|css|png|html|mp3|wav)(\?|$)|socket\.io/.test(u)) treqs.push({ url: u.replace(BASE, ''), status: res.status(), auth: res.request().headers().authorization || '' }); });
  const terrors = []; tab.on('pageerror', (e) => terrors.push(e.message));
  tab.on('dialog', (d) => d.dismiss());
  await tab.goto(BASE + '/tablet-login.html?tabletName=TAB1', { waitUntil: 'networkidle2' });
  await tab.type('#username', 'op1'); await tab.type('#password', 'pw');
  await Promise.all([tab.waitForNavigation({ waitUntil: 'networkidle2' }), tab.click('#loginButton')]);
  await sleep(4000);
  check('F. tablet logged in and on tablet.html', tab.url().includes('tablet.html'), tab.url());
  const tBad = treqs.filter((r) => r.status >= 400);
  check(`F. tablet: ${treqs.length} API calls, none failed`, tBad.length === 0 && treqs.length > 3, tBad.map((r) => `${r.status} ${r.url}`).join(', '));
  const tAdminTok = treqs.filter((r) => r.auth.includes(newerTok));
  check('F. tablet never sends the admin token (no wrapper on tablet page)', tAdminTok.length === 0 && !(await tab.evaluate(() => !!window.__ksgAdminAuthInstalled)));
  const tNoTok = treqs.filter((r) => !/^\/(tabletLogin|api\/tablet\/login-info|validateToken)/.test(r.url) && !r.auth.startsWith('Bearer '));
  check('F. every tablet data request carried the tablet token', tNoTok.length === 0, tNoTok.map((r) => r.url).join(', '));
  check('F. login page used login-info (not the full tablet list)', treqs.some((r) => r.url.startsWith('/api/tablet/login-info')) && !treqs.some((r) => r.url.startsWith('/getTablets')));
  // Pi pushes a counter value → tablet should receive it over the socket
  const got = tab.evaluate(() => new Promise((res) => { socket.on('opcua_variables_update', (d) => { if (d?.variables?.cnt?.value == 789) res(true); }); setTimeout(() => res(false), 8000); }));
  const arr = Array(30).fill(0); arr[27] = 789;
  await fetch(BASE + '/api/opcua/data', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Raspberry-ID': 'TESTPI' },
    body: JSON.stringify({ raspberryId: 'TESTPI', data: [{ opcNodeId: 'ns=4;s=ARRAY6', value: arr, quality: 'Good', timestamp: new Date().toISOString() }] }) });
  check('F. tablet page receives Pi value (cnt=789) live', await got);
  await tab.screenshot({ path: path.join(SHOTS, 'f_tablet.png') });

  // G. automatic renewal: token with 10 days left is renewed to ~1 year, page keeps working
  const auth0 = JSON.parse(await tab.evaluate(() => localStorage.getItem('tabletAuth')));
  const p0 = jwt.decode(auth0.token);
  const short = jwt.sign({ username: p0.username, role: p0.role, dbName: p0.dbName, tabletId: p0.tabletId, tabletName: p0.tabletName, userId: p0.userId }, SECRET, { expiresIn: '10d' });
  await tab.evaluate((t) => { const a = JSON.parse(localStorage.getItem('tabletAuth')); a.token = t; localStorage.setItem('tabletAuth', JSON.stringify(a)); }, short);
  await tab.reload({ waitUntil: 'networkidle2' }); await sleep(7000);
  const auth1 = JSON.parse(await tab.evaluate(() => localStorage.getItem('tabletAuth')));
  const left1 = (jwt.decode(auth1.token).exp - Date.now() / 1000) / 86400;
  check('G. 10-days-left tablet token renewed automatically (~365 days)', auth1.token !== short && left1 > 360, `left=${Math.round(left1)}d`);
  check('G. still on tablet.html, no warning shown', tab.url().includes('tablet.html') && !(await tab.$('#tabletLoginExpiryWarning')));
  const got2 = tab.evaluate(() => new Promise((res) => { socket.on('opcua_variables_update', (d) => { if (d?.variables?.cnt?.value == 790) res(true); }); setTimeout(() => res(false), 8000); }));
  const arr2 = Array(30).fill(0); arr2[27] = 790;
  await fetch(BASE + '/api/opcua/data', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Raspberry-ID': 'TESTPI' },
    body: JSON.stringify({ raspberryId: 'TESTPI', data: [{ opcNodeId: 'ns=4;s=ARRAY6', value: arr2, quality: 'Good', timestamp: new Date().toISOString() }] }) });
  check('G. after renewal + reload, tablet still receives live Pi value (cnt=790)', await got2);

  // H. renewal fails (server unreachable for that call) and 2 days left → warning, NOT logged out
  const twoDays = jwt.sign({ username: p0.username, role: p0.role, dbName: p0.dbName, tabletId: p0.tabletId, tabletName: p0.tabletName, userId: p0.userId }, SECRET, { expiresIn: '2d' });
  await tab.evaluate((t) => { const a = JSON.parse(localStorage.getItem('tabletAuth')); a.token = t; localStorage.setItem('tabletAuth', JSON.stringify(a)); }, twoDays);
  await tab.setRequestInterception(true);
  tab.on('request', (rq) => (rq.url().includes('/api/tablet/refresh-token') ? rq.abort() : rq.continue()));
  await tab.reload({ waitUntil: 'networkidle2' }); await sleep(7000);
  const warn = await tab.$eval('#tabletLoginExpiryWarning', (e) => e.textContent).catch(() => null);
  check('H. renewal failing + 2 days left → warning bar shown', !!warn && warn.includes('あと2日'), warn || 'none');
  check('H. tablet NOT logged out', tab.url().includes('tablet.html'), tab.url());
  const pe = await tab.$eval('#tabletLoginExpiryWarning', (e) => getComputedStyle(e).pointerEvents).catch(() => '');
  check('H. warning bar cannot block taps', pe === 'none', pe);
  await tab.screenshot({ path: path.join(SHOTS, 'h_tablet_warning.png') });
  await tab.setRequestInterception(false);

  // I. OPC monitor page (admin token in this browser) works
  const mon = await browser.newPage();
  const mreqs = [];
  mon.on('response', (res) => { const u = res.url(); if (u.startsWith(BASE) && u.includes('/api/')) mreqs.push({ url: u.replace(BASE, ''), status: res.status() }); });
  const merrs = []; mon.on('pageerror', (e) => merrs.push(e.message));
  await mon.goto(BASE + '/opcua-monitor', { waitUntil: 'networkidle2' }); await sleep(2500);
  const mBad = mreqs.filter((r) => r.status === 401 || r.status === 403);
  check(`I. opcua-monitor page: ${mreqs.length} API calls, none 401/403`, mBad.length === 0, mBad.map((r) => r.url).join(', '));
  check('F. tablet page had no JS errors', terrors.length === 0, terrors.join(' | ').slice(0, 300));

  const real = errors.filter((e) => !/Failed to fetch|NetworkError/.test(e));
  check('admin pages: no new JS errors', real.length === 0, real.join(' | ').slice(0, 400));
  await browser.close();
  console.log(out.join('\n')); console.log(`\n${out.length - fails} passed, ${fails} failed`);
})().catch((e) => { console.error(e); process.exit(1); });
