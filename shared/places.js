/* ─── TripOS · curated places browser ────────────────────────
 * Reads the shared, public `curated_places` table from Supabase
 * (RLS allows anyone to read; no login needed) and renders filterable
 * cards. This is the seed of the real "Places" app screen.
 * ──────────────────────────────────────────────────────────── */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cfg = window.TRIPOS_SUPABASE || {};
const grid = document.getElementById('placesGrid');
const filterBar = document.getElementById('placeFilters');
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

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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
  const tip = p.tip
    ? '<p class="place-tip">' + esc(p.tip) + '</p>' : '';
  return (
    '<article class="place-card" data-cat="' + esc(p.category) + '">' +
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

function renderFilters(cats) {
  const all = ['all'].concat(cats);
  filterBar.innerHTML = all.map((c, i) => {
    const label = c === 'all' ? 'All' : (CAT[c] ? CAT[c].label : c);
    return '<button class="filter' + (i === 0 ? ' on' : '') + '" data-cat="' + esc(c) + '">' +
      esc(label) + '</button>';
  }).join('');
  filterBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter');
    if (!btn) return;
    filterBar.querySelectorAll('.filter').forEach((f) => f.classList.remove('on'));
    btn.classList.add('on');
    const pick = btn.getAttribute('data-cat');
    grid.querySelectorAll('.place-card').forEach((el) => {
      el.style.display = (pick === 'all' || el.getAttribute('data-cat') === pick) ? '' : 'none';
    });
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
    const cats = [];
    data.forEach((p) => { if (cats.indexOf(p.category) === -1) cats.push(p.category); });
    renderFilters(cats);
  } catch (err) {
    console.error('[TripOS] places load failed:', err.message || err);
    statusEl.textContent = 'Could not load places right now.';
  }
})();
