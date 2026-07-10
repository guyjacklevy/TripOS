/* ─── TripOS · curated places browser ────────────────────────
 * Reads the shared, public `curated_places` table from Supabase
 * (RLS allows anyone to read; no login needed) and renders cards
 * filterable by area and category. The seed of the "Places" screen.
 * ──────────────────────────────────────────────────────────── */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cfg = window.TRIPOS_SUPABASE || {};
const grid = document.getElementById('placesGrid');
const areaBar = document.getElementById('placeAreas');
const catBar = document.getElementById('placeFilters');
const statusEl = document.getElementById('placesStatus');

/* category → orb colour + icon */
const CAT = {
  beach:     { orb: 'planet-pink',   icon: '🏖', label: 'Beach' },
  food:      { orb: 'planet-amber',  icon: '🍽', label: 'Food' },
  nightlife: { orb: 'planet-purple', icon: '🎉', label: 'Nightlife' },
  work:      { orb: 'planet-blue',   icon: '☕', label: 'Work' },
  wellness:  { orb: 'planet-teal',   icon: '💆', label: 'Wellness' },
  explore:   { orb: 'planet-blue',   icon: '🗺', label: 'Explore' },
  surf:      { orb: 'planet-pink',   icon: '🏄', label: 'Surf' }
};

/* preferred area order (falls back to first-seen for anything else) */
const AREA_ORDER = ['Uluwatu', 'Canggu', 'Ubud', 'Seminyak', 'Islands'];

const region = (area) => String(area || '').split('/')[0].trim();

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const state = { area: 'all', cat: 'all' };

function card(p) {
  const cat = CAT[p.category] || { orb: 'planet-teal', icon: '📍', label: p.category };
  const personas = (p.personas || []).map((x) =>
    '<span class="persona-chip">' + esc(x) + '</span>').join('');
  const maps = p.maps_query
    ? '<a class="place-maps" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' +
      encodeURIComponent(p.maps_query) + '">Open in Maps ↗</a>'
    : '';
  const timing = p.timing_note
    ? '<div class="row"><span class="k">🕑</span><span>' + esc(p.timing_note) + '</span></div>' : '';
  const tip = p.tip ? '<p class="place-tip">' + esc(p.tip) + '</p>' : '';
  return (
    '<article class="place-card" data-cat="' + esc(p.category) + '" data-region="' + esc(region(p.area)) + '">' +
      '<div class="place-top">' +
        '<span class="orb ' + cat.orb + '"></span>' +
        '<div>' +
          '<div class="place-name">' + esc(p.name) +
            (p.verified ? '<span class="place-verified" title="Verified">✓</span>' : '') + '</div>' +
          '<div class="place-area">' + cat.icon + ' ' + esc(p.area) + '</div>' +
        '</div>' +
      '</div>' +
      (personas ? '<div class="place-personas">' + personas + '</div>' : '') +
      (p.why ? '<p class="place-why">' + esc(p.why) + '</p>' : '') +
      '<div class="place-meta">' + timing + '</div>' +
      tip +
      '<div class="place-foot">' +
        '<span class="place-price">' + esc(p.price_note || '') + '</span>' +
        maps +
      '</div>' +
    '</article>'
  );
}

function applyFilters() {
  let shown = 0;
  grid.querySelectorAll('.place-card').forEach((el) => {
    const okArea = state.area === 'all' || el.getAttribute('data-region') === state.area;
    const okCat = state.cat === 'all' || el.getAttribute('data-cat') === state.cat;
    const show = okArea && okCat;
    el.style.display = show ? '' : 'none';
    if (show) shown++;
  });
  let empty = document.getElementById('placesEmpty');
  if (!shown) {
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

function buildBar(bar, values, key, labelFor) {
  const all = ['all'].concat(values);
  bar.innerHTML = all.map((v, i) => {
    const label = v === 'all' ? (key === 'area' ? 'All areas' : 'All types') : labelFor(v);
    return '<button class="filter' + (i === 0 ? ' on' : '') + '" data-v="' + esc(v) + '">' +
      esc(label) + '</button>';
  }).join('');
  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter');
    if (!btn) return;
    bar.querySelectorAll('.filter').forEach((f) => f.classList.remove('on'));
    btn.classList.add('on');
    state[key] = btn.getAttribute('data-v');
    applyFilters();
  });
}

(async function () {
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
    grid.innerHTML = data.map(card).join('');

    const regions = [];
    data.forEach((p) => { const r = region(p.area); if (regions.indexOf(r) === -1) regions.push(r); });
    regions.sort((a, b) => {
      const ia = AREA_ORDER.indexOf(a), ib = AREA_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    const cats = [];
    data.forEach((p) => { if (cats.indexOf(p.category) === -1) cats.push(p.category); });

    buildBar(areaBar, regions, 'area', (v) => v);
    buildBar(catBar, cats, 'cat', (v) => (CAT[v] ? CAT[v].label : v));
  } catch (err) {
    console.error('[TripOS] places load failed:', err.message || err);
    statusEl.textContent = 'Could not load places right now.';
  }
})();
