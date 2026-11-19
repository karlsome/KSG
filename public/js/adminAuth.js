// Admin pages only (never loaded by tablet.html / tablet-login.html).
// 1. Adds "Authorization: Bearer <ksgToken>" to every request to this server.
// 2. Keeps the token fresh: a token with less than 12h left is swapped for a new 24h one
//    (POST /api/auth/refresh), so an admin page or dashboard left open never expires.
// 3. If the server says the login is missing/expired, shows a banner with a login link.
(function () {
  if (window.__ksgAdminAuthInstalled) return;
  window.__ksgAdminAuthInstalled = true;

  var TOKEN_KEY = 'ksgToken';
  var USER_KEY = 'authUser';
  // On *.freyaaccess.com → FreyaAccess login. Anywhere else (localhost:3000, LAN IP) → this
  // server's own /login.html, so you stay on the host you are testing. Override by defining
  // KSG_LOGIN_URL (e.g. in config.js).
  function loginUrl() {
    if (typeof KSG_LOGIN_URL !== 'undefined' && KSG_LOGIN_URL) return KSG_LOGIN_URL;
    return /(^|\.)freyaaccess\.com$/i.test(location.hostname) ? 'https://www.freyaaccess.com/' : '/login.html';
  }
  var REFRESH_WHEN_LEFT_MS = 12 * 60 * 60 * 1000;
  var CHECK_EVERY_MS = 30 * 60 * 1000;
  var nativeFetch = window.fetch.bind(window);

  function readToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }

  function decode(token) {
    try {
      var part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(decodeURIComponent(escape(atob(part))));
    } catch (e) { return null; }
  }

  function apiOrigin() {
    try { return new URL(typeof API_URL !== 'undefined' ? API_URL : location.origin).origin; } catch (e) { return location.origin; }
  }

  function isOwnServer(url) {
    try {
      var u = new URL(url, location.href);
      return u.origin === location.origin || u.origin === apiOrigin();
    } catch (e) { return false; }
  }

  function showLoginBanner(reason) {
    if (document.getElementById('ksgAuthBanner')) return;
    var show = function () {
      if (document.getElementById('ksgAuthBanner')) return;
      var bar = document.createElement('div');
      bar.id = 'ksgAuthBanner';
      bar.setAttribute('role', 'alert');
      bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#b91c1c;color:#fff;' +
        'padding:10px 16px;font:14px/1.4 sans-serif;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap';
      var text = document.createElement('span');
      text.textContent = 'ログインの有効期限が切れました。もう一度ログインしてください。 / Your login has expired. Please log in again.';
      var link = document.createElement('a');
      link.href = loginUrl();
      link.textContent = 'ログイン / Log in';
      link.style.cssText = 'background:#fff;color:#b91c1c;padding:4px 12px;border-radius:6px;font-weight:600;text-decoration:none';
      bar.appendChild(text);
      bar.appendChild(link);
      document.body.appendChild(bar);
      console.warn('[adminAuth] login required:', reason);
    };
    if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
  }

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || String(input);
    var token = readToken();
    if (token && isOwnServer(url)) {
      try {
        init = Object.assign({}, init || {});
        var headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
        if (!headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + token);
        init.headers = headers;
      } catch (e) { /* send as-is */ }
    }
    return nativeFetch(input, init).then(function (res) {
      var authError = res.headers && res.headers.get('X-Auth-Error');
      if (authError && authError !== 'db-mismatch' && isOwnServer(url)) showLoginBanner(authError);
      return res;
    });
  };

  var refreshing = null;
  function refreshIfNeeded() {
    var token = readToken();
    if (!token || refreshing) return refreshing;
    var payload = decode(token);
    if (!payload || !payload.exp) return null;
    var left = payload.exp * 1000 - Date.now();
    if (left <= 0 || left > REFRESH_WHEN_LEFT_MS) return null;
    refreshing = nativeFetch(apiOrigin() + '/api/auth/refresh', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
    }).then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (data && data.token && readToken() === token) {
          try {
            localStorage.setItem(TOKEN_KEY, data.token);
            var p = decode(data.token);
            if (p) localStorage.setItem(USER_KEY, JSON.stringify(p));
          } catch (e) { /* storage blocked */ }
        }
      })
      .catch(function () { /* try again next time */ })
      .then(function () { refreshing = null; });
    return refreshing;
  }

  // Called by index.html before it stores a token from ?token=… so an old bookmarked
  // link cannot replace a newer token.
  window.ksgAdminAuth = {
    acceptUrlToken: function (urlToken) {
      var incoming = decode(urlToken);
      if (!incoming) return false;
      var current = decode(readToken());
      return !(current && current.exp && incoming.exp && current.exp > incoming.exp &&
        current.username === incoming.username && current.exp * 1000 > Date.now());
    },
    refreshIfNeeded: refreshIfNeeded,
    loginUrl: loginUrl,
  };

  document.addEventListener('DOMContentLoaded', function () { setTimeout(refreshIfNeeded, 1000); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') refreshIfNeeded(); });
  setInterval(refreshIfNeeded, CHECK_EVERY_MS);
})();
