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

  /* ---------- db: the interface app.js expects ---------- */
  function makeDb(u) {
    var CK = 'sync-cache:' + u.id, QK = 'sync-queue:' + u.id;
    var cache = lsGet(CK) || {};   // last known copy of every chunk
    var queue = lsGet(QK) || {};   // chunks changed here and not yet uploaded
    var listeners = [], flushing = false, fetchTimer = null, retryTimer = null;

    function persist() { lsSet(CK, cache); lsSet(QK, queue); }
    function pending() { return Object.keys(queue).length > 0; }

    function emit(fromCache) {
      var docs = Object.keys(cache).map(function (id) { var d = cache[id]; return { id: id, data: function () { return d; } }; });
      var snap = { docs: docs, empty: docs.length === 0, metadata: { fromCache: !!fromCache, hasPendingWrites: pending() } };
      listeners.forEach(function (l) { try { l.cb(snap); } catch (e) { console.error(e); } });
    }

    function fetchRemote() {
      return sb.from(TABLE).select('id,data').eq('user_id', u.id).then(function (r) {
        if (r.error) throw r.error;
        var next = {};
        (r.data || []).forEach(function (row) { next[row.id] = row.data; });
        Object.keys(queue).forEach(function (id) { next[id] = queue[id]; }); // local changes win until uploaded
        cache = next; persist();
        return true;
      });
    }
    function refresh() {
      clearTimeout(fetchTimer);
      fetchTimer = setTimeout(function () {
        if (!navigator.onLine) return;
        fetchRemote().then(function () { emit(false); flushQueue(); }).catch(function () {});
      }, 250);
    }

    function flushQueue() {
      if (flushing || !pending()) return Promise.resolve();
      if (!navigator.onLine) return Promise.resolve();
      flushing = true;
      var ids = Object.keys(queue);
      var rows = ids.map(function (id) { return { user_id: u.id, id: id, data: queue[id], updated_at: new Date().toISOString() }; });
      var sent = ids.map(function (id) { return JSON.stringify(queue[id]); });
      return sb.from(TABLE).upsert(rows, { onConflict: 'user_id,id' }).then(function (r) {
        flushing = false;
        if (r.error) throw r.error;
        ids.forEach(function (id, i) { if (queue[id] !== undefined && JSON.stringify(queue[id]) === sent[i]) delete queue[id]; });
        persist();
        if (pending()) return flushQueue();
        emit(false);
      }).catch(function (e) {
        flushing = false;
        console.warn('Sync upload failed, will retry', e);
        clearTimeout(retryTimer); retryTimer = setTimeout(flushQueue, 15000);
      });
    }

    // live updates from other devices
    try {
      sb.channel('app_docs_' + u.id)
        .on('postgres_changes', { event: '*', schema: 'public', table: TABLE, filter: 'user_id=eq.' + u.id }, function (p) {
          var row = p.new && p.new.id ? p.new : null;
          if (!row || queue[row.id] !== undefined) return;
          cache[row.id] = row.data; persist(); emit(false);
        })
        .subscribe();
    } catch (e) {}
    window.addEventListener('online', function () { flushQueue(); refresh(); });
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') refresh(); });

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
              });
            }
            return function () { listeners = listeners.filter(function (x) { return x !== l; }); };
          }
        };
      },
      doc: function (path) {
        var id = String(path).split('/').pop();
        return {
          set: function (data) {
            var d = JSON.parse(JSON.stringify(data));
            queue[id] = d; cache[id] = d; persist();
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

  /* ---------- account card shown at the bottom of Settings ---------- */
  window.Sync = {
    accountHtml: function () {
      var h = '<h2>Account and sync</h2><div class="card">';
      if (!sb) h += '<p class="hint" style="margin:0">Sync isn’t set up yet, so data stays on this device. Add your Supabase keys to js/config.js to turn it on.</p>';
      else if (user) h += '<div class="kv"><span>Signed in as</span><b>' + esc(user.email) + '</b></div><p class="hint" style="margin:0">Changes sync to every device signed in with this email. They save here first, so logging works offline too.</p><button class="btn sm" data-sync="out">Sign out</button>';
      else h += '<p class="hint" style="margin:0">Not signed in, so data stays on this device. Sign in to sync with your other devices. Anything saved here moves into your account the first time you sign in.</p><button class="btn primary" data-sync="in">Sign in</button>';
      return h + '</div>';
    }
  };
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-sync]');
    if (!b) return;
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
