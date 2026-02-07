/**
 * Supabase через fetch — без внешних скриптов. Работает в Telegram WebView.
 */
(function () {
  'use strict';
  const config = window.SUPABASE_CONFIG || {};
  if (!config.url || !config.anonKey) {
    window.__SUPABASE_FETCH__ = null;
    return;
  }

  const base = config.url.replace(/\/$/, '') + '/rest/v1';
  const headers = {
    'apikey': config.anonKey,
    'Authorization': 'Bearer ' + config.anonKey,
    'Content-Type': 'application/json'
  };

  async function req(method, url, body, prefer) {
    const h = { ...headers };
    if (prefer) h['Prefer'] = prefer;
    const r = await fetch(url, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) throw new Error(await r.text() || r.statusText);
    if (r.status === 204 || r.headers.get('content-length') === '0') return null;
    return r.json();
  }

  function from(table) {
    const api = {};
    const select = function (columns) {
      let filters = {};
      let orderStr = null;
      let limitNum = null;
      const chain = {
        eq(c, v) { filters[c] = v; return chain; },
        order(c, o) { orderStr = o && o.ascending === false ? c + '.desc' : c + '.asc'; return chain; },
        limit(n) { limitNum = n; return chain; },
        single() {
          limitNum = 1;
          return {
            then(res) {
              const q = new URLSearchParams();
              q.set('select', columns);
              Object.entries(filters).forEach(([k, v]) => q.set(k, 'eq.' + encodeURIComponent(v)));
              if (orderStr) q.set('order', orderStr);
              if (limitNum != null) q.set('limit', limitNum);
              return req('GET', base + '/' + table + '?' + q).then(arr => {
                const d = Array.isArray(arr) ? arr[0] : arr;
                res({ data: d || null, error: d ? null : { message: 'Not found' } });
              }).catch(e => res({ data: null, error: { message: e.message } }));
            }
          };
        },
        then(res) {
          const q = new URLSearchParams();
          q.set('select', columns);
          Object.entries(filters).forEach(([k, v]) => q.set(k, 'eq.' + encodeURIComponent(v)));
          if (orderStr) q.set('order', orderStr);
          if (limitNum != null) q.set('limit', limitNum);
          return req('GET', base + '/' + table + '?' + q).then(data => {
            const arr = Array.isArray(data) ? data : (data ? [data] : []);
            res({ data: arr, error: null });
          }).catch(e => res({ data: null, error: { message: e.message } }));
        }
      };
      return chain;
    };
    api.select = select;
    api.insert = function (row) {
      const p = req('POST', base + '/' + table, row, 'return=representation').then(data => {
        const d = Array.isArray(data) ? data[0] : data;
        return { data: d, error: null };
      }).catch(e => ({ data: null, error: { message: e.message } }));
      p.select = function () { return p; };
      p.single = function () { return p; };
      return p;
    };
    api.upsert = function (row) {
      return req('POST', base + '/' + table, row, 'return=representation,resolution=merge-duplicates').then(() => ({ error: null })).catch(e => ({ error: { message: e.message } }));
    };
    api.update = function (updates) {
      let filters = {};
      const chain = {
        eq(c, v) { filters[c] = v; return chain; },
        then(res) {
          const q = new URLSearchParams();
          Object.entries(filters).forEach(([k, v]) => q.set(k, 'eq.' + encodeURIComponent(v)));
          return req('PATCH', base + '/' + table + '?' + q, updates).then(() => res({ error: null })).catch(e => res({ error: { message: e.message } }));
        }
      };
      return chain;
    };
    return api;
  }

  window.__SUPABASE_FETCH__ = {
    from,
    channel: function () { return { on: function () { return this; }, subscribe: function () { return this; }; }; },
    removeChannel: function () {},
    _usePolling: true
  };
})();
