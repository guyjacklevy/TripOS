/* ─── Prevoya · spatial places browser (shared core) ──────────
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

/* 2c: graded category photo behind the glass (~22% presence — atmosphere,
   never subject). Both mounts sit one level deep, so ../shared works. */
export const catPhoto = (cat) => CAT[cat]
  ? '<span class="card-photo" aria-hidden="true"><img loading="lazy" alt="" ' +
    'src="../shared/img/cat-' + esc(cat) + '.webp" onerror="this.parentNode.remove()"></span>'
  : '';

export function mountPlaces(cfg) {
  const { els, places, plan, onCheckin, onGoogleSearch, onGoogleAdd, saves, stampedIds, onSave } = cfg;
  const allPlaces = places.slice();
  const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = { area: 'all', cat: 'all', q: '', view: 'rows' };
  /* view: 'rows' = Netflix category carousels · '<category>' = single-category see-all grid */
  let list = places;            // brief-sorted place list (matches float to top)
  const matchedMap = new Map(); // place → scoreBreakdown, matches only

  /* ── persona dot colours (2b): 6 filled hues + 2 ring dots, zero new tokens ── */
  const PERSONA_DOT = {
    surfer:   { c: 'var(--teal)',         ring: false },
    nomad:    { c: 'var(--cy)',           ring: false },
    foodie:   { c: 'var(--am)',           ring: false },
    party:    { c: 'var(--area-denpasar)', ring: false },
    luxury:   { c: 'var(--purple)',       ring: false },
    wellness: { c: 'var(--area-ubud)',    ring: false },
    family:   { c: 'var(--area-ubud)',    ring: true  },
    culture:  { c: 'var(--purple)',       ring: true  },
  };

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
    const personas = (p.personas || []).map((x) => {
      const d = PERSONA_DOT[x] || { c: 'var(--mut)', ring: false };
      return '<span class="persona-chip"><span class="pdot' + (d.ring ? ' ring' : '') +
        '" style="--pd:' + d.c + '"></span>' + esc(x) + '</span>';
    }).join('');
    const maps = p.maps_query
      ? '<a class="place-maps" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' +
        encodeURIComponent(p.maps_query) + '">Maps ↗</a>' : '';
    const here = onCheckin
      ? '<button type="button" class="place-maps place-here" data-place-id="' + esc(p.id) + '">📍 I’m here</button>'
      : '';
    const timing = p.timing_note
      ? '<div class="row"><span class="k">🕑</span><span>' + esc(p.timing_note) + '</span></div>' : '';
    const tip = p.tip ? '<p class="place-tip">' + esc(p.tip) + '</p>' : '';
    const searchHay = [p.name, p.area, cat.label, (p.personas || []).join(' '), (p.tags || []).join(' ')]
      .join(' ').toLowerCase();
    const disc = p.source === 'google'
      ? '<span class="disc-badge" title="Discovered via Google Maps — unverified">◔ discovered</span>' : '';
    return (
      '<article class="place-card" data-cat="' + esc(p.category) + '" data-region="' + esc(region(p.area)) +
        '" data-id="' + esc(p.id) + '" data-search="' + esc(searchHay) + '" style="--cc:' + cat.cc + '">' +
        catPhoto(p.category) +
        flagBtn(p) +
        (matched ? '<span class="match-badge">✦ ' + bd.pct + '% match</span>' : disc) +
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

  /* ── SAVED PLACES R1 (SAVED_PLACES_RULINGS): the save mark — an SVG flag,
     card top-right, 44px target, always visible. Saved+stamped = ✓ (R5).
     Renders only when the surface can persist (app mount passes onSave). ── */
  function flagBtn(p) {
    if (!onSave || !saves) return '';
    const id = String(p.id);
    const on = saves.has(id);
    const done = on && stampedIds && stampedIds.has(id);
    return '<button type="button" class="save-flag' + (on ? ' on' : '') + (done ? ' done' : '') +
      '" data-save="' + esc(id) + '" aria-label="' + (on ? 'saved — tap to remove' : 'save for later') + '">' +
      (done ? '<span class="sf-check">✓</span>'
        : '<svg width="16" height="16" aria-hidden="true"><use href="#icon-' + (on ? 'saved' : 'save') + '"/></svg>') +
      '</button>';
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

  /* ── compact carousel card (2a): name · area · 2-line why · match badge.
     Same data-* attrs + searchHay as the full card, so applyFilters treats
     mini and full cards identically. Cost/tip/timing/personas are cut. ── */
  function miniCard(p, bd) {
    const matched = !!bd;
    const cat = CAT[p.category] || { orb: 'planet-teal', cc: 'var(--teal)', icon: '📍', label: p.category };
    const here = onCheckin
      ? '<button type="button" class="place-maps place-here" data-place-id="' + esc(p.id) + '">📍 I’m here</button>'
      : '';
    const maps = p.maps_query
      ? '<a class="place-maps" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' +
        encodeURIComponent(p.maps_query) + '">Maps ↗</a>' : '';
    const searchHay = [p.name, p.area, cat.label, (p.personas || []).join(' '), (p.tags || []).join(' ')]
      .join(' ').toLowerCase();
    const disc = p.source === 'google'
      ? '<span class="disc-badge" title="Discovered via Google Maps — unverified">◔ discovered</span>' : '';
    return (
      '<article class="place-card poi-mini" data-cat="' + esc(p.category) + '" data-region="' + esc(region(p.area)) +
        '" data-id="' + esc(p.id) + '" data-search="' + esc(searchHay) + '" style="--cc:' + cat.cc + '">' +
        catPhoto(p.category) +
        flagBtn(p) +
        (matched ? '<span class="match-badge">✦ ' + bd.pct + '%</span>' : disc) +
        '<div class="place-top">' +
          '<span class="orb ' + cat.orb + '"></span>' +
          '<div>' +
            '<div class="place-name">' + esc(p.name) +
              (p.verified ? '<span class="place-verified" title="Verified">✓</span>' : '') + '</div>' +
            '<div class="poi-type">' + cat.icon + ' ' + esc(p.area) + '</div>' +
          '</div>' +
        '</div>' +
        (p.why ? '<p class="place-why mini-why">' + esc(p.why) + '</p>' : '') +
        '<div class="mini-foot">' + here + maps + '<span class="mini-more">more ›</span></div>' +
      '</article>'
    );
  }

  /* group brief-sorted list by category; matched categories float to top
     (by best in-category score), the rest by descending count */
  function catGroups() {
    const byCat = new Map();
    list.forEach((p) => { if (!byCat.has(p.category)) byCat.set(p.category, []); byCat.get(p.category).push(p); });
    const groups = [];
    byCat.forEach((cards, catKey) => {
      let matched = false, best = -1;
      cards.forEach((p) => { const bd = matchedMap.get(p); if (bd) { matched = true; if (bd.score > best) best = bd.score; } });
      groups.push({ cat: catKey, cards, count: cards.length, matched, best });
    });
    groups.sort((a, b) =>
      (a.matched === b.matched ? 0 : (a.matched ? -1 : 1)) ||
      (a.matched ? b.best - a.best : b.count - a.count));
    return groups;
  }

  /* §F layer 1: matched rows only — the full shelf arrives at first check-in
     or the day-2 open. Deep-links (focusPlace/focusArea) bypass the layer:
     a user who asks for more is never shown a gate. */
  let shelfUnlocked = cfg.fullShelf !== false;

  /* rows view — the category carousels ARE the categories (legend retired) */
  function renderRows() {
    let groups = catGroups();
    if (!shelfUnlocked) {
      const matchedOnly = groups.filter((g) => g.matched);
      if (matchedOnly.length) groups = matchedOnly; /* zero matches → full rows (never blank) */
    }
    /* Guy 2026-08-11: the search bar is ALWAYS visible — day 1 included.
       (§F amendment; Rachel pinged. Typing unlocks the full shelf below.) */
    if (els.search) els.search.hidden = false;
    /* ── SAVED PLACES R2: the bank is the FIRST row of Places — a rail, not
       a chip. Renders only when non-empty (absence is the empty state).
       Ordered area → recency. Counter real or absent. First-save caption
       rides the §F layer-cap pattern: dies on first interaction, forever. */
    let savedRow = '';
    if (onSave && saves && saves.size) {
      const savedPlaces = allPlaces
        .filter((p) => saves.has(String(p.id)))
        .sort((a, b) => {
          const ra = AREA_ORDER.indexOf(region(a.area)), rb = AREA_ORDER.indexOf(region(b.area));
          if (ra !== rb) return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
          const ta = (saves.get && saves.get(String(a.id))) || 0;
          const tb = (saves.get && saves.get(String(b.id))) || 0;
          return tb - ta;
        });
      if (savedPlaces.length) {
        const stampedN = stampedIds ? savedPlaces.filter((p) => stampedIds.has(String(p.id))).length : 0;
        let capSeen = true;
        try { capSeen = !!localStorage.getItem('tripos_cap_save1'); } catch (_) {}
        savedRow = (capSeen ? '' : '<p class="layer-cap" data-cap="save1">your shortlist · saves schedule themselves</p>') +
          '<div class="plb-row plb-saved" style="--cc:var(--teal)">' +
            '<header class="row-head">' +
              '<span class="row-dot"></span>' +
              '<span class="row-name"><svg width="12" height="12" aria-hidden="true"><use href="#icon-saved"/></svg> saved</span>' +
              '<span class="row-count">' + savedPlaces.length + '</span>' +
              (stampedN ? '<span class="row-matched">' + savedPlaces.length + ' saved · ' + stampedN + ' stamped</span>' : '') +
            '</header>' +
            '<div class="carousel">' + savedPlaces.map((p) => miniCard(p, matchedMap.get(p) || null)).join('') + '</div>' +
          '</div>';
      }
    }
    els.grid.innerHTML = '<div class="cat-rows">' + savedRow + groups.map((g) => {
      const meta = CAT[g.cat] || { cc: 'var(--teal)', label: g.cat };
      return '<div class="plb-row" data-cat="' + esc(g.cat) + '" style="--cc:' + meta.cc + '">' +
        '<header class="row-head">' +
          '<span class="row-dot"></span>' +
          '<span class="row-name">' + esc(meta.label) + '</span>' +
          '<span class="row-count">' + g.count + '</span>' +
          (g.matched ? '<span class="row-matched">✦ matched</span>' : '') +
          '<button type="button" class="row-all" data-cat="' + esc(g.cat) + '">see all →</button>' +
        '</header>' +
        '<div class="carousel">' + g.cards.map((p) => miniCard(p, matchedMap.get(p) || null)).join('') + '</div>' +
      '</div>';
    }).join('') + '</div>';
    dropIn(Array.from(els.grid.querySelectorAll('.place-card')));
    els.grid.querySelectorAll('.row-all').forEach((b) => {
      b.onclick = () => { state.view = b.getAttribute('data-cat'); renderCatGrid(state.view); applyFilters(false); };
    });
  }

  /* see-all view — full cards for a single category, with a back control.
     focusId (optional): scroll to + highlight that place's full card. */
  function renderCatGrid(catKey, focusId) {
    const meta = CAT[catKey] || { cc: 'var(--teal)', label: catKey };
    const cards = list.filter((p) => p.category === catKey);
    els.grid.innerHTML = '<div class="cat-detail">' +
      '<button type="button" class="row-back">← all categories</button>' +
      '<h3 class="cat-detail-h" style="--cc:' + meta.cc + '"><span class="row-dot"></span>' + esc(meta.label) + '</h3>' +
      '<div class="poi-grid">' + cards.map((p) => card(p, matchedMap.get(p) || null)).join('') + '</div>' +
    '</div>';
    dropIn(Array.from(els.grid.querySelectorAll('.place-card')));
    els.grid.querySelector('.row-back').onclick = () => { state.view = 'rows'; renderRows(); applyFilters(false); };
    if (focusId) {
      const el = els.grid.querySelector('.place-card[data-id="' + CSS.escape(String(focusId)) + '"]');
      if (el) {
        el.classList.add('just-added');
        requestAnimationFrame(() => el.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'center' }));
      }
    }
  }

  function applyFilters(animate) {
    const shown = [];
    const q = (state.q || '').trim().toLowerCase();
    els.grid.querySelectorAll('.place-card').forEach((el) => {
      const okArea = state.area === 'all' || el.getAttribute('data-region') === state.area;
      const okQ = !q || (el.getAttribute('data-search') || '').indexOf(q) !== -1;
      const show = okArea && okQ; /* no category filter — rows ARE the categories */
      el.style.display = show ? '' : 'none';
      if (show) shown.push(el);
    });
    /* collapse empty category rows + keep the row count honest */
    els.grid.querySelectorAll('.plb-row').forEach((row) => {
      let vis = 0;
      row.querySelectorAll('.place-card').forEach((c) => { if (c.style.display !== 'none') vis++; });
      row.style.display = vis ? '' : 'none';
      const cnt = row.querySelector('.row-count');
      if (cnt) cnt.textContent = vis;
    });
    if (animate) dropIn(shown);
    let empty = els.grid.parentNode.querySelector('.places-empty');
    if (!shown.length) {
      if (!empty) {
        empty = document.createElement('p');
        empty.className = 'places-status places-empty';
        els.grid.after(empty);
      }
      empty.textContent = q
        ? 'No curated match for “' + q + '”.'
        : 'Nothing in that area yet — try another.';
    } else if (empty) {
      empty.remove();
    }
    updateDiscover(shown.length);
    return shown.length;
  }

  /* ── Google-Maps fallback: only when the app supplies onGoogleSearch ── */
  function updateDiscover(localCount) {
    if (!els.discover || !onGoogleSearch) return;
    const q = (state.q || '').trim();
    if (q.length < 3) { els.discover.hidden = true; els.discover.innerHTML = ''; return; }
    els.discover.hidden = false;
    if (!els.discover.dataset.q || els.discover.dataset.q !== q) {
      els.discover.dataset.q = q;
      els.discover.innerHTML =
        '<button type="button" class="btn btn-primary disc-search">' +
        (localCount ? 'Not it? ' : '') + 'Search Google Maps for “' + esc(q) + '” →</button>' +
        '<div class="disc-results"></div>';
      els.discover.querySelector('.disc-search').onclick = runGoogleSearch;
    }
  }

  async function runGoogleSearch(e) {
    const btn = e.currentTarget;
    const q = (state.q || '').trim();
    const out = els.discover.querySelector('.disc-results');
    btn.disabled = true;
    out.innerHTML = '<p class="places-status">Searching Google Maps…</p>';
    let cands = [];
    try { cands = await onGoogleSearch(q); } catch (_) { cands = null; }
    btn.disabled = false;
    if (!cands) { out.innerHTML = '<p class="places-status">Couldn’t reach Google Maps right now.</p>'; return; }
    if (!cands.length) { out.innerHTML = '<p class="places-status">Google had nothing for that either.</p>'; return; }
    out.innerHTML = cands.map((c, i) =>
      '<div class="disc-card" data-i="' + i + '">' +
        '<div><div class="place-name">' + esc(c.name) + '</div>' +
          '<div class="poi-type">' + esc(c.area || 'Bali') + ' · ' + esc(c.category) +
            (c.rating ? ' · ★ ' + c.rating : '') + '</div></div>' +
        (c.already
          ? '<span class="disc-have">already in Prevoya</span>'
          : '<button type="button" class="place-maps disc-add">＋ Add</button>') +
      '</div>'
    ).join('');
    out.querySelectorAll('.disc-add').forEach((b) => {
      b.onclick = async () => {
        const c = cands[+b.closest('.disc-card').getAttribute('data-i')];
        b.disabled = true; b.textContent = 'adding…';
        let place = null;
        try { place = await onGoogleAdd(c); } catch (_) { place = null; }
        if (!place) { b.disabled = false; b.textContent = '⚠ retry'; return; }
        b.outerHTML = '<span class="disc-have">✓ added</span>';
        injectPlace(place);
      };
    });
  }

  /* drop a freshly-discovered place into its category row, highlighted */
  function injectPlace(place) {
    allPlaces.unshift(place);
    const bd = plan ? scoreBreakdown(place, plan) : null;
    if (bd && isMatch(bd.score)) matchedMap.set(place, bd);
    list = [place].concat(list.filter((p) => p.id !== place.id));
    state.view = 'rows';
    renderRows();
    applyFilters(false);
    const el = els.grid.querySelector('.place-card[data-id="' + CSS.escape(String(place.id)) + '"]');
    if (el) {
      el.classList.add('just-added');
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
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

  /* ── render ── */
  flyTo(8000, 1200);
  if (els.status) els.status.remove();

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

  renderRows();

  /* one delegated handler on the grid, survives every re-render:
     Maps links pass through · "I'm here" checks in · any other tap on a
     carousel card opens its category detail, scrolled to that place */
  els.grid.onclick = (e) => {
    if (e.target.closest('a')) return;
    /* R1: the flag toggles — optimistic, reverted on a failed write. A tap
       on the mark never opens the card (it's a mark, not the card). */
    const sf = e.target.closest('.save-flag');
    if (sf) {
      e.stopPropagation();
      if (!onSave || !saves) return;
      const id = sf.getAttribute('data-save');
      const p = allPlaces.find((x) => String(x.id) === id);
      if (!p) return;
      const wasOn = saves.has(id);
      if (wasOn) { saves.delete(id); } else { saves.set ? saves.set(id, Date.now()) : saves.add(id); }
      sf.classList.toggle('on', !wasOn);
      const use = sf.querySelector('use');
      if (use) use.setAttribute('href', '#icon-' + (wasOn ? 'save' : 'saved'));
      if (!wasOn && !REDUCED) { sf.classList.remove('sf-ping'); void sf.offsetWidth; sf.classList.add('sf-ping'); }
      if (state.view === 'rows') renderRows(); /* the rail reflects the bank live */
      Promise.resolve(onSave(p, !wasOn)).then((ok) => {
        if (ok !== false) return;
        if (wasOn) { saves.set ? saves.set(id, Date.now()) : saves.add(id); } else { saves.delete(id); }
        if (state.view === 'rows') renderRows();
      });
      return;
    }
    const btn = e.target.closest('.place-here');
    if (btn) {
      const p = allPlaces.find((x) => String(x.id) === btn.getAttribute('data-place-id'));
      if (p && onCheckin) onCheckin(p, btn);
      return;
    }
    const mini = e.target.closest('.poi-mini');
    if (mini) {
      state.view = mini.getAttribute('data-cat');
      renderCatGrid(state.view, mini.getAttribute('data-id'));
      applyFilters(false);
    }
  };

  const regions = [];
  places.forEach((p) => { const r = region(p.area); if (regions.indexOf(r) === -1) regions.push(r); });
  regions.sort((a, b) => {
    const ia = AREA_ORDER.indexOf(a), ib = AREA_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  buildAreaCards(regions);
  if (els.catBar) { els.catBar.innerHTML = ''; els.catBar.hidden = true; } /* legend retired — rows ARE the categories */

  /* §G · no-brief state: the full shelf, browsable, nothing locked or blurred
     — the blur-gate belongs to the funnel's teaser, not the library. One
     honest banner: matching switches on after the brief. */
  if (!plan && els.bannerHost) {
    const b = document.createElement('div');
    b.className = 'nobrief-banner';
    b.innerHTML = 'matching switches on after your brief · ';
    const chip = document.createElement(cfg.onBrief ? 'button' : 'a');
    chip.className = 'ck-reset';
    chip.textContent = 'answer 3 questions →';
    if (cfg.onBrief) { chip.type = 'button'; chip.onclick = () => cfg.onBrief(); }
    else chip.href = '/bali/plan/';
    b.appendChild(chip);
    els.bannerHost.insertAdjacentElement('beforebegin', b);
  }

  /* ── search input: instant local filter (debounced) ── */
  if (els.search) {
    let t = null;
    els.search.oninput = () => {
      clearTimeout(t);
      /* typing IS asking — the first keystroke unlocks the full shelf, or a
         day-1 search would silently miss every unrendered place (§F carve-out) */
      if (!shelfUnlocked && els.search.value.trim()) {
        shelfUnlocked = true;
        if (state.view === 'rows') renderRows();
      }
      t = setTimeout(() => { state.q = els.search.value; applyFilters(true); }, 180);
    };
  }

  /* ── public handle: deep-focus one place (Today timeline taps land HERE,
     on the exact card, not on an unrelated grid) ── */
  return {
    focusPlace(id) {
      shelfUnlocked = true; /* asked-for content is never gated (§F carve-out) */
      const p = allPlaces.find((x) => String(x.id) === String(id));
      if (!p) return;
      if (state.area !== 'all') {
        const allBtn = els.areaBar && els.areaBar.querySelector('.area-card[data-v="all"]');
        if (allBtn) allBtn.click(); /* an active area filter must never hide the target */
      }
      state.view = p.category;
      renderCatGrid(p.category, String(id));
      applyFilters(false);
    },
    /* build #5 (audit J3): Today's rail footers land here — category rows,
       pre-filtered to the day's area. Unknown area falls back to all. */
    focusArea(area) {
      shelfUnlocked = true; /* asked-for content is never gated (§F carve-out) */
      if (state.view !== 'rows') { state.view = 'rows'; renderRows(); }
      else renderRows();
      const cards = els.areaBar ? [...els.areaBar.querySelectorAll('.area-card')] : [];
      const hit = cards.find((b) => b.getAttribute('data-v') === String(area || ''))
        || cards.find((b) => b.getAttribute('data-v') === 'all');
      if (hit) hit.click(); else applyFilters(false);
    }
  };
}
