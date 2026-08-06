/* ─── Prevoya · launch analytics (first-party, honest, tiny) ──────────
 * window.pvTrack(name, props) → one INSERT-ONLY row in public.events.
 * Rules: no PII ever (no emails, names, coordinates); props stay small;
 * fires only on production hostnames (localhost/preview stay silent);
 * failures are silently ignored — analytics must never break the product. */
(function () {
  var noop = function () {};
  var cfg = window.TRIPOS_SUPABASE || {};
  var prod = /(^|\.)prevoya\.app$|\.vercel\.app$/.test(location.hostname);
  if (!cfg.url || !cfg.anonKey || !prod) { window.pvTrack = noop; return; }
  var sid;
  try {
    sid = localStorage.getItem('pv_sid');
    if (!sid) {
      sid = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      localStorage.setItem('pv_sid', sid);
    }
  } catch (e) { sid = 'nosid'; }
  window.pvTrack = function (name, props) {
    try {
      fetch(cfg.url + '/rest/v1/events', {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          apikey: cfg.anonKey,
          Authorization: 'Bearer ' + cfg.anonKey,
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          name: String(name).slice(0, 40),
          sid: sid,
          props: props || {}
        })
      }).catch(noop);
    } catch (e) { /* never break the product for a metric */ }
  };
})();
