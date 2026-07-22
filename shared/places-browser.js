/* ─── TripOS · spatial places browser (shared core) ──────────
 * One browser, two mounts: the public /bali/places page and the
 * app's Places tab. Terrain area cards, altitude header, legend,
 * POI cards, match badges + float-to-top. The caller supplies the
 * places data, the plan (brief), and optionally an onCheckin
 * handler — when present, cards grow an "I'm here" action
 * (Layer 2 mechanics: data collection starts before display).
 * ──────────────────────────────────────────────────────────── */
import { scorePlace, scoreBreakdown, isMatch, VIBE_LABEL, TIER_LABEL, durLabel } from './match.js';

export const CAT = {
  beach:     { orb: 'planet-pink',   cc: 'var(--cat-beach)',    icon: '🏖', label: 'Beach' },
  food:      { orb: 'planet-amber',  cc: 'var(--cat-food)',     icon: '🍽', label: 'Food' },
  nightlife: { orb: 'planet-purple', cc: 'var(--cat-night)',    icon: '🎉', label: 'Nightlife' },
  work:      { orb: 'planet-blue',   cc: 'var(--cat-work)',     icon: '☕', label: 'Cafe + Work' },
  wellness:  { orb: 'planet-teal',   cc: 'var(--cat-wellness)', icon: '💆', label: 'Wellness' },
  explore:   { orb: 'planet-blue',   cc: 'var(--cat-explore)',  icon: '🗺', label: 'Explore' },
  gym:       { orb: 'planet-teal',   cc: 'var(--cat-gym)',      icon: '🏋️', label: 'Gym' }
};

export const AREA_META = {
  'All':      { key: '',         ac: 'var(--teal)',          tags: 'overview · curated · live',     alt: 8000 },
  'Uluwatu':  { key: 'uluwatu',  ac: 'var(--area-uluwatu)',  tags: 'cliffs · surf · sunsets',       alt: 2400 },
  'Canggu':   { key: 'canggu',   ac: 'var(--area-canggu)',   tags: 'surf · cafes · nomads',         alt: 2100 },
  'Ubud':     { key: 'ubud',     ac: 'var(--area-ubud)',     tags: 'jungle · yoga · stillness',     alt: 3800 },
  'Seminyak': { key: 'seminyak', ac: 'var(--area-seminyak)', tags: 'boutique · dining · nightlife', alt: 1800 },
  'Islands':  { key: 'islands',  ac: 'var(--area-islands)',  tags: 'penida · snorkel · mantas',     alt: 2600 },
  'Sanur':    { key: 'sanur',    ac: 'var(--area-sanur)',    tags: 'local · calm · beach',          alt: 1600 },
  'Denpasar': { key: 'denpasar', ac: 'var(--area-denpasar)', tags: 'real · local · city',           alt: 1400 }
};
const AREA_ORDER = ['Uluwatu', 'Canggu', 'Ubud', 'Seminyak', 'Sanur', 'Denpasar', 'Islands'];

const region = (area) => String(area || '').split('/')[0].trim();
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function mountPlaces(cfg) {
  const { els, places, plan, onCheckin } = cfg;
  const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = { area: 'all', cat: 'all' };

  /* ── altitude counter ── */
  let altCurrent = 35000;
  let altRAF = null;
  const fmtAlt = (n) => Math.round(n).toLocaleString('en-US') + ' ft';
  function flyTo(target, ms) {
    if (!els.alt) return;
    if (altRAF) cancelAnimationFrame(altRAF);
    if (REDUCED) { altCurrent = target; els.alt.textContent = fmtAlt(target); return; }
    const from = altCurrent;
    let t0 = null;
    const step = (ts) => {
      if (!t0) t0 = ts;
      const p = Math.min(1, (ts - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      altCurrent = from + (target - from) * eased;
      els.alt.textContent = fmtAlt(altCurrent);
      if (p < 1) altRAF = requestAnimationFrame(step);
    };
    altRAF = requestAnimationFrame(step);
  }

  /* ── POI card (bd = scoreBreakdown when this place matches the brief) ── */
  function card(p, bd) {
    const matched = !!bd;
    const cat = CAT[p.category] || { orb: 'planet-teal', cc: 'var(--teal)', icon: '📍', label: p.category };
    const personas = (p.personas || []).map((x) =>
      '<span class="persona-chip">' + esc(x) + '</span>').join('');
    const maps = p.maps_query
      ? '<a class="place-maps" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' +
        encodeURIComponent(p.maps_query) + '">Maps ↗</a>' : '';
    const here = onCheckin
      ? '<button type="button" class="place-maps place-here" data-place-id="' + esc(p.id) + '">📍 I’m here</button>'
      : '';
    const timing = p.timing_note
      ? '<div class="row"><span class="k">🕑</span><span>' + esc(p.timing_note) + '</span></div>' : '';
    const tip = p.tip ? '<p class="place-tip">' + esc(p.tip) + '</p>' : '';
    return (
      '<article class="place-card" data-cat="' + esc(p.category) + '" data-region="' + esc(region(p.area)) +
        '" style="--cc:' + cat.cc + '">' +
        (matched ? '<span class="match-badge">✦ ' + bd.pct + '% match</span>' : '') +
        '<div class="place-top">' +
          '<span class="orb ' + cat.orb + '"></span>' +
          '<div>' +
            '<div class="place-name">' + esc(p.name) +
              (p.verified ? '<span class="place-verified" title="Verified">✓</span>' : '') + '</div>' +
            '<div class="poi-type">' + cat.icon + ' ' + esc(p.area) + '</div>' +
          '</div>' +
        '</div>' +
        (matched && bd.reasons.length
          ? '<p class="match-why">matched on: ' + bd.reasons.slice(0, 4).map(esc).join(' · ') + '</p>'
          : '') +
        (personas ? '<div class="place-personas">' + personas + '</div>' : '') +
        (p.why ? '<p class="place-why">' + esc(p.why) + '</p>' : '') +
        '<div class="place-meta">' + timing + '</div>' +
        tip +
        '<div class="place-foot">' +
          '<span class="place-price">' + esc(p.price_note || '') + '</span>' +
          '<span class="pf-actions">' + here + maps + '</span>' +
        '</div>' +
      '</article>'
    );
  }

  function dropIn(cards) {
    if (REDUCED) return;
    cards.forEach((el, i) => {
      el.classList.remove('poi-drop');
      void el.offsetWidth;
      el.style.animationDelay = (i * 30) + 'ms';
      el.classList.add('poi-drop');
    });
  }

  function applyFilters(animate) {
    const shown = [];
    els.grid.querySelectorAll('.place-card').forEach((el) => {
      const okArea = state.area === 'all' || el.getAttribute('data-region') === state.area;
      const okCat = state.cat === 'all' || el.getAttribute('data-cat') === state.cat;
      const show = okArea && okCat;
      el.style.display = show ? '' : 'none';
      if (show) shown.push(el);
    });
    if (animate) dropIn(shown);
    let empty = els.grid.parentNode.querySelector('.places-empty');
    if (!shown.length) {
      if (!empty) {
        empty = document.createElement('p');
        empty.className = 'places-status places-empty';
        els.grid.after(empty);
      }
      empty.textContent = 'Nothing in that combo yet — try another filter.';
    } else if (empty) {
      empty.remove();
    }
  }

  function buildAreaCards(regions) {
    const entries = [['All', AREA_META['All']]].concat(
      regions.map((r) => [r, AREA_META[r] || { key: r.toLowerCase(), ac: 'var(--teal)', tags: 'curated · live', alt: 2500 }])
    );
    els.areaBar.innerHTML = entries.map(([name, m], i) =>
      '<button type="button" class="area-card' + (i === 0 ? ' on' : '') + '" data-v="' + esc(name === 'All' ? 'all' : name) +
        '" data-key="' + esc(m.key) + '" data-alt="' + m.alt + '" style="--ac:' + m.ac + '">' +
        '<span class="ac-name"><span class="ac-pin">✦</span>' + esc(name === 'All' ? 'All areas' : name) + '</span>' +
        '<span class="ac-tags">' + esc(m.tags) + '</span>' +
      '</button>'
    ).join('');
    /* onclick (not addEventListener) — remounts must not stack handlers */
    els.areaBar.onclick = (e) => {
      const btn = e.target.closest('.area-card');
      if (!btn) return;
      els.areaBar.querySelectorAll('.area-card').forEach((b) => b.classList.remove('on'));
      btn.classList.add('on');
      state.area = btn.getAttribute('data-v');
      document.body.setAttribute('data-area', btn.getAttribute('data-key'));
      if (els.coordArea) els.coordArea.textContent = (state.area === 'all' ? 'ALL AREAS' : state.area.toUpperCase());
      flyTo(parseInt(btn.getAttribute('data-alt'), 10) || 8000, 400);
      applyFilters(true);
    };
  }

  function buildLegend(cats) {
    const all = ['all'].concat(cats);
    els.catBar.innerHTML = all.map((c, i) => {
      const meta = c === 'all' ? { cc: 'var(--teal)', label: 'All types' } : (CAT[c] || { cc: 'var(--teal)', label: c });
      return '<button type="button" class="legend-pill' + (i === 0 ? ' on' : '') + '" data-v="' + esc(c) +
        '" style="--cc:' + meta.cc + '"><span class="legend-dot"></span>' + esc(meta.label) + '</button>';
    }).join('');
    els.catBar.onclick = (e) => {
      const btn = e.target.closest('.legend-pill');
      if (!btn) return;
      els.catBar.querySelectorAll('.legend-pill').forEach((b) => b.classList.remove('on'));
      btn.classList.add('on');
      state.cat = btn.getAttribute('data-v');
      applyFilters(true);
    };
  }

  /* ── render ── */
  flyTo(8000, 1200);
  if (els.status) els.status.remove();

  let list = places;
  const matchedMap = new Map(); /* place → scoreBreakdown */
  if (plan) {
    const order = new Map(places.map((p, i) => [p, i]));
    places.forEach((p) => {
      const bd = scoreBreakdown(p, plan);
      if (isMatch(bd.score)) matchedMap.set(p, bd);
    });
    if (matchedMap.size) {
      list = places.slice().sort((a, b) => {
        const am = matchedMap.has(a) ? matchedMap.get(a).score : -1;
        const bm = matchedMap.has(b) ? matchedMap.get(b).score : -1;
        return bm - am || order.get(a) - order.get(b);
      });
      if (els.bannerHost) {
        const banner = document.createElement('div');
        banner.className = 'match-banner';
        banner.innerHTML = '<span class="pulse-dot"></span>Matched to your brief · ' +
          esc(VIBE_LABEL[plan.vibe] || '') + ' · ' +
          (plan.dur != null ? esc(durLabel(+plan.dur)) + ' · ' : '') +
          esc(TIER_LABEL[plan.tier] || '') +
          '<span class="mb-note">your matches float to the top</span>';
        els.bannerHost.parentNode.insertBefore(banner, els.bannerHost);
      }
    }
  }

  els.grid.innerHTML = list.map((p) => card(p, matchedMap.get(p) || null)).join('');
  dropIn(Array.from(els.grid.querySelectorAll('.place-card')));

  if (onCheckin) {
    els.grid.onclick = (e) => {
      const btn = e.target.closest('.place-here');
      if (!btn) return;
      const p = places.find((x) => String(x.id) === btn.getAttribute('data-place-id'));
      if (p) onCheckin(p, btn);
    };
  }

  const regions = [];
  places.forEach((p) => { const r = region(p.area); if (regions.indexOf(r) === -1) regions.push(r); });
  regions.sort((a, b) => {
    const ia = AREA_ORDER.indexOf(a), ib = AREA_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  const cats = [];
  places.forEach((p) => { if (cats.indexOf(p.category) === -1) cats.push(p.category); });

  buildAreaCards(regions);
  buildLegend(cats);
}
