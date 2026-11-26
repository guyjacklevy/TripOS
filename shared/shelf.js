/* ─── Prevoya · the shelf (Round 17.1, expert cut D) ──────────────────
 * The app's home: collections through time, the living This-week lane,
 * the ask row, the gift door, the echo. The planner is one door away at
 * /app/trip/ (the old app, untouched). Renders anonymous (browser buffer)
 * and signed-in (own rows via RLS). No service keys, no new endpoints:
 * everything here reads what the user already owns, plus the public echo. */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { anonList, anonToggle, anonMap } from './anon-saves.js';

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
  return '<a class="gc" href="#c/' + esc(g.slug) + '">' + img + '<span class="sh"></span>' +
    '<span class="nm"><b>' + esc(g.title) + '</b><span>' + g.items.length + ' PLACE' + (g.items.length === 1 ? '' : 'S') +
    ' · ' + esc(g.label) + '</span></span></a>';
}
const NEW_TILE = '<a class="gc new" href="/app/trip/#you"><span class="plus"><i>＋</i>New collection<em>OR CAMERA ROLL → ~2 MIN</em></span></a>';

function openSheet() { $('linksSh').classList.add('on'); }
$('linksSh').addEventListener('click', (e) => { if (e.target === $('linksSh')) $('linksSh').classList.remove('on'); });

/* ── signed-in boot ── */
async function bootSigned(user) {
  SAVE_USER = user;
  await claimAnon(user);
  const [plR, ckR, shR, ppR, rcR] = await Promise.all([
    sb.from('places').select('id, curated_place_id, name, area, category, created_at, via_token, via_name')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(1000),
    sb.from('checkins').select('place_id, photo_path').eq('user_id', user.id).limit(2000),
    sb.from('trip_shares').select('id, token, destination, scope, note, photos, created_at')
      .eq('user_id', user.id).eq('kind', 'list').is('revoked_at', null).is('profile_slug', null)
      .order('created_at', { ascending: false }).limit(12),
    sb.from('public_profiles').select('slug').eq('user_id', user.id)
      .order('created_at', { ascending: true }).limit(1),
    sb.from('place_recs').select('place_id').eq('user_id', user.id).eq('worth_it', true).limit(2000)
  ]);
  const rows = plR.data || [];
  const cks = ckR.data || [];
  const beenSet = new Set(cks.filter((r) => r.place_id).map((r) => String(r.place_id)));
  const photoSet = new Set(cks.filter((r) => r.photo_path && r.place_id).map((r) => String(r.place_id)));
  const worthSet = new Set((rcR.data || []).map((r) => String(r.place_id)));
  const shares = shR.data || [];
  const slug = ppR.data && ppR.data[0] && ppR.data[0].slug;

  /* curated lookup for destination + photo, chunked */
  const ids = [...new Set(
    rows.map((r) => r.curated_place_id).filter(Boolean).map(String).concat([...beenSet])
  )];
  const cmap = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await sb.from('curated_places')
      .select('id, name, destination, photo_name, category, categories').in('id', ids.slice(i, i + 100));
    (data || []).forEach((c) => cmap.set(String(c.id), c));
  }

  const own = rows.filter((r) => !r.via_token);
  const received = rows.filter((r) => r.via_token);
  const savedSet = new Set(own.filter((r) => r.curated_place_id).map((r) => String(r.curated_place_id)));

  /* composer context — one standing link per collection ('' = legacy) */
  CTX = {
    user, cmap, savedSet, stampSet: beenSet, worthSet, photoSet,
    shares: new Map(shares.map((s) => [String(s.destination || '').toLowerCase(), s])),
    dominant: null, destList: []
  };

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
  const biggest = [...groups.values()].sort((a, b) => b.items.length - a.items.length)[0];
  CTX.dominant = biggest && biggest.key !== '—' ? biggest.key : null;
  CTX.destList = sorted.filter((g) => g.key !== '—').map((g) => ({ slug: g.key, title: g.title }));
  CTX.groups = groups; /* the collection view reads these (17.4) */

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
    currentSlug: current && current.key !== '—' ? current.key : null,
    current: current && {
      title: 'Your ' + current.title,
      dt: monthLbl(current.first) + ' → NOW',
      n: current.items.length,
      been: current.items.filter((r) => beenSet.has(String(r.curated_place_id))).length,
      photos: current.items.slice(0, 40).map((r) => { const c = cmap.get(String(r.curated_place_id)); return c && c.photo_name; }).filter(Boolean).slice(0, 3)
    },
    rest: rest.map((g) => ({ slug: g.key, title: g.title, items: g.items, label: monthLbl(g.first), photo_name: g.photo_name })),
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
    $('curOpn').hidden = !(m.signed && m.currentSlug);
    $('curDt').textContent = m.current.dt;
    $('curMt').textContent = m.current.n + ' PLACE' + (m.current.n === 1 ? '' : 'S') +
      (m.current.been ? ' · ✓ BEEN TO ' + m.current.been : '');
    $('curStrip').innerHTML = m.current.photos.length
      ? m.current.photos.map((n) => '<img alt="" data-pn="' + esc(n) + '" src="' + esc(catSrc('explore')) + '">').join('')
      : '';
    $('curStrip').style.display = m.current.photos.length ? '' : 'none';
    $('curGift').hidden = !m.signed; /* an anonymous shelf can't mint links */
    $('curGift').onclick = () => openComposer(m.currentSlug);
    const curOpen = (e) => {
      if (e.target.closest('.gift') || e.target.closest('.echo')) return;
      if (m.signed && m.currentSlug) location.hash = '#c/' + m.currentSlug;
    };
    $('cur').onclick = curOpen;
    $('cur').style.cursor = m.signed && m.currentSlug ? 'pointer' : '';
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
  if (m.signed) {
    $('mkLink').onclick = () => { $('linksSh').classList.remove('on'); openComposer(m.currentSlug); };
  } else {
    $('mkLink').hidden = true;
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
  if (location.hash.indexOf('#c/') === 0) applyHash();
}

/* ── THE COMPOSER (Round 17.2): make the gift without leaving home.
   Same contract as the old app's sheet: one standing link per collection
   ('' = the legacy unscoped link, serving the dominant collection); a
   live row is UPDATED and its token re-copied, a fresh link is born
   scoped; keepers = photo ∪ worth-it ∪ saved; quiet categories never
   count; share_created carries the origin for generation-2 K. ── */
let CTX = null;
const QUIET = new Set(['practical', 'stay', 'health', 'services']);
const shareSlug = () => {
  const a = new Uint8Array(16); crypto.getRandomValues(a);
  return Array.from(a, (b) => (b % 36).toString(36)).join('');
};
function giftable(scope, destSlug) {
  const out = [];
  const pool = new Set([...CTX.savedSet, ...CTX.stampSet]);
  pool.forEach((id) => {
    const c = CTX.cmap.get(id);
    if (!c) return;
    if (destSlug && String(c.destination || '').toLowerCase() !== destSlug) return;
    const cats = (Array.isArray(c.categories) && c.categories.length) ? c.categories : [c.category];
    if (cats.every((x) => QUIET.has(String(x)))) return;
    if (scope === 'keepers' &&
        !CTX.savedSet.has(id) && !CTX.worthSet.has(id) && !CTX.photoSet.has(id)) return;
    out.push(id);
  });
  return out;
}
function liveRowFor(destSlug) {
  const d = String(destSlug || '').toLowerCase();
  return CTX.shares.get(d) ||
    (d && d === CTX.dominant ? CTX.shares.get('') : null) ||
    (!d ? CTX.shares.get('') : null) || null;
}
function openComposer(destSlug) {
  if (!CTX || !CTX.user) return;
  let dest = destSlug || (CTX.destList[0] && CTX.destList[0].slug) || null;
  const sheet = $('giftSh');
  let scope = null;      /* decided once per collection, then the chips own it */
  let fieldsFor;         /* which collection the note/photos fields were loaded for */
  let live = null;

  const destName = () => dest ? cap(dest) : 'collection';
  const giftMessage = (n, link) =>
    (scope === 'all'
      ? 'My whole ' + destName() + ' — ' + n + ' place' + (n === 1 ? '' : 's') + ' I’ve been to or kept. '
      : 'I made you a list of my ' + destName() + ' places — ' + n + ' spot' + (n === 1 ? '' : 's') + ' I vouch for. ') + link;

  const paint = () => {
    live = liveRowFor(dest);
    const scopeD = (live && !live.destination) ? null : dest;
    const all = giftable('all', scopeD);
    const keep = giftable('keepers', scopeD);
    /* the live row seeds the pick ONCE; after that the chips own it
       (17.2 fix: re-seeding on every repaint ate the user's tap) */
    if (scope === null) {
      scope = (live && (live.scope === 'all' || live.scope === 'keepers'))
        ? live.scope : (keep.length ? 'keepers' : 'all');
    }
    if (!keep.length) scope = 'all';
    const cur = () => (scope === 'all' ? all : keep);
    if (fieldsFor !== dest) {
      fieldsFor = dest;
      $('gcNote').value = live ? (live.note || '') : '';
      $('gcPhotos').checked = live ? live.photos !== false : true;
    }

    const dh = $('gcDests');
    if (CTX.destList.length > 1) {
      dh.innerHTML = CTX.destList.map((d) =>
        '<button type="button" class="dchip' + (d.slug === dest ? ' on' : '') + '" data-d="' + esc(d.slug) + '">' + esc(d.title) + '</button>').join('');
      dh.hidden = false;
      dh.onclick = (e) => {
        const c = e.target.closest('.dchip');
        if (!c) return;
        dest = c.getAttribute('data-d');
        scope = null; /* the new collection's live row re-seeds the pick */
        paint();
      };
    } else dh.hidden = true;

    const shp = $('gcScope');
    if (keep.length && keep.length < all.length) {
      shp.innerHTML =
        '<button type="button" class="chip' + (scope === 'keepers' ? ' on' : '') + '" data-s="keepers"><b>the keepers · ' + keep.length + '</b><span>PHOTOS · WORTH-ITS · SAVES</span></button>' +
        '<button type="button" class="chip' + (scope === 'all' ? ' on' : '') + '" data-s="all"><b>everything · ' + all.length + '</b><span>EVERY PLACE BEEN OR KEPT</span></button>';
      shp.hidden = false;
      shp.onclick = (e) => {
        const c = e.target.closest('.chip');
        if (!c) return;
        scope = c.getAttribute('data-s');
        paint();
      };
    } else { scope = 'all'; shp.hidden = true; shp.innerHTML = ''; }

    const phN = cur().filter((id) => CTX.photoSet.has(id)).length;
    const phBox = $('gcPhotos');
    if (phN) {
      $('gcPhotosLbl').textContent = 'include my photos (' + phN + ' place' + (phN === 1 ? '' : 's') + ') — they travel only with this gift';
      phBox.disabled = false;
    } else {
      $('gcPhotosLbl').textContent = 'no photos of yours yet — add one to any been place';
      phBox.checked = false; phBox.disabled = true;
    }
    $('gcH').textContent = 'Gift your ' + destName() + ' — ' + cur().length + ' place' + (cur().length === 1 ? '' : 's');
    $('gcMsg').innerHTML = esc(giftMessage(cur().length, '')) +
      '<i>' + esc(live ? location.origin + '/s/?t=' + live.token : location.origin + '/s/?t=…') + '</i>';
    $('gcRevoke').hidden = !live;
    const btn = $('gcCopy');
    btn.disabled = !cur().length;
    btn.textContent = cur().length ? 'copy message + link' : 'nothing giftable here yet';
    btn.onclick = async () => {
      if (!cur().length) return;
      btn.disabled = true;
      const note = $('gcNote').value.trim().slice(0, 280) || null;
      const photos = !!$('gcPhotos').checked;
      if (live) {
        const { error } = await sb.from('trip_shares').update({ note, photos, scope }).eq('id', live.id);
        if (error) { btn.disabled = false; btn.textContent = '⚠ didn’t save — retry'; return; }
        live.note = note; live.photos = photos; live.scope = scope;
      } else {
        const ins = await sb.from('trip_shares')
          .insert({ user_id: CTX.user.id, token: shareSlug(), kind: 'list', note, photos, scope, destination: dest || null })
          .select().single();
        if (ins.error) { btn.disabled = false; btn.textContent = '⚠ didn’t save — retry'; return; }
        live = ins.data;
        CTX.shares.set(String(live.destination || '').toLowerCase(), live);
      }
      const msg = giftMessage(cur().length, location.origin + '/s/?t=' + live.token);
      try { await navigator.clipboard.writeText(msg); btn.textContent = '✓ copied — paste it anywhere'; }
      catch (_) { btn.textContent = 'copy failed — long-press the message'; }
      $('gcMsg').innerHTML = esc(giftMessage(cur().length, '')) +
        '<i>' + esc(location.origin + '/s/?t=' + live.token) + '</i>';
      $('gcRevoke').hidden = false;
      const pay = { kind: 'list', n: cur().length, photos, scope, via: 'shelf' };
      if (live.destination) pay.dest = String(live.destination).toLowerCase();
      try { const s = JSON.parse(localStorage.getItem('tripos_via') || 'null'); if (s && s.token) pay.origin = s.token; } catch (_) {}
      track('share_created', pay);
      btn.disabled = false;
    };
    $('gcRevoke').onclick = async () => {
      if (!live) return;
      const { error } = await sb.from('trip_shares')
        .update({ revoked_at: new Date().toISOString() }).eq('id', live.id);
      if (error) { $('gcRevoke').textContent = '⚠ couldn’t revoke — retry'; return; }
      CTX.shares.delete(String(live.destination || '').toLowerCase());
      live = null;
      $('gcRevoke').textContent = 'revoke the link';
      paint();
    };
  };
  paint();
  sheet.classList.add('on');
}
$('giftSh').addEventListener('click', (e) => { if (e.target === $('giftSh')) $('giftSh').classList.remove('on'); });

/* ── THE SAVE SHEET (Round 17.3): catch a place without leaving home.
   Same ladder as the save catcher: our curated pool first (works
   anonymous, buffers), then the live Google door for the signed-in
   (places-search 'search' → 'add' mints the curated row). A save lands
   in the places table — and on top of the This-week lane, because the
   whole shelf re-boots after it. ── */
let SAVE_USER = null;       /* set by bootSigned; null = anonymous */
let svCurated = [], svGoogle = [];
function svRow(p, i, kind) {
  const already = SAVE_USER
    ? (CTX && CTX.savedSet.has(String(p.id)))
    : anonMap().has(String(p.id));
  const sub = kind === 'g'
    ? esc((p.area || 'found live').toUpperCase()) + ' · NOT IN THE ATLAS YET'
    : esc([p.category, p.area].filter(Boolean).join(' · ').toUpperCase()) + (p.verified ? ' · ✓' : '');
  return '<div class="svrow"><span class="n">' + esc(p.name) + '<span>' + sub + '</span></span>' +
    '<button type="button" class="sv1' + (already ? ' done' : '') + '" data-k="' + kind + '" data-i="' + i + '"' +
    (already ? ' disabled' : '') + '>' + (already ? 'On your list ✓' : '⚑ Save') + '</button></div>';
}
async function svSearch(q) {
  q = String(q || '').trim();
  if (!q) return;
  $('svSt').textContent = 'LOOKING…';
  $('svRows').innerHTML = '';
  const { data: hits } = await sb.from('curated_places')
    .select('id, name, area, category, verified')
    .ilike('name', '%' + q.replace(/[%_]/g, '') + '%').limit(6);
  svCurated = hits || [];
  let html = svCurated.map((p, i) => svRow(p, i, 'c')).join('');
  svGoogle = [];
  if (SAVE_USER && svCurated.length < 3) {
    try {
      const r = await fetch(cfg.url + '/functions/v1/places-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey },
        body: JSON.stringify({ action: 'search', query: q })
      });
      const g = r.ok ? await r.json() : null;
      svGoogle = ((g && g.candidates) || []).filter((c) =>
        !svCurated.some((p) => p.name.toLowerCase() === String(c.name).toLowerCase())).slice(0, 4);
    } catch (_) {}
    html += svGoogle.map((c, i) => svRow(c, i, 'g')).join('');
  }
  if (!SAVE_USER && !svCurated.length) {
    $('svSt').innerHTML = 'NOT IN OUR ATLAS YET — <a href="/app/trip/">SIGN IN</a> AND IT FETCHES LIVE, ANYWHERE ON EARTH.';
  } else {
    $('svSt').textContent = html ? '' : 'NOTHING MATCHED — TRY FEWER WORDS.';
  }
  $('svRows').innerHTML = html;
}
async function svSave(btn, kind, i) {
  btn.disabled = true;
  btn.textContent = 'Saving…';
  const fail = (t) => { btn.disabled = false; btn.textContent = '⚑ Save'; $('svSt').textContent = t; };
  let p = kind === 'c' ? svCurated[i] : null;
  if (kind === 'g') {
    /* the live door mints the curated row first */
    try {
      const r = await fetch(cfg.url + '/functions/v1/places-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey },
        body: JSON.stringify({ action: 'add', place_id: svGoogle[i].google_place_id })
      });
      const d = r.ok ? await r.json() : null;
      p = d && d.place;
    } catch (_) {}
    if (!p) return fail('COULDN’T ADD THAT ONE — TRY AGAIN.');
  }
  if (!p) return fail('');
  if (SAVE_USER) {
    const { error } = await sb.from('places').insert({
      user_id: SAVE_USER.id, curated_place_id: p.id,
      name: p.name, area: p.area, category: p.category, curated: true
    });
    if (error) return fail('DIDN’T SAVE — TRY AGAIN.');
  } else {
    anonToggle({ id: p.id, name: p.name, area: p.area, category: p.category });
  }
  track('place_saved');
  btn.classList.add('done');
  btn.textContent = 'On your list ✓';
  $('svSt').textContent = 'KEPT — IT’S ON TOP OF YOUR SHELF.';
  /* the shelf re-boots quietly: the save appears in This week */
  if (SAVE_USER) bootSigned(SAVE_USER).catch(() => {});
  else bootAnon();
}
$('fabSave').addEventListener('click', () => {
  $('saveSh').classList.add('on');
  setTimeout(() => { try { $('svIn').focus(); } catch (_) {} }, 260);
});
$('saveSh').addEventListener('click', (e) => { if (e.target === $('saveSh')) $('saveSh').classList.remove('on'); });
$('svForm').addEventListener('submit', (e) => { e.preventDefault(); svSearch($('svIn').value); });
$('svRows').addEventListener('click', (e) => {
  const b = e.target.closest('.sv1');
  if (b && !b.disabled) svSave(b, b.getAttribute('data-k'), +b.getAttribute('data-i'));
});

/* ── THE COLLECTION VIEW (Round 17.4): a cover opens in place.
   Your places of one destination, grouped by area with their marks,
   the collection's own gift door on top. Hash-routed (#c/<slug>) so
   back works and a save re-boot keeps the open view. ── */
const SHELF_SECTIONS = ['week', 'ask', 'cur', 'shelfGrid', 'signin', 'recSec'];
function showShelf() {
  $('collView').hidden = true;
  SHELF_SECTIONS.forEach((id) => {
    const el = $(id);
    if (el && el.dataset.was !== '1') return; /* only restore what we hid */
    if (el) { el.hidden = false; delete el.dataset.was; }
  });
}
function renderCollection(slug) {
  if (!CTX || !CTX.groups || !CTX.groups.has(slug)) { location.hash = ''; return; }
  const g = CTX.groups.get(slug);
  SHELF_SECTIONS.forEach((id) => {
    const el = $(id);
    if (el && !el.hidden) { el.dataset.was = '1'; el.hidden = true; }
  });
  $('cvName').textContent = 'Your ' + g.title;
  $('cvGift').onclick = () => openComposer(slug === '—' ? null : slug);
  const been = g.items.filter((r) => CTX.stampSet.has(String(r.curated_place_id))).length;
  $('cvCt').textContent = g.items.length + ' PLACE' + (g.items.length === 1 ? '' : 'S') +
    (been ? ' · ✓ BEEN TO ' + been : '');
  const covers = g.items
    .map((r) => { const c = CTX.cmap.get(String(r.curated_place_id)); return c && c.photo_name; })
    .filter(Boolean).slice(0, 3);
  $('cvStrip').innerHTML = covers.map((n) =>
    '<img alt="" data-pn="' + esc(n) + '" src="' + esc(catSrc('explore')) + '">').join('');
  $('cvStrip').parentElement.style.display = covers.length ? '' : 'none';

  /* areas, biggest first; fold at 5 */
  const byArea = new Map();
  g.items.forEach((r) => {
    const a = String(r.area || '').trim() || 'Around';
    if (!byArea.has(a)) byArea.set(a, []);
    byArea.get(a).push(r);
  });
  $('cvAreas').innerHTML = [...byArea.entries()].sort((a, b) => b[1].length - a[1].length)
    .map(([area, items]) => {
      const ab = items.filter((r) => CTX.stampSet.has(String(r.curated_place_id))).length;
      return '<section class="cvarea"><h3>' + esc(area) + '</h3>' +
        '<p class="cc">' + items.length + ' PLACE' + (items.length === 1 ? '' : 'S') +
          (ab ? ' · ' + ab + ' VISITED' : '') + '</p>' +
        items.map((r, i) => {
          const id = String(r.curated_place_id);
          const c = CTX.cmap.get(id);
          const mk = CTX.stampSet.has(id) ? ['✓ BEEN', '']
            : (CTX.worthSet.has(id) ? ['♥ WORTH IT', ' w'] : ['⚑ SAVED', ' s']);
          const pn = (c && c.photo_name) ? ' data-pn="' + esc(c.photo_name) + '"' : '';
          const fold = items.length > 6 && i >= 5 ? ' hidden' : '';
          return '<div class="cvpl"' + fold + '><img alt="" loading="lazy"' + pn +
            ' src="' + esc(catSrc(r.category)) + '">' +
            '<span class="n">' + esc(r.name) +
              '<span>' + esc(String(r.category || '').toUpperCase()) + '</span></span>' +
            '<span class="mk' + mk[1] + '">' + mk[0] + '</span></div>';
        }).join('') +
        (items.length > 6
          ? '<button type="button" class="cvmore">Show ' + (items.length - 5) + ' more in ' + esc(area) + ' ↓</button>'
          : '') +
      '</section>';
    }).join('');
  $('collView').hidden = false;
  window.scrollTo(0, 0);
  const names = [...document.querySelectorAll('#collView img[data-pn]')]
    .map((i) => i.getAttribute('data-pn'));
  if (names.length) resolvePhotos(names.slice(0, 16)).then(() => {
    applyPhotos();
    if (names.length > 16) resolvePhotos(names.slice(16, 32)).then(applyPhotos);
  });
  track('collection_view', { dest: slug });
}
$('cvAreas').addEventListener('click', (e) => {
  const b = e.target.closest('.cvmore');
  if (!b) return;
  b.parentElement.querySelectorAll('.cvpl[hidden]').forEach((el) => { el.hidden = false; });
  b.remove();
});
$('cvBack').addEventListener('click', () => { location.hash = ''; });
function applyHash() {
  const m = location.hash.match(/^#c\/([a-z0-9-]+)/);
  if (m && CTX && CTX.groups) renderCollection(m[1]);
  else showShelf();
}
window.addEventListener('hashchange', applyHash);

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
