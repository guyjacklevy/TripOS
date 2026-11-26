/* ─── Prevoya · the shelf (Round 17.1, expert cut D) ──────────────────
 * The app's home: collections through time, the living This-week lane,
 * the ask row, the gift door, the echo. The planner is one door away at
 * /app/trip/ (the old app, untouched). Renders anonymous (browser buffer)
 * and signed-in (own rows via RLS). No service keys, no new endpoints:
 * everything here reads what the user already owns, plus the public echo. */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { anonList } from './anon-saves.js';

const cfg = window.TRIPOS_SUPABASE || {};
const sb = createClient(cfg.url, cfg.anonKey);
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const track = (n, p) => { try { window.pvTrack && window.pvTrack(n, p); } catch (_) {} };
const cap = (s) => { const d = String(s || '').trim(); return d ? d[0].toUpperCase() + d.slice(1) : ''; };

const CAT_FILE = {
  food: 'food', cafe: 'work', work: 'work', gym: 'gym', wellness: 'wellness',
  explore: 'explore', beach: 'beach', nightlife: 'nightlife', 'day-club': 'beach',
  stay: 'explore', health: 'wellness', services: 'explore', rental: 'explore'
};
const catSrc = (c) => '/shared/img/cat-' + (CAT_FILE[c] || 'explore') + '.webp';

function ago(ts) {
  const m = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (m < 60) return m + 'M AGO';
  const h = Math.round(m / 60);
  if (h < 24) return h + 'H AGO';
  const d = Math.round(h / 24);
  if (d < 7) return d + 'D AGO';
  const w = Math.round(d / 7);
  if (w < 5) return w + 'W AGO';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short' }).toUpperCase() + ' ’' + String(new Date(ts).getFullYear()).slice(2);
}
const monthLbl = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short' }).toUpperCase() + ' ’' + String(new Date(ts).getFullYear()).slice(2);

/* ── google place photos, display-time (same contract as /g and /s) ── */
const GUR = new Map();
async function resolvePhotos(names) {
  const need = [...new Set(names.filter((n) => n && !GUR.has(n)))].slice(0, 16);
  if (!need.length || !cfg.url || !cfg.anonKey) return;
  try {
    const r = await fetch(cfg.url + '/functions/v1/places-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey },
      body: JSON.stringify({ action: 'photos', names: need, maxw: 480 })
    });
    if (!r.ok) return;
    const j = await r.json();
    Object.entries((j && j.uris) || {}).forEach(([n, u]) => { if (u) GUR.set(n, u); });
  } catch (_) {}
}
function swapIn(img, uri) {
  const im = new Image();
  im.onload = () => { img.src = uri; };
  im.src = uri;
}
function applyPhotos() {
  document.querySelectorAll('img[data-pn]').forEach((img) => {
    const n = img.getAttribute('data-pn');
    if (n && GUR.has(n)) { swapIn(img, GUR.get(n)); img.removeAttribute('data-pn'); }
  });
}

/* ── the claim: saves buffered before the account existed become rows,
   provenance intact — same semantics as the old app's claimAnonSaves ── */
async function claimAnon(user) {
  let buf = [];
  try { buf = JSON.parse(localStorage.getItem('prevoya_saves_anon') || '[]'); } catch (_) {}
  if (!Array.isArray(buf) || !buf.length) return;
  const { data: existing } = await sb.from('places')
    .select('curated_place_id').eq('user_id', user.id).not('curated_place_id', 'is', null);
  const have = new Set((existing || []).map((r) => String(r.curated_place_id)));
  let claimed = 0;
  for (const s of buf) {
    const id = String(s.id || '');
    if (!id || have.has(id)) continue;
    const via = (s.via && s.via.t)
      ? { token: String(s.via.t).slice(0, 64), name: String(s.via.name || 'a friend').slice(0, 40) } : null;
    const { error } = await sb.from('places').insert({
      user_id: user.id, curated_place_id: s.id,
      name: s.name, area: s.area, category: s.category || null, curated: true,
      via_token: via ? via.token : null, via_name: via ? via.name : null
    });
    if (error) { console.warn('[Prevoya] shelf claim failed:', error.message); continue; }
    have.add(id);
    claimed++;
  }
  try { localStorage.removeItem('prevoya_saves_anon'); } catch (_) {}
  if (claimed) {
    let viaTok = null;
    try { const s = JSON.parse(localStorage.getItem('tripos_via') || 'null'); viaTok = (s && s.token) || null; } catch (_) {}
    track('anon_saves_claimed', viaTok ? { n: claimed, via: viaTok } : { n: claimed });
  }
}

/* ── render pieces ── */
function weekRow(it) {
  const img = it.photo_name
    ? '<img alt="" data-pn="' + esc(it.photo_name) + '" src="' + esc(catSrc(it.category)) + '">'
    : (it.category && CAT_FILE[it.category]
      ? '<img alt="" src="' + esc(catSrc(it.category)) + '">'
      : '<span class="wph">' + esc((it.name || '·')[0].toUpperCase()) + '</span>');
  return '<div class="wsave">' + img +
    '<span class="n">' + esc(it.name) + '<span>' + esc(it.sub) + '</span></span>' +
    '<span class="ago">' + esc(it.when) + '</span></div>';
}
function coverCard(g) {
  const img = g.photo_name
    ? '<img alt="" data-pn="' + esc(g.photo_name) + '" src="' + esc(catSrc('explore')) + '">'
    : '<img alt="" src="' + esc(catSrc('explore')) + '">';
  return '<a class="gc" href="/app/trip/#places">' + img + '<span class="sh"></span>' +
    '<span class="nm"><b>' + esc(g.title) + '</b><span>' + g.items.length + ' PLACE' + (g.items.length === 1 ? '' : 'S') +
    ' · ' + esc(g.label) + '</span></span></a>';
}
const NEW_TILE = '<a class="gc new" href="/app/trip/#you"><span class="plus"><i>＋</i>New collection<em>OR CAMERA ROLL → ~2 MIN</em></span></a>';

function openSheet() { $('linksSh').classList.add('on'); }
$('linksSh').addEventListener('click', (e) => { if (e.target === $('linksSh')) $('linksSh').classList.remove('on'); });

/* ── signed-in boot ── */
async function bootSigned(user) {
  await claimAnon(user);
  const [plR, ckR, shR, ppR] = await Promise.all([
    sb.from('places').select('id, curated_place_id, name, area, category, created_at, via_token, via_name')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(1000),
    sb.from('checkins').select('place_id').eq('user_id', user.id).limit(2000),
    sb.from('trip_shares').select('token, destination, scope, created_at')
      .eq('user_id', user.id).eq('kind', 'list').is('revoked_at', null).is('profile_slug', null)
      .order('created_at', { ascending: false }).limit(12),
    sb.from('public_profiles').select('slug').eq('user_id', user.id)
      .order('created_at', { ascending: true }).limit(1)
  ]);
  const rows = plR.data || [];
  const beenSet = new Set((ckR.data || []).map((r) => String(r.place_id)));
  const shares = shR.data || [];
  const slug = ppR.data && ppR.data[0] && ppR.data[0].slug;

  /* curated lookup for destination + photo, chunked */
  const ids = [...new Set(rows.map((r) => r.curated_place_id).filter(Boolean).map(String))];
  const cmap = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await sb.from('curated_places')
      .select('id, destination, photo_name').in('id', ids.slice(i, i + 100));
    (data || []).forEach((c) => cmap.set(String(c.id), c));
  }

  const own = rows.filter((r) => !r.via_token);
  const received = rows.filter((r) => r.via_token);

  /* collections = own saves grouped by destination */
  const groups = new Map();
  own.forEach((r) => {
    const c = cmap.get(String(r.curated_place_id));
    const key = (c && c.destination) ? String(c.destination).toLowerCase() : '—';
    if (!groups.has(key)) groups.set(key, { key, title: (c && c.destination) ? cap(c.destination) : 'More places', items: [], latest: 0, first: Infinity, photo_name: null });
    const g = groups.get(key);
    g.items.push(r);
    const ts = new Date(r.created_at).getTime();
    if (ts > g.latest) g.latest = ts;
    if (ts < g.first) g.first = ts;
    if (!g.photo_name && c && c.photo_name) g.photo_name = c.photo_name;
  });
  const sorted = [...groups.values()].sort((a, b) => b.latest - a.latest);
  const current = sorted[0] || null;
  const rest = sorted.slice(1);

  render({
    signed: true,
    avatar: (user.email || '·')[0].toUpperCase(),
    slug,
    week: [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 3).map((r) => {
      const c = cmap.get(String(r.curated_place_id));
      return {
        name: r.name, category: r.category, photo_name: c && c.photo_name,
        when: ago(new Date(r.created_at).getTime()),
        sub: (r.via_token ? 'FROM ' + String(r.via_name || 'A FRIEND').toUpperCase()
          : '→ YOUR ' + ((c && c.destination) ? String(c.destination).toUpperCase() : 'PLACES'))
      };
    }),
    weekN: rows.filter((r) => Date.now() - new Date(r.created_at).getTime() < 7 * 864e5).length,
    current: current && {
      title: 'Your ' + current.title,
      dt: monthLbl(current.first) + ' → NOW',
      n: current.items.length,
      been: current.items.filter((r) => beenSet.has(String(r.curated_place_id))).length,
      photos: current.items.slice(0, 40).map((r) => { const c = cmap.get(String(r.curated_place_id)); return c && c.photo_name; }).filter(Boolean).slice(0, 3)
    },
    rest: rest.map((g) => ({ title: g.title, items: g.items, label: monthLbl(g.first), photo_name: g.photo_name })),
    shares,
    received: groupReceived(received),
    destinations: sorted.map((g) => g.title)
  });
}
function groupReceived(recRows) {
  const by = new Map();
  recRows.forEach((r) => {
    const k = String(r.via_token);
    if (!by.has(k)) by.set(k, { token: k, name: r.via_name || 'A friend', n: 0 });
    by.get(k).n++;
  });
  return [...by.values()];
}

/* ── anonymous boot: the buffer is the shelf ── */
function bootAnon() {
  const buf = anonList();
  const own = buf.filter((s) => !s.via);
  const rec = buf.filter((s) => s.via && s.via.t);
  const by = new Map();
  rec.forEach((s) => {
    const k = String(s.via.t);
    if (!by.has(k)) by.set(k, { token: k, name: (s.via.name || 'A friend'), n: 0 });
    by.get(k).n++;
  });
  render({
    signed: false,
    avatar: '·',
    slug: null,
    week: [...buf].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 3).map((s) => ({
      name: s.name, category: s.category, photo_name: null,
      when: s.ts ? ago(s.ts) : '',
      sub: s.via ? 'FROM ' + String(s.via.name || 'A FRIEND').toUpperCase() : (s.area ? String(s.area).toUpperCase() : 'SAVED')
    })),
    weekN: buf.length,
    current: own.length ? {
      title: 'Your places', dt: 'IN THIS BROWSER', n: own.length, been: 0, photos: []
    } : null,
    rest: [],
    shares: [],
    received: [...by.values()],
    destinations: []
  });
}

/* ── the one renderer ── */
function render(m) {
  $('hAva').textContent = m.avatar;
  if (m.slug) {
    const lk = $('hLink');
    const url = 'prevoya.app/g/' + m.slug;
    lk.textContent = '⌨ ' + url + ' · COPY';
    lk.hidden = false;
    lk.onclick = () => {
      const done = () => { lk.textContent = '✓ COPIED'; setTimeout(() => { lk.textContent = '⌨ ' + url + ' · COPY'; }, 1400); };
      try { navigator.clipboard.writeText('https://' + url).then(done, done); } catch (_) { done(); }
    };
  }

  /* the living lane */
  $('week').hidden = false;
  if (m.week.length) {
    $('weekRows').innerHTML = m.week.map(weekRow).join('');
    $('weekN').textContent = !m.signed
      ? m.weekN + ' SAVE' + (m.weekN === 1 ? '' : 'S') + ' IN THIS BROWSER'
      : (m.weekN ? m.weekN + ' SAVE' + (m.weekN === 1 ? '' : 'S') + ' THIS WEEK' : 'LATEST');
  } else {
    $('weekN').textContent = '';
    $('weekInv').hidden = false;
  }

  /* the ask row */
  if (m.signed && (m.shares.length || m.destinations.length)) {
    $('askSub').textContent = 'ANSWER WITH ONE LINK' +
      (m.destinations.length ? ' — ' + m.destinations.slice(0, 4).join(' · ').toUpperCase() : '');
    $('ask').hidden = false;
    $('ask').onclick = openSheet;
  }

  /* the current collection */
  if (m.current) {
    $('curName').textContent = m.current.title;
    $('curDt').textContent = m.current.dt;
    $('curMt').textContent = m.current.n + ' PLACES' +
      (m.current.been ? ' · ✓ BEEN TO ' + m.current.been : '');
    $('curStrip').innerHTML = m.current.photos.length
      ? m.current.photos.map((n) => '<img alt="" data-pn="' + esc(n) + '" src="' + esc(catSrc('explore')) + '">').join('')
      : '';
    $('curStrip').style.display = m.current.photos.length ? '' : 'none';
    $('curGift').onclick = openSheet;
    $('cur').hidden = false;
  }

  /* the shelf grid */
  $('shelfGrid').innerHTML = (m.signed ? m.rest.map(coverCard).join('') : '') + (m.signed ? NEW_TILE : '');

  /* sign-in door for the anonymous */
  $('signin').hidden = m.signed;

  /* received lanes */
  if (m.received.length) {
    $('recRows').innerHTML = m.received.map((g) =>
      '<a class="lane" href="/s/?t=' + encodeURIComponent(g.token) + '">' +
        '<span class="rg"><i>' + esc((g.name || 'F')[0].toUpperCase()) + '</i></span>' +
        '<span class="n">' + esc(g.name) + '’s gift<span>' + g.n + ' PLACE' + (g.n === 1 ? '' : 'S') + ' TAKEN · OPEN THE GIFT →</span></span>' +
        '<span class="chev">›</span></a>').join('');
    $('recSec').hidden = false;
  }

  /* the links sheet + echo */
  if (m.signed && m.shares.length) {
    $('linkRows').innerHTML = m.shares.map((s) => {
      const nm = 'Your ' + (s.destination ? cap(s.destination) : 'places') + (s.scope === 'keepers' ? ' — keepers' : '');
      return '<div class="lnk"><span class="n">' + esc(nm) +
        '<span>prevoya.app/s/?t=' + esc(s.token.slice(0, 6)) + '…</span></span>' +
        '<span class="e" data-tok="' + esc(s.token) + '">…</span>' +
        '<button type="button" class="cp" data-copy="https://prevoya.app/s/?t=' + esc(s.token) + '">COPY</button></div>';
    }).join('');
    document.querySelectorAll('#linkRows .cp').forEach((b) => {
      b.addEventListener('click', () => {
        const done = () => { b.textContent = '✓'; setTimeout(() => { b.textContent = 'COPY'; }, 1400); };
        try { navigator.clipboard.writeText(b.getAttribute('data-copy')).then(done, done); } catch (_) { done(); }
      });
    });
    m.shares.forEach((s) => {
      fetch(cfg.url + '/functions/v1/profile?echo=' + encodeURIComponent(s.token))
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          const el = document.querySelector('#linkRows .e[data-tok="' + CSS.escape(s.token) + '"]');
          if (el && j) el.innerHTML = '<b>' + (j.opened || 0) + '</b> OPENED · <b>' + (j.kept || 0) + '</b> KEPT';
          else if (el) el.textContent = '';
          const ec = $('curEcho');
          if (j && m.shares[0] && s.token === m.shares[0].token && ec) {
            ec.innerHTML = '<b>' + (j.opened || 0) + '</b> OPENED · <b>' + (j.kept || 0) + '</b> KEPT';
            ec.hidden = false;
            ec.onclick = openSheet;
          }
        }).catch(() => {});
    });
  } else if (m.signed) {
    $('linkRows').innerHTML = '<p class="none">No links yet — your first gift link is one tap away.</p>';
  }

  $('shLoad').hidden = true;
  $('shBody').hidden = false;

  /* photos arrive behind the paint */
  const names = [...document.querySelectorAll('img[data-pn]')].map((i) => i.getAttribute('data-pn'));
  if (names.length) {
    resolvePhotos(names.slice(0, 16)).then(() => {
      applyPhotos();
      if (names.length > 16) resolvePhotos(names.slice(16, 32)).then(applyPhotos);
    });
  }
  track('shelf_view', { signed: !!m.signed });
}

/* ── boot ── */
(async function () {
  let booted = false;
  const go = (session) => {
    if (booted) return;
    booted = true;
    if (session && session.user) bootSigned(session.user).catch((e) => { console.warn('[Prevoya] shelf:', e); bootAnon(); });
    else bootAnon();
  };
  /* a magic-link landing carries tokens in the URL; the client picks them
     up asynchronously — listen first, then ask */
  sb.auth.onAuthStateChange((ev, session) => {
    if (ev === 'SIGNED_IN' && !booted) go(session);
  });
  const { data } = await sb.auth.getSession();
  if (data && data.session) go(data.session);
  else setTimeout(() => go(null), location.hash.indexOf('access_token') !== -1 ? 2500 : 400);
})();
