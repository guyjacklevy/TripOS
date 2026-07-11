/* ─── TripOS · curated places browser ────────────────────────
 * Reads the shared, public `curated_places` table from Supabase
 * (RLS allows anyone to read; no login needed) and renders POI-style
 * intel cards filterable by area terrain cards + a map legend.
 * Google Earth spatial aesthetic — zero libraries, zero weight.
 * ──────────────────────────────────────────────────────────── */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { scorePlace, isMatch, readPlan, VIBE_LABEL, TIER_LABEL, durLabel } from './match.js';

const cfg = window.TRIPOS_SUPABASE || {};
const grid = document.getElementById('placesGrid');
const areaBar = document.getElementById('placeAreas');
const catBar = document.getElementById('placeFilters');
const statusEl = document.getElementById('placesStatus');
const altEl = document.getElementById('altValue');
const coordAreaEl = document.getElementById('coordArea');

/* category → orb colour, accent var, icon */
const CAT = {
  beach:     { orb: 'planet-pink',   cc: 'var(--cat-beach)',    icon: '🏖', label: 'Beach' },
  food:      { orb: 'planet-amber',  cc: 'var(--cat-food)',     icon: '🍽', label: 'Food' },
  nightlife: { orb: 'planet-purple', cc: 'var(--cat-night)',    icon: '🎉', label: 'Nightlife' },
  work:      { orb: 'planet-blue',   cc: 'var(--cat-work)',     icon: '☕', label: 'Cafe + Work' },
  wellness:  { orb: 'planet-teal',   cc: 'var(--cat-wellness)', icon: '💆', label: 'Wellness' },
  explore:   { orb: 'planet-blue',   cc: 'var(--cat-explore)',  icon: '🗺', label: 'Explore' },
  gym:       { orb: 'planet-teal',   cc: 'var(--cat-gym)',      icon: '🏋️', label: 'Gym' }
};

/* area terrain identities — keys, colours, keywords, approach altitude */
const AREA_META = {
  'All':      { key: '',         ac: 'var(--teal)',          tags: 'overview · curated · live',      alt: 8000 },
  'Uluwatu':  { key: 'uluwatu',  ac: 'var(--area-uluwatu)',  tags: 'cliffs · surf · sunsets',        alt: 2400 },
  'Canggu':   { key: 'canggu',   ac: 'var(--area-canggu)',   tags: 'surf · cafes · nomads',          alt: 2100 },
  'Ubud':     { key: 'ubud',     ac: 'var(--area-ubud)',     tags: 'jungle · yoga · stillness',      alt: 3800 },
  'Seminyak': { key: 'seminyak', ac: 'var(--area-seminyak)', tags: 'boutique · dining · nightlife',  alt: 1800 },
  'Islands':  { key: 'islands',  ac: 'var(--area-islands)',  tags: 'penida · snorkel · mantas',      alt: 2600 },
  'Sanur':    { key: 'sanur',    ac: 'var(--area-sanur)',    tags: 'local · calm · beach',           alt: 1600 },
  'Denpasar': { key: 'denpasar', ac: 'var(--area-denpasar)', tags: 'real · local · city',            alt: 1400 }
};
const AREA_ORDER = ['Uluwatu', 'Canggu', 'Ubud', 'Seminyak', 'Sanur', 'Denpasar', 'Islands'];

const region = (area) => String(area || '').split('/')[0].trim();

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = { area: 'all', cat: 'all' };

/* ── altitude counter — fly in on approach ── */
let altCurrent = 35000;
let altRAF = null;
function fmtAlt(n) { return Math.round(n).toLocaleString('en-US') + ' ft'; }
function flyTo(target, ms) {
  if (!altEl) return;
  if (altRAF) cancelAnimationFrame(altRAF);
  if (REDUCED) { altCurrent = target; altEl.textContent = fmtAlt(target); return; }
  const from = altCurrent;
  let t0 = null;
  const step = (ts) => {
    if (!t0) t0 = ts;
    const p = Math.min(1, (ts - t0) / ms);
    const eased = 1 - Math.pow(1 - p, 3);
    altCurrent = from + (target - from) * eased;
    altEl.textContent = fmtAlt(altCurrent);
    if (p < 1) altRAF = requestAnimationFrame(step);
  };
  altRAF = requestAnimationFrame(step);
}

/* ── POI intel card ── */
function card(p, matched) {
  const cat = CAT[p.category] || { orb: 'planet-teal', cc: 'var(--teal)', icon: '📍', label: p.category };
  const personas = (p.personas || []).map((x) =>
    '<span class="persona-chip">' + esc(x) + '</span>').join('');
  const maps = p.maps_query
    ? '<a class="place-maps" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' +
      encodeURIComponent(p.maps_query) + '">Open in Maps ↗</a>'
    : '';
  const tip = p.tip ? '<p class="place-tip">' + esc(p.tip) + '</p>' : '';
  const price = '<span class="price-sym">' + '$'.repeat(Math.max(1, Math.min(4, p.price_level || 1))) + '</span>';
  const when = p.timing_note
    ? '<div class="cell"><span class="k">When</span><span class="v">' + esc(p.timing_note) + '</span></div>'
    : '<div class="cell"></div>';
  return (
    '<article class="place-card" data-cat="' + esc(p.category) + '" data-region="' + esc(region(p.area)) +
      '" style="--cc:' + cat.cc + '">' +
      (matched ? '<span class="match-badge">✦ your match</span>' : '') +
      '<div class="place-top">' +
        '<span class="orb ' + cat.orb + '"></span>' +
        '<div>' +
          '<div class="place-name">' + esc(p.name) +
            (p.verified ? '<span class="place-verified" title="Verified">✓</span>' : '') + '</div>' +
          '<div class="poi-type">' + esc(cat.label) + ' · ' + esc(p.area) + '</div>' +
        '</div>' +
      '</div>' +
      (personas ? '<div class="place-personas">' + personas + '</div>' : '') +
      (p.why ? '<p class="place-why">' + esc(p.why) + '</p>' : '') +
      tip +
      '<div class="poi-intel">' + when +
        '<div class="cell"><span class="k">Cost</span><span class="v">' + price + '</span></div>' +
      '</div>' +
      '<div class="place-foot">' +
        '<span class="place-price">' + esc(p.price_note || '') + '</span>' +
        maps +
      '</div>' +
    '</article>'
  );
}

/* ── staggered POI drop on the cards that survive a filter ── */
function dropIn(cards) {
  if (REDUCED) return;
  cards.forEach((el, i) => {
    el.classList.remove('poi-drop');
    void el.offsetWidth; /* restart the animation */
    el.style.animationDelay = (i * 30) + 'ms';
    el.classList.add('poi-drop');
  });
}

function applyFilters(animate) {
  const shownCards = [];
  grid.querySelectorAll('.place-card').forEach((el) => {
    const okArea = state.area === 'all' || el.getAttribute('data-region') === state.area;
    const okCat = state.cat === 'all' || el.getAttribute('data-cat') === state.cat;
    const show = okArea && okCat;
    el.style.display = show ? '' : 'none';
    if (show) shownCards.push(el);
  });
  if (animate) dropIn(shownCards);
  let empty = document.getElementById('placesEmpty');
  if (!shownCards.length) {
    if (!empty) {
      empty = document.createElement('p');
      empty.id = 'placesEmpty';
      empty.className = 'places-status';
      grid.after(empty);
    }
    empty.textContent = 'Nothing in that combo yet — try another filter.';
  } else if (empty) {
    empty.remove();
  }
}

/* ── area terrain cards ── */
function buildAreaCards(regions) {
  const entries = [['All', AREA_META['All']]].concat(
    regions.map((r) => [r, AREA_META[r] || { key: r.toLowerCase(), ac: 'var(--teal)', tags: 'curated · live', alt: 2500 }])
  );
  areaBar.innerHTML = entries.map(([name, m], i) =>
    '<button type="button" class="area-card' + (i === 0 ? ' on' : '') + '" data-v="' + esc(name === 'All' ? 'all' : name) +
      '" data-key="' + esc(m.key) + '" data-alt="' + m.alt + '" style="--ac:' + m.ac + '">' +
      '<span class="ac-name"><span class="ac-pin">✦</span>' + esc(name === 'All' ? 'All areas' : name) + '</span>' +
      '<span class="ac-tags">' + esc(m.tags) + '</span>' +
    '</button>'
  ).join('');
  areaBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.area-card');
    if (!btn) return;
    areaBar.querySelectorAll('.area-card').forEach((b) => b.classList.remove('on'));
    btn.classList.add('on');
    state.area = btn.getAttribute('data-v');
    document.body.setAttribute('data-area', btn.getAttribute('data-key'));
    if (coordAreaEl) coordAreaEl.textContent = (state.area === 'all' ? 'ALL AREAS' : state.area.toUpperCase());
    flyTo(parseInt(btn.getAttribute('data-alt'), 10) || 8000, 400);
    applyFilters(true);
  });
}

/* ── category legend ── */
function buildLegend(cats) {
  const all = ['all'].concat(cats);
  catBar.innerHTML = all.map((c, i) => {
    const meta = c === 'all'
      ? { cc: 'var(--teal)', label: 'All types' }
      : (CAT[c] || { cc: 'var(--teal)', label: c });
    return '<button type="button" class="legend-pill' + (i === 0 ? ' on' : '') + '" data-v="' + esc(c) +
      '" style="--cc:' + meta.cc + '">' +
      '<span class="legend-dot"></span>' + esc(meta.label) +
    '</button>';
  }).join('');
  catBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.legend-pill');
    if (!btn) return;
    catBar.querySelectorAll('.legend-pill').forEach((b) => b.classList.remove('on'));
    btn.classList.add('on');
    state.cat = btn.getAttribute('data-v');
    applyFilters(true);
  });
}

(async function () {
  /* approach descent: 35,000 ft → 8,000 ft on load */
  flyTo(8000, 1200);

  if (!cfg.url || cfg.url.indexOf('YOUR_') !== -1) {
    statusEl.textContent = 'Places load once Supabase is connected.';
    return;
  }
  try {
    const sb = createClient(cfg.url, cfg.anonKey);
    const { data, error } = await sb
      .from('curated_places')
      .select('*')
      .eq('destination', 'bali')
      .order('area', { ascending: true })
      .order('category', { ascending: true });
    if (error) throw error;
    if (!data || !data.length) {
      statusEl.textContent = 'No places yet — check back soon.';
      return;
    }
    statusEl.remove();

    /* personalization: if a check-in brief is saved, badge matches + float them up */
    const plan = readPlan();
    let list = data;
    const matchedSet = new Set();
    if (plan) {
      const order = new Map(data.map((p, i) => [p, i]));
      data.forEach((p) => { if (isMatch(scorePlace(p, plan))) matchedSet.add(p); });
      if (matchedSet.size) {
        list = data.slice().sort((a, b) => {
          const am = matchedSet.has(a) ? scorePlace(a, plan) : -1;
          const bm = matchedSet.has(b) ? scorePlace(b, plan) : -1;
          return bm - am || order.get(a) - order.get(b);
        });
        const banner = document.createElement('div');
        banner.className = 'match-banner';
        banner.innerHTML = '<span class="pulse-dot"></span>Matched to your brief · ' +
          esc(VIBE_LABEL[plan.vibe] || '') + ' · ' +
          (plan.dur != null ? esc(durLabel(+plan.dur)) + ' · ' : '') +
          esc(TIER_LABEL[plan.tier] || '') +
          '<span class="mb-note">your matches float to the top</span>';
        areaBar.parentNode.insertBefore(banner, areaBar);
      }
    }

    grid.innerHTML = list.map((p) => card(p, matchedSet.has(p))).join('');
    dropIn(Array.from(grid.querySelectorAll('.place-card')));

    const regions = [];
    data.forEach((p) => { const r = region(p.area); if (regions.indexOf(r) === -1) regions.push(r); });
    regions.sort((a, b) => {
      const ia = AREA_ORDER.indexOf(a), ib = AREA_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    const cats = [];
    data.forEach((p) => { if (cats.indexOf(p.category) === -1) cats.push(p.category); });

    buildAreaCards(regions);
    buildLegend(cats);
  } catch (err) {
    console.error('[TripOS] places load failed:', err.message || err);
    statusEl.textContent = 'Could not load places right now.';
  }
})();
