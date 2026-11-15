/*
 * sync.js: sign-in, cross-device sync and offline cache.
 *
 * The planner (js/app.js) was first built as a Claude artifact, and it asks for
 * its storage through `window.claude.use('db' | 'assets' | 'downloads')`.
 * This file provides those same three things, backed by Supabase, so app.js
 * barely had to change:
 *
 *   db        -> table `app_docs` (one row per data chunk, per user)
 *   assets    -> storage bucket `photos` (check-in photos)
 *   downloads -> a normal browser file download (backups)
 *
 * Offline: every change is written to this device first (localStorage) and
 * queued, then pushed to Supabase when there is a connection. Other devices
 * get changes live (Supabase Realtime) and whenever the app is reopened.
 *
 * If js/config.js has no Supabase keys yet, the app runs "on this device only".
 */
(function () {
  'use strict';

  var cfg = window.APP_CONFIG || {};
  var configured = !!(cfg.supabaseUrl && cfg.supabaseKey && !/YOUR_/.test(cfg.supabaseUrl + cfg.supabaseKey) && window.supabase);
  var sb = configured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  }) : null;

  var TABLE = 'app_docs', BUCKET = 'photos', LOCAL_ONLY = 'sync-local-only';
  var user = null;

  /* sync health, shown in the status pill and in Settings */
  var diag = { lastUp: null, lastDown: null, err: null, pending: 0, syncNow: null };
  function errText(e) {
    if (!e) return 'Unknown error';
    var m = e.message || String(e);
    if (e.code === '42501' || /permission denied/i.test(m)) m += ' (run the latest supabase/schema.sql in Supabase)';
    if (e.code === '42P01' || /does not exist|schema cache/i.test(m)) m += ' (the app_docs table is missing: run supabase/schema.sql)';
    return m + (e.code ? ' [' + e.code + ']' : '');
  }
  function setErr(e) { diag.err = e ? errText(e) : null; if (e) console.warn('Sync problem:', e); notify(); }
  function notify() { try { if (window.appRefreshStatus) window.appRefreshStatus(); } catch (x) {} }

  /* ---------- small helpers ---------- */
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function rid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  /* ---------- auth gate: resolves with the signed-in user, or null for local-only ---------- */
  var authReady = new Promise(function (resolve) {
    if (!sb) { resolve(null); return; }
    sb.auth.getSession().then(function (r) {
      var s = r && r.data && r.data.session;
      if (s) { user = s.user; resolve(user); return; }
      if (lsGet(LOCAL_ONLY)) { resolve(null); return; }
      showSignIn(function (u) { user = u; resolve(u); }, function () { lsSet(LOCAL_ONLY, true); resolve(null); });
    }).catch(function () { resolve(null); });
  });

  if (sb) {
    sb.auth.onAuthStateChange(function (ev) {
      if (ev === 'PASSWORD_RECOVERY') showNewPassword();
    });
  }

  /* ---------- sign-in screen ---------- */
  function overlay(html) {
    var o = document.getElementById('sync-overlay');
    if (!o) { o = document.createElement('div'); o.id = 'sync-overlay'; document.body.appendChild(o); }
    o.innerHTML = '<div class="sync-box">' + html + '</div>';
    return o;
  }
  function closeOverlay() { var o = document.getElementById('sync-overlay'); if (o) o.remove(); }

  function showSignIn(onUser, onLocal) {
    var o = overlay(
      '<h2>Sign in to sync</h2>' +
      '<p class="hint">Sign in on each phone and your laptop with the same email to keep one shared log.</p>' +
      '<label>Email<input id="sy-email" type="email" autocomplete="username" inputmode="email"></label>' +
      '<label>Password<input id="sy-pass" type="password" autocomplete="current-password"></label>' +
      '<div class="err" id="sy-err"></div>' +
      '<button class="btn primary" id="sy-in">Sign in</button>' +
      '<div class="row2"><button class="btn" id="sy-up">Create account</button><button class="btn" id="sy-forgot">Forgot password</button></div>' +
      '<button class="linkbtn" id="sy-local">Use on this device only for now</button>'
    );
    function val(id) { return (document.getElementById(id).value || '').trim(); }
    function err(m) { document.getElementById('sy-err').textContent = m || ''; }
    function busy(b) { o.querySelectorAll('button').forEach(function (x) { x.disabled = b; }); }
    function done(u) { closeOverlay(); onUser(u); }

    o.querySelector('#sy-in').onclick = function () {
      var e = val('sy-email'), p = document.getElementById('sy-pass').value;
      if (!e || !p) { err('Enter your email and password.'); return; }
      busy(true); err('');
      sb.auth.signInWithPassword({ email: e, password: p }).then(function (r) {
        busy(false);
        if (r.error) { err(r.error.message); return; }
        done(r.data.user);
      }).catch(function () { busy(false); err('Couldn’t reach the server. Check your connection.'); });
    };
    o.querySelector('#sy-up').onclick = function () {
      var e = val('sy-email'), p = document.getElementById('sy-pass').value;
      if (!e || p.length < 6) { err('Enter your email and a password of at least 6 characters.'); return; }
      busy(true); err('');
      sb.auth.signUp({ email: e, password: p, options: { emailRedirectTo: location.origin + location.pathname } }).then(function (r) {
        busy(false);
        if (r.error) { err(r.error.message); return; }
        if (r.data.session) { done(r.data.user); return; }
        err('Account made. Check your email for a confirmation link, then sign in here.');
      }).catch(function () { busy(false); err('Couldn’t reach the server. Check your connection.'); });
    };
    o.querySelector('#sy-forgot').onclick = function () {
      var e = val('sy-email');
      if (!e) { err('Enter your email first, then tap Forgot password.'); return; }
      busy(true);
      sb.auth.resetPasswordForEmail(e, { redirectTo: location.origin + location.pathname }).then(function (r) {
        busy(false);
        err(r.error ? r.error.message : 'Check your email for a link to set a new password.');
      });
    };
    o.querySelector('#sy-local').onclick = function () { closeOverlay(); onLocal(); };
    o.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') o.querySelector('#sy-in').click(); });
  }

  function showNewPassword() {
    var o = overlay(
      '<h2>Set a new password</h2>' +
      '<label>New password<input id="sy-np" type="password" autocomplete="new-password"></label>' +
      '<div class="err" id="sy-err"></div><button class="btn primary" id="sy-save">Save password</button>'
    );
    o.querySelector('#sy-save').onclick = function () {
      var p = document.getElementById('sy-np').value;
      if (p.length < 6) { document.getElementById('sy-err').textContent = 'At least 6 characters.'; return; }
      sb.auth.updateUser({ password: p }).then(function (r) {
        if (r.error) { document.getElementById('sy-err').textContent = r.error.message; return; }
        closeOverlay(); location.replace(location.pathname);
      });
    };
  }

  /* ---------- merging: combine this device's change with another device's ---------- */
  // Stable text form of a value (object keys sorted), so two copies can be compared
  // even though the database returns keys in a different order.
  function canon(v) {
    if (v === undefined) return 'undefined';
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
  }
  function same(a, b) { return canon(a) === canon(b); }
  function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function mergeKeyed(b, l, r, lKeys, rKeys) {
    // b, l, r are maps; returns [key, value] pairs: the other device's order first, then anything only added here
    var out = [], seen = {};
    rKeys.concat(lKeys).forEach(function (k) {
      if (seen[k]) return; seen[k] = 1;
      var inB = k in b, inL = k in l, inR = k in r;
      if (inL && inR) out.push([k, merge3(b[k], l[k], r[k])]);
      else if (inR) { if (!(inB && same(b[k], r[k]))) out.push([k, r[k]]); }   // else: removed here
      else if (inL) { if (!(inB && same(b[k], l[k]))) out.push([k, l[k]]); }   // else: removed there
    });
    return out;
  }
  // base = the last version both sides agreed on; local = this device; remote = the server.
  // Keeps both sides' changes; where both changed the very same value, this device wins.
  function merge3(base, local, remote) {
    if (same(local, remote)) return local;
    if (same(base, local)) return remote;
    if (same(base, remote)) return local;
    if (isObj(local) && isObj(remote)) {
      var o = {};
      mergeKeyed(isObj(base) ? base : {}, local, remote, Object.keys(local), Object.keys(remote)).forEach(function (p) { o[p[0]] = p[1]; });
      return o;
    }
    if (Array.isArray(local) && Array.isArray(remote)) {
      var b = Array.isArray(base) ? base : [], all = b.concat(local, remote);
      var keyOf = null;
      if (all.every(function (x) { return isObj(x) && x.id != null; })) keyOf = function (x) { return 'id:' + x.id; };
      else if (b.length === local.length && local.length === remote.length) return local.map(function (x, i) { return merge3(b[i], x, remote[i]); });
      else if (all.every(isObj)) keyOf = canon;
      if (!keyOf) return local;
      var toMap = function (arr) { var m = {}; arr.forEach(function (x) { m[keyOf(x)] = x; }); return m; };
      return mergeKeyed(toMap(b), toMap(local), toMap(remote), local.map(keyOf), remote.map(keyOf)).map(function (p) { return p[1]; });
    }
    return local;
  }

  /* ---------- db: the interface app.js expects ---------- */
  /*
   * Every chunk on the server carries a version number (`_rev` inside its data).
   *  - An upload only goes through if the server still has the version this device last saw.
   *    If another device got there first, the two are merged and the upload is retried.
   *  - Anything arriving from the server that is older than what this device already has is ignored,
   *    so a slow or out-of-order reply can never undo a newer change.
   */
  function makeDb(u) {
    var CK = 'sync-cache:' + u.id, QK = 'sync-queue:' + u.id, BK = 'sync-base:' + u.id;
    var cache = lsGet(CK) || {};   // every chunk as this device sees it (includes changes not yet uploaded)
    var queue = lsGet(QK) || {};   // ids of chunks changed here and not yet uploaded
    var base = lsGet(BK) || {};    // id -> { rev, data }: the last server version this device has seen
    var listeners = [], flushing = false, fetchTimer = null, retryTimer = null;

    function persist() { lsSet(CK, cache); lsSet(QK, queue); lsSet(BK, base); diag.pending = Object.keys(queue).length; }
    function pending() { return Object.keys(queue).length > 0; }
    function clone(o) { return JSON.parse(JSON.stringify(o)); }
    function revOf(d) { return d && typeof d._rev === 'number' ? d._rev : 0; }
    function strip(d) { var o = {}; Object.keys(d || {}).forEach(function (k) { if (k !== '_rev') o[k] = d[k]; }); return o; }

    function emit(fromCache) {
      var docs = Object.keys(cache).map(function (id) { var d = cache[id]; return { id: id, data: function () { return d; } }; });
      var snap = { docs: docs, empty: docs.length === 0, metadata: { fromCache: !!fromCache, hasPendingWrites: pending() } };
      listeners.forEach(function (l) { try { l.cb(snap); } catch (e) { console.error(e); } });
    }

    // A row has arrived from the server (download, live update, or after a clash). Returns true if it changed anything.
    function incoming(id, rawData) {
      var r = revOf(rawData), d = strip(rawData), b = base[id];
      if (b) {
        if (r && r <= b.rev) return false;                 // older than, or the same as, what we already have
        if (!r && same(d, b.data)) return false;           // written by an old copy of the app: only take it if it differs
      }
      base[id] = { rev: r, data: d };
      if (queue[id]) {
        var m = merge3(b ? b.data : undefined, cache[id], d);
        cache[id] = m;
        if (same(m, d)) delete queue[id];
      } else cache[id] = d;
      return true;
    }

    function fetchRemote() {
      return sb.from(TABLE).select('id,data').eq('user_id', u.id).then(function (r) {
        if (r.error) throw r.error;
        var changed = false;
        (r.data || []).forEach(function (row) { if (incoming(row.id, row.data)) changed = true; });
        persist();
        diag.lastDown = Date.now(); if (!pending()) setErr(null); else notify();
        return changed;
      }).catch(function (e) { setErr(e); throw e; });
    }
    function refresh() {
      clearTimeout(fetchTimer);
      fetchTimer = setTimeout(function () {
        if (!navigator.onLine) return;
        fetchRemote().then(function (changed) { if (changed) emit(false); flushQueue(); }).catch(function () {});
      }, 250);
    }

    // Upload one chunk. Resolves true when the server has it, false when it clashed and was merged (try again).
    function pushOne(id) {
      var local = cache[id], b = base[id], sentText = canon(local);
      var newRev = (b ? b.rev : 0) + 1;
      var data = clone(local); data._rev = newRev;
      var q;
      if (!b) q = sb.from(TABLE).insert({ user_id: u.id, id: id, data: data }).select('id');
      else {
        q = sb.from(TABLE).update({ data: data, updated_at: new Date().toISOString() }).eq('user_id', u.id).eq('id', id);
        q = (b.rev ? q.eq('data->>_rev', String(b.rev)) : q.is('data->_rev', null)).select('id');
      }
      return q.then(function (r) {
        var clash = r.error ? r.error.code === '23505' : !(r.data && r.data.length);
        if (r.error && !clash) throw r.error;
        if (!clash) {
          base[id] = { rev: newRev, data: strip(data) };
          if (canon(cache[id]) === sentText) delete queue[id];   // unless it changed again while uploading
          persist();
          return true;
        }
        // Another device changed this chunk first: fetch its version, merge, and let the caller retry.
        return sb.from(TABLE).select('id,data').eq('user_id', u.id).eq('id', id).then(function (g) {
          if (g.error) throw g.error;
          var row = g.data && g.data[0];
          if (row) incoming(id, row.data); else delete base[id];   // the row has gone: upload it afresh
          persist();
          return false;
        });
      });
    }
    function flushQueue() {
      if (flushing || !pending()) return Promise.resolve();
      if (!navigator.onLine) return Promise.resolve();
      flushing = true;
      var tries = 0;
      function next() {
        var ids = Object.keys(queue);
        if (!ids.length) return Promise.resolve();
        if (++tries > 40) return Promise.reject(new Error('Could not upload after several tries'));
        return pushOne(ids[0]).then(next);
      }
      return next().then(function () {
        flushing = false;
        diag.lastUp = Date.now(); diag.err = null;
        notify();
        emit(false);
      }).catch(function (e) {
        flushing = false;
        setErr(e);
        clearTimeout(retryTimer); retryTimer = setTimeout(flushQueue, 15000);
      });
    }

    // live updates from other devices
    try {
      sb.channel('app_docs_' + u.id)
        .on('postgres_changes', { event: '*', schema: 'public', table: TABLE, filter: 'user_id=eq.' + u.id }, function (p) {
          var row = p.new && p.new.id ? p.new : null;
          if (!row) return;
          if (!row.data || typeof row.data !== 'object') { refresh(); return; }
          if (incoming(row.id, row.data)) { persist(); if (pending()) flushQueue(); else emit(false); }
        })
        .subscribe();
    } catch (e) {}
    window.addEventListener('online', function () { flushQueue(); refresh(); });
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') refresh(); });
    // Backup for live updates: check for changes every 30 seconds while the app is open.
    setInterval(function () { if (document.visibilityState === 'visible') { flushQueue(); refresh(); } }, 30000);
    diag.syncNow = function () { flushQueue(); refresh(); };
    persist();

    return {
      collection: function () {
        return {
          onSnapshot: function (cb, errCb) {
            var l = { cb: cb, err: errCb }; listeners.push(l);
            var hasCache = Object.keys(cache).length > 0;
            // Prefer fresh data from the server; fall back to this device's copy if slow or offline.
            var settled = false;
            var fallback = setTimeout(function () {
              if (settled) return; settled = true;
              if (hasCache) emit(true); else if (errCb) errCb({ code: 'unavailable' });
            }, navigator.onLine ? 4000 : 0);
            if (navigator.onLine) {
              fetchRemote().then(function () {
                if (!settled) { settled = true; clearTimeout(fallback); }
                emit(false); flushQueue();
              }).catch(function () {
                if (settled) return; settled = true; clearTimeout(fallback);
                if (hasCache) emit(true); else if (errCb) errCb({ code: 'unavailable' });
                notify();
              });
            }
            return function () { listeners = listeners.filter(function (x) { return x !== l; }); };
          }
        };
      },
      doc: function (path) {
        var id = String(path).split('/').pop();
        return {
          // seen = the copy of this chunk the app based its change on. If something newer has
          // arrived since (and the app hasn't shown it yet), merge instead of overwriting it.
          set: function (data, seen) {
            var d = clone(data);
            if (seen !== undefined && cache[id] !== undefined && !same(cache[id], seen)) d = merge3(seen, d, cache[id]);
            cache[id] = d; queue[id] = 1; persist();
            setTimeout(flushQueue, 0);
            return Promise.resolve();
          }
        };
      }
    };
  }

  /* ---------- assets: check-in photos in a private storage bucket ---------- */
  var signed = {};
  function makeAssets(u) {
    return {
      upload: function (blob) {
        var path = u.id + '/' + rid() + '.jpg';
        return sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'image/jpeg' }).then(function (r) {
          if (r.error) throw r.error;
          return { id: path };
        });
      },
      delete: function (id) {
        return sb.storage.from(BUCKET).remove([id]).then(function (r) { if (r.error) throw r.error; delete signed[id]; });
      }
    };
  }
  // app.js renders <img data-photo="path">; fill in a short-lived private link.
  function hydratePhotos() {
    if (!sb || !user) return;
    document.querySelectorAll('img[data-photo]:not([src])').forEach(function (img) {
      var id = img.getAttribute('data-photo');
      if (signed[id] && signed[id].exp > Date.now()) { img.src = signed[id].url; return; }
      img.setAttribute('src', 'data:image/gif;base64,R0lGODlhAQABAAAAACw=');
      sb.storage.from(BUCKET).createSignedUrl(id, 3600).then(function (r) {
        if (r.data && r.data.signedUrl) { signed[id] = { url: r.data.signedUrl, exp: Date.now() + 3300e3 }; img.src = r.data.signedUrl; }
      });
    });
  }
  new MutationObserver(hydratePhotos).observe(document.documentElement, { childList: true, subtree: true });

  /* ---------- downloads: backups ---------- */
  var downloads = {
    save: function (o) {
      var blob = new Blob([o.data], { type: 'application/json' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = o.filename || 'backup.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      return Promise.resolve();
    }
  };

  /* ---------- what app.js calls ---------- */
  var dbP = null, assetsP = null;
  window.claude = {
    use: function (name) {
      if (name === 'downloads') return Promise.resolve(downloads);
      if (name === 'db') return dbP || (dbP = authReady.then(function (u) { return u ? makeDb(u) : null; }));
      if (name === 'assets') return assetsP || (assetsP = authReady.then(function (u) { return u ? makeAssets(u) : null; }));
      return Promise.resolve(null);
    }
  };

  /* ---------- Strava: runs copied in by the "strava" Edge Function ---------- *
   * The function (supabase/functions/strava) keeps your Strava tokens and writes
   * runs to the strava_runs table. Here we read that table, listen for new rows,
   * and hand the runs to app.js, which adds any new ones to your log.         */
  var strava = { runs: [], cbs: [], status: lsGet('strava-status') || null, busy: false, err: null, lastPull: 0 };
  var stravaId = String(cfg.stravaClientId || '').trim();
  function stravaSet(s) { strava.status = s; lsSet('strava-status', s); notify(); }
  function stravaCall(action, extra) {
    var body = Object.assign({ action: action }, extra || {});
    return sb.functions.invoke('strava', { body: body }).then(function (r) {
      if (r.error) {
        // Pull the function's own error message out of the response when there is one.
        var ctx = r.error.context;
        if (ctx && typeof ctx.json === 'function') return ctx.json().then(function (j) { throw new Error(j.error || r.error.message); }, function () { throw r.error; });
        throw r.error;
      }
      return r.data;
    });
  }
  function stravaLoad() {
    return sb.from('strava_runs').select('id,data').eq('user_id', user.id).then(function (r) {
      if (r.error) throw r.error;
      strava.runs = (r.data || []).map(function (row) { var d = Object.assign({}, row.data); d.id = String(row.id); return d; });
      strava.cbs.forEach(function (cb) { try { cb(strava.runs); } catch (e) { console.error(e); } });
    });
  }
  function stravaSync(quiet) {
    if (!user || strava.busy) return Promise.resolve();
    strava.busy = true; if (!quiet) notify();
    return stravaCall('sync').then(function (d) {
      strava.busy = false; strava.err = null; strava.lastPull = Date.now();
      stravaSet(d && d.connected ? { connected: true, athlete: d.athlete, lastSync: d.lastSync, webhook: (strava.status || {}).webhook } : { connected: false });
      return stravaLoad();
    }).catch(function (e) {
      strava.busy = false; strava.err = e.message || String(e); notify();
      return stravaLoad().catch(function () {});
    });
  }
  function stravaStart(u) {
    if (!u || !stravaId) return;
    // Coming back from Strava's "Authorize" page: ?state=strava&code=...
    var q = new URLSearchParams(location.search);
    if (q.get('state') === 'strava') {
      history.replaceState(null, '', location.pathname + location.hash);
      if (q.get('code')) {
        strava.busy = true; notify();
        stravaCall('connect', { code: q.get('code') }).then(function (d) {
          strava.busy = false; strava.err = null; strava.lastPull = Date.now();
          stravaSet({ connected: true, athlete: d.athlete, lastSync: d.lastSync, webhook: d.webhook });
          return stravaLoad();
        }).catch(function (e) { strava.busy = false; strava.err = e.message || String(e); notify(); });
      } else {
        strava.err = 'Strava wasn’t connected (you cancelled, or Strava said no).'; notify();
      }
    } else {
      stravaLoad().catch(function () {});
      if (strava.status && strava.status.connected) stravaSync(true);
    }
    // New runs arrive here live when the webhook writes them.
    try {
      sb.channel('strava_runs_' + u.id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'strava_runs', filter: 'user_id=eq.' + u.id }, function () { stravaLoad().catch(function () {}); })
        .subscribe();
    } catch (e) {}
    // Backup in case a webhook is missed: check Strava when the app comes back to the front, at most every 10 minutes.
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && strava.status && strava.status.connected && Date.now() - strava.lastPull > 600e3) stravaSync(true);
    });
  }
  authReady.then(stravaStart);

  window.Strava = {
    // app.js calls this once: cb gets the full list of Strava runs whenever it changes.
    onRuns: function (cb) { strava.cbs.push(cb); if (strava.runs.length) cb(strava.runs); },
    html: function () {
      if (!sb || !user) return '';
      var s = strava.status || {}, h = '<h2>Strava</h2><div class="card">';
      if (!stravaId) {
        h += '<p class="hint" style="margin:0">Strava isn’t set up yet. Add your Strava Client ID to js/config.js (see the README).</p>';
      } else if (s.connected) {
        h += '<div class="kv"><span>Connected as</span><b>' + esc(s.athlete || 'your Strava account') + '</b></div>' +
          '<p class="hint" style="margin:0">Runs you record on Strava are added to your log automatically, shortly after you finish. Rides and other activities are left out. Check the run type the app picked in Log &gt; History and change it if needed.</p>' +
          '<div class="kv"><span>Last checked</span><b>' + (strava.busy ? 'checking…' : ago(s.lastSync ? Date.parse(s.lastSync) : null)) + '</b></div>' +
          '<div class="kv"><span>Runs from Strava</span><b>' + strava.runs.length + '</b></div>' +
          (s.webhook === 'off' ? '<p class="hint" style="margin:0">Instant updates aren’t on, so new runs appear when you open the app instead.</p>' : '') +
          '<div class="row2"><button class="btn sm" data-strava="sync"' + (strava.busy ? ' disabled' : '') + '>Check Strava now</button><button class="btn sm" data-strava="off">Disconnect</button></div>';
      } else {
        h += '<p class="hint" style="margin:0">Connect Strava and your runs are added to your log automatically. Only runs are copied, not rides.</p>' +
          '<button class="btn primary" data-strava="on"' + (strava.busy ? ' disabled' : '') + '>' + (strava.busy ? 'Connecting…' : 'Connect Strava') + '</button>';
      }
      if (strava.err) h += '<p class="err">Strava problem: ' + esc(strava.err) + '</p>';
      return h + '</div>';
    }
  };
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-strava]');
    if (!b) return;
    var a = b.getAttribute('data-strava');
    if (a === 'on') {
      location.href = 'https://www.strava.com/oauth/authorize?' + new URLSearchParams({
        client_id: stravaId, response_type: 'code', approval_prompt: 'auto',
        scope: 'activity:read_all', state: 'strava', redirect_uri: location.origin + location.pathname
      });
    }
    if (a === 'sync') stravaSync(false);
    if (a === 'off') {
      if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'Tap again to disconnect'; return; }
      strava.busy = true; notify();
      stravaCall('disconnect').then(function () {
        strava.busy = false; strava.err = null; strava.runs = []; stravaSet({ connected: false });
      }).catch(function (e) { strava.busy = false; strava.err = e.message || String(e); notify(); });
    }
  });

  /* ---------- account card shown at the bottom of Settings ---------- */
  function ago(t) { if (!t) return 'not yet'; var s = Math.round((Date.now() - t) / 1000); return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : new Date(t).toLocaleString('en-GB'); }
  /* ---------- pick up new versions of the app without being asked ---------- */
  // An open copy of the app keeps running the code it loaded. After an update, an old copy can undo
  // what the new one does, so check now and then whether the site has changed and reload when it has.
  var loadedTag = null, lastCheck = 0;
  function checkForUpdate() {
    if (location.protocol === 'file:' || !navigator.onLine || Date.now() - lastCheck < 20000) return;
    lastCheck = Date.now();
    Promise.all(['js/app.js', 'js/sync.js', 'index.html'].map(function (f) {
      return fetch(f, { method: 'HEAD', cache: 'no-store' }).then(function (r) { return r.ok ? (r.headers.get('etag') || r.headers.get('last-modified') || '') : null; });
    })).then(function (tags) {
      if (tags.indexOf(null) >= 0) return;
      var t = tags.join('|');
      if (!t.replace(/\|/g, '')) return;
      if (loadedTag === null) { loadedTag = t; return; }
      if (t !== loadedTag) reloadWhenIdle();
    }).catch(function () {});
  }
  function reloadWhenIdle() {
    if (window.appCanReload && !window.appCanReload()) { setTimeout(reloadWhenIdle, 5000); return; }
    location.reload();
  }
  checkForUpdate();
  setInterval(function () { if (document.visibilityState === 'visible') checkForUpdate(); }, 60000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') checkForUpdate(); });

  window.Sync = {
    canon: canon,
    updateNow: reloadWhenIdle,
    problem: function () { return user && diag.err ? 'Not syncing. See Settings' : ''; },
    accountHtml: function () {
      var h = '<h2>Account and sync</h2><div class="card">';
      if (!sb) h += '<p class="hint" style="margin:0">Sync isn’t set up yet, so data stays on this device. Add your Supabase keys to js/config.js to turn it on.</p>';
      else if (user) h += '<div class="kv"><span>Signed in as</span><b>' + esc(user.email) + '</b></div><p class="hint" style="margin:0">Changes sync to every device signed in with this email. They save here first, so logging works offline too.</p>' +
        '<div class="kv"><span>Last upload</span><b>' + ago(diag.lastUp) + '</b></div>' +
        '<div class="kv"><span>Last download</span><b>' + ago(diag.lastDown) + '</b></div>' +
        '<div class="kv"><span>Changes waiting to upload</span><b>' + diag.pending + '</b></div>' +
        (diag.err ? '<p class="err">Sync problem: ' + esc(diag.err) + '</p>' : '') +
        '<div class="row2"><button class="btn sm" data-sync="now">Sync now</button><button class="btn sm" data-sync="out">Sign out</button></div>';
      else h += '<p class="hint" style="margin:0">Not signed in, so data stays on this device. Sign in to sync with your other devices. Anything saved here moves into your account the first time you sign in.</p><button class="btn primary" data-sync="in">Sign in</button>';
      return h + '</div>';
    }
  };
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-sync]');
    if (!b) return;
    if (b.getAttribute('data-sync') === 'now') { if (diag.syncNow) diag.syncNow(); else location.reload(); return; }
    if (b.getAttribute('data-sync') === 'in') { lsDel(LOCAL_ONLY); location.reload(); }
    if (b.getAttribute('data-sync') === 'out') {
      b.disabled = true;
      sb.auth.signOut().finally(function () { lsDel(LOCAL_ONLY); location.reload(); });
    }
  });

  /* ---------- offline support: register the service worker ---------- */
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
})();
