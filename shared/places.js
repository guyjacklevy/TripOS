/* ─── Prevoya · the public Bali shelf (/bali/places) ──────────
 * ROUND 20 (Guy picked the /x/19/a daylight example, 28 Nov): the
 * public shelf leaves the cosmic engine and renders the daylight
 * world directly — paper, white rows, ⚑ SAVE pills, a place sheet.
 * The signed app's Places tab keeps shared/places-browser.js
 * untouched; this page no longer mounts it.
 * Saves stay anonymous-first (anon-saves.js) and claim themselves
 * into the account on first signed-in open, exactly as before.
 * ──────────────────────────────────────────────────────────── */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { readPlan, scoreBreakdown, isMatch } from './match.js';
import { anonMap, anonToggle, anonCount } from './anon-saves.js';

const cfg = window.TRIPOS_SUPABASE || {};
const $ = (id) => document.getElementById(id);
const statusEl = $('placesStatus');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const LABEL = {
  beach: 'Beach', food: 'Food', nightlife: 'Nightlife', work: 'Cafe + Work',
  wellness: 'Wellness', explore: 'Explore', gym: 'Gym', 'day-club': 'Day Club',
  surf: 'Surf', practical: 'Practical', stay: 'Stays', cafe: 'Cafe',
  health: 'Health', services: 'Services', rental: 'Rental'
};
/* category photography floor — every key maps to a file that EXISTS */
const PHOTO_FILE = {
  food: 'food', cafe: 'work', work: 'work', gym: 'gym', wellness: 'wellness',
  explore: 'explore', beach: 'beach', nightlife: 'nightlife', surf: 'beach',
  'day-club': 'beach', stay: 'explore', health: 'wellness', services: 'explore', rental: 'explore'
};
const catArt = (c) => '/shared/img/cat-' + (PHOTO_FILE[c] || 'explore') + '.webp';
const AREA_ORDER = ['Uluwatu', 'Canggu', 'Ubud', 'Seminyak', 'Sanur', 'Denpasar',
  'East Bali', 'Nusa Penida', 'Gili Trawangan', 'Lombok'];
const region = (a) => String(a || '').split('/')[0].trim();
/* v3 facets: categories[] is the truth; category = categories[0] */
const catsOf = (p) => (Array.isArray(p.categories) && p.categories.length) ? p.categories : [p.category];

(async function () {
  if (!cfg.url || cfg.url.indexOf('YOUR_') !== -1) {
    statusEl.textContent = 'Places load once Supabase is connected.';
    return;
  }
  let sb, places;
  try {
    sb = createClient(cfg.url, cfg.anonKey);
    const { data, error } = await sb
      .from('curated_places')
      .select('*')
      .eq('destination', 'bali')
      .order('area', { ascending: true })
      .order('category', { ascending: true });
    if (error) throw error;
    places = data || [];
  } catch (err) {
    console.error('[Prevoya] places load failed:', err.message || err);
    statusEl.textContent = 'Could not load places right now.';
    return;
  }
  if (!places.length) {
    statusEl.textContent = 'No places yet — check back soon.';
    return;
  }

  /* ── the brief (Round 19 gate: only a brief kept in the last 60 days) ── */
  const plan = (function () {
    const p = readPlan();
    return p && p.ts && (Date.now() - p.ts) < 60 * 86400000 ? p : null;
  })();
  const matched = new Map(); /* place → scoreBreakdown */
  if (plan) places.forEach((p) => {
    const bd = scoreBreakdown(p, plan);
    if (isMatch(bd.score)) matched.set(p, bd);
  });
  if (matched.size) {
    $('matchNote').textContent = '✦ MATCHED TO YOUR BRIEF — YOUR MATCHES FLOAT UP';
    $('matchNote').hidden = false;
  }

  /* ── the anonymous save buffer + keep-bar ── */
  const saves = anonMap();
  const bar = $('saveBar');
  const paintBar = () => {
    const n = anonCount();
    bar.hidden = n === 0;
    $('kc').textContent = '⚑ ' + n + ' saved';
  };
  paintBar();

  /* ── header counts (real, computed — never hard-coded) ── */
  const regions = [];
  places.forEach((p) => { const r = region(p.area); if (r && regions.indexOf(r) === -1) regions.push(r); });
  regions.sort((a, b) => {
    const ia = AREA_ORDER.indexOf(a), ib = AREA_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  $('shelfCt').textContent = places.length + ' PLACES · ' + regions.length +
    ' AREAS · CURATED BY PEOPLE WHO WENT';

  /* ── chips: every category present, counted via facets ── */
  const tally = new Map();
  places.forEach((p) => catsOf(p).forEach((c) => { if (c) tally.set(c, (tally.get(c) || 0) + 1); }));
  const chipRows = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  $('chips').innerHTML = '<button class="on" data-c="all">ALL ' + places.length + '</button>' +
    chipRows.map(([c, n]) => '<button data-c="' + esc(c) + '">' +
      esc((LABEL[c] || c).toUpperCase()) + ' ' + n + '</button>').join('');

  /* ── rows, grouped by area; matches float to the top of their area ── */
  const byId = new Map(places.map((p) => [String(p.id), p]));
  function svHTML(p, big) {
    const on = saves.has(String(p.id));
    return '<button type="button" class="sv' + (on ? ' on' : '') + (big ? ' big' : '') +
      '" data-save="' + esc(String(p.id)) +
      '" aria-label="' + (on ? 'saved — tap to remove' : 'save for later') + '">⚑ ' +
      (on ? 'SAVED' : 'SAVE') + '</button>';
  }
  function rowHTML(p) {
    const bd = matched.get(p);
    const hay = [p.name, p.area, catsOf(p).map((c) => LABEL[c] || c).join(' '),
      (p.personas || []).join(' '), (p.tags || []).join(' ')].join(' ').toLowerCase();
    const sub = esc((LABEL[p.category] || p.category || '').toUpperCase()) +
      (p.source === 'google' && !p.verified ? ' · ◔ DISCOVERED' : '') +
      (bd ? ' · <b class="mm">✦ ' + bd.pct + '%</b>' : '');
    return '<div class="pl" role="button" tabindex="0" data-id="' + esc(String(p.id)) +
      '" data-cats="' + esc(catsOf(p).join(' ')) + '" data-search="' + esc(hay) + '">' +
      '<img alt="" loading="lazy" src="' + catArt(p.category) + '" onerror="this.style.visibility=\'hidden\'">' +
      '<span class="n"><em>' + esc(p.name) + (p.verified ? ' <b class="pv">✓</b>' : '') + '</em>' +
      '<span>' + sub + '</span></span>' +
      svHTML(p) +
      '<span class="chev">›</span></div>';
  }
  $('areas').innerHTML = regions.map((r) => {
    const rows = places.filter((p) => region(p.area) === r);
    rows.sort((a, b) => {
      const sa = matched.has(a) ? matched.get(a).score : -1;
      const sb2 = matched.has(b) ? matched.get(b).score : -1;
      return sb2 - sa;
    });
    return '<section class="area" data-r="' + esc(r) + '"><h2>' + esc(r) + '</h2>' +
      '<p class="ac">' + rows.length + ' PLACE' + (rows.length === 1 ? '' : 'S') + '</p>' +
      rows.map(rowHTML).join('') + '</section>';
  }).join('');
  statusEl.hidden = true;

  /* ── filtering: one chip + the search box; empty sections collapse ── */
  const state = { cat: 'all', q: '' };
  function applyFilters() {
    const q = state.q.trim().toLowerCase();
    let shown = 0;
    document.querySelectorAll('#areas .pl').forEach((el) => {
      const okCat = state.cat === 'all' ||
        (' ' + el.getAttribute('data-cats') + ' ').indexOf(' ' + state.cat + ' ') !== -1;
      const okQ = !q || (el.getAttribute('data-search') || '').indexOf(q) !== -1;
      const show = okCat && okQ;
      el.style.display = show ? '' : 'none';
      if (show) shown++;
    });
    document.querySelectorAll('#areas .area').forEach((sec) => {
      let vis = 0;
      sec.querySelectorAll('.pl').forEach((el) => { if (el.style.display !== 'none') vis++; });
      sec.style.display = vis ? '' : 'none';
      sec.querySelector('.ac').textContent = vis + ' PLACE' + (vis === 1 ? '' : 'S');
    });
    statusEl.hidden = shown > 0;
    if (!shown) statusEl.textContent = q
      ? 'No curated match for “' + q + '”.'
      : 'Nothing in that filter — try another.';
  }
  $('chips').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-c]');
    if (!b) return;
    state.cat = b.getAttribute('data-c');
    $('chips').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    applyFilters();
  });
  let qT = null;
  $('q').addEventListener('input', () => {
    clearTimeout(qT);
    qT = setTimeout(() => { state.q = $('q').value; applyFilters(); }, 150);
  });

  /* ── the save toggle: every pill for that place, the bar, the toast ── */
  function toggleSave(p) {
    const id = String(p.id);
    const nowOn = anonToggle(p);
    if (nowOn) saves.set(id, Date.now()); else saves.delete(id);
    document.querySelectorAll('.sv[data-save="' + CSS.escape(id) + '"]').forEach((b) => {
      b.classList.toggle('on', nowOn);
      b.textContent = '⚑ ' + (nowOn ? 'SAVED' : 'SAVE');
      b.setAttribute('aria-label', nowOn ? 'saved — tap to remove' : 'save for later');
    });
    paintBar();
    const prev = document.querySelector('.toast');
    if (prev) prev.remove();
    const t = document.createElement('div');
    t.className = 'toast' + (nowOn ? '' : ' off');
    t.textContent = nowOn ? '⚑ Kept — on your list' : 'Removed — off your list';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }

  /* ── the place sheet: the row's › opens the full story ──
     Photo chain: the place's own photo > its Google photo (resolved at
     display time through places-search, credited — never stored) > the
     category floor. One name per open, cached for the session. */
  const PHOTO_CACHE = new Map();
  function openSheet(p) {
    const bd = matched.get(p);
    const sub = [p.area, (LABEL[p.category] || p.category || '').toUpperCase()]
      .filter(Boolean).map(esc).join(' · ') +
      (p.verified ? ' · ✓ VERIFIED' : (p.source === 'google' ? ' · ◔ DISCOVERED' : '')) +
      (bd ? ' · ✦ ' + bd.pct + '% MATCH' : '');
    const maps = p.maps_query
      ? '<a class="maps" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' +
        encodeURIComponent(p.maps_query) + '">Open in Maps ↗</a>' : '';
    const forLine = (p.personas || []).length
      ? '<p class="for">FOR: ' + (p.personas || []).slice(0, 5).map((x) => esc(String(x).toUpperCase())).join(' · ') + '</p>' : '';
    $('plShIn').innerHTML = '<div class="grab"></div>' +
      '<div class="sh-photo"><img alt="" id="shImg" src="' + catArt(p.category) + '"></div>' +
      '<h3>' + esc(p.name) + '</h3>' +
      '<p class="sub">' + sub + '</p>' +
      (p.why ? '<p class="why">' + esc(p.why) + '</p>' : '') +
      (p.tip ? '<p class="tip">' + esc(p.tip) + '</p>' : '') +
      '<div class="meta">' +
        (p.timing_note ? '<div>🕑 ' + esc(p.timing_note) + '</div>' : '') +
        (p.price_note ? '<div>💰 ' + esc(p.price_note) + '</div>' : '') +
      '</div>' + forLine +
      '<div class="acts">' + maps + svHTML(p, true) + '</div>';
    $('plSh').classList.add('on');
    /* the real photo swaps in once decoded — the floor never flashes dark */
    const land = (uri) => {
      const im = new Image();
      im.onload = () => {
        const img = $('shImg');
        if (!img) return;
        img.src = uri;
        if (p.photo_author && !document.querySelector('.sh-cred')) {
          const c = document.createElement('span');
          c.className = 'sh-cred';
          c.textContent = '📷 ' + p.photo_author + ' · Google';
          img.parentNode.appendChild(c);
        }
      };
      im.src = uri;
    };
    if (p.photo_uri) { land(p.photo_uri); return; }
    if (!p.photo_name) return;
    if (PHOTO_CACHE.has(p.photo_name)) { land(PHOTO_CACHE.get(p.photo_name)); return; }
    sb.functions.invoke('places-search', { body: { action: 'photos', names: [p.photo_name] } })
      .then(({ data: r }) => {
        const uri = r && r.uris && r.uris[p.photo_name];
        if (!uri) return; /* the honest floor stays */
        PHOTO_CACHE.set(p.photo_name, uri);
        land(uri);
      }).catch(() => {});
  }
  const closeSheet = () => $('plSh').classList.remove('on');
  $('plSh').addEventListener('click', (e) => { if (e.target === $('plSh')) closeSheet(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

  /* ── one delegated handler: the pill saves, the row opens ── */
  function actOn(e) {
    const svb = e.target.closest('.sv');
    if (svb) {
      const p = byId.get(svb.getAttribute('data-save'));
      if (p) toggleSave(p);
      return true;
    }
    const row = e.target.closest('.pl');
    if (row) {
      const p = byId.get(row.getAttribute('data-id'));
      if (p) openSheet(p);
      return true;
    }
    return false;
  }
  $('areas').addEventListener('click', actOn);
  $('plShIn').addEventListener('click', actOn);
  $('areas').addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('pl')) {
      e.preventDefault();
      const p = byId.get(e.target.getAttribute('data-id'));
      if (p) openSheet(p);
    }
  });
})();
