/* ─── Prevoya · the app (/app) — v3 slice 1 ────────────────────
 * Foundation: welcome (Google primary + email code fallback),
 * tab shell (Today/Places/Pulse/You, hash routing, runway light),
 * Stage 6 passenger record typed onto the boarding pass, and the
 * v2 data surfaces distributed into their tabs as interim content.
 * Spec: _agents/cto/APP_SPEC.md v3.2 — nothing here is improvised.
 * ──────────────────────────────────────────────────────────── */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  pickTop, isMatch, scorePlace, scoreBreakdown, readPlan, VIBE_LABEL, TIER_LABEL, HOME_AREA, durLabel, CAT_ICON,
  pickNow, pickUpcoming, whyNow, timeBlock, DAY_KEYS
} from './match.js';
import { mountCheckin } from './checkin.js';
import { mountPlaces, catPhoto } from './places-browser.js';

const cfg = window.TRIPOS_SUPABASE || {};
/* launch analytics: DB tables stay the source of truth (checkins, optins,
   via_*) — events cover only what they can't: funnel steps + share taps */
const track = (n, p) => { try { window.pvTrack && window.pvTrack(n, p); } catch (_) {} };
const $ = (id) => document.getElementById(id);

const welcome = $('welcome');
const record = $('record');
const shell = $('shell');
const checkinScreen = $('checkinScreen');
const corridorA = $('corridorA');
const ceremonyEl = $('ceremony');

const TIER_IDR = { back: 350, comf: 700, prem: 1500 };
const ANCHORS = [[300, 'beach club day'], [150, 'massage'], [35, 'warung meal']];
const CAT_META = {
  beach:     { orb: 'planet-pink',   cc: 'var(--cat-beach)' },
  food:      { orb: 'planet-amber',  cc: 'var(--cat-food)' },
  nightlife: { orb: 'planet-purple', cc: 'var(--cat-night)' },
  work:      { orb: 'planet-blue',   cc: 'var(--cat-work)' },
  wellness:  { orb: 'planet-teal',   cc: 'var(--cat-wellness)' },
  explore:   { orb: 'planet-blue',   cc: 'var(--cat-explore)' },
  gym:       { orb: 'planet-teal',   cc: 'var(--cat-gym)' }
};
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtK = (k) => (k >= 1000 ? (Math.round(k / 100) / 10) + 'M' : Math.round(k) + 'k');
const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* passenger line: "MR. G. LEVY" from title + full name */
function passengerLine(title, fullName) {
  const name = String(fullName || '').trim();
  if (!name) return null;
  const parts = name.split(/\s+/);
  const last = parts[parts.length - 1];
  const initial = parts.length > 1 ? parts[0][0] + '. ' : '';
  return ((title ? title + ' ' : '') + initial + last).toUpperCase();
}

/* ─── first-run boot captions (N4 — the tour is dead) ───
 * Each tab's instrument "powers on" once with a one-line mono caption,
 * dismissed forever by the first interaction with that tab. */
let placesCount = 52;
const BOOT_ANCHOR = {
  today: () => document.querySelector('#panel-today .today-head'),
  places: () => document.querySelector('#panel-places .coord-display'),
  pulse: () => document.querySelector('#panel-pulse .inst-strip'),
  you: () => document.querySelector('#panel-you .inst-strip')
};
const BOOT_TEXT = {
  today: () => 'your concierge · refreshes with the clock',
  places: () => 'your curated layer · ' + placesCount + ' spots',
  pulse: () => 'your fuel gauge · log in 5s',
  you: () => 'your flight prep · visa, gear, repacking'
};
function bootFlags() {
  try { return JSON.parse(localStorage.getItem('tripos_boot') || '{}'); } catch (_) { return {}; }
}
function maybeBootCaption(tab) {
  if (!BOOT_TEXT[tab]) return;
  const flags = bootFlags();
  if (flags[tab]) return;
  const anchor = BOOT_ANCHOR[tab]();
  if (!anchor || anchor.nextElementSibling && anchor.nextElementSibling.classList.contains('boot-caption')) return;
  const cap = document.createElement('p');
  cap.className = 'boot-caption';
  cap.textContent = '● ' + BOOT_TEXT[tab]();
  anchor.after(cap);
  const panel = $('panel-' + tab);
  panel.addEventListener('click', function dismiss() {
    try {
      const fresh = bootFlags();
      fresh[tab] = 1;
      localStorage.setItem('tripos_boot', JSON.stringify(fresh));
    } catch (_) {}
    cap.remove();
  }, { once: true });
}

/* ─── tab shell ─── */
const TABS = ['today', 'places', 'pulse', 'you'];
let activeTab = null;
function setTab(name, push) {
  if (TABS.indexOf(name) === -1) name = 'today';
  if (name === activeTab) return;
  activeTab = name;
  TABS.forEach((t) => {
    const panel = $('panel-' + t);
    if (panel) panel.classList.toggle('on', t === name);
  });
  const slots = document.querySelectorAll('.tab-slot');
  let idx = 0;
  slots.forEach((s, i) => {
    const on = s.getAttribute('data-tab') === name;
    s.classList.toggle('on', on);
    if (on) idx = i;
  });
  const runway = $('runway');
  if (runway) runway.style.transform = 'translateX(' + (idx * 100) + '%)';
  if (push !== false) {
    try { history.replaceState(null, '', '#' + name); } catch (_) {}
  }
  window.scrollTo(0, 0);
  maybeBootCaption(name);
}
$('tabBar').addEventListener('click', (e) => {
  const slot = e.target.closest('.tab-slot');
  if (slot) setTab(slot.getAttribute('data-tab'));
});
window.addEventListener('hashchange', () => setTab(location.hash.slice(1), false));
/* AI-1b: the strip's LEG chip jumps to the route instrument on You */
document.addEventListener('click', (e) => {
  if (e.target.closest('.leg-chip')) {
    setTab('you');
    const el = document.getElementById('youRoute');
    if (el && !el.hidden) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

/* ─── renders (pure — testable without a session) ─── */

function renderBrief(trip) {
  if (!trip || !trip.vibe) {
    $('briefLine').innerHTML = 'No brief yet — answer three questions and everything personalizes.';
    $('briefGrid').innerHTML = '';
    $('briefEdit').textContent = '✈ do the check-in — 30 seconds';
    return;
  }
  const d = trip.duration_days;
  const dailyK = TIER_IDR[trip.budget_tier] || 700;
  $('briefLine').textContent = 'Denpasar, Bali · ' + (d === 0 ? 'open-ended' : durLabel(d)) + ' · ' +
    (HOME_AREA[trip.vibe] || 'Bali') + ' base';
  $('briefGrid').innerHTML =
    '<div><span>Passenger</span><strong id="bpPassenger">—</strong></div>' +
    '<div><span>Class</span><strong>' + esc(VIBE_LABEL[trip.vibe] || '—') + '</strong></div>' +
    '<div><span>Duration</span><strong>' + esc(d === 0 ? 'Open-ended' : durLabel(d)) + '</strong></div>' +
    '<div><span>Budget / day</span><strong>' + fmtK(dailyK) + ' IDR</strong></div>' +
    '<div><span>Base</span><strong>' + esc(HOME_AREA[trip.vibe] || 'Bali') + '</strong></div>' +
    '<div><span>Tier</span><strong>' + esc(TIER_LABEL[trip.budget_tier] || '—') + '</strong></div>' +
    '<div><span>Day</span><strong id="bpDay">—</strong></div>' +
    '<div><span>Ready</span><strong id="bpReady">—</strong></div>';
  const area = (HOME_AREA[trip.vibe] || '').split(' ')[0].toLowerCase();
  if (area) document.body.setAttribute('data-area', area);
}

function setPassenger(title, fullName) {
  const line = passengerLine(title, fullName);
  const el = $('bpPassenger');
  if (el) el.textContent = line || '—';
}

function pickCard(p, matched, nowLine, plannedLead, railKey) {
  const meta = CAT_META[p.category] || { orb: 'planet-teal', cc: 'var(--teal)' };
  const icon = CAT_ICON[p.category] || '📍';
  const maps = p.maps_query
    ? '<a class="place-maps" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' +
      encodeURIComponent(p.maps_query) + '">Maps ↗</a>' : '';
  /* 1.3 (Guy): the plan's cards carry the SAME actions as Places — check-in
     is the whole point. 4: planned picks aren't set in stone — ↻ rotates
     through honest alternatives for that rail. */
  const here = '<button type="button" class="place-maps place-here" data-place-id="' + esc(p.id) + '">📍 I’m here</button>';
  /* build #5 (audit J3): swap is TEXT, everywhere — Guy couldn't see the icon
     affordance; visible-affordance rule applies */
  const swap = plannedLead && railKey
    ? '<button type="button" class="swap-chip pl-swap" data-swap-rail="' + esc(railKey) + '">↻ SWAP</button>' : '';
  let money = '';
  for (let m = 0; m < (p.price_level || 1); m++) money += '$';
  const badge = matched && matched.pct
    ? '✦ ' + matched.pct + '% match'
    : (matched ? '✦ your match' : null);
  return (
    '<article class="place-card now-tap' + (plannedLead ? ' planned-lead' : '') + '" data-place="' + esc(p.id) + '" style="--cc:' + meta.cc + '">' +
      catPhoto(p.category) + /* Guy: Today cards wear the same graded photos as Places */
      (badge ? '<span class="match-badge">' + badge + '</span>' : '') +
      '<div class="place-top"><span class="orb ' + meta.orb + '"></span><div>' +
        '<div class="place-name">' + esc(p.name) + (p.verified ? '<span class="place-verified">✓</span>' : '') + '</div>' +
        '<div class="poi-type">' + icon + ' ' + esc(p.area) + ' · <span class="price-sym">' + money + '</span></div>' +
      '</div></div>' +
      (nowLine ? '<p class="why-now">' + esc(nowLine) + '</p>' : '') +
      (p.why ? '<p class="place-why">' + esc(p.why) + '</p>' : '') +
      (p.tip ? '<p class="place-tip">' + esc(p.tip) + '</p>' : '') +
      '<div class="place-foot"><span class="place-price">' + esc(nowLine ? (p.price_note || '') : (p.timing_note || '')) + '</span>' +
        '<span class="pf-actions">' + here + swap + maps + '<span class="mini-more">more ›</span></span></div>' +
    '</article>'
  );
}

function dropIn(grid) {
  if (REDUCED) return;
  Array.from(grid.querySelectorAll('.place-card')).forEach((el, i) => {
    el.style.animationDelay = (i * 30) + 'ms';
    el.classList.add('poi-drop');
  });
}

const planFromTrip = (trip) => (trip && trip.vibe ? {
  vibe: trip.vibe, dur: String(trip.duration_days), tier: trip.budget_tier,
  vibe_detail: trip.vibe_detail || null, party: trip.party || null,
  party_detail: trip.party_detail || null, priorities: trip.priorities || []
} : null);

/* Bali runs on WITA (UTC+8, no DST). The app is a Bali destination brain,
   so the dial/timeline read Bali local time regardless of the device. */
function baliNow() {
  try { return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Makassar' })); }
  catch (_) { return new Date(); }
}

/* THE shared clock (WAVE3_GLOBE_SPEC §3 + TODAY_TIMELINE §2) — computed once,
   consumed by both the orbit dial and (next) the timeline. Never compute twice. */
const DAY_ABBR = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const PHASE_WORD = { dawn: 'DAWN', day: 'DAYLIGHT', golden: 'GOLDEN HOUR', dusk: 'DUSK', night: 'NIGHT' };
/* literal hex per phase — set inline so stroke/fill can actually fade (Rachel's table) */
const PHASE_COLOR = { dawn: '#ffb454', day: '#3dffd0', golden: '#ffb454', dusk: '#a78bfa', night: '#4cc9f0' };
function dayState(d) {
  const h = d.getHours(), m = d.getMinutes(), mins = h * 60 + m;
  let phase;
  if (mins >= 300 && mins < 480) phase = 'dawn';
  else if (mins >= 480 && mins < 960) phase = 'day';
  else if (mins >= 960 && mins < 1110) phase = 'golden';
  else if (mins >= 1110 && mins < 1230) phase = 'dusk';
  else phase = 'night';
  let rail;
  if (mins >= 300 && mins < 660) rail = 'morning';
  else if (mins >= 660 && mins < 960) rail = 'midday';
  else if (mins >= 960 && mins < 1140) rail = 'golden';
  else rail = 'night';
  /* terminator angle: --od-angle = mins/4 + CAL. CAL=30 puts the pin (φ≈120°,
     lower-right) at the terminator entering light at 06:00 and dark at 18:00;
     verified against noon (lit) and midnight (dark). */
  const angle = mins / 4 + 30;
  return { h, m, mins, day: d.getDay(), phase, rail, angle };
}

/* ONE day-of-trip number, used by both the Today strip and the boarding pass
   so they can never disagree (Rachel's note). Calendar-day diff (time-of-day
   ignored) against the shared clock `now`, not Date.now().
   Origin = trip.arrive (real landing day, slice 7) when set; else
   trip.created_at as the historical proxy. Can return ≤0 pre-arrival —
   tripDayLabel renders that as a T− countdown. */
function tripDayNumber(trip, now) {
  if (!trip) return null;
  let sMid;
  if (trip.arrive) {
    /* plain DATE 'YYYY-MM-DD' — parse components, never new Date(str) (UTC shift) */
    const p = String(trip.arrive).split('-');
    sMid = new Date(+p[0], +p[1] - 1, +p[2]);
  } else if (trip.created_at) {
    const s = new Date(trip.created_at);
    sMid = new Date(s.getFullYear(), s.getMonth(), s.getDate());
  } else return null;
  const nMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const n = Math.round((nMid - sMid) / 86400000) + 1;
  return trip.arrive ? n : Math.max(1, n); /* proxy origin can never be future */
}
function tripDayLabel(trip, now) {
  const n = tripDayNumber(trip, now);
  if (n == null) return null;
  if (n <= 0) return 'T−' + (1 - n); /* pre-arrival: launch-style countdown */
  return trip.duration_days ? 'DAY ' + n + '/' + trip.duration_days : 'DAY ' + n;
}

/* ─── AI-1 · ONE route state, computed next to dayState() (Rachel's rule):
   the Today strip, the route instrument, and the repack nudge all read this
   object — they can never disagree. <2 legs → null → every surface falls
   back to the classic single-base experience (never fake a route). ─── */
const AREA_TINT = {
  Canggu: 'var(--area-canggu)', Uluwatu: 'var(--area-uluwatu)', Ubud: 'var(--area-ubud)',
  Seminyak: 'var(--area-seminyak)', Sanur: 'var(--area-sanur)', Denpasar: 'var(--area-denpasar)',
  Islands: 'var(--area-islands)'
};

/* ─── THE LIVING MAP (LIVING_MAP_SPEC M1) — one abstract island, four homes:
   ceremony (animated trace) · route instrument (static, lived) · share card ·
   later the wrapped replay. Abstract-not-cartographic by charter. ─── */
const AREA_XY = {
  Canggu: [100, 128], Seminyak: [127, 144], Denpasar: [153, 131], Sanur: [172, 145],
  Ubud: [142, 105], Uluwatu: [156, 180], Islands: [229, 175]
};
const AREA_HEX = { /* canvas + SVG need literal colors — mirrors the CSS tokens */
  Canggu: '#3dffd0', Ubud: '#4ade80', Seminyak: '#ffb454', Uluwatu: '#a78bfa',
  Islands: '#4cc9f0', Sanur: '#4cc9f0', Denpasar: '#ff6b6b'
};
const ISLAND_PATH = 'M31,130 Q43,109 67,103 Q100,91 136,85 Q178,79 217,85 Q253,89.5 277,106 Q289,115 283,125.5 Q271,136 247,139 Q223,142 202,139 Q184,137.5 172,140.5 Q167.5,148 166,157 Q178,163 181,175 Q178,190 163,196 Q145,199 136,187 Q130,175 139,164.5 Q145,158.5 154,157 Q152.5,148 148,142 Q124,136 94,134.5 Q61,133 40,137.5 Q29.5,137.5 31,130 Z';

/* same bucketing the backend uses (places-search v6) — dots claim an AREA,
   never GPS precision (the island is abstract; pretending otherwise would lie) */
function latLngRegion(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (lng > 115.40) return 'Islands';
  if (lat < -8.75 && lng < 115.25) return 'Uluwatu';
  const C = { Canggu: [-8.66, 115.13], Uluwatu: [-8.82, 115.10], Ubud: [-8.51, 115.26],
    Seminyak: [-8.69, 115.17], Sanur: [-8.69, 115.26], Denpasar: [-8.65, 115.21] };
  let best = null, bestD = Infinity;
  Object.keys(C).forEach((n) => {
    const d = (lat - C[n][0]) ** 2 + (lng - C[n][1]) ** 2;
    if (d < bestD) { bestD = d; best = n; }
  });
  return bestD < 0.25 ? best : null;
}

/* the lived map: done legs solid, current bright + ringed, future dimmed;
   one dot per stamped place, area-bucketed with a deterministic offset */
function routeMapSVG(legs, checkins, curIdx) {
  const pts = legs.map((l) => AREA_XY[l.area] || [160, 150]);
  const seg = (a, b) => 'M' + a[0] + ',' + a[1] + ' L' + b[0] + ',' + b[1];
  let done = '', rest = '';
  for (let i = 0; i < pts.length - 1; i++) {
    if (curIdx >= 0 && i < curIdx) done += ' ' + seg(pts[i], pts[i + 1]);
    else rest += ' ' + seg(pts[i], pts[i + 1]);
  }
  const restOpacity = curIdx < 0 ? '0.7' : '0.35'; /* pre-arrival: the plan IS the story */
  const orbs = legs.map((l, i) => {
    const x = pts[i][0], y = pts[i][1];
    const hex = AREA_HEX[l.area] || '#3dffd0';
    const cur = i === curIdx;
    const dim = curIdx >= 0 && i > curIdx ? ' opacity="0.55"' : '';
    return '<circle cx="' + x + '" cy="' + y + '" r="' + (cur ? 6.5 : 5) + '" fill="' + hex + '"' + dim + '/>' +
      (cur ? '<circle cx="' + x + '" cy="' + y + '" r="9.5" fill="none" stroke="' + hex + '" stroke-width="1" opacity="0.6"/>' : '') +
      '<text x="' + (x + 10) + '" y="' + (y + 3) + '" fill="' + hex + '"' + dim + '>' + esc(l.area.toUpperCase()) + '</text>';
  }).join('');
  const seen = new Set();
  let dots = '';
  (checkins || []).forEach((c) => {
    const k = c.place_id ? String(c.place_id) : 'nm:' + (c.place_name || c.id);
    if (seen.has(k)) return;
    seen.add(k);
    const reg = latLngRegion(c.lat, c.lng);
    if (!reg || !AREA_XY[reg]) return;
    let h = 0;
    for (let i = 0; i < k.length; i++) h = ((h * 31) + k.charCodeAt(i)) >>> 0;
    const ang = (h % 360) * Math.PI / 180;
    const rad = 7 + ((h >> 4) % 8);
    dots += '<circle cx="' + (AREA_XY[reg][0] + Math.cos(ang) * rad).toFixed(1) +
      '" cy="' + (AREA_XY[reg][1] + Math.sin(ang) * rad).toFixed(1) + '" r="1.9" fill="#e8e8f0" opacity="0.85"/>';
  });
  return '<svg viewBox="0 0 320 260" width="100%" aria-hidden="true">' +
    '<path d="' + ISLAND_PATH + '" fill="none" stroke="var(--mut)" stroke-width="1.5" opacity="0.5"/>' +
    '<ellipse cx="229" cy="175" rx="12" ry="8.25" transform="rotate(-14 229 175)" fill="none" stroke="var(--mut)" stroke-width="1.2" opacity="0.5"/>' +
    (rest ? '<path d="' + rest.trim() + '" fill="none" stroke="var(--teal)" stroke-width="1.6" stroke-linecap="round" opacity="' + restOpacity + '"/>' : '') +
    (done ? '<path d="' + done.trim() + '" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round"/>' : '') +
    orbs + dots + '</svg>';
}
let TRIP_LEGS = []; /* loaded with the trip; single source for routeState callers */
function routeState(trip, legs, now) {
  if (!trip || !legs || legs.length < 2) return null;
  const total = legs.reduce((s, l) => s + (l.nights || 0), 0);
  const day = tripDayNumber(trip, now);
  const d = day == null ? 0 : day;
  let acc = 0, cur = null, next = null;
  legs.forEach((l, i) => {
    if (!cur && d > acc && d <= acc + l.nights) {
      cur = { area: l.area, nights: l.nights, why: l.why, idx: i, nightOf: d - acc };
      next = legs[i + 1] || null;
    }
    acc += l.nights;
  });
  return {
    legs, total, count: legs.length, cur, next,
    pre: d < 1,                                    /* T−n: route ahead, nothing started */
    over: d > total,                               /* open-ended tail past the route */
    lastDay: !!(cur && cur.nightOf === cur.nights),
    summary: (trip.route_summary || '').trim()
  };
}
/* AI-2.5 · deviation: the traveler moved by their own will. Today follows
   them; the route is never silently rewritten — it waits, visibly. Null =
   on-route. Picking the current leg's own area counts as returning. */
function offRoute(trip, rs) {
  const o = trip && trip.area_override;
  if (!o) return null;
  if (rs && rs.cur && rs.cur.area === o) return null;
  return o;
}
const inAreaRegion = (p, area) => {
  const r = String(p.area || '').split('/')[0].trim();
  if (area === 'Islands') return /penida|lembongan|islands|ceningan/i.test(r);
  return r.toLowerCase() === String(area).toLowerCase();
};

/* replan gate — v1 rule: routes freeze at arrival (days adapt later, AI-3).
   No arrive date = still planning = replan allowed. */
function canReplan(trip, now) {
  if (!trip) return false;
  if (!trip.arrive) return true;
  const p = String(trip.arrive).split('-');
  const aMid = new Date(+p[0], +p[1] - 1, +p[2]);
  const nMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return nMid <= aMid;
}

function updateStrip(trip, firstName, now) {
  const s = dayState(now);
  const hh = String(s.h).padStart(2, '0');
  const mm = String(s.m).padStart(2, '0');
  const base = trip && trip.vibe ? (HOME_AREA[trip.vibe] || 'Bali').split(' ')[0].toUpperCase() : 'BALI';
  const dayc = tripDayLabel(trip, now);
  /* S2.1: the day counter is the anchor jump — tap returns to the live day */
  $('todayStrip').innerHTML = DAY_ABBR[s.day] + ' · ' + hh + ':' + mm +
    (dayc ? ' · <button type="button" class="leg-chip" id="dayChip">' + esc(dayc) + '</button>' : '');
  const dChip = $('dayChip');
  if (dChip) dChip.onclick = () =>
    window.scrollTo({ top: 0, behavior: REDUCED_MOTION() ? 'auto' : 'smooth' });
  /* AI-1b: the leg is the base — the word BASE dies when a route exists.
     Leg-day counter stays OFF the strip (it lives on the route instrument). */
  const rs = routeState(trip, TRIP_LEGS, now);
  const ov = offRoute(trip, rs);
  if (ov) {
    /* REALITY FIRST S1.1: where you are is fact, unmarked — reality is not a
       deviation from anything. The plan demotes to the context line below.
       (OFF-ROUTE token retired per REALITY_FIRST_SURFACE_SPEC.) */
    $('todayStrip2').textContent = ov.toUpperCase() + ' · ' + PHASE_WORD[s.phase];
  } else if (rs && rs.cur) {
    const legChip = '<button type="button" class="leg-chip" data-goto="you">LEG ' +
      (rs.cur.idx + 1) + '/' + rs.count + '</button>';
    $('todayStrip2').innerHTML = rs.lastDay && rs.next
      ? esc(rs.cur.area.toUpperCase()) + ' · LAST DAY → ' + esc(rs.next.area.toUpperCase()) +
        ' · ' + PHASE_WORD[s.phase]
      : esc(rs.cur.area.toUpperCase()) + ' · ' + legChip + ' · ' + PHASE_WORD[s.phase];
  } else {
    $('todayStrip2').textContent = base + ' BASE · ' + PHASE_WORD[s.phase];
  }
  /* S1.1 · the context line — the plan, demoted to quiet fact. Renders ONLY
     when reality ≠ route; rejoining is silent (the line simply vanishes). */
  const ctx = $('todayStrip3');
  if (ctx) {
    if (ov && rs && rs.cur) {
      ctx.innerHTML = 'route says ' + esc(rs.cur.area.toLowerCase()) +
        ' · it can wait — <button type="button" class="ctx-replan" id="ctxReplan">or replan →</button>';
      ctx.hidden = false;
      const rb = $('ctxReplan');
      /* S1.3: self-service replan — opens the proposal regardless of the
         decline cooldown (asking never depends on being asked) */
      if (rb) rb.onclick = () => {
        maybeReflow({ force: true });
        const bub = $('reflowBubble');
        if (bub && !bub.hidden) requestAnimationFrame(() =>
          bub.scrollIntoView({ behavior: REDUCED_MOTION() ? 'auto' : 'smooth', block: 'center' }));
      };
    } else ctx.hidden = true;
  }
  /* greeting uses the RAIL word; the strip uses the PHASE word — 19:00 shows
     "Night" (rail) beside "DUSK" (phase). Intentional: two layers of one clock
     (Rachel). Do NOT reconcile them. */
  const blockWord = s.rail === 'morning' ? 'Morning' : s.rail === 'midday' ? 'Midday'
    : s.rail === 'golden' ? 'Golden hour' : 'Night';
  $('todayGreet').textContent = blockWord + (firstName ? ', ' + firstName : '') + '.';
  /* drive the orbit dial: phase → glow (CSS), literal colour (JS), terminator angle */
  const dial = $('orbitDial');
  if (dial) {
    dial.dataset.phase = s.phase;
    dial.style.setProperty('--od-angle', s.angle.toFixed(1) + 'deg');
    const c = PHASE_COLOR[s.phase];
    const rim = dial.querySelector('.od-rim');
    const pin = dial.querySelector('.od-pin');
    const ping = dial.querySelector('.od-ping');
    if (rim) rim.style.stroke = c;
    if (pin) { pin.style.fill = c; pin.style.filter = 'drop-shadow(0 0 4px ' + c + ')'; }
    if (ping) ping.style.stroke = c;
  }
}

/* ─── AI-1a · THE ROUTE INSTRUMENT (AI_ROUTE_SURFACES_SPEC §1) ───
   The flight-plan grammar at trip-zoom: vertical line, area-orb nodes in
   terrain tints, current leg lit, nights in mono with dot leaders.
   Not-an-airline checklist: nights not dates · names not codes · orbs not
   planes · no chevrons between legs · no prices · no booking language.
   <2 legs → instrument suppressed entirely (renders nothing). */
function renderRoute(trip, legs, now, opts) {
  const host = $('youRoute');
  if (!host) return;
  const rs = routeState(trip, legs, now);
  if (!rs) {
    /* §G: while a route is actually generating, the field says so — grey
       + scan sweep. Otherwise <2 legs suppresses the instrument entirely
       (classic app; an "awaiting" line for a 1-leg choice would be a lie). */
    if (trip && ROUTE_GENERATING) {
      host.hidden = false;
      host.innerHTML = '<div class="route-instr ri-awaiting">' +
        '<div class="scan-line"></div>' +
        '<div class="ri-head">ROUTE · awaiting your plan</div></div>';
    } else { host.hidden = true; host.innerHTML = ''; }
    return;
  }
  const o = opts || {};
  const d = tripDayNumber(trip, now) || 0;

  let acc = 0;
  const rows = rs.legs.map((l, i) => {
    const start = acc; acc += l.nights;
    const done = d > start + l.nights;
    const isCur = !!(rs.cur && rs.cur.idx === i);
    const state = done ? 'done' : isCur ? 'current' : 'planned';
    const nightsLbl = done ? l.nights + ' NIGHTS · DONE'
      : isCur ? 'NIGHT ' + rs.cur.nightOf + ' OF ' + l.nights
      : l.nights + ' NIGHTS';
    const why = (l.why || '').trim();
    /* whys missing = silence, never padding (spec §4) */
    const whyBlock = why
      ? '<div class="ri-why"' + (isCur ? '' : ' hidden') + '><p>' + esc(why) + '</p>' +
        '<button type="button" class="place-maps ri-places" data-area="' + esc(l.area) + '">→ places in ' +
        esc(l.area.toUpperCase()) + '</button></div>'
      : '';
    return '<div class="ri-leg ' + state + '" data-i="' + i + '" style="--at:' +
        (AREA_TINT[l.area] || 'var(--teal)') + '">' +
      '<span class="ri-orb"></span>' +
      '<button type="button" class="ri-row"' + (why ? '' : ' disabled') + '>' +
        '<span class="ri-name">' + esc(l.area.toUpperCase()) + '</span>' +
        '<span class="ri-dots"></span>' +
        '<span class="ri-n">' + nightsLbl + '</span>' +
        (why ? '<span class="ri-caret">' + (isCur ? '▴' : '▾') + '</span>' : '') +
      '</button>' +
      whyBlock +
    '</div>';
  });

  /* REALITY FIRST S1.1: the amber off-route line + BACK ON ROUTE retire —
     reality renders unmarked on Today and rejoining is silent (auto-anchor).
     The manual picker survives HERE only, demoted: the no-GPS fallback.
     Picking the current leg's own area clears the override (rejoin by hand). */
  const ov = offRoute(trip, rs);
  const overrideBlock =
    '<button type="button" class="ck-reset ri-else" id="riElse">set my area manually</button>' +
    '<div class="ri-areas" id="riAreas" hidden>' +
      Object.keys(AREA_TINT).map((a) =>
        '<button type="button" class="ri-area-chip" data-area="' + esc(a) + '" style="--at:' + AREA_TINT[a] + '">' + esc(a) + '</button>'
      ).join('') +
    '</div>';

  host.hidden = false;
  /* M1 · the living map comes home: static (trace motion stays ceremony-class),
     done legs solid, current ringed, the traveler's own stamps as marks */
  const mapCur = rs.cur ? rs.cur.idx : (rs.over ? rs.legs.length - 1 : -1);
  host.innerHTML =
    '<div class="route-instr">' +
      '<div class="ri-map">' + routeMapSVG(rs.legs, CHECKINS, mapCur) + '</div>' +
      '<div class="ri-head">YOUR ROUTE · <em>' + rs.total + '</em> NIGHTS · <em>' + rs.count + '</em> LEGS</div>' +
      (rs.summary ? '<p class="ri-summary">' + esc(rs.summary) + '</p>' : '') +
      '<div class="ri-legs">' + rows.join('') + '</div>' +
      '<div class="ri-foot">' +
        overrideBlock +
        (canReplan(trip, now)
          ? '<button type="button" class="ri-replan" id="riReplan">↻ REPLAN ROUTE</button>' +
            '<div class="ri-confirm" id="riConfirm" hidden>' +
              '<p>Your route regenerates from your brief — legs and picks may change.</p>' +
              '<button type="button" class="btn btn-primary ri-go" id="riGo">replan</button>' +
              '<button type="button" class="ck-reset" id="riKeep">keep</button>' +
            '</div>'
          : '<p class="ri-locked">route locked in flight · days adapt daily</p>') +
        /* §D: the deliberate share path — the card's permanent second home */
        (o.onShare ? '<button type="button" class="ri-replan" id="riShare">↗ SHARE ROUTE</button>' : '') +
      '</div>' +
    '</div>';

  /* reveal: existing drop-in keyframes, 90ms stagger per leg (spec §1.3) */
  if (o.reveal) {
    host.querySelectorAll('.ri-leg').forEach((el, i) => {
      el.style.animationDelay = (i * 90) + 'ms';
      el.classList.add('poi-drop');
    });
  }
  /* expand/collapse — the row is the tap target, the caret is the affordance */
  host.querySelectorAll('.ri-row').forEach((btn) => {
    btn.onclick = () => {
      const legEl = btn.closest('.ri-leg');
      const why = legEl.querySelector('.ri-why');
      if (!why) return;
      why.hidden = !why.hidden;
      const caret = btn.querySelector('.ri-caret');
      if (caret) caret.textContent = why.hidden ? '▾' : '▴';
    };
  });
  /* deep-link: Places filtered to the leg's area */
  host.querySelectorAll('.ri-places').forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      setTab('places');
      const card = document.querySelector('#appAreaBar .area-card[data-v="' + b.getAttribute('data-area') + '"]');
      if (card) card.click();
    };
  });
  if (o.onReplan) {
    const shareChip = $('riShare');
  if (shareChip && o.onShare) shareChip.onclick = () => o.onShare(shareChip);
  const chip = $('riReplan'), conf = $('riConfirm');
    if (chip) chip.onclick = () => { chip.hidden = true; conf.hidden = false; };
    const keep = $('riKeep'), go = $('riGo');
    if (keep) keep.onclick = () => { conf.hidden = true; chip.hidden = false; };
    if (go) go.onclick = o.onReplan;
  }
  if (o.onOverride) {
    const elseBtn = $('riElse'), areas = $('riAreas');
    if (elseBtn) elseBtn.onclick = () => { areas.hidden = !areas.hidden; };
    if (areas) areas.querySelectorAll('.ri-area-chip').forEach((b) => {
      b.onclick = () => {
        const a = b.getAttribute('data-area');
        /* choosing the leg's own area = rejoining the plan, by hand */
        o.onOverride(rs && rs.cur && a === rs.cur.area ? null : a);
      };
    });
  }
}

/* ═══ A1 · THE PASSPORT (ASSET_SURFACES_SPEC) ═══════════════════════
   Stamps are check-ins; pages are areas; visas are first entries.
   Object semantics, never skeuomorphism — glass, instrument ink,
   terrain tints. Real only; NO spend amounts anywhere in here.
   Banned by spec: completion %, streaks, gamification. */
let CHECKINS = [];        /* the user's check-in rows, chronological */
let SAVES = new Map();    /* saved places: curated_place_id → save-time ms (R2 recency) */
let SAVE_ROWS = new Map(); /* curated_place_id → places-table row id, for unsave */
let TRIP_DAY_PLANS = [];  /* [{leg_seq, day_in_leg, slots}] for planned-vs-actual */
let PP_VIEW = 'place';
let PP_CAT = 'all';
let PP_EDIT = false; /* 2.2: edit mode — only the explicit ✕ deletes a stamp */
let PP_COUNTED = false;   /* header count-up plays once per session */
const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/* deterministic per-place: rotation −3°…+3° and frame shape — stable across
   renders, no randomness in the render path (Rachel §0.1) */
function stampSeed(id) {
  let h = 0; const s = String(id || '');
  for (let i = 0; i < s.length; i++) h = ((h * 31) + s.charCodeAt(i)) >>> 0;
  return h;
}
function baliDateOf(iso) {
  const b = new Date(new Date(iso).getTime() + 8 * 3600e3);
  return { y: b.getUTCFullYear(), m: b.getUTCMonth(), d: b.getUTCDate() };
}
const dateLbl = (dd) => MONTH_ABBR[dd.m] + ' ' + dd.d;

function stampEl(ck, p, opts) {
  const o = opts || {};
  const seed = stampSeed(ck.place_id || ck.place_name);
  const rot = (((seed % 61) / 10) - 3).toFixed(1);
  const shape = ((seed >> 3) % 2) ? 'st-diamond' : 'st-circle';
  const areaName = p ? String(p.area || '').split('/')[0].trim() : 'Bali';
  const tint = AREA_TINT[areaName] || 'var(--teal)';
  const cc = p && CAT_META[p.category] ? CAT_META[p.category].cc : 'var(--teal)';
  const dd = baliDateOf(ck.created_at);
  const badge = p ? (p.verified ? '<span class="st-v">✓</span>'
    : (p.source === 'google' ? '<span class="st-v st-disc">◔</span>' : '')) : '';
  const count = (o.count || 0) > 1 ? '<span class="st-count">×' + o.count + '</span>' : '';
  const meta = o.meta ? '<span class="st-meta">' + o.meta + '</span>' : '';
  /* F9: the traveler's own worth-it tap echoes on the stamp — a button whose
     effect is never seen teaches users buttons here don't do anything */
  const worth = (o.worth || ck.worth_it) ? '<span class="st-meta st-worth">✓ worth it</span>' : '';
  /* R5: the intent-to-action pair — same grammar as "▸ planned · ✓ stamped" */
  const savedPair = (ck.place_id && SAVES.has(String(ck.place_id)))
    ? '<span class="st-meta">⚑ saved · ✓ stamped</span>' : '';
  const tap = !!p; /* rejected/vanished places render untappable, from the log alone */
  /* 2.1 (Guy): the stamp says WHAT the place is — category in words, not color alone */
  const catWord = p && p.category ? ' · ' + esc(p.category) : '';
  const delX = o.editable && o.ckId
    ? '<span class="st-x" data-ck="' + esc(o.ckId) + '" role="button" aria-label="remove stamp">✕</span>' : '';
  /* M3 §1: a raw stamp is private by default — the chip is the promotion
     door ("was this one of them?"). No chip, no path to a public surface. */
  const resolveChip = (!p && ck.id && ck.place_name)
    ? '<span class="st-meta st-resolve" data-ck="' + esc(ck.id) + '" role="button">◌ private · was this one of them? →</span>' : '';
  return '<' + (tap ? 'button type="button"' : 'div') +
    ' class="stamp ' + shape + (o.ceremony ? ' st-new' : '') + '"' +
    (tap ? ' data-place="' + esc(ck.place_id) + '"' : '') +
    ' style="--st:' + tint + ';--rot:' + rot + 'deg">' +
      delX + count +
      '<span class="st-dot" style="background:' + cc + '"></span>' +
      '<span class="st-name">' + esc(p ? p.name : (ck.place_name || '—')) + '</span>' +
      '<span class="st-date">' + dateLbl(dd) + catWord + ' ' + badge + '</span>' +
      worth + meta + savedPair + resolveChip +
    '</' + (tap ? 'button' : 'div') + '>';
}
function visaEl(area, firstIso) {
  const tint = AREA_TINT[area] || 'var(--teal)';
  const dd = baliDateOf(firstIso);
  return '<div class="visa" style="--st:' + tint + '">' +
    '<span class="visa-name">' + esc(area.toUpperCase()) + '</span>' +
    '<span class="visa-date">ENTRY · ' + dateLbl(dd) + '</span></div>';
}

function renderPassport(trip, places, opts) {
  const host = $('ppBody');
  if (!host) return;
  const o = opts || {};
  const resolve = (id) => (places || []).find((x) => String(x.id) === String(id)) || null;

  /* header counts — real, never padded */
  const ids = new Set(), areas = new Set();
  /* named-but-unmatched stamps are distinct places, not one "null" bucket */
  const placeKey = (c) => c.place_id ? String(c.place_id) : 'nm:' + (c.place_name || c.id);
  CHECKINS.forEach((c) => {
    ids.add(placeKey(c));
    const p = resolve(c.place_id);
    areas.add(p ? String(p.area || '').split('/')[0].trim() : 'Bali');
  });
  const head = $('ppHead');
  const counts = [[ids.size, 'PLACES'], [areas.size, 'AREAS'], [CHECKINS.length, 'STAMPS']];
  head.innerHTML = 'YOUR BALI · ' + counts.map(([n, l]) =>
    '<em data-n="' + n + '">' + (PP_COUNTED ? n : 0) + '</em> ' + l).join(' · ');
  if (!PP_COUNTED && CHECKINS.length && !REDUCED_MOTION()) {
    PP_COUNTED = true;
    head.querySelectorAll('em').forEach((el) => {
      const target = +el.getAttribute('data-n'); let t0 = null;
      const step = (ts) => {
        if (!t0) t0 = ts;
        const p = Math.min(1, (ts - t0) / 700);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    /* rAF can stall in background tabs — the numbers must land regardless */
    setTimeout(() => head.querySelectorAll('em').forEach((el) => { el.textContent = el.getAttribute('data-n'); }), 900);
  } else { PP_COUNTED = true; head.querySelectorAll('em').forEach((el) => { el.textContent = el.getAttribute('data-n'); }); }

  /* empty state: instrument at zero + ONE action (§5.4) */
  if (!CHECKINS.length) {
    $('ppToggle').hidden = true;
    $('ppFilter').innerHTML = '';
    host.innerHTML = '<p class="sec-context">No stamps yet — your first check-in starts the passport.</p>' +
      '<button type="button" class="btn btn-primary pp-start">Find where you are →</button>';
    host.querySelector('.pp-start').onclick = () => setTab('places');
    return;
  }
  $('ppToggle').hidden = false;

  if (PP_VIEW === 'place') {
    /* BY PLACE — the library: one stamp per place (×n revisits), pages = areas */
    const perPlace = new Map();
    CHECKINS.forEach((c) => {
      const k = placeKey(c);
      if (!perPlace.has(k)) perPlace.set(k, { ck: c, count: 0, worth: false });
      perPlace.get(k).count++;
      if (c.worth_it) perPlace.get(k).worth = true; /* F9: any visit worth it → the place echoes it */
    });
    const groups = new Map(); /* area → {first, items[]} */
    perPlace.forEach((v) => {
      const p = resolve(v.ck.place_id);
      if (PP_CAT !== 'all' && (!p || p.category !== PP_CAT)) return;
      const area = p ? String(p.area || '').split('/')[0].trim() : 'Bali';
      if (!groups.has(area)) groups.set(area, { first: v.ck.created_at, items: [] });
      const g = groups.get(area);
      if (v.ck.created_at < g.first) g.first = v.ck.created_at;
      g.items.push({ ...v, p });
    });
    /* category filter chips — persona-dot pattern, color only in the dot */
    const cats = [...new Set([...perPlace.values()].map((v) => (resolve(v.ck.place_id) || {}).category).filter(Boolean))];
    $('ppFilter').innerHTML = ['all'].concat(cats).map((c) =>
      '<button type="button" class="pp-cat' + (PP_CAT === c ? ' on' : '') + '" data-v="' + esc(c) + '">' +
      (c === 'all' ? 'all' : '<span class="pdot" style="--pd:' + ((CAT_META[c] || {}).cc || 'var(--teal)') + '"></span>' + esc(c)) +
      '</button>').join('');
    const ordered = [...groups.entries()].sort((a, b) => a[1].first < b[1].first ? -1 : 1);
    host.innerHTML = ordered.map(([area, g]) =>
      '<div class="pp-page">' +
        visaEl(area, g.first) +
        '<div class="stamp-grid">' +
          g.items.sort((a, b) => a.ck.created_at < b.ck.created_at ? -1 : 1)
            .map((it) => stampEl(it.ck, it.p, { count: it.count, worth: it.worth, ceremony: o.ceremony && String(it.ck.place_id) === String(o.ceremony) }))
            .join('') +
        '</div>' +
        '<button type="button" class="ck-reset pp-pulse">view in pulse →</button>' +
      '</div>').join('') ||
      '<p class="sec-context">Nothing in that category yet.</p>';
    host.querySelectorAll('.pp-pulse').forEach((b) => { b.onclick = () => setTab('pulse'); });
  } else {
    /* BY DAY — memory-zoom: the route grammar's third altitude */
    $('ppFilter').innerHTML = '';
    const now = baliNow();
    const dayN = tripDayNumber(trip, now) || 0;
    /* absolute day → (leg_seq, day_in_leg) for planned-vs-actual */
    const legOf = (d) => {
      let acc = 0;
      for (let i = 0; i < TRIP_LEGS.length; i++) {
        const l = TRIP_LEGS[i];
        if (d > acc && d <= acc + l.nights) return { seq: l.seq || (i + 1), dayInLeg: d - acc };
        acc += l.nights;
      }
      return null;
    };
    const planFor = (d) => {
      const lg = legOf(d); if (!lg) return [];
      const row = TRIP_DAY_PLANS.find((r) => r.leg_seq === lg.seq && r.day_in_leg === lg.dayInLeg);
      return (row && row.slots) || [];
    };
    /* origin midnight for date labels */
    let origin;
    if (trip && trip.arrive) { const p = String(trip.arrive).split('-'); origin = new Date(+p[0], +p[1] - 1, +p[2]); }
    else if (trip && trip.created_at) { const c = new Date(trip.created_at); origin = new Date(c.getFullYear(), c.getMonth(), c.getDate()); }
    else origin = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const rows = [];
    /* the asset never hides real history: check-ins logged BEFORE day 1
       (earlier stays, or an arrive date set later) render as PRE-TRIP days —
       stamped days only, no empty padding outside the trip window */
    const preMap = new Map();
    CHECKINS.forEach((c) => {
      const b = baliDateOf(c.created_at);
      if (new Date(b.y, b.m, b.d) < origin) {
        const k = b.y + '-' + b.m + '-' + b.d;
        if (!preMap.has(k)) preMap.set(k, { dd: b, cks: [] });
        preMap.get(k).cks.push(c);
      }
    });
    [...preMap.values()]
      .sort((a, b) => (a.dd.y - b.dd.y) || (a.dd.m - b.dd.m) || (a.dd.d - b.dd.d))
      .forEach((g) => {
        const iso = g.dd.y + '-' + String(g.dd.m + 1).padStart(2, '0') + '-' + String(g.dd.d).padStart(2, '0');
        rows.push('<div class="pp-day"><span class="pp-day-label">' +
          dateLbl(g.dd) + ' · PRE-TRIP' +
          '<button type="button" class="pp-day-add" data-date="' + iso + '" aria-label="stamp this day">+</button></span>' +
          '<div class="stamp-grid">' +
          g.cks.map((c) => stampEl(c, resolve(c.place_id), {})).join('') +
          '</div></div>');
      });
    for (let d = 1; d <= Math.max(1, dayN); d++) {
      const dd = new Date(origin.getFullYear(), origin.getMonth(), origin.getDate() + (d - 1));
      const key = dd.getFullYear() + '-' + dd.getMonth() + '-' + dd.getDate();
      const dayCks = CHECKINS.filter((c) => {
        const b = baliDateOf(c.created_at);
        return (b.y + '-' + b.m + '-' + b.d) === key;
      });
      const planned = planFor(d);
      const stampedIds = new Set(dayCks.map((c) => String(c.place_id)));
      const label = MONTH_ABBR[dd.getMonth()] + ' ' + dd.getDate() + ' · DAY ' + d;
      const dayIso = dd.getFullYear() + '-' + String(dd.getMonth() + 1).padStart(2, '0') + '-' + String(dd.getDate()).padStart(2, '0');
      const addBtn = '<button type="button" class="pp-day-add" data-date="' + dayIso + '" aria-label="stamp this day">+</button>';
      if (!dayCks.length && !planned.length) {
        rows.push('<div class="pp-day dim"><span class="pp-day-label">' + label + ' · no stamps' + addBtn + '</span></div>');
        continue;
      }
      const stamps = dayCks.map((c) => {
        const p = resolve(c.place_id);
        const wasPlanned = planned.some((s) => String(s.place_id) === String(c.place_id));
        return stampEl(c, p, { meta: wasPlanned ? '▸ planned · ✓ stamped' : null,
          ceremony: o.ceremony && String(c.place_id) === String(o.ceremony),
          editable: PP_EDIT, ckId: c.id });
      }).join('');
      /* planned-but-missed: dim ghost rows, BY DAY only, never on the share page */
      const ghosts = (d < dayN ? planned : []).filter((s) => !stampedIds.has(String(s.place_id)))
        .map((s) => {
          const p = resolve(s.place_id);
          return p ? '<div class="pp-ghost">▸ ' + esc(p.name) + ' · planned · passed</div>' : '';
        }).join('');
      rows.push('<div class="pp-day"><span class="pp-day-label">' + label + addBtn + '</span>' +
        (stamps ? '<div class="stamp-grid">' + stamps + '</div>' : '') + ghosts + '</div>');
    }
    host.innerHTML = '<div class="pp-days">' + rows.join('') + '</div>';
  }

  /* §H day-7: a mark in a logbook, not a debt — the latest completed week,
     counts real, no ceremony. Leads the passport (nearest stable home to
     "under the most recent stamp" across both views). */
  const wkDone = Math.floor(((tripDayNumber(trip, baliNow()) || 0) - 1) / 7);
  if (wkDone >= 1 && CHECKINS.length) {
    const wl = document.createElement('p');
    wl.className = 'pp-week-line';
    wl.textContent = 'week ' + wkDone + ' complete · ' + CHECKINS.length + ' stamp' + (CHECKINS.length === 1 ? '' : 's');
    host.insertAdjacentElement('afterbegin', wl);
  }

  /* F5: deterministic milestone → one quiet earned line under the new stamp —
     in EITHER view. If a filter hides the ceremony stamp, the line leads the
     passport instead: an earned moment never fails silently (Guy's phone). */
  if (o.milestone && o.ceremony) {
    const n = document.createElement('button');
    n.type = 'button';
    n.className = 'ck-reset pp-share-nudge';
    n.textContent = '↗ share your passport';
    const st = host.querySelector('.st-new');
    if (st) st.insertAdjacentElement('afterend', n);
    else host.insertAdjacentElement('afterbegin', n);
  }
}
function REDUCED_MOTION() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ─── the flight plan (WAVE3_TODAY_TIMELINE_SPEC) ───
   Four rails on one route line, aligned to dayState's rails. Current rail =
   full POI cards (the old NOW cards) + a you-are-here tick; future rails =
   slot cards; past rails collapse. Empty rails invite. */
const RAILS = [
  { key: 'morning', label: 'MORNING',     hours: '05–11',   start: 300, end: 660 },
  { key: 'midday',  label: 'MIDDAY',      hours: '11–16',   start: 660, end: 960 },
  { key: 'golden',  label: 'GOLDEN HOUR', hours: '16–19',   start: 960, end: 1140 },
  { key: 'night',   label: 'NIGHT',       hours: '19–LATE', start: 1140, end: 1740 }
];
const BLOCK_RAIL = { morning: 'morning', afternoon: 'midday', sunset: 'golden', evening: 'night', night: 'night' };
const BLOCK_ORDER = { morning: 0, afternoon: 1, sunset: 2, evening: 3, night: 4 };
function primaryRail(p) {
  const bt = (p.best_time || []).slice().sort((a, b) => (BLOCK_ORDER[a] ?? 9) - (BLOCK_ORDER[b] ?? 9));
  return bt.length ? BLOCK_RAIL[bt[0]] : null;
}
/* brief-relevant picks for a rail, topped up with verified spots so a rail is
   rarely empty; category-diverse; returns [] only if the rail truly has nothing */
function railPicks(places, plan, railKey, n) {
  const inRail = places.filter((p) => primaryRail(p) === railKey);
  const scored = inRail
    .map((p) => ({ p, s: plan ? scorePlace(p, plan) : (p.verified ? 3 : 0) }))
    .sort((a, b) => b.s - a.s);
  const out = [];
  const cats = {};
  for (const x of scored) {
    if (out.length >= n) break;
    if (x.s < 0) continue;
    if (cats[x.p.category]) continue;
    cats[x.p.category] = true;
    out.push(x.p);
  }
  return { picks: out, total: scored.filter((x) => x.s >= 3).length || inRail.length };
}
function slotCard(p, planned, railKey) {
  const meta = CAT_META[p.category] || { cc: 'var(--teal)' };
  return '<a class="slot-card' + (planned ? ' is-planned' : '') + '" href="#places" data-place="' + esc(p.id) + '" style="--cc:' + meta.cc + '">' +
    '<span class="slot-dot"></span>' +
    '<span class="slot-name">' + esc(p.name) + (p.verified ? ' ✓' : '') + '</span>' +
    (planned ? '<span class="slot-planned">' + (DAY_PLAN_OFFROUTE ? '▸ pick · off-route' : '▸ pick') + '</span>' : '') +
    '<span class="slot-hint">' + esc(p.area.split('/')[0].trim()) + '</span>' +
    (planned && railKey ? '<button type="button" class="swap-chip slot-swap" data-swap-rail="' + esc(railKey) + '">↻ SWAP</button>' : '') +
  '</a>';
}
function railInvite(rail) {
  return '<a class="rail-invite" href="#places">no picks this block · browse ' +
    rail.label.toLowerCase() + ' spots →</a>';
}

/* AI-2a: today's day-plan slots — [{rail, place_id, why}] for the current
   (leg, day), set by the IIFE's loadDayPlan(). null = no plan = classic rails.
   The plan augments the rails; it never fakes one. */
let DAY_PLAN = null;
/* AI-3: an adjusted day (concierge replied to the traveler's situation).
   Adjusted plans render even off-route — they were made FOR where you are. */
let DAY_PLAN_ADJUSTED = false;
/* F1 (UX audit): an off-route day plan — generated FOR the override area
   (leg_seq 0 rows). The concierge follows you; suppression was right,
   silence was the break. */
let DAY_PLAN_OFFROUTE = false;
let OFFDAY_GENERATING = false;
let DAYS_GENERATING = false; /* F7: leg-plan generation in flight → scan row */
let ROUTE_GENERATING = false; /* §G: route generation in flight → You field says so */
let CONCIERGE_DOWN = false;  /* §G: engine unreachable → honest amber line on Today */
let TL_KEEP_SCROLL = false;  /* one-shot: next renderToday keeps scroll position */
let CX_NOTE = null;

/* ─── §F · progressive disclosure — layers gate BROWSING CHROME, never
   options (the explorability carve-out: deep-links always open the full
   data). Derived from data only; captions dismiss forever on first
   interaction (localStorage — cosmetic, not a gate). ─── */
const LAYERS = { today: true, places: true, pulse: true }; /* true = full (layer 2) */
function baliDateKey(iso) {
  const b = new Date(new Date(iso).getTime() + 8 * 3600e3);
  return b.getUTCFullYear() + '-' + (b.getUTCMonth() + 1) + '-' + b.getUTCDate();
}
function isDay2Plus(firstOpenAt, now) {
  if (!firstOpenAt) return true; /* pre-corridor accounts were backfilled — full app */
  return baliDateKey(firstOpenAt) !== baliDateKey(now.toISOString());
}
function capSeen(key) { try { return !!localStorage.getItem('tripos_cap_' + key); } catch (_) { return true; } }
function capMark(key) { try { localStorage.setItem('tripos_cap_' + key, '1'); } catch (_) {} }
function layerCap(key, text) {
  if (capSeen(key)) return '';
  return '<p class="layer-cap" data-cap="' + esc(key) + '">' + esc(text) + '</p>';
}

function renderToday(trip, firstName, places, dateOpt) {
  const now = dateOpt || baliNow();
  updateStrip(trip, firstName, now);
  if (!places || !places.length) return;
  const plan = planFromTrip(trip);
  const s = dayState(now);
  const currentIdx = RAILS.findIndex((r) => r.key === s.rail);
  const postMidnight = s.mins < 300; /* 00:00–04:59, still the NIGHT rail */

  /* AI-2.5: off-route → the leg's day plan doesn't apply (it was planned for
     an area you're not in) and picks localize to where you actually are —
     falling back to the full pool rather than ever rendering empty rails */
  const ov = offRoute(trip, routeState(trip, TRIP_LEGS, now));
  let pool = places;
  if (ov) {
    const local = places.filter((p) => inAreaRegion(p, ov));
    if (local.length >= 4) pool = local;
  }

  /* resolve planned slots to real place rows (id must exist in our data —
     engine guarantees it, but the client never trusts blindly). Adjusted
     plans (AI-3) and off-route plans (F1) render off-route — both were
     made for where you actually are. */
  const plannedByRail = {};
  if (!ov || DAY_PLAN_ADJUSTED || DAY_PLAN_OFFROUTE) (DAY_PLAN || []).forEach((sl) => {
    const p = places.find((x) => String(x.id) === String(sl.place_id));
    if (p && !plannedByRail[sl.rail]) plannedByRail[sl.rail] = { p, why: (sl.why || '').trim() };
  });

  /* the concierge input shows only when there's a day to adjust */
  const cxForm = $('cxForm');
  if (cxForm) cxForm.hidden = !(routeState(trip, TRIP_LEGS, now) || {}).cur;

  let html = '';
  RAILS.forEach((r, i) => {
    const state = r.key === s.rail ? 'current'
      : postMidnight ? 'future'
      : (i < currentIdx ? 'past' : 'future');
    /* §F layer 1: NOW cards + the current rail only — the full four-rail day
       arrives on the day-2 open (browsing chrome gated, never options) */
    if (!LAYERS.today && state !== 'current') return;
    const planned = plannedByRail[r.key] || null;
    let { picks, total } = railPicks(pool, plan, r.key, 3);
    if (planned) {
      picks = picks.filter((p) => String(p.id) !== String(planned.p.id));
      total = Math.max(total, picks.length + 1);
    }
    /* build #5: a rail with a pick links onward — the menu must be FELT */
    const moreArea = ov || (routeState(trip, TRIP_LEGS, now) || { cur: null }).cur;
    const moreLink = planned
      ? '<a class="rail-more" href="#places" data-area="' +
        esc(ov || (moreArea && moreArea.area) || '') + '">more ' +
        r.label.toLowerCase() + ' options →</a>'
      : '';

    if (state === 'past') {
      html += '<div class="rail past" data-rail="' + r.key + '">' +
        '<button type="button" class="rail-head-past">' + r.hours + ' · ' + r.label +
        ' · passed · ' + total + ' pick' + (total === 1 ? '' : 's') + '</button>' +
        '<div class="rail-body" hidden></div></div>';
      return;
    }

    html += '<div class="rail ' + state + '" data-rail="' + r.key + '">' +
      '<div class="rail-node"></div>' +
      '<div class="rail-head">' + r.hours + ' · ' + r.label + '</div>';

    if (state === 'current') {
      /* you-are-here tick, positioned proportionally within the block */
      let nowAdj = s.mins;
      if (r.key === 'night' && s.mins < 300) nowAdj = s.mins + 1440;
      const p = Math.min(1, Math.max(0, (nowAdj - r.start) / (r.end - r.start)));
      const hh = String(s.h).padStart(2, '0'), mm = String(s.m).padStart(2, '0');
      const labelP = Math.min(80, Math.max(20, p * 100)); /* the tick is truth; the label stays on-screen */
      html += '<div class="tl-now"><div class="tl-now-bar"><span class="tl-now-tick" style="left:' +
        (p * 100).toFixed(1) + '%"></span></div>' +
        '<span class="tl-now-label" style="left:' + labelP.toFixed(1) + '%">' + hh + ':' + mm + ' · you are here</span></div>';
      /* the planned pick leads the rail; NOW suggestions follow (deduped) */
      const cards = [];
      if (planned) {
        /* ▸ is the engine's own voice (Rachel's AI-2 pass §1): the terminal
           plans in ▸ lines, the rails carry the same mark. planned-lead is the
           only card that ever overrides the category accent. */
        /* build #5: PLANNED → PICK — a pick is an opinion held confidently;
           it invites agreement or a swap. "Planned" closes the question. */
        cards.push(pickCard(planned.p, plan && isMatch(scorePlace(planned.p, plan)) ? scoreBreakdown(planned.p, plan) : null,
          (DAY_PLAN_OFFROUTE ? '▸ PICK · off-route — ' : '▸ PICK — ') + (planned.why || 'on today’s plan'), true, r.key));
      }
      /* F7: generation gets a visible moment — the quiet scan row, never a
         terminal (that's a funnel ceremony; the rails get the hum) */
      if (!planned && (OFFDAY_GENERATING || DAYS_GENERATING)) {
        cards.unshift('<div class="rail-scan"><div class="scan-line"></div>' +
          '<span>▸ planning your ' + esc((ov || (moreArea && moreArea.area) || 'bali').toLowerCase()) + ' day…</span></div>');
      }
      const nowPicks = (plan ? pickNow(pool, plan, now, 3) : [])
        .filter((pp) => !planned || String(pp.id) !== String(planned.p.id));
      const rest = nowPicks.length
        ? nowPicks.map((pp) => pickCard(pp, scoreBreakdown(pp, plan), '◉ NOW — ' + (whyNow(pp, now) || 'your kind of place')))
        : picks.map((pp) => pickCard(pp, plan && isMatch(scorePlace(pp, plan)) ? scoreBreakdown(pp, plan) : null, null));
      /* build #5: min-two-alternatives — one alternative reads as a formality,
         two reads as a choice (pick+1 → pick+2) */
      cards.push(...rest.slice(0, 2));
      html += '<div class="rail-cards">' + (cards.join('') || railInvite(r)) + '</div>' + moreLink;
    } else {
      /* future: planned slot leads, two suggestions beside it (build #5) */
      const shown = picks.slice(0, 2);
      const slots = (planned ? [slotCard(planned.p, true, r.key)] : []).concat(shown.map((pp) => slotCard(pp)));
      html += slots.length
        ? '<div class="rail-slots">' + slots.join('') +
          (planned ? '' : (total > slots.length ? '<a class="slot-more" href="#places">+ ' + (total - slots.length) + ' more →</a>' : '')) + '</div>' + moreLink
        : railInvite(r);
    }
    html += '</div>';
  });

  const tl = $('timeline');
  /* AI-3: the concierge's reply leads the adjusted day */
  if (CX_NOTE) html = '<p class="cx-reply">◦ ' + esc(CX_NOTE) + '</p>' + html;
  /* F1: the state change announces itself ON the surface it changes — one
     amber instrument line, back-affordance in the line (Rachel's copy) */
  if (CONCIERGE_DOWN && !DAY_PLAN) {
    /* §G engine-down: verified picks keep working; the silence is explained */
    html = '<div class="offroute-line"><span>concierge offline · showing verified picks</span></div>' + html;
  }
  /* §F: the unlock caption — one mono line, dismissed forever on first tap */
  /* S1.2 · choice as the frame: one mono micro-label reframes the rails as
     PROPOSAL — "today's offer" when a plan applies, the humbler "if you want
     ideas" on self-directed days. Same components either way: the
     instruments never care whether the concierge was consulted. */
  const anchorArea = ov || ((routeState(trip, TRIP_LEGS, now) || {}).cur || {}).area || null;
  const hasPlanToday = Object.keys(plannedByRail).length > 0;
  if (anchorArea) {
    html = '<p class="offer-label">' + (hasPlanToday ? 'today’s offer' : 'if you want ideas') +
      ' · ' + esc(String(anchorArea).toLowerCase()) + '</p>' + html;
  }
  /* the freedom line lives in the composer placeholder, ambient (S1.2) */
  const cxInp = $('cxInput');
  if (cxInp) cxInp.placeholder = hasPlanToday
    ? 'rain? tired? plans changed? — tell me'
    : 'your day, your call — I’m here.';
  if (LAYERS.today) html = layerCap('today2', 'your full day — four rails, morning to night') + html;
  tl.innerHTML = html;
  dropIn(tl);
  /* past rails expand on tap (dimmed, no lift) */
  tl.querySelectorAll('.rail-head-past').forEach((btn) => {
    btn.onclick = () => {
      const body = btn.nextElementSibling;
      if (body.dataset.loaded !== '1') {
        const key = btn.closest('.rail').getAttribute('data-rail');
        const rk = RAILS.find((r) => r.key === key);
        body.innerHTML = railPicks(pool, plan, key, 2).picks.map((pp) => slotCard(pp)).join('') || railInvite(rk);
        body.dataset.loaded = '1';
      }
      body.hidden = !body.hidden;
      btn.closest('.rail').classList.toggle('open', !body.hidden);
    };
  });
  /* auto-scroll the current rail into the top third (once per render) —
     suppressed for in-place re-renders like swap (Guy: the screen jumped) */
  const cur = tl.querySelector('.rail.current');
  if (TL_KEEP_SCROLL) { TL_KEEP_SCROLL = false; }
  else if (cur && dateOpt === undefined) {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    cur.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  }
  renderItinerary(); /* S2: the days ahead render beneath the live day */
  maybeReflow();     /* S1.3: the concierge may propose — never commands */
}

/* S2 hook — implemented inside the signed-in closure (needs sb/user);
   a no-op until boot assigns it, so fixtures and early paints stay safe */
let renderItinerary = () => {};

/* ═══ S1.3 · divergence detection (module-pure) ═══
   ≥2 consecutive Bali days of live check-ins in one region ≠ the current
   leg's area (ATLAS A2). Today without a check-in yet doesn't break a
   streak that ended yesterday. */
function divergence(t) {
  const rs = routeState(t, TRIP_LEGS, baliNow());
  if (!rs || !rs.cur) return null;
  const legArea = rs.cur.area;
  const dayReg = {};
  CHECKINS.forEach((c) => {
    const r = latLngRegion(c.lat, c.lng);
    if (!r) return;
    const b = baliDateOf(c.created_at);
    dayReg[b.y + '-' + b.m + '-' + b.d] = r; /* the day's last located check-in wins */
  });
  const now = baliNow();
  let region = null, streak = 0;
  for (let i = 0; i < 14; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const k = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
    const r = dayReg[k];
    if (!r) { if (i === 0) continue; break; }
    if (r === legArea) break;
    if (region && r !== region) break;
    region = r; streak++;
  }
  return region && streak >= 2 ? { region, streak } : null;
}
let maybeReflow = () => {}; /* closure-implemented, like renderItinerary */

function renderPulse(dailyK, spentK, tripDay) {
  const leftK = Math.max(0, dailyK - spentK);
  $('pulseSpent').textContent = fmtK(spentK);
  $('pulseBudget').textContent = fmtK(dailyK) + ' IDR';
  $('pulseLeft').textContent = fmtK(leftK) + ' IDR';
  const pct = Math.min(100, Math.round((spentK / dailyK) * 100));
  $('pulseFill').style.width = pct + '%';
  $('pulseFill').style.background = pct >= 100
    ? 'linear-gradient(90deg, rgba(255,107,107,0.5), var(--rd))' : '';
  /* §G zero-state: the plan is the content until spending exists — the daily
     line is a real tier-derived number, never a blank gauge */
  if (spentK === 0) {
    $('pulseNote').textContent = (tripDay && tripDay > 0 ? 'day ' + tripDay + ' · ' : '') +
      'nothing logged yet · your daily line is ' + fmtK(dailyK) + ' IDR';
    return;
  }
  if (spentK >= dailyK) {
    $('pulseNote').textContent = 'Over today’s line — tomorrow resets the runway.';
  } else {
    const bits = ANCHORS.map(([k, label]) => [Math.floor(leftK / k), label])
      .filter(([n]) => n >= 1).slice(0, 2)
      .map(([n, label]) => '≈ ' + n + '× ' + label);
    $('pulseNote').textContent = bits.length
      ? 'Still on the table today: ' + bits.join(' · ')
      : 'Tight day — a warung run might have to wait for tomorrow.';
  }
  /* 1.2 (Guy): the Today fuel strip is gone — money lives in Pulse only */
}

/* pace: days elapsed vs budget consumed, bar-per-day, month projection */
function renderPace(dailyK, monthRows, now) {
  const day = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const perDay = new Array(daysInMonth).fill(0);
  let monthK = 0;
  (monthRows || []).forEach((r) => {
    const d = new Date(r.spent_at);
    const k = (r.amount_idr || 0) / 1000;
    monthK += k;
    if (d.getMonth() === now.getMonth()) perDay[d.getDate() - 1] += k;
  });
  const budgetToDateK = dailyK * day;
  const deltaDays = (budgetToDateK - monthK) / dailyK;
  const proj = day > 0 ? (monthK / day) * daysInMonth : 0;

  $('paceSpent').textContent = fmtK(monthK) + ' IDR';
  $('paceBudget').textContent = fmtK(budgetToDateK) + ' IDR';
  $('paceProj').textContent = monthK > 0 ? fmtK(proj) + ' IDR' : '—';

  const del = $('paceDelta');
  if (!monthK) {
    del.textContent = 'no spends yet';
    del.className = 'pace-delta';
    $('paceNote').textContent = 'The strip fills as you log — every bar is a day.';
  } else if (deltaDays >= 0.5) {
    del.textContent = '≈ ' + (Math.round(deltaDays * 10) / 10) + ' days ahead';
    del.className = 'pace-delta good';
    $('paceNote').textContent = 'Under pace — the island can keep you longer.';
  } else if (deltaDays <= -0.5) {
    del.textContent = '≈ ' + (Math.round(-deltaDays * 10) / 10) + ' days behind';
    del.className = 'pace-delta bad';
    $('paceNote').textContent = 'Over pace — a few warung days pull it back.';
  } else {
    del.textContent = 'on pace';
    del.className = 'pace-delta good';
    $('paceNote').textContent = 'Right on the line. Clean flying.';
  }

  const maxK = Math.max(dailyK * 1.5, ...perDay);
  $('dayStrip').innerHTML = perDay.map((k, i) => {
    const dayN = i + 1;
    if (dayN > day) return '<span class="day-bar future"></span>';
    const h = k > 0 ? Math.max(4, Math.round((k / maxK) * 44)) : 2;
    const cls = k > dailyK ? 'over' : (k > 0 ? 'ok' : 'zero');
    const today = dayN === day ? ' today' : '';
    return '<span class="day-bar ' + cls + today + '" style="height:' + h + 'px"></span>';
  }).join('');
}

/* category breakdown, planet-orb colors */
const EXP_CAT_COLOR = {
  food: 'var(--am)', transport: 'var(--cy)', wellness: 'var(--teal)',
  nightlife: 'var(--purple)', accommodation: 'var(--rd)', admin: 'var(--mut)'
};
function renderCats(monthRows) {
  const sums = {};
  let total = 0;
  (monthRows || []).forEach((r) => {
    const k = (r.amount_idr || 0) / 1000;
    sums[r.category || 'other'] = (sums[r.category || 'other'] || 0) + k;
    total += k;
  });
  const entries = Object.entries(sums).sort((a, b) => b[1] - a[1]);
  $('catBars').innerHTML = entries.length
    ? entries.map(([cat, k]) => {
        const pct = total ? Math.round((k / total) * 100) : 0;
        const cc = EXP_CAT_COLOR[cat] || 'var(--teal)';
        return '<div class="cat-row">' +
          '<span class="cat-name">' + esc(cat) + '</span>' +
          '<span class="cat-track"><span class="cat-fill" style="width:' + pct + '%;background:' + cc + '"></span></span>' +
          '<span class="cat-amt">' + fmtK(k) + '</span>' +
        '</div>';
      }).join('')
    : '<p class="pulse-note" style="margin:0">Your first warung run goes here.</p>';
}

/* recent spends — last 10 this month, ✕ to delete */
function renderRecent(monthRows) {
  const rows = (monthRows || []).slice(0, 10);
  $('spendList').innerHTML = rows.length
    ? rows.map((r) => {
        const d = new Date(r.spent_at);
        const when = d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' · ' +
          d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return '<li data-id="' + esc(r.id || '') + '">' +
          '<span class="sl-cat">' + esc(r.category || '—') + '</span>' +
          '<span class="sl-amt">' + fmtK((r.amount_idr || 0) / 1000) + '</span>' +
          '<span class="sl-time">' + when + '</span>' +
          (r.id ? '<button type="button" class="sl-del" aria-label="Delete">✕</button>' : '') +
        '</li>';
      }).join('')
    : '<li class="sl-empty">Nothing logged yet — the presets above take 2 seconds.</li>';
}

/* ─── screens ─── */
function show(which) {
  welcome.hidden = which !== 'welcome';
  record.hidden = which !== 'record';
  shell.hidden = which !== 'shell';
  checkinScreen.hidden = which !== 'checkin';
  if (corridorA) corridorA.hidden = which !== 'corridorA';
  if (ceremonyEl) ceremonyEl.hidden = which !== 'ceremony';
}

window.__appDebug = {
  LAYERS,
  show, setTab, renderBrief, renderPulse, renderPace, renderCats,
  renderRecent, renderToday, setPassenger, passengerLine, mountPlaces,
  updateStrip, dayState, baliNow, tripDayNumber, tripDayLabel,
  routeState, renderRoute, canReplan,
  injectDayPlan: (slots) => { DAY_PLAN = slots || null; },
  injectAdjust: (reply, slots) => { CX_NOTE = reply || null; if (slots) DAY_PLAN = slots; DAY_PLAN_ADJUSTED = true; },
  /* preview: drive the F1 off-route matrix — plan / generating / fallback */
  injectOffDay: (slots, generating) => {
    DAY_PLAN = slots || null; DAY_PLAN_OFFROUTE = !!slots;
    OFFDAY_GENERATING = !!generating; DAY_PLAN_ADJUSTED = false; CX_NOTE = null;
  },
  injectPassport: (trip, places, checkins, dayPlans, opts) => {
    CHECKINS = checkins || []; TRIP_DAY_PLANS = dayPlans || [];
    renderPassport(trip, places || [], opts || {});
  },
  /* preview: inject a route without a session — strip + instrument + nudge */
  injectRoute: (t, legs, opts) => {
    TRIP_LEGS = legs || [];
    renderRoute(t, TRIP_LEGS, baliNow(), opts || {});
    updateStrip(t, '', baliNow());
  }
};

/* ─── live wiring ─── */
if (!cfg.url || cfg.url.indexOf('YOUR_') !== -1) {
  show('welcome');
  $('welcomeStatus').textContent = 'Supabase is not configured.';
} else {
  const sb = createClient(cfg.url, cfg.anonKey);
  let user = null;
  let profile = null;
  let trip = null;
  let dailyK = 700;
  let pendingEmail = '';
  let freshLogin = false;

  const firstName = () => {
    const n = profile && profile.full_name ? profile.full_name.trim().split(/\s+/)[0] : '';
    return n || '';
  };
  /* T3 (Guy's call): the concierge greets with title + name on Today */
  const greetName = () => {
    const f = firstName();
    if (!f) return '';
    return profile && profile.title ? profile.title + ' ' + f : f;
  };

  /* N1: the instrument runs — clock ticks every minute, grids refresh
     when the time-block flips (morning → midday → golden hour → night) */
  let todayCtx = null;
  let clockTimer = null;
  let lastBlock = null;
  function startClock() {
    if (clockTimer) return;
    lastBlock = timeBlock(baliNow().getHours());
    let lastDayNum = trip ? tripDayNumber(trip, baliNow()) : null;
    clockTimer = setInterval(() => {
      if (!todayCtx) return;
      const now = baliNow();
      updateStrip(todayCtx.trip, todayCtx.name, now);
      paintNudge(); /* last-day repack nudge flips at midnight with the leg */
      /* midnight: a new trip day = possibly a new leg day-plan */
      const dn = tripDayNumber(todayCtx.trip, now);
      if (dn !== lastDayNum) {
        lastDayNum = dn;
        loadDayPlan().then(() => renderToday(todayCtx.trip, todayCtx.name, todayCtx.places, baliNow()));
      }
      const block = timeBlock(now.getHours());
      if (block !== lastBlock) {
        lastBlock = block;
        renderToday(todayCtx.trip, todayCtx.name, todayCtx.places, now);
      }
    }, 60000);
  }

  const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const startOfMonth = () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; };

  async function loadPulse() {
    const { data, error } = await sb.from('expenses')
      .select('id, amount_idr, category, spent_at')
      .gte('spent_at', startOfMonth().toISOString())
      .order('spent_at', { ascending: false });
    if (error) { console.error('[Prevoya] expenses load failed:', error.message); return; }
    const rows = data || [];
    const t0 = startOfToday().getTime();
    const todayK = rows.reduce((s, r) =>
      s + (new Date(r.spent_at).getTime() >= t0 ? (r.amount_idr || 0) : 0), 0) / 1000;
    renderPulse(dailyK, todayK, tripDayNumber(trip, baliNow()));
    renderPace(dailyK, rows, new Date());
    renderCats(rows);
    renderRecent(rows);
    /* §F: Pulse's layer 2 (pace math, categories, recent, preset editing)
       arrives with the 3rd logged expense — until then the gauge + daily
       line + one-tap log ARE the screen */
    LAYERS.pulse = rows.length >= 3;
    document.querySelectorAll('.pace-card, .cat-card, .recent-card').forEach((el) => { el.hidden = !LAYERS.pulse; });
    const pe = $('presetEditBtn');
    if (pe) pe.hidden = !LAYERS.pulse;
    if (LAYERS.pulse && !capSeen('pulse2')) {
      const pc = document.querySelector('.pace-card');
      if (pc) pc.insertAdjacentHTML('beforebegin', layerCap('pulse2', 'your pace — the month, projected'));
    }
  }

  /* tap ✕ on a recent spend → gone (RLS guarantees it's your own row) */
  $('spendList').addEventListener('click', async (e) => {
    const btn = e.target.closest('.sl-del');
    if (!btn) return;
    const li = btn.closest('li');
    const id = li && li.getAttribute('data-id');
    if (!id) return;
    li.style.opacity = '0.4';
    const { error } = await sb.from('expenses').delete().eq('id', id);
    if (error) { console.error('[Prevoya] delete failed:', error.message); li.style.opacity = ''; return; }
    loadPulse();
  });

  /* PU3: typing 150000 must never become 150M — big numbers are read as full IDR */
  function normalizeK(raw) {
    const n = parseInt(raw, 10);
    if (!(n > 0)) return { k: 0 };
    if (n >= 10000) return { k: Math.round(n / 1000), corrected: true };
    return { k: n };
  }

  async function logSpend(amtK, cat, dateStr) {
    if (!user || !(amtK > 0)) return;
    $('logStatus').textContent = 'Logging…';
    const row = {
      user_id: user.id, trip_id: trip && trip.id ? trip.id : null,
      amount_idr: Math.round(amtK * 1000), category: cat
    };
    /* PU4: retro-dated spends land at midday of the chosen day */
    if (dateStr) {
      const today = new Date().toISOString().slice(0, 10);
      if (dateStr !== today) row.spent_at = new Date(dateStr + 'T12:00:00').toISOString();
    }
    const { error } = await sb.from('expenses').insert(row);
    $('logStatus').textContent = error ? '⚠ ' + error.message : '✓ logged ' + fmtK(amtK);
    if (!error) { setTimeout(() => { $('logStatus').textContent = ''; }, 1600); loadPulse(); }
  }

  /* PU2: quick-log presets — yours, editable */
  const DEFAULT_PRESETS = [
    { label: '🍜 Warung', amt: 35, cat: 'food' },
    { label: '☕ Coffee', amt: 30, cat: 'food' },
    { label: '🛵 Bike', amt: 50, cat: 'transport' },
    { label: '💆 Massage', amt: 150, cat: 'wellness' },
    { label: '🏖 Beach club', amt: 300, cat: 'nightlife' }
  ];
  let presetEdit = false;
  const getPresets = () =>
    (profile && Array.isArray(profile.presets) && profile.presets.length) ? profile.presets : DEFAULT_PRESETS;
  function renderPresets() {
    $('quickLog').innerHTML = getPresets().map((p, i) =>
      '<button type="button" class="chip chip-btn' + (presetEdit ? ' editing' : '') +
        '" data-i="' + i + '" data-amt="' + p.amt + '" data-cat="' + esc(p.cat) + '">' +
        esc(p.label) + ' ' + fmtK(p.amt) +
        (presetEdit ? '<span class="chip-x" aria-label="remove">✕</span>' : '') +
      '</button>'
    ).join('');
    $('presetAdd').hidden = !presetEdit;
    $('presetHint').hidden = !presetEdit;
    $('presetEditBtn').textContent = presetEdit ? '✓ done' : '✎ edit';
  }
  async function savePresets(next) {
    profile.presets = next;
    renderPresets();
    const { error } = await sb.from('profiles').update({ presets: next }).eq('id', user.id);
    if (error) console.error('[Prevoya] presets save failed:', error.message);
  }

  /* Layer 2 mechanics, dark: "I'm here" writes a check-in row.
     No display yet — the data compounds until thresholds are met. */
  const SPEND_EST = { 1: 50, 2: 150, 3: 300, 4: 600 };            /* k IDR by price level */
  const EXP_FROM_PLACE = {                                          /* place cat → expense cat */
    food: 'food', work: 'food', nightlife: 'nightlife', beach: 'nightlife',
    wellness: 'wellness', gym: 'wellness', explore: 'transport'
  };
  async function checkinAt(p, btn) {
    if (!user) return;
    btn.disabled = true;
    btn.textContent = '✓ checked in';
    const { data: ckRow, error } = await sb.from('checkins').insert({
      user_id: user.id, place_id: p.id, place_name: p.name, lat: p.lat, lng: p.lng
    }).select().single();
    if (error) {
      console.error('[Prevoya] check-in failed:', error.message);
      btn.textContent = '⚠ didn’t save — tap to retry';
      btn.disabled = false;
      return;
    }
    setTimeout(() => { btn.textContent = '📍 I’m here'; btn.disabled = false; }, 2600);
    /* A1: the stamp ceremony — the check-in lands in the passport live */
    CHECKINS.push(ckRow || { user_id: user.id, place_id: p.id, place_name: p.name, lat: p.lat, lng: p.lng, created_at: new Date().toISOString() });
    autoAnchor(); /* REALITY FIRST: a live check-in is the strongest signal — Today follows it now */
    /* F5: pride moments are deterministic — first stamp in an area, every
       10th trip-wide. Never random, never nagging. */
    let milestone = false;
    if (todayCtx) {
      /* Guy's phone: the checked-in place may be newer than todayCtx.places
         (discovery adds mid-session) — its area comes from p ITSELF, never
         a pool lookup that can miss */
      const a = String(p.area || '').split('/')[0].trim() || null;
      const areaOf = (pid) => {
        const pl = todayCtx.places.find((x) => String(x.id) === String(pid));
        return pl ? String(pl.area || '').split('/')[0].trim() : null;
      };
      const inArea = a ? CHECKINS.filter((c) =>
        String(c.place_id) === String(p.id) ? true : areaOf(c.place_id) === a).length : 0;
      milestone = inArea === 1 || (CHECKINS.length > 0 && CHECKINS.length % 10 === 0);
    }
    if (todayCtx) renderPassport(todayCtx.trip, todayCtx.places, { ceremony: p.id, milestone });
    /* R5: a stamp at a saved place — the flag on the card becomes the ✓,
       quietly (no toast, no confetti; the story format is the reward) */
    const cardEl = btn.closest('.place-card');
    if (cardEl && p.id && SAVES.has(String(p.id))) {
      const sf = cardEl.querySelector('.save-flag.on');
      if (sf) { sf.classList.add('done'); sf.innerHTML = '<span class="sf-check">✓</span>'; }
    }
    /* T7: the v19 loop — checked in? offer the typical spend, one tap to log */
    const card = btn.closest('.place-card');
    if (card && !card.querySelector('.spend-suggest')) {
      const estK = SPEND_EST[p.price_level || 1];
      const cat = EXP_FROM_PLACE[p.category] || 'food';
      const sug = document.createElement('div');
      sug.className = 'spend-suggest';
      /* 3 (Guy): the estimate is a starting point, not the price — editable
         before logging, still one tap when the guess is right */
      sug.innerHTML = '<span class="ss-editwrap"><input class="auth-input ss-amt" inputmode="numeric" value="' + estK + '"><span class="ss-k">k IDR</span></span>' +
        '<button type="button" class="place-maps ss-log">＋ log</button>' +
        '<button type="button" class="place-maps ss-worth">worth it</button>' +
        '<button type="button" class="ck-reset ss-skip">skip</button>';
      card.appendChild(sug);
      /* A2: the 1-tap micro-signal (S2) — was it worth going? */
      sug.querySelector('.ss-worth').addEventListener('click', async (ev) => {
        const b = ev.currentTarget;
        b.disabled = true;
        if (ckRow && ckRow.id) {
          const { error: we } = await sb.from('checkins').update({ worth_it: true }).eq('id', ckRow.id);
          b.textContent = we ? '⚠ retry' : '✓ noted';
          if (we) b.disabled = false;
          else {
            ckRow.worth_it = true;
            /* F9: the echo is immediate — the stamp shows it right away */
            if (todayCtx) renderPassport(todayCtx.trip, todayCtx.places);
          }
        } else b.textContent = '✓ noted';
      });
      sug.querySelector('.ss-log').addEventListener('click', async () => {
        let v = parseInt(sug.querySelector('.ss-amt').value, 10);
        if (!Number.isFinite(v) || v <= 0) v = estK;
        if (v >= 10000) v = Math.round(v / 1000); /* typed full IDR — read as thousands */
        sug.innerHTML = '<span class="ss-done">…</span>';
        await logSpend(v, cat);
        sug.innerHTML = '<span class="ss-done">✓ ' + fmtK(v) + ' logged to your pulse</span>';
        setTimeout(() => sug.remove(), 3000);
      });
      sug.querySelector('.ss-skip').addEventListener('click', () => sug.remove());
      /* Guy's phone: 20s vanished under him mid-decision — 45s, and ANY touch
         on the suggestion cancels the clock (deciding IS interacting) */
      const auto = setTimeout(() => { if (sug.parentNode) sug.remove(); }, 45000);
      sug.querySelector('.ss-amt').addEventListener('focus', () => clearTimeout(auto));
      sug.addEventListener('touchstart', () => clearTimeout(auto), { once: true, passive: true });
      sug.addEventListener('pointerdown', () => clearTimeout(auto), { once: true });
    }
  }

  /* the full spatial browser in the Places tab (remount-safe for brief changes) */
  let placesApi = null; /* mountPlaces handle — Today taps deep-focus through it */
  function mountPlacesTab(places) {
    const panel = $('panel-places');
    panel.querySelectorAll('.match-banner').forEach((b) => b.remove());
    $('appAreaBar').innerHTML = '';
    $('appCatBar').innerHTML = '';
    $('appPlacesGrid').innerHTML = '';
    placesApi = mountPlaces({
      els: {
        alt: $('appAlt'),
        coordArea: $('appCoordArea'),
        areaBar: $('appAreaBar'),
        catBar: $('appCatBar'),
        status: $('appPlacesStatus'),
        grid: $('appPlacesGrid'),
        bannerHost: $('appAreaBar'),
        search: $('appPlaceSearch'),
        discover: $('appDiscover')
      },
      places,
      plan: planFromTrip(trip),
      onCheckin: checkinAt,
      /* SAVED PLACES v1 (R1/R2): the bank + the mark, wired to the original
         user-places table. Saves are private by default, always. */
      saves: SAVES,
      stampedIds: new Set((CHECKINS || []).map((c) => String(c.place_id)).filter((k) => k !== 'null')),
      onSave: async (p, nowSaved) => {
        if (!user) return false;
        if (nowSaved) {
          const { data: row, error } = await sb.from('places').insert({
            user_id: user.id, curated_place_id: p.id,
            name: p.name, area: p.area, category: p.category, curated: true
          }).select('id').single();
          if (error) { console.warn('[Prevoya] save failed:', error.message); return false; }
          SAVE_ROWS.set(String(p.id), row.id);
          track('place_saved');
          return true;
        }
        const rowId = SAVE_ROWS.get(String(p.id));
        if (!rowId) return false;
        const { error } = await sb.from('places').delete().eq('id', rowId);
        if (error) { console.warn('[Prevoya] unsave failed:', error.message); return false; }
        SAVE_ROWS.delete(String(p.id));
        return true;
      },
      onGoogleSearch: googleSearch,
      onGoogleAdd: googleAdd,
      onBrief: () => openCheckin(), /* §G no-brief banner runs the questionnaire in-app */
      fullShelf: LAYERS.places /* §F: layer 1 = matched rows only; deep-links bypass */
    });
    if (LAYERS.places && !capSeen('places2')) {
      $('appPlacesGrid').insertAdjacentHTML('beforebegin',
        layerCap('places2', 'the full shelf — ' + (places || []).length + ' places, every row, search'));
    }
  }

  /* Today → Places, with relation (Guy's phone test): any tap on a card that
     carries data-place lands on THAT place — category detail, scrolled,
     highlighted. Maps links pass through untouched. */
  document.addEventListener('click', (e) => {
    if (e.target.closest('.st-x')) return; /* passport delete has its own handler */
    /* 1.3: Today cards check in like Places cards do */
    const here = e.target.closest('.place-here');
    if (here && e.target.closest('#timeline')) {
      e.preventDefault();
      const p = todayCtx && todayCtx.places.find((x) => String(x.id) === here.getAttribute('data-place-id'));
      if (p) checkinAt(p, here);
      return;
    }
    /* F1: ↩ ROUTE lives in the amber line — the way back is where the state is felt */
    /* build #5: rail footer → Places, pre-filtered to the day's area */
    const rm = e.target.closest('.rail-more');
    if (rm && e.target.closest('#timeline')) {
      e.preventDefault();
      setTab('places');
      const area = rm.getAttribute('data-area');
      if (placesApi && placesApi.focusArea) placesApi.focusArea(area || 'all');
      return;
    }
    /* F5: both share bridges land on the passport with the sheet open */
    const ns = e.target.closest('.nudge-share, .pp-share-nudge');
    if (ns) {
      e.preventDefault();
      setTab('you');
      const pp = $('youPassport');
      if (pp) pp.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const share = $('ppShare'), sheet = $('ppShareSheet');
      if (share && sheet && sheet.hidden) setTimeout(() => share.click(), 450);
      return;
    }
    /* 4: the plan isn't set in stone — rotate the slot through alternatives */
    const sw = e.target.closest('.pl-swap, .slot-swap');
    if (sw && e.target.closest('#timeline')) {
      e.preventDefault();
      swapPlanned(sw.getAttribute('data-swap-rail'));
      return;
    }
    const el = e.target.closest('[data-place]');
    if (!el || e.target.closest('a.place-maps')) return;
    /* Guy's phone: the spend suggestion lives INSIDE the card — editing the
       amount must never ride the card's deep-link to Places */
    if (e.target.closest('.spend-suggest')) return;
    e.preventDefault();
    const id = el.getAttribute('data-place');
    setTab('places');
    if (placesApi) placesApi.focusPlace(id);
  });

  /* 4 · swap one planned place: rotate through the rail's honest alternatives,
     persist when on-route (RLS own-row update on day_plans) */
  /* ═══ REALITY FIRST S1.3 · THE RE-FLOW — the plan follows you ═════════
     Divergence ≥2 days → the concierge PROPOSES (a bubble with chips,
     never a silent rewrite). Accept earns the trace: 3 beats, ~6s, then
     the updated route lands. Decline = quiet, no re-ask until the region
     changes; the header's `replan →` keeps self-service alive (force). */
  maybeReflow = function (opts) {
    const host = $('reflowBubble');
    if (!host) return;
    if (host.dataset.state === 'done') return;
    if (!trip || !todayCtx || TRIP_LEGS.length < 1) { host.hidden = true; return; }
    const force = !!(opts && opts.force);
    let div = divergence(todayCtx.trip);
    if (!div && force) {
      /* self-service path: propose from wherever reality says, streak or not */
      const rs = routeState(todayCtx.trip, TRIP_LEGS, baliNow());
      const legArea = rs && rs.cur ? rs.cur.area : null;
      const reg = realityRegion() || trip.area_override;
      if (reg && legArea && reg !== legArea) div = { region: reg, streak: 1 };
    }
    if (!div) { host.hidden = true; return; }
    if (!force && trip.reflow_declined_area === div.region) { host.hidden = true; return; }
    const total = TRIP_LEGS.reduce((s, l) => s + (l.nights || 0), 0);
    const day = tripDayNumber(trip, baliNow()) || 1;
    const left = Math.max(1, total - (day - 1));
    host.innerHTML =
      '<p class="rf-line">' + (div.streak >= 2
        ? 'You’ve been in ' + esc(div.region) + ' ' + div.streak + ' days — want me to re-plan the rest around it?'
        : 'You’re in ' + esc(div.region) + ' — want me to re-plan the rest around it?') + '</p>' +
      '<div class="rf-chips">' +
        '<button type="button" class="ri-replan" id="rfYes">replan from here</button>' +
        '<button type="button" class="ck-reset" id="rfNo">keep my route</button>' +
      '</div>';
    host.hidden = false;
    $('rfYes').onclick = () => acceptReflow(div.region, left);
    $('rfNo').onclick = async () => {
      trip.reflow_declined_area = div.region;
      host.innerHTML = '<p class="rf-line rf-quiet">your route holds</p>';
      setTimeout(() => { host.hidden = true; }, 2200);
      const { error } = await sb.from('trips').update({ reflow_declined_area: div.region }).eq('id', trip.id);
      if (error) console.warn('[Prevoya] reflow decline persist failed:', error.message);
      track('reflow_decline', { region: div.region });
    };
  };

  async function acceptReflow(region, leftDays) {
    const host = $('reflowBubble');
    /* beat 1 · the terminal line takes the screen (skippable by tap) */
    const ov = document.createElement('div');
    ov.className = 'rf-ceremony';
    ov.innerHTML = '<div class="rf-inner">' +
      '<p class="rf-term">▸ re-routing your remaining ' + leftDays + ' days…</p>' +
      '<div class="cer-map rf-map" hidden><svg viewBox="0 0 320 260" width="100%" aria-hidden="true">' +
        '<path d="' + ISLAND_PATH + '" fill="none" stroke="var(--mut)" stroke-width="1.5" opacity="0.5"/>' +
        '<ellipse cx="229" cy="175" rx="12" ry="8.25" transform="rotate(-14 229 175)" fill="none" stroke="var(--mut)" stroke-width="1.2" opacity="0.5"/>' +
        '<path id="rfTrace" d="" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round"/>' +
        '<g id="rfOrbs"></g></svg></div>' +
      '<p class="rf-counts" id="rfCounts" hidden></p></div>';
    document.body.appendChild(ov);
    let skipped = false;
    ov.onclick = () => { skipped = true; ov.remove(); };
    const { data, error } = await sb.functions.invoke('plan-engine', { body: { action: 'reroute', anchor_area: region } });
    if (error || !data || data.error || !data.legs) {
      if (!skipped) ov.remove();
      if (host) {
        host.innerHTML = '<p class="rf-line rf-quiet">couldn’t re-plan just now — your route holds</p>';
        setTimeout(() => { host.hidden = true; }, 2600);
      }
      return;
    }
    track('reflow_accept', { to: region });
    TRIP_LEGS = data.legs || [];
    trip.route_summary = data.summary || trip.route_summary;
    trip.reflow_declined_area = null;
    const { data: dpAll } = await sb.from('day_plans').select('leg_seq, day_in_leg, slots').eq('trip_id', trip.id);
    TRIP_DAY_PLANS = dpAll || [];
    if (host) host.dataset.state = 'done';
    /* reality == plan now — the override clears itself, silently */
    if (trip.area_override) await setOverride(null, { quiet: true });
    /* beats 2–3 · the tail re-traces from where you stand, counts land */
    if (!skipped && !REDUCED_MOTION()) {
      const mapEl = ov.querySelector('.rf-map');
      const newLegs = TRIP_LEGS.filter((l) => l.status !== 'done');
      const pts = newLegs.map((l) => AREA_XY[l.area] || [160, 150]);
      mapEl.hidden = false;
      const tr = ov.querySelector('#rfTrace');
      tr.setAttribute('d', pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ',' + p[1]).join(' '));
      ov.querySelector('#rfOrbs').innerHTML = newLegs.map((l, i) =>
        '<circle cx="' + pts[i][0] + '" cy="' + pts[i][1] + '" r="6" fill="' + (AREA_HEX[l.area] || '#3dffd0') + '"/>' +
        '<text x="' + (pts[i][0] + 10) + '" y="' + (pts[i][1] + 3) + '" fill="' + (AREA_HEX[l.area] || '#3dffd0') +
        '" font-size="9" style="font-family:ui-monospace,Menlo,monospace;letter-spacing:0.08em">' +
        esc(l.area.toUpperCase()) + '</text>').join('');
      try {
        const len = tr.getTotalLength();
        tr.style.strokeDasharray = String(len);
        tr.style.strokeDashoffset = String(len);
        requestAnimationFrame(() => { tr.style.transition = 'stroke-dashoffset 1.6s ease-out'; tr.style.strokeDashoffset = '0'; });
      } catch (_) {}
      await new Promise((r) => setTimeout(r, 2000));
      if (!skipped) {
        const c = ov.querySelector('#rfCounts');
        const nl = TRIP_LEGS.filter((l) => l.status !== 'done');
        c.textContent = leftDays + ' DAYS · ' + nl.length + ' BASE' + (nl.length === 1 ? '' : 'S') + ' · re-planned from ' + region.toUpperCase();
        c.hidden = false;
        await new Promise((r) => setTimeout(r, 1700));
      }
    }
    if (!skipped) ov.remove();
    /* the receipt lands on the surfaces */
    renderRoute(trip, TRIP_LEGS, baliNow(), { onReplan: replanRoute, onOverride: setOverride, onShare: shareRoute });
    updateStrip(trip, greetName(), baliNow());
    if (todayCtx) { todayCtx.trip = trip; renderToday(trip, todayCtx.name, todayCtx.places); }
    if (host) {
      host.innerHTML = '<p class="rf-line">done — your plan starts where you are. scroll down to see the days.</p>';
      host.hidden = false;
      setTimeout(() => { host.hidden = true; }, 4200);
    }
    loadDayPlan().then(() => { if (todayCtx) renderToday(todayCtx.trip, todayCtx.name, todayCtx.places); });
  }

  /* ═══ REALITY FIRST S2 · THE ITINERARY — the days ahead ═══════════════
     Today's lower half, no toggle: scrolling down IS scrolling forward in
     time. Future days = compact rows (browsing); expanding one = intent →
     full cards + swap. ⚑ save on every future pick (browsing tomorrow IS
     shortlisting). Leg boundaries as visa-style headers; ungenerated legs
     honest with a door. Past days live in the passport, never here. */
  const ITIN_EXPANDED = new Set();  /* 'seq:dayInLeg' expanded in place */
  let ITIN_DEPTH = 7;               /* soft cap of day rows (spec 2.2) */

  function itinWindows() {
    let acc = 0;
    return TRIP_LEGS.map((l) => {
      const w = { seq: l.seq, area: l.area, nights: l.nights, fromDay: acc + 1, toDay: acc + l.nights };
      acc += l.nights;
      return w;
    });
  }
  const itinPlanFor = (seq, dayInLeg) => {
    const row = TRIP_DAY_PLANS.find((r) => r.leg_seq === seq && r.day_in_leg === dayInLeg);
    return (row && row.slots) || [];
  };
  /* ONE save write-path for every surface (extracted from the Places mount) */
  async function toggleSave(p) {
    if (!user || !p) return false;
    const id = String(p.id);
    if (SAVES.has(id)) {
      const rowId = SAVE_ROWS.get(id);
      if (!rowId) return false;
      const { error } = await sb.from('places').delete().eq('id', rowId);
      if (error) return false;
      SAVES.delete(id);
      SAVE_ROWS.delete(id);
      return true;
    }
    const { data: row, error } = await sb.from('places').insert({
      user_id: user.id, curated_place_id: p.id,
      name: p.name, area: p.area, category: p.category, curated: true
    }).select('id').single();
    if (error) return false;
    SAVES.set(id, Date.now());
    SAVE_ROWS.set(id, row.id);
    track('place_saved');
    return true;
  }
  const itinFlag = (p) => {
    const on = SAVES.has(String(p.id));
    return '<button type="button" class="it-flag' + (on ? ' on' : '') + '" data-flag="' + esc(p.id) +
      '" aria-label="' + (on ? 'saved — tap to remove' : 'save for later') + '">' +
      '<svg width="14" height="14" aria-hidden="true"><use href="#icon-' + (on ? 'saved' : 'save') + '"/></svg></button>';
  };

  renderItinerary = function () {
    const host = $('itinerary');
    if (!host) return;
    const t = (todayCtx && todayCtx.trip) || trip; /* fixture-friendly: todayCtx carries the trip */
    if (!LAYERS.today || !t || TRIP_LEGS.length < 1 || !todayCtx) { host.innerHTML = ''; return; }
    const now = baliNow();
    const dayN = tripDayNumber(t, now);
    if (dayN == null || dayN < 1) { host.innerHTML = ''; return; }
    let origin;
    if (t.arrive) { const p = String(t.arrive).split('-'); origin = new Date(+p[0], +p[1] - 1, +p[2]); }
    else { const c = new Date(t.created_at); origin = new Date(c.getFullYear(), c.getMonth(), c.getDate()); }
    const resolve = (id) => (todayCtx.places || []).find((x) => String(x.id) === String(id)) || null;

    let html = '';
    let rows = 0;
    let clipped = 0;
    const wins = itinWindows();
    for (const w of wins) {
      if (w.toDay <= dayN) continue; /* fully lived legs are memory — passport */
      const future = w.fromDay > dayN;
      const hasPlan = TRIP_DAY_PLANS.some((r) => r.leg_seq === w.seq);
      if (future) {
        html += '<div class="it-leg"><span class="it-leg-orb" style="background:' +
          (AREA_TINT[w.area] || 'var(--teal)') + '"></span>→ ' + esc(w.area.toUpperCase()) +
          ' · ' + w.nights + ' NIGHTS · from day ' + w.fromDay + '</div>';
        if (!hasPlan) {
          html += '<div class="it-ungen"><span>' + esc(w.area.toUpperCase()) + ' · ' + w.nights +
            ' DAYS · planned when the leg starts</span>' +
            '<button type="button" class="ck-reset it-plan-now" data-leg="' + w.seq + '">plan it now →</button></div>';
          continue;
        }
      } else if (!hasPlan) {
        /* Guy's repro (2026-08-28): the CURRENT leg with no generated plan
           rendered as a wall of empty dashes with no door — the honest
           ungenerated treatment applies here too, days-remaining counted */
        const left = w.toDay - dayN;
        if (left > 0) {
          html += '<div class="it-ungen"><span>' + esc(w.area.toUpperCase()) + ' · ' + left +
            ' DAY' + (left === 1 ? '' : 'S') + ' LEFT · not planned yet</span>' +
            '<button type="button" class="ck-reset it-plan-now" data-leg="' + w.seq + '">plan these days →</button></div>';
        }
        continue;
      }
      if (rows >= ITIN_DEPTH) { clipped += w.toDay - Math.max(w.fromDay, dayN + 1) + 1; continue; }
      for (let d = Math.max(w.fromDay, dayN + 1); d <= w.toDay; d++) {
        if (rows >= ITIN_DEPTH) { clipped++; continue; }
        rows++;
        const dayInLeg = d - w.fromDay + 1;
        const key = w.seq + ':' + dayInLeg;
        const dd = new Date(origin.getFullYear(), origin.getMonth(), origin.getDate() + (d - 1));
        const slots = itinPlanFor(w.seq, dayInLeg);
        const bySlot = {};
        slots.forEach((sl) => { if (!bySlot[sl.rail]) bySlot[sl.rail] = sl; });
        const expanded = ITIN_EXPANDED.has(key);
        html += '<div class="it-day' + (expanded ? ' open' : '') + '" data-key="' + key + '">' +
          '<button type="button" class="it-day-head" data-toggle="' + key + '">' +
            MONTH_ABBR[dd.getMonth()] + ' ' + dd.getDate() + ' · DAY ' + d +
            '<span class="it-day-caret">' + (expanded ? '▾' : '▸') + '</span></button>';
        RAILS.forEach((r) => {
          const sl = bySlot[r.key];
          const p = sl ? resolve(sl.place_id) : null;
          if (!expanded) {
            html += '<div class="it-rail" data-toggle="' + key + '">' +
              '<span class="it-hours">' + r.hours + '</span>' +
              '<span class="pdot" style="--pd:' + (p && CAT_META[p.category] ? CAT_META[p.category].cc : 'var(--line)') + '"></span>' +
              '<span class="it-name' + (p ? '' : ' dim') + '">' + (p ? esc(p.name) : '—') + '</span>' +
              (p ? itinFlag(p) : '') +
            '</div>';
          } else if (p) {
            html += '<div class="it-card" style="--cc:' + ((CAT_META[p.category] || {}).cc || 'var(--teal)') + '">' +
              itinFlag(p) +
              '<div class="it-card-top"><span class="it-hours">' + r.hours + '</span>' +
                '<strong>' + esc(p.name) + '</strong>' +
                (p.verified ? '<span class="place-verified">✓</span>' : '') + '</div>' +
              ((sl.why || p.why) ? '<p class="it-why">' + esc(sl.why || p.why) + '</p>' : '') +
              '<button type="button" class="swap-chip it-swap" data-leg="' + w.seq + '" data-day="' + dayInLeg +
                '" data-rail="' + r.key + '">↻ SWAP</button>' +
            '</div>';
          } else {
            html += '<div class="it-rail"><span class="it-hours">' + r.hours + '</span>' +
              '<span class="pdot" style="--pd:var(--line)"></span><span class="it-name dim">—</span></div>';
          }
        });
        html += '</div>';
      }
    }
    if (clipped > 0) {
      html += '<button type="button" class="ck-reset it-more">+ ' + clipped + ' more day' + (clipped === 1 ? '' : 's') + ' →</button>';
    }
    /* the SCRUBBER (Guy's calendar instinct, hybridized): a strip of day
       chips ABOVE the plan — an index, not a container, visible before the
       thing it indexes (Guy's placement ruling). Tap a day → it renders,
       expands, and the river jumps there. */
    const strip = $('itStrip');
    if (strip) {
      if (html) {
        strip.innerHTML = '<button type="button" class="it-dchip it-dchip-now" data-scrollnow>NOW</button>' +
          wins.map((w) => {
            if (w.toDay <= dayN) return '';
            let out = '';
            for (let d = Math.max(w.fromDay, dayN + 1); d <= w.toDay; d++) {
              out += '<button type="button" class="it-dchip" data-jump="' + d + '" style="--lc:' +
                (AREA_TINT[w.area] || 'var(--teal)') + '">' + d + '</button>';
            }
            return out;
          }).join('');
        strip.hidden = false;
      } else { strip.innerHTML = ''; strip.hidden = true; }
    }
    host.innerHTML = html ? '<p class="itin-head">the days ahead</p>' + html : '';
  };

  /* one delegated wire for the whole itinerary — survives every re-render */
  const itinHost = $('itinerary');
  const itinClick = async (e) => {
    const flag = e.target.closest('.it-flag');
    if (flag) {
      e.stopPropagation();
      const p = (todayCtx && todayCtx.places || []).find((x) => String(x.id) === flag.getAttribute('data-flag'));
      if (p && await toggleSave(p)) renderItinerary();
      return;
    }
    const sw = e.target.closest('.it-swap');
    if (sw) {
      e.stopPropagation();
      swapFuture(+sw.getAttribute('data-leg'), +sw.getAttribute('data-day'), sw.getAttribute('data-rail'));
      return;
    }
    const pn = e.target.closest('.it-plan-now');
    if (pn) {
      const seq = +pn.getAttribute('data-leg');
      pn.disabled = true;
      pn.textContent = '▸ planning…';
      const { data, error } = await sb.functions.invoke('plan-engine', { body: { action: 'days', leg_seq: seq } });
      if (error || !data || data.error) { pn.disabled = false; pn.textContent = 'plan it now →'; return; }
      const { data: dpAll } = await sb.from('day_plans').select('leg_seq, day_in_leg, slots').eq('trip_id', trip.id);
      TRIP_DAY_PLANS = dpAll || [];
      track('itin_plan_leg', { leg: seq });
      renderItinerary();
      return;
    }
    const more = e.target.closest('.it-more');
    if (more) { ITIN_DEPTH += 7; renderItinerary(); return; }
    if (e.target.closest('[data-scrollnow]')) {
      window.scrollTo({ top: 0, behavior: REDUCED_MOTION() ? 'auto' : 'smooth' });
      return;
    }
    const jump = e.target.closest('.it-dchip[data-jump]');
    if (jump) {
      const d = +jump.getAttribute('data-jump');
      const t = (todayCtx && todayCtx.trip) || trip;
      const dayN = tripDayNumber(t, baliNow()) || 0;
      if (d - dayN > ITIN_DEPTH) ITIN_DEPTH = d - dayN; /* the river reaches the chip */
      const w = itinWindows().find((x) => d >= x.fromDay && d <= x.toDay);
      if (w && TRIP_DAY_PLANS.some((r) => r.leg_seq === w.seq)) {
        ITIN_EXPANDED.add(w.seq + ':' + (d - w.fromDay + 1)); /* tapping a day is intent */
      }
      renderItinerary();
      const el = w && itinHost.querySelector('.it-day[data-key="' + w.seq + ':' + (d - w.fromDay + 1) + '"]');
      const target = el || itinHost.querySelector('.it-ungen');
      if (target) requestAnimationFrame(() =>
        target.scrollIntoView({ behavior: REDUCED_MOTION() ? 'auto' : 'smooth', block: 'start' }));
      return;
    }
    const tog = e.target.closest('[data-toggle]');
    if (tog) {
      const key = tog.getAttribute('data-toggle');
      /* expanding a day is declaring intent (spec 2.2) */
      if (ITIN_EXPANDED.has(key)) ITIN_EXPANDED.delete(key);
      else ITIN_EXPANDED.add(key);
      renderItinerary();
    }
  };
  if (itinHost) itinHost.addEventListener('click', itinClick);
  const itinStripHost = $('itStrip');
  if (itinStripHost) itinStripHost.addEventListener('click', itinClick);

  /* S2 swap on a FUTURE day — same rotate-through-alternatives grammar as
     today's swap, persisted to that day's plan row */
  function swapFuture(legSeq, dayInLeg, railKey) {
    const row = TRIP_DAY_PLANS.find((r) => r.leg_seq === legSeq && r.day_in_leg === dayInLeg);
    if (!row || !todayCtx) return;
    const slot = (row.slots || []).find((s) => s.rail === railKey);
    if (!slot) return;
    const leg = TRIP_LEGS.find((l) => l.seq === legSeq);
    let pool = todayCtx.places;
    if (leg) {
      const local = pool.filter((p) => inAreaRegion(p, leg.area));
      if (local.length >= 4) pool = local;
    }
    const plan = planFromTrip(todayCtx.trip);
    const { picks } = railPicks(pool, plan, railKey, 6);
    if (!picks.length) return;
    const i = picks.findIndex((p) => String(p.id) === String(slot.place_id));
    const alt = picks[(i + 1) % picks.length];
    if (!alt || String(alt.id) === String(slot.place_id)) return;
    slot.place_id = alt.id;
    slot.why = 'your swap — ↻ again for another';
    renderItinerary();
    sb.from('day_plans').update({ slots: row.slots })
      .eq('trip_id', todayCtx.trip.id).eq('leg_seq', legSeq).eq('day_in_leg', dayInLeg)
      .then(({ error }) => { if (error) console.warn('[Prevoya] future swap persist failed:', error.message); });
  }

  function swapPlanned(railKey) {
    if (!DAY_PLAN || !todayCtx || !railKey) return;
    const slot = DAY_PLAN.find((s) => s.rail === railKey);
    if (!slot) return;
    const rs = routeState(todayCtx.trip, TRIP_LEGS, baliNow());
    const ov = offRoute(todayCtx.trip, rs);
    let pool = todayCtx.places;
    if (ov) {
      const local = pool.filter((p) => inAreaRegion(p, ov));
      if (local.length >= 4) pool = local;
    }
    const plan = planFromTrip(todayCtx.trip);
    const { picks } = railPicks(pool, plan, railKey, 6);
    if (!picks.length) return;
    const i = picks.findIndex((p) => String(p.id) === String(slot.place_id));
    const alt = picks[(i + 1) % picks.length];
    if (!alt || String(alt.id) === String(slot.place_id)) return;
    slot.place_id = alt.id;
    slot.why = 'your swap — ↻ again for another';
    /* in-place re-render: the traveler is LOOKING at this card — no jumping */
    TL_KEEP_SCROLL = true;
    const scrollY = window.scrollY;
    renderToday(todayCtx.trip, todayCtx.name, todayCtx.places);
    window.scrollTo(0, scrollY);
    if (rs && rs.cur && !ov) {
      sb.from('day_plans').update({ slots: DAY_PLAN })
        .eq('trip_id', todayCtx.trip.id).eq('leg_seq', rs.cur.idx + 1).eq('day_in_leg', rs.cur.nightOf)
        .then(({ error }) => { if (error) console.warn('[Prevoya] swap persist failed:', error.message); });
    } else if (ov && DAY_PLAN_OFFROUTE && !DAY_PLAN_ADJUSTED) {
      /* F1: off-route picks are full citizens — swaps persist to the leg_seq-0 row */
      const day = Math.max(1, tripDayNumber(todayCtx.trip, baliNow()) || 1);
      sb.from('day_plans').update({ slots: DAY_PLAN })
        .eq('trip_id', todayCtx.trip.id).eq('leg_seq', 0).eq('day_in_leg', day)
        .then(({ error }) => { if (error) console.warn('[Prevoya] swap persist failed:', error.message); });
    }
  }

  /* ─── A2 · zero-friction check-in ───
     One tap → nearest places from where you stand → confirm → the stamp
     ceremony fires. Permission asked contextually at first attempt, never
     onboarding (Rachel). Every failure path lands in Places, honestly. */
  const havKm = (la1, ln1, la2, ln2) => {
    const R = 6371, dLa = (la2 - la1) * Math.PI / 180, dLn = (ln2 - ln1) * Math.PI / 180;
    const a = Math.sin(dLa / 2) ** 2 +
      Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLn / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };
  const gpsBtnEl = $('gpsBtn');
  if (gpsBtnEl) gpsBtnEl.onclick = () => {
    const sheet = $('gpsSheet');
    sheet.hidden = false;
    if (!navigator.geolocation) {
      sheet.innerHTML = '<p class="pulse-note">location unavailable on this device — pick the place in Places</p>';
      return;
    }
    /* the contextual line ABOVE the OS prompt (Rachel's copy direction) */
    sheet.innerHTML = '<p class="pulse-note">find where you are? · one tap check-ins</p>';
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude: la, longitude: ln } = pos.coords;
      /* M3 ruling §1 — this sheet IS "was this one of them?". A pick =
         instant Tier-1 stamp at OUR place record. Naming a new place saves
         a PRIVATE stamp (device fix never reaches a public surface) and
         feeds the curation queue. */
      const nameFlow = () => {
        sheet.innerHTML =
          '<p class="pulse-note">name it · stays private to you</p>' +
          '<div class="gps-namerow">' +
            '<input class="auth-input gps-name" maxlength="80" placeholder="what’s this place called?">' +
            '<button type="button" class="ri-replan gps-save">stamp it</button>' +
          '</div>' +
          '<button type="button" class="ck-reset gps-cancel">cancel</button>';
        sheet.querySelector('.gps-cancel').onclick = () => { sheet.hidden = true; };
        sheet.querySelector('.gps-save').onclick = async (ev) => {
          const nm = sheet.querySelector('.gps-name').value.trim();
          if (!nm) return;
          const b = ev.currentTarget;
          b.disabled = true;
          const { data: ckRow, error } = await sb.from('checkins').insert({
            user_id: user.id, place_id: null, place_name: nm, lat: la, lng: ln
          }).select().single();
          if (error) { b.disabled = false; b.textContent = '⚠ retry'; return; }
          CHECKINS.push(ckRow);
          autoAnchor(); /* REALITY FIRST: a named place is presence too */
          try { window.pvTrack && window.pvTrack('place_named', {}); } catch (_) {}
          if (todayCtx) renderPassport(todayCtx.trip, todayCtx.places);
          sheet.innerHTML = '<p class="pulse-note">✓ stamped · private to you — public only once it’s verified</p>';
          setTimeout(() => { sheet.hidden = true; }, 2400);
        };
      };
      const cands = ((todayCtx && todayCtx.places) || [])
        .filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number')
        .map((p) => ({ p, km: havKm(la, ln, p.lat, p.lng) }))
        .sort((a, b) => a.km - b.km).slice(0, 3);
      if (!cands.length) {
        sheet.innerHTML = '<p class="pulse-note">nothing nearby in the data yet</p>' +
          '<button type="button" class="ri-replan gps-new">📍 name this place</button>' +
          '<button type="button" class="ck-reset gps-else">or pick it in Places →</button>';
        sheet.querySelector('.gps-new').onclick = nameFlow;
        sheet.querySelector('.gps-else').onclick = () => { sheet.hidden = true; setTab('places'); };
        return;
      }
      sheet.innerHTML = '<p class="pulse-note">you’re near:</p>' +
        cands.map((c, i) =>
          '<button type="button" class="ri-replan gps-pick" data-i="' + i + '">' +
          esc(c.p.name) + ' · ' + (c.km < 1 ? Math.round(c.km * 1000) + ' m' : c.km.toFixed(1) + ' km') +
          '</button>').join('') +
        '<button type="button" class="ck-reset gps-new">none of these — name it</button>' +
        '<button type="button" class="ck-reset gps-else">somewhere else →</button>';
      sheet.querySelectorAll('.gps-pick').forEach((b) => {
        b.onclick = async () => {
          await checkinAt(cands[+b.getAttribute('data-i')].p, b);
          setTimeout(() => { sheet.hidden = true; }, 1400);
        };
      });
      sheet.querySelector('.gps-new').onclick = nameFlow;
      sheet.querySelector('.gps-else').onclick = () => { sheet.hidden = true; setTab('places'); };
    }, (err) => {
      /* say what actually happened — a generic line hides the fix (Guy's test) */
      const denied = err && err.code === 1;
      sheet.innerHTML = denied
        ? '<p class="pulse-note">location is blocked for this site. iPhone: Settings → Privacy &amp; Security → Location Services → Safari Websites → “While Using”. Then in Safari tap <strong>ᴀA</strong> in the address bar → Website Settings → Location → Allow.</p>' +
          '<button type="button" class="ri-replan gps-retry">try again</button>' +
          '<button type="button" class="ck-reset gps-else">or pick the place in Places →</button>'
        : '<p class="pulse-note">couldn’t get a fix (' + (err && err.code === 3 ? 'timed out' : 'position unavailable') + ') — near buildings or indoors this can take a moment.</p>' +
          '<button type="button" class="ri-replan gps-retry">try again</button>' +
          '<button type="button" class="ck-reset gps-else">or pick the place in Places →</button>';
      const retry = sheet.querySelector('.gps-retry');
      if (retry) retry.onclick = () => gpsBtnEl.onclick();
      const elseB = sheet.querySelector('.gps-else');
      if (elseB) elseB.onclick = () => { sheet.hidden = true; setTab('places'); };
    }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
  };

  /* ═══ A2 v2 · THE STAMPING SESSION (Guy+Alex fusion, 2026-08-11) ═══
     The unit of work is a session, not a stamp: sticky day + ◂▸ stepper +
     a type-ahead that stamps on tap and never drops focus. "+" on any
     BY DAY row opens it anchored there; the button opens it at yesterday.
     Replaces the old one-stamp retro form. */
  let ssDate = null; /* 'YYYY-MM-DD' (Bali calendar day) */
  const ssEl = { sheet: $('stampSheet'), date: $('ssDate'), prev: $('ssPrev'), next: $('ssNext'),
    close: $('ssClose'), find: $('ssFind'), suggest: $('ssSuggest'), chips: $('ssChips') };
  const ssIso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const ssParse = (iso) => { const p = String(iso).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  const ssTodayIso = () => { const n = baliNow(); return ssIso(new Date(n.getFullYear(), n.getMonth(), n.getDate())); };
  function ssLabel() {
    const d = ssParse(ssDate);
    let origin = null;
    if (trip && trip.arrive) origin = ssParse(trip.arrive);
    else if (trip && trip.created_at) { const c = new Date(trip.created_at); origin = new Date(c.getFullYear(), c.getMonth(), c.getDate()); }
    const dayN = origin ? Math.round((d - origin) / 86400000) + 1 : null;
    return MONTH_ABBR[d.getMonth()] + ' ' + d.getDate() +
      (dayN == null ? '' : (dayN >= 1 ? ' · DAY ' + dayN : ' · PRE-TRIP'));
  }
  function ssRenderChips() {
    const cks = CHECKINS.filter((c) => {
      const b = baliDateOf(c.created_at);
      return ssIso(new Date(b.y, b.m, b.d)) === ssDate;
    });
    ssEl.chips.innerHTML = cks.map((c) =>
      '<button type="button" class="ss-chip" data-ck="' + esc(c.id) + '">' +
      esc(c.place_name || 'a place') + ' <span class="ssc-x">✕</span></button>').join('');
  }
  function ssPaint() {
    ssEl.date.textContent = ssLabel();
    ssEl.next.disabled = ssDate >= ssTodayIso();
    ssRenderChips();
  }
  function openStampSheet(dateIso) {
    if (!ssEl.sheet) return;
    ssDate = dateIso || ssDate || ssTodayIso();
    if (ssDate > ssTodayIso()) ssDate = ssTodayIso();
    ssEl.sheet.hidden = false;
    ssEl.find.value = '';
    ssEl.suggest.innerHTML = '';
    ssPaint();
    ssEl.find.focus();
  }
  async function ssStamp(p) {
    const { data: ckRow, error } = await sb.from('checkins').insert({
      user_id: user.id, place_id: p.id, place_name: p.name, lat: p.lat, lng: p.lng,
      created_at: ssDate + 'T12:00:00+08:00' /* noon Bali on the session day */
    }).select().single();
    if (error) {
      ssEl.suggest.innerHTML = '<p class="pulse-note">didn’t save — tap the place again</p>';
      return;
    }
    CHECKINS.push(ckRow);
    CHECKINS.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    track('retro_stamp');
    if (todayCtx) renderPassport(todayCtx.trip, todayCtx.places); /* sheet lives outside ppBody — it survives */
    ssEl.find.value = '';
    ssEl.suggest.innerHTML = '';
    ssPaint();
    ssEl.find.focus(); /* the whole point: type-tap, type-tap, never re-aim */
  }
  if (ssEl.sheet) {
    ssEl.find.oninput = () => {
      const q = ssEl.find.value.trim().toLowerCase();
      if (q.length < 2) { ssEl.suggest.innerHTML = ''; return; }
      const pool = ((todayCtx && todayCtx.places) || []);
      const hits = pool
        .map((p) => {
          const name = String(p.name).toLowerCase();
          const hay = name + ' ' + String(p.area || '').toLowerCase();
          const rank = name.startsWith(q) ? 0 : name.indexOf(q) !== -1 ? 1 : hay.indexOf(q) !== -1 ? 2 : -1;
          return { p, rank };
        })
        .filter((x) => x.rank >= 0)
        .sort((a, b) => a.rank - b.rank || (b.p.verified === true) - (a.p.verified === true))
        .slice(0, 6);
      ssEl.suggest.innerHTML = hits.map((x) =>
        '<button type="button" data-pick="' + esc(x.p.id) + '">' + esc(x.p.name) +
        '<span class="ssg-area">' + esc(String(x.p.area || '').split('/')[0]) + '</span></button>').join('') ||
        '<p class="pulse-note">nothing by that name yet — tell Alex, it joins the dataset</p>';
    };
    ssEl.suggest.onclick = (e) => {
      const b = e.target.closest('[data-pick]');
      if (!b) return;
      const p = ((todayCtx && todayCtx.places) || []).find((x) => String(x.id) === b.getAttribute('data-pick'));
      if (p) ssStamp(p);
    };
    ssEl.chips.onclick = async (e) => {
      const chip = e.target.closest('.ss-chip');
      if (!chip) return;
      const id = chip.getAttribute('data-ck');
      const { error } = await sb.from('checkins').delete().eq('id', id);
      if (error) { console.error('[Prevoya] unstamp failed:', error.message); return; }
      CHECKINS = CHECKINS.filter((c) => String(c.id) !== String(id));
      if (todayCtx) renderPassport(todayCtx.trip, todayCtx.places);
      ssPaint();
      ssEl.find.focus();
    };
    ssEl.prev.onclick = () => { ssDate = ssIso(new Date(ssParse(ssDate).getTime() - 86400000)); ssPaint(); ssEl.find.focus(); };
    ssEl.next.onclick = () => {
      const n = ssIso(new Date(ssParse(ssDate).getTime() + 86400000));
      if (n <= ssTodayIso()) { ssDate = n; ssPaint(); ssEl.find.focus(); }
    };
    ssEl.close.onclick = () => { ssEl.sheet.hidden = true; };
  }
  const retroBtn = $('ppRetro');
  if (retroBtn) retroBtn.onclick = () => {
    const y = new Date(ssParse(ssTodayIso()).getTime() - 86400000);
    openStampSheet(ssIso(y));
  };

  /* ─── A3 · sharing: explicit, per-trip, revocable. The link is the ONLY
     public door, and the privacy boundary is stated where the share happens. */
  const shareSlug = () => {
    const a = new Uint8Array(16); crypto.getRandomValues(a);
    return Array.from(a, (b) => (b % 36).toString(36)).join('');
  };
  const shareBtn = $('ppShare');
  if (shareBtn) shareBtn.onclick = async () => {
    const sheet = $('ppShareSheet');
    if (!sheet.hidden) { sheet.hidden = true; return; }
    sheet.hidden = false;
    sheet.innerHTML = '<p class="pulse-note">▸ opening the share desk…</p>';
    let { data: rows } = await sb.from('trip_shares').select('*')
      .eq('trip_id', trip.id).is('revoked_at', null).limit(1);
    let share = rows && rows[0];
    if (!share) {
      const ins = await sb.from('trip_shares').insert({ trip_id: trip.id, token: shareSlug() }).select().single();
      if (ins.error) { sheet.innerHTML = '<p class="pulse-note">couldn’t create the link — tap SHARE to retry</p>'; return; }
      share = ins.data;
    }
    const link = location.origin + '/s/?t=' + share.token;
    sheet.innerHTML =
      '<div class="pp-share-link" id="ppShareLink">' + esc(link) + '</div>' +
      '<p class="pp-share-priv">Past days and places only. Never your spend, never where you are now. Revoke any time — the link dies instantly.</p>' +
      '<div class="pp-share-acts">' +
        '<button type="button" class="btn btn-primary log-btn" id="ppShareCopy">copy link</button>' +
        '<button type="button" class="ck-reset" id="ppShareRevoke">revoke</button>' +
      '</div>';
    $('ppShareCopy').onclick = async () => {
      try { await navigator.clipboard.writeText(link); $('ppShareCopy').textContent = '✓ copied'; }
      catch (_) { $('ppShareCopy').textContent = 'copy failed — long-press the link'; }
    };
    $('ppShareRevoke').onclick = async () => {
      const { error } = await sb.from('trip_shares').update({ revoked_at: new Date().toISOString() }).eq('id', share.id);
      sheet.innerHTML = error
        ? '<p class="pulse-note">couldn’t revoke — tap SHARE to retry</p>'
        : '<p class="pulse-note">link revoked — this passport is private again. Tap SHARE for a fresh link any time.</p>';
    };
  };

  /* A1 · passport controls: view toggle, category filter, You section index */
  /* 2.2 · edit mode: deletion lives in BY DAY (one stamp = one check-in);
     entering edit switches the view so the ✕ always means exactly one row */
  const ppEditBtn = $('ppEditBtn');
  if (ppEditBtn) ppEditBtn.onclick = () => {
    PP_EDIT = !PP_EDIT;
    ppEditBtn.textContent = PP_EDIT ? '✓ done editing' : 'edit stamps';
    if (PP_EDIT && PP_VIEW !== 'day') {
      PP_VIEW = 'day';
      const t = $('ppToggle');
      if (t) t.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.getAttribute('data-v') === 'day'));
    }
    if (todayCtx) renderPassport(todayCtx.trip, todayCtx.places);
  };
  const ppBodyEl = $('ppBody');
  if (ppBodyEl) ppBodyEl.addEventListener('click', async (e) => {
    /* the fusion door: "+" on a day row opens the session anchored there */
    const add = e.target.closest('.pp-day-add');
    if (add) {
      e.preventDefault();
      e.stopPropagation();
      openStampSheet(add.getAttribute('data-date'));
      return;
    }
    /* M3 §1 · promotion: a private raw stamp becomes a Tier-1 stamp at OUR
       database place — the device fix is REPLACED, never migrated. */
    const rv = e.target.closest('.st-resolve');
    if (rv) {
      e.preventDefault();
      e.stopPropagation();
      if (rv.closest('.stamp').nextElementSibling &&
          rv.closest('.stamp').nextElementSibling.classList.contains('pp-resolve')) return;
      const ck = CHECKINS.find((c) => String(c.id) === String(rv.getAttribute('data-ck')));
      if (!ck) return;
      const pool = ((todayCtx && todayCtx.places) || [])
        .filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number');
      const cands = (typeof ck.lat === 'number' && typeof ck.lng === 'number')
        ? pool.map((p) => ({ p, km: havKm(ck.lat, ck.lng, p.lat, p.lng) }))
            .sort((a, b) => a.km - b.km).slice(0, 3)
        : [];
      const box = document.createElement('div');
      box.className = 'pp-resolve';
      box.innerHTML = (cands.length
        ? '<p class="pulse-note">was it one of these?</p>' +
          cands.map((c, i) =>
            '<button type="button" class="ri-replan ppr-pick" data-i="' + i + '">' +
            esc(c.p.name) + ' · ' + (c.km < 1 ? Math.round(c.km * 1000) + ' m' : c.km.toFixed(1) + ' km') +
            '</button>').join('')
        : '<p class="pulse-note">nothing near it on the map yet — it stays private for now</p>') +
        '<button type="button" class="ck-reset ppr-cancel">' + (cands.length ? 'keep it private' : 'ok') + '</button>';
      rv.closest('.stamp').insertAdjacentElement('afterend', box);
      box.querySelector('.ppr-cancel').onclick = () => box.remove();
      box.querySelectorAll('.ppr-pick').forEach((b) => {
        b.onclick = async () => {
          const p = cands[+b.getAttribute('data-i')].p;
          b.disabled = true;
          const { error } = await sb.from('checkins').update({
            place_id: p.id, place_name: p.name, lat: p.lat, lng: p.lng
          }).eq('id', ck.id);
          if (error) { b.disabled = false; b.textContent = '⚠ retry'; return; }
          ck.place_id = p.id; ck.place_name = p.name; ck.lat = p.lat; ck.lng = p.lng;
          try { window.pvTrack && window.pvTrack('stamp_promoted', {}); } catch (_) {}
          if (todayCtx) renderPassport(todayCtx.trip, todayCtx.places, { ceremony: p.id });
        };
      });
      return;
    }
    const x = e.target.closest('.st-x');
    if (!x) return;
    e.preventDefault();
    e.stopPropagation();
    const id = x.getAttribute('data-ck');
    const { error } = await sb.from('checkins').delete().eq('id', id);
    if (error) { console.error('[Prevoya] stamp delete failed:', error.message); return; }
    CHECKINS = CHECKINS.filter((c) => String(c.id) !== String(id));
    if (todayCtx) renderPassport(todayCtx.trip, todayCtx.places);
  });

  const ppToggleEl = $('ppToggle');
  if (ppToggleEl) ppToggleEl.onclick = (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    PP_VIEW = b.getAttribute('data-v');
    ppToggleEl.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    if (todayCtx) renderPassport(todayCtx.trip, todayCtx.places);
  };
  const ppFilterEl = $('ppFilter');
  if (ppFilterEl) ppFilterEl.onclick = (e) => {
    const b = e.target.closest('.pp-cat');
    if (!b) return;
    PP_CAT = b.getAttribute('data-v');
    if (todayCtx) renderPassport(todayCtx.trip, todayCtx.places);
  };
  const youIdx = $('youIndex');
  if (youIdx) {
    youIdx.onclick = (e) => {
      const b = e.target.closest('button[data-goto]');
      if (!b) return;
      youIdx.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      const t = $(b.getAttribute('data-goto'));
      if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    /* active chip tracks scroll */
    if ('IntersectionObserver' in window) {
      const spy = new IntersectionObserver((es) => {
        es.forEach((en) => {
          if (!en.isIntersecting) return;
          youIdx.querySelectorAll('button').forEach((x) =>
            x.classList.toggle('on', x.getAttribute('data-goto') === en.target.id));
        });
      }, { rootMargin: '-25% 0px -65% 0px' });
      ['youPass', 'youRoute', 'youPassport', 'readyCard', 'packCard'].forEach((i) => {
        const el = $(i); if (el) spy.observe(el);
      });
    }
  }

  /* AI-3 · the live concierge: one message → today re-plans around it */
  const cxFormEl = $('cxForm');
  if (cxFormEl) cxFormEl.onsubmit = async (e) => {
    e.preventDefault();
    const inp = $('cxInput');
    const msg = inp.value.trim();
    if (!msg) return;
    const btn = cxFormEl.querySelector('button');
    const note = $('cxNote');
    btn.disabled = true;
    note.hidden = false;
    note.textContent = '▸ your concierge is adjusting today…';
    try {
      const { data, error } = await sb.functions.invoke('plan-engine', { body: { action: 'adjust', message: msg } });
      if (error || !data || data.error || !data.reply) {
        note.textContent = 'concierge unavailable — try again';
        btn.disabled = false;
        return;
      }
      DAY_PLAN = (data.slots && data.slots.length) ? data.slots : DAY_PLAN;
      DAY_PLAN_ADJUSTED = true;
      CX_NOTE = data.reply;
      inp.value = '';
      note.hidden = true;
      btn.disabled = false;
      if (todayCtx) renderToday(todayCtx.trip, todayCtx.name, todayCtx.places);
    } catch (_) {
      note.textContent = 'concierge unavailable — try again';
      btn.disabled = false;
    }
  };

  /* Wave 4: the edge function — search Google Maps, add to our data.
     Key never touches the client; supabase-js sends the user's JWT. */
  async function googleSearch(query) {
    const { data, error } = await sb.functions.invoke('places-search', { body: { action: 'search', query } });
    if (error) { console.error('[Prevoya] google search failed:', error.message); return null; }
    if (data && data.error) { console.error('[Prevoya] search:', data.error); return data.error === 'search-not-configured' ? null : []; }
    return (data && data.candidates) || [];
  }
  async function googleAdd(candidate) {
    const { data, error } = await sb.functions.invoke('places-search', { body: { action: 'add', place_id: candidate.google_place_id } });
    if (error) { console.error('[Prevoya] add place failed:', error.message); return null; }
    if (data && data.error) { console.error('[Prevoya] add:', data.error); return null; }
    return (data && data.place) || null;
  }

  /* ─── readiness + packing (slice 6) ───
   * Auto-generated from the brief once, then the user owns the list.
   * Duration-aware visa items are the credibility play: a 2-week brief
   * gets VOA guidance, a 3-monther gets B211A before-you-fly. */
  const PRETRIP_BASE = [
    'Travel insurance that covers scooter riding',
    'eSIM installed before landing (Telkomsel / by.U)',
    'International Driving Permit — police checks are real',
    'Tell your bank + know the ATM plan (BCA/Mandiri)',
    'Travel pharmacy: rehydration salts, charcoal, motion pills'
  ];
  const VISA_BY_DUR = {
    14: 'Visa on Arrival at DPS — IDR 500k, 30 days. Passport valid 6+ months',
    30: 'Visa on Arrival + plan the EXTENSION — start it around day 20, not day 29',
    90: 'A 30-day VOA won’t cut it — sort a B211A (60 days, extendable) BEFORE you fly',
    0:  'Open-ended: B211A visa (60d, extendable ×2) — arrange it before the flight'
  };
  const PACK_BASE = [
    'Passport — 6+ months validity',
    'Type C/F plug adapter',
    'Reef-safe sunscreen',
    'Light rain layer (yes, even in dry season)'
  ];
  const PACK_VIBE = {
    surf:     ['Reef booties', 'Zinc stick', 'Board sock for the scooter rack'],
    nomad:    ['Laptop stand', 'Noise-cancelling buds', 'Power bank'],
    wellness: ['Yoga mat towel', 'Mosquito spray', 'Layers for cool jungle nights'],
    party:    ['One good shirt', 'Electrolytes', 'Sunglasses you can afford to lose'],
    mix:      ['Power bank', 'Electrolytes', 'Daypack']
  };
  function buildAutoItems(t) {
    const out = [];
    const d = t && t.duration_days != null ? t.duration_days : 30;
    out.push({ kind: 'pretrip', label: VISA_BY_DUR[d] || VISA_BY_DUR[30], auto: true });
    PRETRIP_BASE.forEach((l) => out.push({ kind: 'pretrip', label: l, auto: true }));
    PACK_BASE.forEach((l) => out.push({ kind: 'packing', label: l, auto: true }));
    (PACK_VIBE[t && t.vibe] || PACK_VIBE.mix).forEach((l) => out.push({ kind: 'packing', label: l, auto: true }));
    return out;
  }

  let checkItems = [];
  let repack = null; /* { location, packed:Set } while a repack run is live */

  function checkRow(i) {
    const inRepack = repack && i.kind === 'packing';
    const on = inRepack ? repack.packed.has(i.id) : !!i.done;
    return '<li data-id="' + esc(i.id) + '">' +
      '<button type="button" class="chk' + (on ? ' on' : '') + '" aria-label="toggle">' + (on ? '✓' : '') + '</button>' +
      '<span class="lbl' + (on && !inRepack ? ' done' : '') + '">' + esc(i.label) + '</span>' +
      (inRepack ? '' : '<button type="button" class="sl-del" aria-label="delete">✕</button>') +
    '</li>';
  }

  function renderChecklists() {
    const pre = checkItems.filter((i) => i.kind === 'pretrip');
    const pack = checkItems.filter((i) => i.kind === 'packing');
    $('pretripList').innerHTML = pre.map(checkRow).join('') ||
      '<li class="sl-empty">Nothing yet — add your first item.</li>';
    $('packList').innerHTML = pack.map(checkRow).join('') ||
      '<li class="sl-empty">Nothing yet — add what you carry.</li>';
    const doneN = pre.filter((i) => i.done).length;
    const pct = pre.length ? Math.round((doneN / pre.length) * 100) : 0;
    $('readyPct').textContent = 'READY ' + pct + '%';
    $('readyPct').className = 'pace-delta ' + (pct >= 80 ? 'good' : pct >= 40 ? '' : 'bad');
    /* N2: the pass is an instrument */
    const bd = $('bpDay'), br = $('bpReady');
    if (br) br.textContent = pct + '%';
    if (bd) {
      const lbl = tripDayLabel(trip, baliNow());  /* same helper as the Today strip */
      bd.textContent = lbl ? lbl.replace('DAY ', 'DAY ').replace('/', ' / ') : '—';
    }
    /* nudge on Today: last-day repack beats the top open pretrip item */
    paintNudge();
  }

  async function loadReadiness() {
    const { data, error } = await sb.from('checklist_items').select('*').order('created_at');
    if (error) { console.error('[Prevoya] checklist load failed:', error.message); return; }
    checkItems = data || [];
    if (trip && trip.vibe && !checkItems.some((i) => i.auto)) {
      const gen = buildAutoItems(trip).map((g) => ({ ...g, user_id: user.id }));
      const { data: ins, error: e2 } = await sb.from('checklist_items').insert(gen).select();
      if (e2) console.error('[Prevoya] checklist generate failed:', e2.message);
      else checkItems = checkItems.concat(ins || []);
    }
    renderChecklists();
    loadMissing();
  }

  async function loadMissing() {
    const { data, error } = await sb.from('repack_runs').select('*')
      .order('created_at', { ascending: false }).limit(3);
    if (error) { console.error('[Prevoya] repack load failed:', error.message); return; }
    const runs = (data || []).filter((r) => r.missing && r.missing.length);
    $('missingWrap').hidden = !runs.length;
    $('missingList').innerHTML = runs.map((r) =>
      r.missing.map((label) =>
        '<li><span class="sl-cat">' + esc(label) + '</span>' +
        '<span class="sl-time">last packed leaving ' + esc(r.location || 'somewhere') + ' · ' +
        new Date(r.created_at).toLocaleDateString([], { day: 'numeric', month: 'short' }) + '</span></li>'
      ).join('')
    ).join('');
  }

  async function toggleItem(id) {
    const item = checkItems.find((i) => i.id === id);
    if (!item) return;
    if (repack && item.kind === 'packing') {
      /* repack run: check = packed, in memory until Done */
      if (repack.packed.has(id)) repack.packed.delete(id);
      else repack.packed.add(id);
      renderChecklists();
      return;
    }
    item.done = !item.done;
    renderChecklists();
    const { error } = await sb.from('checklist_items').update({ done: item.done }).eq('id', id);
    if (error) { console.error('[Prevoya] toggle failed:', error.message); item.done = !item.done; renderChecklists(); }
  }

  async function deleteItem(id) {
    checkItems = checkItems.filter((i) => i.id !== id);
    renderChecklists();
    const { error } = await sb.from('checklist_items').delete().eq('id', id);
    if (error) { console.error('[Prevoya] item delete failed:', error.message); loadReadiness(); }
  }

  async function addItem(kind, label) {
    if (!label.trim()) return;
    const { data, error } = await sb.from('checklist_items')
      .insert({ user_id: user.id, kind, label: label.trim(), auto: false }).select();
    if (error) { console.error('[Prevoya] item add failed:', error.message); return; }
    checkItems = checkItems.concat(data || []);
    renderChecklists();
  }

  function setRepackUI() {
    $('repackBtn').textContent = repack ? '✕ cancel repack' : '🎒 Repack mode';
    $('repackHint').hidden = !repack;
    $('repackDone').hidden = !repack;
    $('repackStart').hidden = true;
    renderChecklists();
  }

  async function finishRepack() {
    const pack = checkItems.filter((i) => i.kind === 'packing');
    const packedIds = pack.filter((i) => repack.packed.has(i.id)).map((i) => i.id);
    const missing = pack.filter((i) => !repack.packed.has(i.id)).map((i) => i.label);
    const location = repack.location;
    const { error } = await sb.from('repack_runs').insert({ user_id: user.id, location, missing });
    if (error) { console.error('[Prevoya] repack save failed:', error.message); return; }
    if (packedIds.length) await sb.from('checklist_items').update({ done: true }).in('id', packedIds);
    const missingIds = pack.filter((i) => !repack.packed.has(i.id)).map((i) => i.id);
    if (missingIds.length) await sb.from('checklist_items').update({ done: false }).in('id', missingIds);
    repack = null;
    setRepackUI();
    loadReadiness();
  }

  /* Y1: install experience — native prompt where the browser offers one,
     illustrated Safari steps on iOS, honest fallback elsewhere */
  let deferredInstall = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e;
    updateInstallCard();
  });
  function updateInstallCard() {
    const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true;
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    $('installedMark').hidden = !standalone;
    $('installBtn').hidden = standalone || !deferredInstall;
    $('iosSteps').hidden = standalone || !isIOS;
    $('installFallback').hidden = standalone || isIOS || !!deferredInstall;
    if (standalone) $('installWhy').textContent = 'Prevoya lives on your home screen. See you out there.';
  }
  /* R5 (CHAT_FIRST_SURFACE_RULINGS): install surfaces post-auth on Today —
     below the readiness nudge, dismissible, shown at most twice ever
     (first open + once more on the 3rd if never dismissed-by-action).
     Never a modal, never pre-auth. Aviv never learned it installs. */
  function installNudgeMaybe() {
    const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true;
    if (standalone) return;
    try {
      if (localStorage.getItem('tripos_install_done')) return;
      const opens = (+localStorage.getItem('tripos_install_opens') || 0) + 1;
      localStorage.setItem('tripos_install_opens', String(opens));
      const shown = +localStorage.getItem('tripos_install_shown') || 0;
      if (shown >= 2) return;
      if (!(opens === 1 || (opens >= 3 && shown === 1))) return;
      localStorage.setItem('tripos_install_shown', String(shown + 1));
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const card = document.createElement('div');
      card.className = 'install-nudge';
      card.innerHTML =
        '<button type="button" class="in-x" aria-label="dismiss">✕</button>' +
        '<p class="in-line">put Prevoya on your home screen — it works offline on the island.</p>' +
        (isIOS
          ? '<p class="in-steps">Safari: tap <strong>share</strong> ↑ then <strong>Add to Home Screen</strong></p>'
          : (deferredInstall ? '<button type="button" class="ri-replan in-go">install →</button>' : ''));
      const anchor = $('readyNudge');
      if (anchor && anchor.parentElement) anchor.insertAdjacentElement('afterend', card);
      else { const panel = $('panel-today'); panel.insertBefore(card, panel.firstChild); }
      card.querySelector('.in-x').onclick = () => { card.remove(); localStorage.setItem('tripos_install_done', '1'); };
      const go = card.querySelector('.in-go');
      if (go) go.onclick = () => {
        if (deferredInstall) deferredInstall.prompt();
        card.remove();
        localStorage.setItem('tripos_install_done', '1');
      };
    } catch (_) {}
  }

  $('installBtn').addEventListener('click', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    const choice = await deferredInstall.userChoice.catch(() => null);
    if (choice && choice.outcome === 'accepted') deferredInstall = null;
    updateInstallCard();
  });

  /* preview/debug: inject checklist state without a session */
  Object.assign(window.__appDebug, {
    injectReadiness: (t, items, rpk) => { trip = t; checkItems = items; repack = rpk || null; renderChecklists(); },
    injectToday: (t, places) => { todayCtx = { trip: t, name: '', places: places || [] }; },
    buildAutoItems, paintNudge, mountPlacesTab,
    injectCuration: (places) => { isAdmin = true; loadCurationDesk(places); },
    realityRegion, autoAnchor /* REALITY FIRST slice 0 — decision logic testable */
  });

  /* upsert a brief (from the questionnaire or a pre-login landing run) */
  async function saveBrief(a) {
    const { data: up, error } = await sb.from('trips').upsert({
      user_id: user.id, destination: 'bali',
      vibe: a.vibe || null,
      vibe_detail: a.vibe_detail || null,
      party: a.party || null,
      party_detail: a.party_detail || null,
      duration_days: a.dur != null ? parseInt(a.dur, 10) : null,
      budget_tier: a.tier || null,
      priorities: a.priorities && a.priorities.length ? a.priorities : null,
      arrive: a.arrive || null,
      musts: a.musts || null /* their locked-in plans ride from the chat (2026-08-24) */
    }, { onConflict: 'user_id,destination' }).select();
    if (error) console.error('[Prevoya] brief save failed:', error.message);
    try { localStorage.setItem('tripos_plan', JSON.stringify(a)); } catch (_) {}
    return (up && up[0]) || null;
  }

  /* chat-first: claim the concierge's draft route verbatim (≤24h old).
     Returns true only when ≥2 real legs landed; any failure falls back to
     genRoute so the ceremony never breaks. */
  async function claimDraftRoute() {
    try {
      const d = JSON.parse(localStorage.getItem('tripos_draft_route') || 'null');
      if (!d || !d.at || Date.now() - d.at > 86400e3) return false;
      const legs = (d.legs || []).filter((l) => l && l.area && (l.nights || 0) >= 1);
      if (legs.length < 2) return false;
      await sb.from('trip_legs').delete().eq('trip_id', trip.id);
      await sb.from('day_plans').delete().eq('trip_id', trip.id);
      const rows = legs.map((l, i) => ({
        trip_id: trip.id, seq: i + 1, area: l.area, nights: Math.round(l.nights),
        why: l.why || null, status: i === 0 ? 'current' : 'planned', engine_version: 'route-v1-draft'
      }));
      const { data: saved, error } = await sb.from('trip_legs').insert(rows).select();
      if (error || !saved || saved.length < 2) return false;
      const ts = new Date().toISOString();
      await sb.from('trips').update({ route_summary: d.summary || null, route_generated_at: ts }).eq('id', trip.id);
      trip.route_summary = d.summary || null;
      trip.route_generated_at = ts;
      TRIP_LEGS = saved;
      localStorage.removeItem('tripos_draft_route');
      return true;
    } catch (_) { return false; }
  }

  /* ─── AI-1a: call the plan-engine, refresh legs. Returns true only when a
     real ≥2-leg route landed. Every failure path is silent-classic. ─── */
  async function genRoute() {
    ROUTE_GENERATING = true;
    try {
      const { data, error } = await sb.functions.invoke('plan-engine', { body: { action: 'route' } });
      ROUTE_GENERATING = false;
      if (error || !data || data.error) {
        console.warn('[Prevoya] plan-engine:', (data && data.error) || (error && error.message) || 'unreachable');
        CONCIERGE_DOWN = true; /* §G: Today explains the silence honestly */
        if (trip) trip.route_generated_at = trip.route_generated_at || new Date().toISOString();
        return false;
      }
      CONCIERGE_DOWN = false;
      TRIP_LEGS = data.legs || [];
      if (trip) {
        trip.route_summary = data.summary || null;
        trip.route_generated_at = new Date().toISOString();
        /* F2: a new route is an unrevealed route — the reveal is a trip state */
        trip.route_revealed_at = null;
        await sb.from('trips').update({ route_revealed_at: null }).eq('id', trip.id);
      }
      return TRIP_LEGS.length >= 2;
    } catch (e) {
      ROUTE_GENERATING = false;
      CONCIERGE_DOWN = true;
      console.warn('[Prevoya] plan-engine unreachable:', e && e.message);
      return false;
    }
  }

  /* F2 · the landing-path interstitial: auth on the lock → the app opens
     INTO the build terminal — honest lines, generation genuinely running
     behind them. Resolves when the route lands (or honestly doesn't). */
  function routeInterstitial() {
    return new Promise((resolve) => {
      show('checkin');
      $('appCkMount').hidden = true;
      $('appCkDots').style.display = 'none';
      $('appCkBuild').hidden = false;
      $('appCkFill').style.width = '0';
      const term = $('appCkTerm');
      term.innerHTML = '';
      const addLn = (html) => {
        const ln = document.createElement('span');
        ln.className = 'ln'; ln.innerHTML = html; term.appendChild(ln);
      };
      addLn('▸ brief received <span class="ok">✓</span>');
      setTimeout(() => { $('appCkFill').style.width = '100%'; }, 60);
      const nights = trip && trip.duration_days ? trip.duration_days : 30;
      setTimeout(() => addLn('▸ routing your ' + nights + ' nights across the island…'), 480);
      genRoute().then((ok) => {
        addLn(ok ? '▸ route ready <span class="ok">✓</span>'
                 : '▸ routing unavailable — your base plan is ready');
        setTimeout(() => { $('appCkDots').style.display = ''; resolve(ok); }, ok ? 700 : 1400);
      });
    });
  }

  /* ─── AI-2a: today's plan for the current (leg, day). Generation is lazy —
     one engine call per leg, cached in day_plans; failures stay silent and
     the rails simply keep their classic suggestion behavior. ─── */
  const daysTried = {}; /* leg_seq → true, stops same-session retry loops */
  const offdayTried = {}; /* `${area}:${day}` → true, same guard for off-route */

  /* F1 · the concierge follows you: off-route days get their OWN generated
     plan for the actual area (leg_seq 0 rows, keyed by trip-day). Engine
     fails → suggestions-only + the amber line — today's behavior, explained. */
  async function loadOffDayPlan(ov) {
    const day = Math.max(1, tripDayNumber(trip, baliNow()) || 1);
    const { data } = await sb.from('day_plans').select('slots, area')
      .eq('trip_id', trip.id).eq('leg_seq', 0).eq('day_in_leg', day).limit(1);
    if (data && data[0] && data[0].area === ov) {
      DAY_PLAN = data[0].slots || null;
      DAY_PLAN_OFFROUTE = !!DAY_PLAN;
      return;
    }
    const k = ov + ':' + day;
    if (offdayTried[k]) return;
    offdayTried[k] = true;
    OFFDAY_GENERATING = true;
    if (todayCtx) renderToday(todayCtx.trip, todayCtx.name, todayCtx.places);
    try {
      const { data: gen, error } = await sb.functions.invoke('plan-engine', { body: { action: 'offday', area: ov } });
      OFFDAY_GENERATING = false;
      if (error || !gen || gen.error || !(gen.slots || []).length) {
        console.warn('[Prevoya] offday:', (gen && gen.error) || (error && error.message) || 'empty');
        if (todayCtx) renderToday(todayCtx.trip, todayCtx.name, todayCtx.places);
        return;
      }
      DAY_PLAN = gen.slots;
      DAY_PLAN_OFFROUTE = true;
      /* discovery may have grown the dataset mid-call (same as leg plans) */
      if (todayCtx && DAY_PLAN.some((sl) =>
            !todayCtx.places.find((x) => String(x.id) === String(sl.place_id)))) {
        const { data: allP } = await sb.from('curated_places').select('*').eq('destination', 'bali');
        if (allP && allP.length) { todayCtx.places = allP; mountPlacesTab(allP); }
      }
      if (todayCtx) renderToday(todayCtx.trip, todayCtx.name, todayCtx.places);
    } catch (e) {
      OFFDAY_GENERATING = false;
      console.warn('[Prevoya] offday unreachable:', e && e.message);
      if (todayCtx) renderToday(todayCtx.trip, todayCtx.name, todayCtx.places);
    }
  }

  async function loadDayPlan() {
    DAY_PLAN = null;
    DAY_PLAN_ADJUSTED = false; /* a fresh (leg, day) clears yesterday's adjustment */
    DAY_PLAN_OFFROUTE = false;
    CX_NOTE = null;
    const rs = routeState(trip, TRIP_LEGS, baliNow());
    const ovNow = offRoute(trip, rs);
    if (ovNow) { await loadOffDayPlan(ovNow); return; }
    if (!rs || !rs.cur) return;
    const legSeq = rs.cur.idx + 1;
    const { data } = await sb.from('day_plans').select('slots')
      .eq('trip_id', trip.id).eq('leg_seq', legSeq).eq('day_in_leg', rs.cur.nightOf).limit(1);
    if (data && data[0]) { DAY_PLAN = data[0].slots || null; return; }
    /* nothing for this leg yet → generate once in the background */
    if (daysTried[legSeq]) return;
    daysTried[legSeq] = true;
    DAYS_GENERATING = true; /* F7: the current rail hums while this runs */
    if (todayCtx) renderToday(todayCtx.trip, todayCtx.name, todayCtx.places);
    try {
      const { data: gen, error } = await sb.functions.invoke('plan-engine', { body: { action: 'days', leg_seq: legSeq } });
      DAYS_GENERATING = false;
      if (error || !gen || gen.error) {
        console.warn('[Prevoya] day-plan:', (gen && gen.error) || (error && error.message) || 'unreachable');
        if (todayCtx) renderToday(todayCtx.trip, todayCtx.name, todayCtx.places);
        return;
      }
      const { data: fresh } = await sb.from('day_plans').select('slots')
        .eq('trip_id', trip.id).eq('leg_seq', legSeq).eq('day_in_leg', rs.cur.nightOf).limit(1);
      if (fresh && fresh[0]) {
        DAY_PLAN = fresh[0].slots || null;
        /* AI-2b: discovery may have grown the dataset mid-call — if the plan
           references places we haven't loaded, refresh the pool so planned
           slots resolve (and the Places tab shows the new ◔ discovered rows) */
        if (todayCtx && (DAY_PLAN || []).some((sl) =>
              !todayCtx.places.find((x) => String(x.id) === String(sl.place_id)))) {
          const { data: allP } = await sb.from('curated_places').select('*').eq('destination', 'bali');
          if (allP && allP.length) { todayCtx.places = allP; mountPlacesTab(allP); }
        }
        if (todayCtx) renderToday(todayCtx.trip, todayCtx.name, todayCtx.places);
      }
    } catch (e) {
      DAYS_GENERATING = false;
      console.warn('[Prevoya] day-plan unreachable:', e && e.message);
      if (todayCtx) renderToday(todayCtx.trip, todayCtx.name, todayCtx.places);
    }
  }

  /* replan flow (spec §3): confirm already happened (riGo) → old route
     crossfades out → honest terminal line in place → new route drops in */
  async function replanRoute() {
    const host = $('youRoute');
    const instr = host && host.querySelector('.route-instr');
    if (!instr) return;
    instr.classList.add('ri-fade');
    const nights = trip && trip.duration_days ? trip.duration_days : 30;
    setTimeout(() => {
      instr.innerHTML = '<div class="ck-term" style="min-height:52px"><span class="ln">▸ re-routing your ' +
        nights + ' nights…</span></div>';
      instr.classList.remove('ri-fade');
    }, 220);
    const ok = await genRoute();
    if (ok) {
      renderRoute(trip, TRIP_LEGS, baliNow(), { reveal: true, onReplan: replanRoute, onOverride: setOverride, onShare: shareRoute });
      /* the replan IS this route's reveal — don't replay it next open (F2) */
      trip.route_revealed_at = new Date().toISOString();
      sb.from('trips').update({ route_revealed_at: trip.route_revealed_at }).eq('id', trip.id)
        .then(({ error }) => { if (error) console.warn('[Prevoya] reveal mark failed:', error.message); });
      updateStrip(trip, greetName(), baliNow());
      paintNudge();
      /* the old route's day plans died with it (server-side) — start fresh */
      DAY_PLAN = null;
      Object.keys(daysTried).forEach((k) => delete daysTried[k]);
      loadDayPlan().then(() => { if (todayCtx) renderToday(todayCtx.trip, todayCtx.name, todayCtx.places); });
    } else {
      instr.querySelector('.ck-term').innerHTML =
        '<span class="ln">▸ routing unavailable — your current route stands</span>';
      setTimeout(() => renderRoute(trip, TRIP_LEGS, baliNow(), { onReplan: replanRoute, onOverride: setOverride, onShare: shareRoute }), 1600);
    }
  }

  /* AI-2.5: persist the deviation; every surface repaints from one place */
  async function setOverride(area, opts) {
    const val = area || null;
    const { error } = await sb.from('trips').update({ area_override: val }).eq('id', trip.id);
    if (error) { console.error('[Prevoya] override save failed:', error.message); return; }
    trip.area_override = val;
    renderRoute(trip, TRIP_LEGS, baliNow(), { onReplan: replanRoute, onOverride: setOverride, onShare: shareRoute });
    if (todayCtx) { todayCtx.trip = trip; renderToday(trip, todayCtx.name, todayCtx.places); }
    else updateStrip(trip, greetName(), baliNow());
    paintNudge();
    /* F1: the plan follows the override — leg plan back on-route, generated
       off-route plan otherwise (lazy; the amber line narrates the wait) */
    loadDayPlan().then(() => { if (todayCtx) renderToday(todayCtx.trip, todayCtx.name, todayCtx.places); });
    if (!(opts && opts.quiet)) setTab('today'); /* the goal was "fix Today" — don't strand them on You (Rachel §4) */
  }

  /* ═══ REALITY FIRST · slice 0 (Guy, 2026-08-28) ═══════════════════════
     The plan is a hypothesis; evidence outranks it. The freshest LIVE
     check-in region (today/yesterday, Bali clock) anchors Today through the
     existing off-route machinery — no tap required. A check-in back in the
     leg's own region clears a stale override: reality rejoined the plan.
     (Guy's repro: 7 days of Ubud check-ins while Today preached Uluwatu.)
     Refinements — freshness window, retro handling, re-flow proposals —
     are ATLAS/Rachel's per from_cto_reality_first_*.md. */
  function realityRegion() {
    const now = baliNow();
    const key = (y, m, d) => y + '-' + m + '-' + d;
    const todayK = key(now.getFullYear(), now.getMonth(), now.getDate());
    const yd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const ydK = key(yd.getFullYear(), yd.getMonth(), yd.getDate());
    for (let i = CHECKINS.length - 1; i >= 0; i--) { /* chronological list, newest last */
      const c = CHECKINS[i];
      const b = baliDateOf(c.created_at);
      const k = key(b.y, b.m, b.d);
      if (k !== todayK && k !== ydK) break;
      const reg = latLngRegion(c.lat, c.lng);
      if (reg) return reg;
    }
    return null;
  }
  async function autoAnchor() {
    try {
      if (!trip || TRIP_LEGS.length < 1) return false;
      const reg = realityRegion();
      if (!reg) return false;
      const rs = routeState(trip, TRIP_LEGS, baliNow());
      const legArea = rs && rs.cur ? rs.cur.area : null;
      const effective = trip.area_override || legArea;
      if (reg === effective) return false;                /* screen already tells the truth */
      if (reg === legArea && trip.area_override) {        /* reality rejoined the plan */
        await setOverride(null, { quiet: true });
        return true;
      }
      await setOverride(reg, { quiet: true });            /* evidence wins */
      track('auto_anchor', { to: reg });
      return true;
    } catch (_) { return false; }
  }

  /* ONE nudge painter — last-day repack beats the readiness item (spec §2);
     while off-route the "moving tomorrow" nudge would mislead — suppressed */
  function paintNudge() {
    const nudge = $('readyNudge');
    if (!nudge) return;
    const rs = routeState(trip, TRIP_LEGS, baliNow());
    /* §H day-2 pre-trip: the countdown + readiness line — the pass's numbers
       are the thing being protected; our streak, without the guilt. (The
       push variant needs push infra; this is the no-permission banner.) */
    const tdN = tripDayNumber(trip, baliNow());
    if (tdN != null && tdN < 1 && LAYERS.today) {
      const pre = (checkItems || []).filter((i) => i.kind === 'pretrip');
      if (pre.length) {
        const pct = Math.round(pre.filter((i) => i.done).length / pre.length * 100);
        nudge.hidden = false;
        nudge.innerHTML = (1 - tdN) + ' DAYS · READY ' + pct + '% · open your checklist →';
        return;
      }
    }
    if (rs && rs.lastDay && rs.next && !offRoute(trip, rs)) {
      nudge.hidden = false;
      /* F5: the leg boundary is a pride beat — the visa page just filled */
      nudge.innerHTML = '🎒 Moving to <strong>' + esc(rs.next.area) + '</strong> tomorrow — run your repack? →' +
        '<span class="nudge-share" role="button">your ' + esc(rs.cur.area) + ' page is complete · ↗ share</span>';
      return;
    }
    const urgent = (checkItems || []).filter((i) => i.kind === 'pretrip').find((i) => !i.done);
    nudge.hidden = !urgent;
    if (urgent) nudge.innerHTML = '⚠ <strong>' + esc(urgent.label) + '</strong> · readiness →';
  }

  /* ─── CURATION DESK (admins only — RLS enforces; the client just paints).
     The credibility ratchet: ◔ discovered → Guy's eye → ✓ verified (or gone).
     S1 grows from S3, and every promotion upgrades every future plan. ─── */
  let isAdmin = false;
  async function loadCurationDesk(places) {
    const card = $('curateCard');
    if (!card) return;
    if (!isAdmin) {
      const { data } = await sb.from('app_admins').select('user_id').limit(1);
      isAdmin = !!(data && data.length);
    }
    if (!isAdmin) { card.hidden = true; return; }
    const queue = (places || []).filter((p) => p.source === 'google' && !p.verified);
    $('curateCount').textContent = queue.length + ' AWAITING';
    $('curateCount').className = 'pace-delta cur-count'; /* pending work = attention amber */
    card.hidden = false;
    $('curateList').innerHTML = queue.length ? queue.map((p) =>
      '<div class="cur-row" data-id="' + esc(p.id) + '">' +
        '<button type="button" class="cur-head">' +
          '<span class="cur-badge">◔</span>' +
          '<span class="cur-name">' + esc(p.name) + '</span>' +
          '<span class="cur-meta">' + esc((p.area || '').split('/')[0].trim()) + ' · ' + esc(p.category) + '</span>' +
          '<span class="ri-caret">▾</span>' +
        '</button>' +
        '<div class="cur-body" hidden>' +
          '<p class="sec-context">Approve and the concierge researches it — real reviews, hours, prices — writes the full intel, and verifies it. One tap.</p>' +
          '<div class="cur-actions">' +
            '<button type="button" class="btn btn-primary cur-verify">✓ approve — research &amp; verify</button>' +
            '<button type="button" class="ck-reset cur-reject">✕ reject</button>' +
          '</div>' +
          '<p class="pulse-note cur-note" hidden></p>' +
        '</div>' +
      '</div>'
    ).join('') : '<p class="sec-context">Queue clear — nothing awaiting review.</p>';

    $('curateList').onclick = async (e) => {
      const row = e.target.closest('.cur-row');
      if (!row) return;
      const id = row.getAttribute('data-id');
      if (e.target.closest('.cur-head')) {
        const body = row.querySelector('.cur-body');
        body.hidden = !body.hidden;
        row.querySelector('.ri-caret').textContent = body.hidden ? '▾' : '▴';
        return;
      }
      const note = row.querySelector('.cur-note');
      const fail = (msg) => { note.hidden = false; note.textContent = msg + ' — tap to retry'; };
      if (e.target.closest('.cur-verify')) {
        /* Guy approves → the engine researches (Google reviews/hours/prices)
           and writes curated-grade intel, grounded only in that data */
        const btn = row.querySelector('.cur-verify');
        btn.disabled = true;
        btn.textContent = 'researching the place…';
        try {
          const { data, error } = await sb.functions.invoke('plan-engine', { body: { action: 'enrich', place_id: id } });
          if (error || !data || data.error || !data.place) {
            btn.disabled = false;
            btn.innerHTML = '✓ approve — research &amp; verify';
            fail('research failed');
            return;
          }
          if (todayCtx) {
            const i = todayCtx.places.findIndex((x) => String(x.id) === String(id));
            if (i !== -1) todayCtx.places[i] = data.place;
          }
          /* the ceremony: ◔ graduates to ✓ before the row leaves the queue —
             the credibility ratchet made visible (Rachel §3) */
          const badge = row.querySelector('.cur-badge');
          if (badge) { badge.textContent = '✓'; badge.classList.add('done'); }
          setTimeout(refreshAfterCuration, 450);
        } catch (_) {
          btn.disabled = false;
          btn.innerHTML = '✓ approve — research &amp; verify';
          fail('research failed');
        }
        return;
      }
      if (e.target.closest('.cur-reject')) {
        const { error } = await sb.from('curated_places').delete().eq('id', id);
        if (error) { fail('didn’t delete'); return; }
        if (todayCtx) todayCtx.places = todayCtx.places.filter((x) => String(x.id) !== String(id));
        refreshAfterCuration();
      }
    };
  }
  function refreshAfterCuration() {
    if (!todayCtx) return;
    mountPlacesTab(todayCtx.places);
    renderToday(todayCtx.trip, todayCtx.name, todayCtx.places);
    loadCurationDesk(todayCtx.places);
  }

  /* stage B: the branched questionnaire, in-app */
  function openCheckin() {
    show('checkin');
    $('appCkBuild').hidden = true;
    $('appCkFill').style.width = '0';
    $('appCkMount').hidden = false;
    mountCheckin($('appCkMount'), $('appCkDots'), (answers) => {
      $('appCkMount').hidden = true;
      $('appCkDots').style.display = 'none';
      $('appCkBuild').hidden = false;
      const lines = [
        '▸ reading your vibe: ' + (VIBE_LABEL[answers.vibe] || answers.vibe) +
          (answers.vibe_detail_label ? ' · ' + answers.vibe_detail_label : ''),
        '▸ matching our curated spots to your brief…',
        '▸ saving to your account…',
        '▸ brief ready <span class="ok">✓</span>'
      ];
      const term = $('appCkTerm');
      term.innerHTML = '';
      setTimeout(() => { $('appCkFill').style.width = '100%'; }, 60);
      let i = 0;
      const tick = () => {
        const ln = document.createElement('span');
        ln.className = 'ln';
        ln.innerHTML = lines[i];
        term.appendChild(ln);
        i++;
        if (i < lines.length) setTimeout(tick, 520);
        else setTimeout(async () => {
          trip = await saveBrief(answers);
          /* AI-1a: route while the terminal holds — honest lines only */
          const addLn = (html) => {
            const ln = document.createElement('span');
            ln.className = 'ln'; ln.innerHTML = html; term.appendChild(ln);
          };
          addLn('▸ routing your legs across the island…');
          const ok = await genRoute();
          addLn(ok ? '▸ route ready <span class="ok">✓</span>'
                   : '▸ routing unavailable — your base plan is ready');
          $('appCkDots').style.display = '';
          freshLogin = true; /* re-use the arrival moment for a fresh brief */
          /* F2: genRoute cleared route_revealed_at — loadShell owns the
             reveal now (one code path for every entry into a fresh route) */
          await loadShell();
        }, 600);
      };
      tick();
    });
  }

  /* ═══════════ FIRST-OPEN CORRIDOR — FIRST_OPEN_SPEC §A–§E ═══════════
     open → Bali is already alive → 3 questions → the route unwraps → your
     name types onto the pass → send it → morning-note ask → tab bar rises.
     Once, ever: profiles.first_open_done_at (server-side — the F3 lesson).
     Engine down → NO ceremony (a ceremony for a fallback is theater). */

  const wait = (ms) => new Promise((r) => setTimeout(r, REDUCED_MOTION() ? 0 : ms));
  let corridorPool = null; /* §A fetches the pool early; loadShell reuses it */

  /* §A · Bali is already alive — one screen, one action */
  async function corridorScreenA() {
    show('corridorA');
    const paint = () => {
      const s = dayState(baliNow());
      const dial = $('corrDial');
      dial.dataset.phase = s.phase;
      dial.style.setProperty('--od-angle', s.angle.toFixed(1) + 'deg');
      const c = PHASE_COLOR[s.phase];
      const rim = dial.querySelector('.od-rim'), pin = dial.querySelector('.od-pin'), ping = dial.querySelector('.od-ping');
      if (rim) rim.style.stroke = c;
      if (pin) { pin.style.fill = c; pin.style.filter = 'drop-shadow(0 0 4px ' + c + ')'; }
      if (ping) ping.style.stroke = c;
      $('corrClock').textContent = 'BALI · ' + String(s.h).padStart(2, '0') + ':' +
        String(s.m).padStart(2, '0') + ' · ' + PHASE_WORD[s.phase];
    };
    paint();
    const tick = setInterval(paint, 30000);
    const { data: pool } = await sb.from('curated_places').select('*').eq('destination', 'bali');
    corridorPool = pool || [];
    /* tonight's ONE highlight — time-matched like a NOW card, verified
       preferred. Nothing matches → the card does not render (never-fake). */
    const dayKey = DAY_KEYS[baliNow().getDay()];
    const tonightTags = ['sunset', 'evening', 'night'];
    const cands = corridorPool
      .filter((p) => (p.best_time || []).some((t) => tonightTags.indexOf(t) !== -1))
      .sort((a, b) => ((b.verified ? 1 : 0) - (a.verified ? 1 : 0)) ||
        ((((b.best_days || []).indexOf(dayKey) !== -1) ? 1 : 0) - (((a.best_days || []).indexOf(dayKey) !== -1) ? 1 : 0)));
    const t = cands[0];
    if (t) {
      const meta = CAT_META[t.category] || { orb: 'planet-teal' };
      $('corrTonight').innerHTML =
        '<span class="orb ' + meta.orb + ' corr-t-orb"></span>' +
        '<div class="corr-t-text"><div class="corr-t-name">' + esc(t.name) +
        (t.verified ? '<span class="place-verified">✓</span>' : '') +
        ' <span class="corr-t-area">' + esc(String(t.area).split('/')[0].trim().toUpperCase()) + '</span></div>' +
        (t.why ? '<p class="corr-t-why">' + esc(t.why) + '</p>' : '') + '</div>';
      $('corrTonight').hidden = false;
    }
    const nVer = corridorPool.filter((p) => p.verified).length;
    $('corrCounts').textContent = nVer + ' verified places · updated ' + baliNow().getFullYear();
    await new Promise((res) => { $('corrCta').onclick = res; });
    clearInterval(tick);
  }

  /* corridor questionnaire — the checkin screen, resolving with answers
     (the corridor owns what happens next; no recursive loadShell) */
  function corridorQuestions() {
    return new Promise((resolve) => {
      show('checkin');
      $('appCkBuild').hidden = true;
      $('appCkFill').style.width = '0';
      $('appCkMount').hidden = false;
      $('appCkDots').style.display = '';
      mountCheckin($('appCkMount'), $('appCkDots'), (answers) => {
        $('appCkMount').hidden = true;
        $('appCkDots').style.display = 'none';
        resolve(answers);
      });
    });
  }

  function cerLine(html) {
    const ln = document.createElement('span');
    ln.className = 'ln'; ln.innerHTML = html;
    $('cerTerm').appendChild(ln);
  }

  /* §C beat 1 · the terminal — every number REAL or absent */
  async function ceremonyGenerate() {
    show('ceremony');
    $('cerBuild').hidden = false;
    $('cerTerm').innerHTML = '';
    $('cerFill').style.width = '0';
    setTimeout(() => { $('cerFill').style.width = '100%'; }, 60);
    const plan = planFromTrip(trip);
    const pool = corridorPool || [];
    const briefWords = [VIBE_LABEL[trip.vibe] || trip.vibe, TIER_LABEL[trip.budget_tier] || trip.budget_tier]
      .filter(Boolean).join(' + ').toLowerCase();
    cerLine('▸ reading your brief — ' + esc(briefWords));
    let matched = null;
    if (pool.length && plan) {
      matched = pool.filter((p) => isMatch(scorePlace(p, plan))).length;
      cerLine('▸ ' + matched + ' places match ' + esc(briefWords));
    }
    cerLine('▸ routing your month…');
    /* chat-first R4: KEEP THIS PLAN means THIS plan — a fresh draft route
       from the concierge is claimed verbatim, never regenerated (the reveal
       already promised these exact legs; their locked-in plans are baked in) */
    const ok = (await claimDraftRoute()) || await genRoute();
    if (ok) {
      cerLine('▸ planning ' + TRIP_LEGS.length + ' bases <span class="ok">✓</span>');
      await wait(600);
    } else {
      cerLine('▸ routing unavailable — your base plan is ready');
      await wait(1400);
    }
    return { ok, matched };
  }

  /* §C beats 2–7 · the gift being unwrapped */
  async function ceremonyBeats(matched) {
    show('ceremony');
    $('cerBuild').hidden = true;
    const reduce = REDUCED_MOTION();
    const legs = TRIP_LEGS;
    const pts = legs.map((l) => AREA_XY[l.area] || [160, 150]);
    /* beat 2 · the route line draws — `trace`, §5.5 v1.2, ceremony-class only */
    const traceEl = $('cerTrace');
    traceEl.setAttribute('d', pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ',' + p[1]).join(' '));
    $('cerOrbs').innerHTML = '';
    $('cerLegs').innerHTML = '';
    $('cerMap').hidden = false;
    if (!reduce) {
      const len = traceEl.getTotalLength();
      traceEl.style.strokeDasharray = len;
      traceEl.style.strokeDashoffset = len;
      traceEl.getBoundingClientRect();
      traceEl.style.transition = 'stroke-dashoffset 800ms ease-in-out';
      traceEl.style.strokeDashoffset = '0';
      await wait(800);
    }
    /* beat 3 · orbs pop, 150ms stagger */
    for (let i = 0; i < legs.length; i++) {
      const xy = pts[i];
      const hex = AREA_HEX[legs[i].area] || '#3dffd0';
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.innerHTML = '<circle cx="' + xy[0] + '" cy="' + xy[1] + '" r="6" fill="' + hex + '"/>' +
        '<text x="' + (xy[0] + 10) + '" y="' + (xy[1] + 3) + '" fill="' + hex + '">' + esc(legs[i].area.toUpperCase()) + '</text>';
      if (!reduce) g.classList.add('cer-pop');
      $('cerOrbs').appendChild(g);
      const row = document.createElement('div');
      row.className = 'cer-leg' + (reduce ? '' : ' cer-pop');
      row.innerHTML = '<div class="cer-leg-row"><span class="cer-leg-orb" style="background:' + hex + '"></span>' +
        '<span class="cer-leg-name">' + esc(legs[i].area.toUpperCase()) + '</span>' +
        '<span class="cer-leg-n">' + legs[i].nights + ' NIGHTS</span></div>' +
        (legs[i].why ? '<p class="cer-leg-why">' + esc(legs[i].why) + '</p>' : '');
      $('cerLegs').appendChild(row);
      await wait(150);
    }
    /* beat 4 · summary — computed numbers only; silence over fiction */
    const days = legs.reduce((s, l) => s + (l.nights || 0), 0);
    const parts = ['your ' + days + ' days', legs.length + ' bases'];
    if (matched != null) parts.push(matched + ' matched places');
    const nVer = (corridorPool || []).filter((p) => p.verified).length;
    const sub = [];
    if (nVer) sub.push('built from ' + nVer + ' verified places');
    if (trip.vibe) {
      sub.push('matched to ' + String(VIBE_LABEL[trip.vibe] || trip.vibe).toLowerCase() +
        (trip.budget_tier ? ' + ' + String(TIER_LABEL[trip.budget_tier] || trip.budget_tier).toLowerCase() : ''));
    }
    $('cerSummary').innerHTML = '<p class="cer-sum-main">' + esc(parts.join(' · ')) + '</p>' +
      (sub.length ? '<p class="cer-sum-sub">' + esc(sub.join(' · ')) + '</p>' : '');
    $('cerSummary').hidden = false;
    await wait(400);
    /* beat 5 · the pass rises — the record ON it (F3, absorbed) */
    $('cerClass').textContent = VIBE_LABEL[trip.vibe] || '—';
    const named = !!(profile && profile.full_name);
    if (named) {
      $('cerPassenger').textContent = passengerLine(profile.title, profile.full_name) || '—';
      $('cerPass').querySelector('.bp-rec-ask').hidden = true;
      $('cerTitleChips').hidden = true;
      $('cerRecName').hidden = true;
      $('cerPass').querySelector('.rec-actions').hidden = true;
    }
    $('cerPass').hidden = false;
    if (!reduce) $('cerPass').classList.add('cer-pop');
    await wait(300);
    if (!named) {
      await new Promise((res) => {
        let cerTitle = (profile && profile.title) || '';
        $('cerTitleChips').onclick = (e) => {
          const b = e.target.closest('.chip-btn'); if (!b) return;
          cerTitle = b.getAttribute('data-title');
          document.querySelectorAll('#cerTitleChips .chip-btn').forEach((x) => x.classList.toggle('on', x === b));
          $('cerPassenger').textContent = passengerLine(cerTitle, $('cerRecName').value.trim()) || '—';
        };
        $('cerRecName').oninput = () => {
          $('cerPassenger').textContent = passengerLine(cerTitle, $('cerRecName').value.trim()) || '—';
        };
        $('cerRecSave').onclick = async () => {
          const name = $('cerRecName').value.trim();
          if (name && user) {
            const { error } = await sb.from('profiles').update({ title: cerTitle || null, full_name: name }).eq('id', user.id);
            if (!error) profile = Object.assign({}, profile, { title: cerTitle || null, full_name: name });
          }
          res();
        };
        $('cerRecSkip').onclick = () => {
          const ts = new Date().toISOString();
          profile = Object.assign({}, profile, { record_skipped_at: ts });
          if (user) sb.from('profiles').update({ record_skipped_at: ts }).eq('id', user.id)
            .then(({ error }) => { if (error) console.warn('[Prevoya] skip persist failed:', error.message); });
          res();
        };
      });
    }
    /* beat 6 · the share moment */
    $('cerShare').hidden = false;
    $('cerShareBtn').onclick = () => shareRoute($('cerShareBtn'));
    await wait(900);
    /* beat 7 · notification warm-ask (§E) */
    await warmAsk();
  }

  /* ─── PUSH_SPEC · the delivery layer: subscribe when (and only when) the
     user has opted in AND the OS permission is granted. SW is push-only. ─── */
  const VAPID_PUBLIC = 'BJ_bGt-zCzjuTWjfe7zpKy6oyTR10udmyV_bvpHtkP5X3SXtAEVGd6AUf8Pg3nlyqjX7vWdA4o37s5K8iFwjxtg';
  function vapidKeyBytes(b64u) {
    const pad = '='.repeat((4 - b64u.length % 4) % 4);
    const raw = atob((b64u + pad).replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  async function ensurePush() {
    try {
      if (!user || !profile || profile.morning_note_optin !== true) return;
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      const reg = await navigator.serviceWorker.register('/app/sw.js');
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKeyBytes(VAPID_PUBLIC)
      });
      const j = sub.toJSON();
      if (!j.keys) return;
      await sb.from('push_subscriptions').upsert({
        user_id: user.id, endpoint: sub.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth
      }, { onConflict: 'endpoint' });
    } catch (e) { console.warn('[Prevoya] push subscribe failed:', e && e.message); }
  }

  /* the You-tab toggle: the user-initiated door (a settings change is its
     own ask — §E's no-third-ask rule governs ASKS, not user actions) */
  function paintMorningToggle() {
    const t = $('morningToggle');
    if (!t) return;
    const on = profile && profile.morning_note_optin === true;
    /* the toggle tells the platform truth (Guy tapped in Safari and nothing
       said why no note would come): iOS delivers push ONLY to the installed
       home-screen app — the wish is recorded either way */
    let label;
    if (!on) label = 'off · tap to get one';
    else if (!('Notification' in window)) label = '☀ on · install to home screen to receive it';
    else if (Notification.permission === 'default') label = '☀ on · tap to allow notifications';
    else if (Notification.permission === 'denied') label = '☀ on · allow notifications in Settings';
    else label = '☀ on · tap to stop';
    t.textContent = label;
    t.onclick = async () => {
      /* already on but the OS was never asked (installed-app first tap):
         this tap ASKS — it must not flip the wish off */
      if (on && 'Notification' in window && Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch (_) {}
        await ensurePush();
        paintMorningToggle();
        return;
      }
      const turnOn = !(profile && profile.morning_note_optin === true);
      if (turnOn && 'Notification' in window && Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch (_) {}
      }
      const ts = new Date().toISOString();
      const patch = {
        morning_note_optin: turnOn,
        morning_note_asked_at: (profile && profile.morning_note_asked_at) || ts,
        morning_note_closed_at: ts
      };
      profile = Object.assign({}, profile, patch);
      if (user) sb.from('profiles').update(patch).eq('id', user.id)
        .then(({ error }) => { if (error) console.warn('[Prevoya] morning toggle failed:', error.message); });
      if (turnOn) ensurePush();
      else {
        /* best-effort: release THIS device; the sender's optin check is the
           real gate, so stale rows on other devices can never fire */
        try {
          const reg = await navigator.serviceWorker.getRegistration('/app/sw.js');
          const sub = reg && await reg.pushManager.getSubscription();
          if (sub) {
            await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
            await sub.unsubscribe();
          }
        } catch (_) {}
      }
      paintMorningToggle();
    };
  }

  /* §E · the warm ask — the OS prompt is never the first touch */
  function warmAsk() {
    return new Promise((res) => {
      const granted = ('Notification' in window) && Notification.permission === 'granted';
      if (granted || (profile && profile.morning_note_asked_at)) { res(); return; }
      $('cerAsk').hidden = false;
      const settle = (optin) => {
        const ts = new Date().toISOString();
        profile = Object.assign({}, profile, { morning_note_optin: optin, morning_note_asked_at: ts });
        if (user) sb.from('profiles').update({ morning_note_optin: optin, morning_note_asked_at: ts }).eq('id', user.id)
          .then(({ error }) => { if (error) console.warn('[Prevoya] ask persist failed:', error.message); });
        $('cerAsk').hidden = true;
        if (optin) ensurePush(); /* permission may have just been granted */
        res();
      };
      $('cerAskYes').onclick = () => {
        if ('Notification' in window && Notification.permission === 'default') {
          try { Notification.requestPermission().finally(() => settle(true)); return; } catch (_) { /* fall through */ }
        }
        settle(true);
      };
      $('cerAskNo').onclick = () => settle(false);
    });
  }

  /* §B · the tab bar rises — once, ever */
  function tabRise() {
    const bar = $('tabBar');
    if (!bar || REDUCED_MOTION()) return;
    bar.classList.add('rising');
    setTimeout(() => bar.classList.remove('rising'), 1300);
  }

  /* §D · the day-1 share card + token-gated public route link */
  async function routeShareRow() {
    let { data: rows } = await sb.from('trip_shares').select('*')
      .eq('trip_id', trip.id).eq('kind', 'route').is('revoked_at', null).limit(1);
    let share = rows && rows[0];
    if (!share) {
      const ins = await sb.from('trip_shares').insert({ trip_id: trip.id, token: shareSlug(), kind: 'route' }).select().single();
      if (ins.error) { console.warn('[Prevoya] route share failed:', ins.error.message); return null; }
      share = ins.data;
    }
    return share;
  }

  /* M2 ruling (Rachel 2026-08-10): the card's dots come from the ONE
     sanitizer path — the shared-trip payload — never a second client-side
     filter. create=false only peeks at an existing share: the replay's
     final frame must never mint a public link uninvited. */
  async function eligibleStamps(create) {
    try {
      let share = null;
      if (create) share = await routeShareRow();
      else {
        const { data: rows } = await sb.from('trip_shares').select('token')
          .eq('trip_id', trip.id).eq('kind', 'route').is('revoked_at', null).limit(1);
        share = rows && rows[0];
      }
      if (!share) return null;
      const r = await fetch(cfg.url + '/functions/v1/shared-trip?t=' + encodeURIComponent(share.token));
      if (!r.ok) return null;
      const d = await r.json();
      return Array.isArray(d.stamps) ? d.stamps : [];
    } catch (_) { return null; }
  }

  async function renderRouteCard(eligible) {
    const legs = TRIP_LEGS;
    const pts = legs.map((l) => AREA_XY[l.area] || [160, 150]);
    const c = document.createElement('canvas');
    c.width = 1080; c.height = 1080;
    const x = c.getContext('2d');
    if (!x) return null;
    const mono = 'ui-monospace, Menlo, monospace';
    x.fillStyle = '#0a0a14'; x.fillRect(0, 0, 1080, 1080);
    x.save();
    x.translate(60, 90); x.scale(3.0, 3.0);
    x.strokeStyle = 'rgba(123,123,154,0.55)'; x.lineWidth = 0.6;
    x.stroke(new Path2D(ISLAND_PATH));
    x.beginPath(); x.ellipse(229, 175, 12, 8.25, -14 * Math.PI / 180, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = '#3dffd0'; x.lineWidth = 1.1; x.lineCap = 'round'; x.lineJoin = 'round';
    x.beginPath();
    pts.forEach((p, i) => { if (i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); });
    x.stroke();
    legs.forEach((l, i) => {
      x.fillStyle = AREA_HEX[l.area] || '#3dffd0';
      x.beginPath(); x.arc(pts[i][0], pts[i][1], 4.5, 0, Math.PI * 2); x.fill();
      x.font = '600 8px ' + mono;
      x.fillText(l.area.toUpperCase(), pts[i][0] + 9, pts[i][1] + 3);
    });
    /* M2 (LIVING_MAP_SPEC, ruling 2026-08-10): the card ages — but ONLY with
       publicly eligible stamps, straight from the sanitizer payload. Day-1
       (or no share yet, or nothing eligible) renders the plan card exactly
       as brand day froze it. Same bucketing + offsets as every surface. */
    const stampedPlaces = new Set();
    (eligible || []).forEach((s) => {
      const k = String(s.key);
      if (stampedPlaces.has(k) || !AREA_XY[s.region]) return;
      stampedPlaces.add(k);
      let h = 0;
      for (let i = 0; i < k.length; i++) h = ((h * 31) + k.charCodeAt(i)) >>> 0;
      const ang = (h % 360) * Math.PI / 180;
      const rad = 7 + ((h >> 4) % 8);
      x.fillStyle = 'rgba(232,232,240,0.85)';
      x.beginPath();
      x.arc(AREA_XY[s.region][0] + Math.cos(ang) * rad, AREA_XY[s.region][1] + Math.sin(ang) * rad, 1.5, 0, Math.PI * 2);
      x.fill();
    });
    x.restore();
    const days = legs.reduce((s, l) => s + (l.nights || 0), 0);
    let headline = days + ' DAYS · ' + legs.length + ' BASES';
    if (stampedPlaces.size) headline += ' · ' + stampedPlaces.size + ' STAMPED';
    x.fillStyle = '#3dffd0'; x.font = '700 64px ' + mono;
    if (x.measureText(headline).width > 936) x.font = '700 52px ' + mono;
    x.fillText(headline, 72, 880);
    /* brief line: vibe · month — tier NEVER ships (Guy 2026-08-04) */
    const bits = [];
    if (trip.vibe) bits.push(String(VIBE_LABEL[trip.vibe] || trip.vibe).toLowerCase());
    if (trip.arrive) {
      const m = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
        'september', 'october', 'november', 'december'][+String(trip.arrive).split('-')[1] - 1];
      if (m) bits.push(m);
    }
    x.fillStyle = '#7b7b9a'; x.font = '36px ' + mono;
    if (bits.length) x.fillText(bits.join(' · '), 72, 938);
    const nVer = (corridorPool || []).filter((p) => p.verified).length;
    x.font = '28px ' + mono;
    if (nVer) x.fillText(nVer + ' verified places · 0 tabs', 72, 990);
    x.fillStyle = '#3dffd0'; x.font = '32px ' + mono; x.textAlign = 'right';
    x.fillText('@prevoya', 1008, 1020);
    x.textAlign = 'left';
    return new Promise((res) => c.toBlob(res, 'image/png'));
  }

  async function shareRoute(btn) {
    if (!trip || TRIP_LEGS.length < 2) return;
    track('share_route_tap');
    const label = btn ? btn.textContent : '';
    if (btn) btn.textContent = '↗ preparing…';
    try {
      const share = await routeShareRow();
      const link = share ? location.origin + '/route/?t=' + share.token : null;
      const blob = await renderRouteCard(await eligibleStamps(true));
      const file = blob ? new File([blob], 'prevoya-route.png', { type: 'image/png' }) : null;
      const text = 'My Bali route' + (link ? ' — plan yours: ' + link : '');
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text });
      } else if (navigator.share) {
        await navigator.share({ text: 'My Bali route — plan yours:', url: link || location.origin });
      } else if (link) {
        await navigator.clipboard.writeText(link);
        if (btn) btn.textContent = '✓ link copied';
        return;
      }
      if (btn) btn.textContent = label;
    } catch (_) {
      if (btn) btn.textContent = label; /* sheet dismissed — not an error */
    }
  }

  /* ═══ M4 · THE WRAPPED MOMENT (WRAPPED_MOMENT_SPEC) ═════════════════════
     The reveal was the plan's premiere; this is the journey's. Same island,
     same grammar, run backward through what actually happened. Privacy per
     spec §3: wrapped content = COMPLETED legs only — completion IS the
     buffer. Tap anywhere = skip to the final frame, always. */
  let WR_TIMERS = [];
  let WR_SKIP = null;
  let WR_LAST_SCOPE = null;
  const wrClear = () => { WR_TIMERS.forEach(clearTimeout); WR_TIMERS = []; };
  const wrAt = (ms, fn) => { WR_TIMERS.push(setTimeout(fn, ms)); };
  /* spec §3: no MediaRecorder → the FILM chip never renders. No broken promises. */
  const FILM_MIME = typeof MediaRecorder === 'undefined' ? null
    : ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((m) => {
        try { return MediaRecorder.isTypeSupported(m); } catch (_) { return false; }
      }) || null;
  const FILM_OK = !!FILM_MIME && !!HTMLCanvasElement.prototype.captureStream;

  /* absolute trip-day window of each leg: leg i covers days (acc, acc+nights] */
  function legWindows() {
    let acc = 0;
    return TRIP_LEGS.map((l) => { const w = { from: acc + 1, to: acc + l.nights, leg: l }; acc += l.nights; return w; });
  }
  function wrapState() {
    if (!trip || TRIP_LEGS.length < 2) return null;
    const day = tripDayNumber(trip, baliNow());
    if (day == null) return null;
    const wins = legWindows();
    const doneIdx = wins.map((w, i) => (day > w.to ? i : -1)).filter((i) => i >= 0);
    return { day, wins, doneIdx, tripDone: day > wins[wins.length - 1].to };
  }

  /* the film itself. scope: {kind:'trip'} | {kind:'leg', idx} — leg wrap is
     beats 2–4 scoped to one leg. Only completed legs ever render. */
  async function runWrapReplay(scope) {
    const st = wrapState();
    if (!st || !st.doneIdx.length) return;
    const el = $('wrapReplay');
    if (!el || !el.hidden) return;
    track('wrap_replay', { kind: scope.kind });

    const legIdxs = scope.kind === 'leg' ? [scope.idx] : st.doneIdx;
    if (scope.kind === 'leg' && st.doneIdx.indexOf(scope.idx) === -1) return;
    const wins = legIdxs.map((i) => st.wins[i]);
    const lastDay = wins[wins.length - 1].to;
    const firstDay = wins[0].from;

    /* origin midnight — same derivation the passport uses */
    let origin;
    if (trip.arrive) { const p = String(trip.arrive).split('-'); origin = new Date(+p[0], +p[1] - 1, +p[2]); }
    else { const c = new Date(trip.created_at); origin = new Date(c.getFullYear(), c.getMonth(), c.getDate()); }
    const dayOfCk = (c) => {
      const b = baliDateOf(c.created_at);
      return Math.round((new Date(b.y, b.m, b.d) - origin) / 86400000) + 1;
    };
    /* stamps inside the wrapped window, in day order; one dot per place */
    const byDay = new Map();
    const seenPlace = new Set();
    (CHECKINS || []).slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1)).forEach((c) => {
      const d = dayOfCk(c);
      if (d < firstDay || d > lastDay) return;
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d).push(c);
    });

    const gEls = { greet: $('wrGreet'), head: $('wrHead'), trace: $('wrTrace'), dots: $('wrDots'),
      orbs: $('wrOrbs'), ticker: $('wrTicker'), counts: $('wrCounts'), records: $('wrRecords'),
      final: $('wrFinal'), card: $('wrCard'), fill: $('wrFill') };
    gEls.greet.textContent = ''; gEls.head.textContent = ''; gEls.trace.setAttribute('d', '');
    gEls.dots.innerHTML = ''; gEls.orbs.innerHTML = ''; gEls.ticker.hidden = true;
    gEls.counts.textContent = ''; gEls.records.innerHTML = ''; gEls.final.hidden = true;
    gEls.card.hidden = true; gEls.fill.style.width = '0%';
    el.hidden = false;

    const pts = wins.map((w) => AREA_XY[w.leg.area] || [160, 150]);
    const dateLabel = (d) => {
      const dd = new Date(origin.getFullYear(), origin.getMonth(), origin.getDate() + (d - 1));
      return MONTH_ABBR[dd.getMonth()] + ' ' + dd.getDate();
    };
    const stampDot = (c) => {
      const k = c.place_id ? String(c.place_id) : 'nm:' + (c.place_name || c.id);
      if (seenPlace.has(k)) return '';
      const reg = latLngRegion(c.lat, c.lng);
      if (!reg || !AREA_XY[reg]) return '';
      seenPlace.add(k);
      let h = 0;
      for (let i = 0; i < k.length; i++) h = ((h * 31) + k.charCodeAt(i)) >>> 0;
      const ang = (h % 360) * Math.PI / 180;
      const rad = 7 + ((h >> 4) % 8);
      return '<circle class="wr-pop" cx="' + (AREA_XY[reg][0] + Math.cos(ang) * rad).toFixed(1) +
        '" cy="' + (AREA_XY[reg][1] + Math.sin(ang) * rad).toFixed(1) + '" r="1.9" fill="#e8e8f0" opacity="0.85"/>';
    };
    const stamps = [...byDay.values()].flat();
    const uniq = new Set(stamps.map((c) => c.place_id ? String(c.place_id) : 'nm:' + (c.place_name || c.id)));
    const areasHit = new Set(stamps.map((c) => latLngRegion(c.lat, c.lng)).filter(Boolean));
    const nights = wins.reduce((s, w) => s + w.leg.nights, 0);

    /* beat 5 record lines — only facts that exist, max 3, zero fillers */
    const recs = [];
    const perPlace = new Map();
    stamps.forEach((c) => {
      const k = c.place_id ? String(c.place_id) : 'nm:' + (c.place_name || c.id);
      perPlace.set(k, (perPlace.get(k) || { n: 0, name: c.place_name }));
      perPlace.get(k).n++;
    });
    const top = [...perPlace.values()].sort((a, b) => b.n - a.n)[0];
    if (top && top.n >= 2 && top.name) recs.push('most visited · ' + String(top.name).toLowerCase() + ' ×' + top.n);
    if (areasHit.size) recs.push(areasHit.size + ' of 7 areas');
    const stampDays = [...byDay.keys()];
    if (stampDays.length >= 2) {
      recs.push(dateLabel(Math.min(...stampDays)).toLowerCase() + ' → ' + dateLabel(Math.max(...stampDays)).toLowerCase() + ' · stamped');
    }

    const finalFrame = async () => {
      wrClear();
      gEls.fill.style.width = '100%';
      /* everything lands in its end state */
      gEls.trace.setAttribute('d', pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ',' + p[1]).join(' '));
      gEls.orbs.innerHTML = wins.map((w, i) =>
        '<circle cx="' + pts[i][0] + '" cy="' + pts[i][1] + '" r="5.5" fill="' + (AREA_HEX[w.leg.area] || '#3dffd0') + '"/>' +
        '<text class="wr-orb-label" x="' + (pts[i][0] + 9) + '" y="' + (pts[i][1] + 3) + '" fill="' + (AREA_HEX[w.leg.area] || '#3dffd0') + '">' +
        esc(w.leg.area.toUpperCase()) + '</text>').join('');
      seenPlace.clear();
      gEls.dots.innerHTML = stamps.map(stampDot).join('');
      gEls.ticker.hidden = true;
      gEls.counts.textContent = countsLine;
      gEls.records.innerHTML = recs.map((r) => '<p>' + esc(r) + '</p>').join('');
      if (scope.kind === 'trip' || st.tripDone) {
        const elig = await eligibleStamps(false).catch(() => null);
        const blob = await renderRouteCard(elig).catch(() => null);
        if (blob) { gEls.card.src = URL.createObjectURL(blob); gEls.card.hidden = false; }
      }
      const filmBtn = $('wrShareFilm');
      if (filmBtn) filmBtn.hidden = !FILM_OK;
      gEls.final.hidden = false;
      WR_SKIP = null;
      WR_LAST_SCOPE = scope;
    };
    WR_SKIP = finalFrame;

    const countsLine = scope.kind === 'leg'
      ? nights + ' NIGHTS · ' + stamps.length + ' STAMPS'
      : lastDay + ' DAYS · ' + wins.length + ' BASES · ' + stamps.length + ' STAMPED · ' + uniq.size + ' PLACES';

    if (REDUCED_MOTION()) { finalFrame(); return; }

    /* ── the beats ── */
    let t = 200;
    const totalMs = 2500 + wins.length * 700 + Math.min(14000, Math.max(8000, byDay.size * 400)) + 2000 + (recs.length ? 3000 : 0) + 800;
    const prog = () => { gEls.fill.style.width = Math.min(100, (t / totalMs) * 100).toFixed(1) + '%'; };

    /* beat 1 · the dates */
    wrAt(t, () => {
      if (scope.kind === 'trip') {
        gEls.greet.textContent = 'That’s the month' + (firstName() ? ', ' + firstName() : '') + '.';
        gEls.greet.classList.add('wr-in');
        gEls.head.textContent = 'YOUR BALI · ' + dateLabel(1) + ' – ' + dateLabel(st.wins[st.wins.length - 1].to);
      } else {
        gEls.greet.textContent = '';
        gEls.head.textContent = wins[0].leg.area.toUpperCase() + ' · WRAPPED — ' + nights + ' nights, ' + stamps.length + ' stamps.';
      }
      gEls.head.classList.add('wr-in');
      prog();
    });
    t += scope.kind === 'trip' ? 2500 : 1600;

    /* beat 2 · the route traces leg by leg */
    wins.forEach((w, i) => {
      wrAt(t, () => {
        gEls.trace.setAttribute('d', pts.slice(0, i + 1).map((p, j) => (j ? 'L' : 'M') + p[0] + ',' + p[1]).join(' '));
        gEls.orbs.innerHTML += '<circle class="wr-pop" cx="' + pts[i][0] + '" cy="' + pts[i][1] + '" r="5.5" fill="' + (AREA_HEX[w.leg.area] || '#3dffd0') + '"/>' +
          '<text class="wr-orb-label wr-pop" x="' + (pts[i][0] + 9) + '" y="' + (pts[i][1] + 3) + '" fill="' + (AREA_HEX[w.leg.area] || '#3dffd0') + '">' +
          esc(w.leg.area.toUpperCase() + ' · ' + w.leg.nights + 'N') + '</text>';
        prog();
      });
      t += 700;
    });

    /* beat 3 · stamps pop in day order; the ticker is the narrative engine */
    const dayGap = Math.max(120, Math.min(400, 12000 / Math.max(1, lastDay - firstDay + 1)));
    for (let d = firstDay; d <= lastDay; d++) {
      const cks = byDay.get(d) || [];
      wrAt(t, () => { gEls.ticker.hidden = false; gEls.ticker.textContent = 'DAY ' + d; prog(); });
      cks.forEach((c, j) => { wrAt(t + j * 80, () => { gEls.dots.innerHTML += stampDot(c); }); });
      t += cks.length ? Math.max(dayGap, cks.length * 80 + 120) : Math.round(dayGap * 0.45);
    }

    /* beat 4 · counts land */
    wrAt(t, () => { gEls.ticker.hidden = true; gEls.counts.textContent = countsLine; gEls.counts.classList.add('wr-in'); prog(); });
    t += 2000;

    /* beat 5 · the record lines */
    if (recs.length) {
      wrAt(t, () => { gEls.records.innerHTML = recs.map((r) => '<p class="wr-in">' + esc(r) + '</p>').join(''); prog(); });
      t += 3000;
    }

    /* beat 6 · final frame */
    wrAt(t, finalFrame);
  }

  /* ── slice 3 · THE FILM (spec §3) — the same replay drawn to canvas and
     captured with the browser's own MediaRecorder. 1080×1920, ≤30s, zero
     libraries. Content: completed legs only + Tier-1/promoted stamps ONLY
     (a private named stamp never ships in an export). The film is a frozen,
     owner-initiated document — the share sheet says so in one line. ── */
  async function renderWrapFilm(scope, btn) {
    const st = wrapState();
    if (!st || !st.doneIdx.length || !FILM_OK) return;
    const legIdxs = scope && scope.kind === 'leg' ? [scope.idx] : st.doneIdx;
    const wins = legIdxs.map((i) => st.wins[i]);
    const firstDay = wins[0].from, lastDay = wins[wins.length - 1].to;
    let origin;
    if (trip.arrive) { const p = String(trip.arrive).split('-'); origin = new Date(+p[0], +p[1] - 1, +p[2]); }
    else { const c0 = new Date(trip.created_at); origin = new Date(c0.getFullYear(), c0.getMonth(), c0.getDate()); }
    const dayOfCk = (c) => {
      const b = baliDateOf(c.created_at);
      return Math.round((new Date(b.y, b.m, b.d) - origin) / 86400000) + 1;
    };
    const dateLabel = (d) => {
      const dd = new Date(origin.getFullYear(), origin.getMonth(), origin.getDate() + (d - 1));
      return MONTH_ABBR[dd.getMonth()] + ' ' + dd.getDate();
    };
    /* Tier-1 only, completed window only, one dot per place, day-ordered */
    const seen = new Set();
    const stamps = [];
    (CHECKINS || []).slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1)).forEach((c) => {
      if (!c.place_id) return; /* Tier-2 NEVER renders in a film (ruling) */
      const d = dayOfCk(c);
      if (d < firstDay || d > lastDay) return;
      const k = String(c.place_id);
      const reg = latLngRegion(c.lat, c.lng);
      if (!reg || !AREA_XY[reg]) return;
      if (seen.has(k)) return;
      seen.add(k);
      let h = 0;
      for (let i = 0; i < k.length; i++) h = ((h * 31) + k.charCodeAt(i)) >>> 0;
      const ang = (h % 360) * Math.PI / 180, rad = 7 + ((h >> 4) % 8);
      stamps.push({ day: d, x: AREA_XY[reg][0] + Math.cos(ang) * rad, y: AREA_XY[reg][1] + Math.sin(ang) * rad });
    });
    const pts = wins.map((w) => AREA_XY[w.leg.area] || [160, 150]);
    const nights = wins.reduce((s, w) => s + w.leg.nights, 0);

    /* timeline (seconds) — same beat grammar, time-parameterized */
    const T1 = 2.4;
    const T2 = T1 + wins.length * 0.7;
    const daysSpan = Math.max(1, lastDay - firstDay + 1);
    const dayDur = Math.min(12, Math.max(6, daysSpan * 0.3)) / daysSpan;
    const T3 = T2 + daysSpan * dayDur;
    const T4 = T3 + 2.0;
    const T5 = T4 + 1.2;
    const TOTAL = Math.min(30, T5 + 1.6);
    const dayAt = (tt) => Math.min(lastDay, firstDay + Math.floor((tt - T2) / dayDur));

    const countsLine = scope && scope.kind === 'leg'
      ? nights + ' NIGHTS · ' + stamps.length + ' STAMPS'
      : lastDay + ' DAYS · ' + wins.length + ' BASES · ' + stamps.length + ' STAMPED';
    const title = scope && scope.kind === 'leg'
      ? wins[0].leg.area.toUpperCase() + ' · WRAPPED'
      : 'YOUR BALI';
    const dates = dateLabel(firstDay) + ' – ' + dateLabel(lastDay);

    const c = document.createElement('canvas');
    c.width = 1080; c.height = 1920;
    const x = c.getContext('2d');
    if (!x) return;
    const mono = 'ui-monospace, Menlo, monospace';
    const islandP = new Path2D(ISLAND_PATH);
    const alpha = (from, dur, tt) => Math.max(0, Math.min(1, (tt - from) / dur));

    function frame(tt) {
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.fillStyle = '#0a0a14'; x.fillRect(0, 0, 1080, 1920);
      /* beat 1 · titles */
      x.textAlign = 'center';
      x.globalAlpha = alpha(0.2, 0.6, tt);
      x.fillStyle = '#e8e8f0'; x.font = '700 66px -apple-system, system-ui, sans-serif';
      x.fillText(title, 540, 330);
      x.globalAlpha = alpha(0.7, 0.6, tt);
      x.fillStyle = '#3dffd0'; x.font = '40px ' + mono;
      x.fillText(dates, 540, 400);
      x.globalAlpha = 1; x.textAlign = 'left';
      /* the island */
      x.save();
      x.translate(60, 520); x.scale(3, 3);
      x.globalAlpha = alpha(1.2, 0.8, tt);
      x.strokeStyle = 'rgba(123,123,154,0.55)'; x.lineWidth = 0.6;
      x.stroke(islandP);
      x.beginPath(); x.ellipse(229, 175, 12, 8.25, -14 * Math.PI / 180, 0, Math.PI * 2); x.stroke();
      /* beat 2 · the trace, leg by leg */
      x.strokeStyle = '#3dffd0'; x.lineWidth = 1.2; x.lineCap = 'round'; x.lineJoin = 'round';
      const segs = Math.max(0, Math.min(pts.length - 1, (tt - T1) / 0.7));
      if (segs > 0) {
        x.beginPath(); x.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i <= Math.floor(segs); i++) x.lineTo(pts[i][0], pts[i][1]);
        const f = segs - Math.floor(segs);
        if (f > 0 && Math.floor(segs) < pts.length - 1) {
          const a = pts[Math.floor(segs)], b = pts[Math.floor(segs) + 1];
          x.lineTo(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f);
        }
        x.stroke();
      }
      wins.forEach((w, i) => {
        if (tt < T1 + i * 0.7) return;
        const pop = Math.min(1, (tt - (T1 + i * 0.7)) / 0.3);
        x.fillStyle = AREA_HEX[w.leg.area] || '#3dffd0';
        x.beginPath(); x.arc(pts[i][0], pts[i][1], 5.5 * (0.4 + 0.6 * pop), 0, Math.PI * 2); x.fill();
        x.globalAlpha = pop; x.font = '600 8px ' + mono;
        x.fillText(w.leg.area.toUpperCase() + ' · ' + w.leg.nights + 'N', pts[i][0] + 9, pts[i][1] + 3);
        x.globalAlpha = 1;
      });
      /* beat 3 · stamps in day order */
      if (tt >= T2) {
        const dNow = dayAt(tt);
        x.fillStyle = 'rgba(232,232,240,0.85)';
        stamps.forEach((s) => {
          if (s.day > dNow) return;
          x.beginPath(); x.arc(s.x, s.y, 1.7, 0, Math.PI * 2); x.fill();
        });
      }
      x.restore();
      /* the day ticker */
      if (tt >= T2 && tt < T3) {
        x.fillStyle = '#7b7b9a'; x.font = '36px ' + mono; x.textAlign = 'right';
        x.fillText('DAY ' + Math.max(firstDay, dayAt(tt)), 1010, 560);
        x.textAlign = 'left';
      }
      /* beat 4 · counts */
      if (tt >= T3) {
        x.globalAlpha = alpha(T3, 0.5, tt);
        x.fillStyle = '#e8e8f0'; x.font = '44px ' + mono; x.textAlign = 'center';
        x.fillText(countsLine, 540, 1430);
        x.globalAlpha = 1; x.textAlign = 'left';
      }
      /* watermark, whole run */
      x.fillStyle = '#3dffd0'; x.font = '34px ' + mono; x.textAlign = 'right';
      x.fillText('@prevoya', 1020, 1856);
      x.textAlign = 'left';
      /* final second · prevoya.app */
      if (tt >= TOTAL - 1.4) {
        x.globalAlpha = alpha(TOTAL - 1.4, 0.5, tt);
        x.fillStyle = '#3dffd0'; x.font = '700 64px ' + mono; x.textAlign = 'center';
        x.fillText('prevoya.app', 540, 1560);
        x.globalAlpha = 1; x.textAlign = 'left';
      }
    }

    const label = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '● rendering…'; }
    track('wrap_film', { kind: scope ? scope.kind : 'trip' });
    try {
      const stream = c.captureStream(30);
      const rec = new MediaRecorder(stream, { mimeType: FILM_MIME, videoBitsPerSecond: 6000000 });
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      const done = new Promise((res) => { rec.onstop = res; });
      rec.start(500);
      const t0 = performance.now();
      await new Promise((res) => {
        const step = () => {
          const tt = (performance.now() - t0) / 1000;
          frame(tt);
          if (btn) btn.textContent = '● rendering ' + Math.min(99, Math.round(tt / TOTAL * 100)) + '%';
          if (tt >= TOTAL) { res(); return; }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
      rec.stop();
      await done;
      const ext = FILM_MIME.indexOf('mp4') !== -1 ? 'mp4' : 'webm';
      const blob = new Blob(chunks, { type: FILM_MIME.split(';')[0] });
      const file = new File([blob], 'prevoya-wrapped.' + ext, { type: blob.type });
      const note = $('wrFilmNote');
      if (note) note.hidden = false;
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] }).catch(() => {});
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }
      if (btn) { btn.disabled = false; btn.textContent = label; }
    } catch (e) {
      console.warn('[Prevoya] film export failed:', e && e.message);
      if (btn) { btn.disabled = false; btn.textContent = '⚠ retry film'; }
    }
  }

  function closeWrap() {
    wrClear();
    WR_SKIP = null;
    const el = $('wrapReplay');
    if (el) el.hidden = true;
    const note = $('wrFilmNote');
    if (note) note.hidden = true;
    const img = $('wrCard');
    if (img && img.src) { try { URL.revokeObjectURL(img.src); } catch (_) {} img.removeAttribute('src'); }
  }
  const wrapEl = $('wrapReplay');
  if (wrapEl) wrapEl.addEventListener('click', (e) => {
    if (e.target.closest('.wr-chips') ) return; /* chips act, never skip */
    if (WR_SKIP) { WR_SKIP(); return; }        /* mid-film tap = final frame */
    if (!$('wrFinal').hidden && !e.target.closest('.wr-final')) closeWrap();
  });
  if ($('wrClose')) $('wrClose').onclick = closeWrap;
  if ($('wrAgain')) $('wrAgain').onclick = () => {
    const st = wrapState();
    closeWrap();
    if (st) runWrapReplay(st.tripDone ? { kind: 'trip' } : { kind: 'leg', idx: st.doneIdx[st.doneIdx.length - 1] });
  };
  if ($('wrShareCard')) $('wrShareCard').onclick = (e) => shareRoute(e.currentTarget);
  if ($('wrShareFilm')) $('wrShareFilm').onclick = (e) => renderWrapFilm(WR_LAST_SCOPE || { kind: 'trip' }, e.currentTarget);

  /* triggers: first Today open after a boundary — never while the repack
     nudge is live (spec §1: it renders after the nudge resolves) */
  async function maybeWrap() {
    const st = wrapState();
    /* the permanent on-demand door: ▶ replay on the passport, from the
       first wrap onward — plays whatever's complete so far */
    const chip = $('ppReplay');
    if (chip) {
      chip.hidden = !(st && st.doneIdx.length);
      chip.onclick = () => runWrapReplay({ kind: 'trip' }); /* full film over completed legs */
    }
    if (!st || !st.doneIdx.length) return;
    const nudgeEl = $('readyNudge');
    if (nudgeEl && !nudgeEl.hidden && /repack/i.test(nudgeEl.textContent)) return;
    const seen = (trip.wraps_seen && typeof trip.wraps_seen === 'object') ? trip.wraps_seen : {};
    const seenLegs = Array.isArray(seen.legs) ? seen.legs : [];
    let fire = null;
    if (st.tripDone && !seen.trip) fire = { kind: 'trip' };
    else {
      const fresh = st.doneIdx.filter((i) => seenLegs.indexOf(i) === -1);
      if (fresh.length && !st.tripDone) fire = { kind: 'leg', idx: fresh[fresh.length - 1] };
    }
    if (!fire) return;
    const next = { legs: [...new Set(seenLegs.concat(fire.kind === 'leg' ? [fire.idx] : st.doneIdx))], trip: seen.trip || fire.kind === 'trip' };
    trip.wraps_seen = next;
    sb.from('trips').update({ wraps_seen: next }).eq('id', trip.id)
      .then(({ error }) => { if (error) console.warn('[Prevoya] wrap mark failed:', error.message); });
    runWrapReplay(fire);
  }

  Object.assign(window.__appDebug, { runWrapReplay, wrapState, maybeWrap, closeWrap, renderWrapFilm, eligibleStamps });

  /* the corridor spine — returns true when the ceremony fired */
  async function runCorridor() {
    let matched = null;
    if (!trip || !trip.vibe) {
      /* CHAT-FIRST (Rachel R1 supersession of §A; ATLAS's Spike-1 flag; the
         Guy repro 2026-08-24): a first-open user with no brief never sees
         the questionnaire — the CONVERSATION owns brief-gathering. They talk,
         KEEP THIS PLAN writes the draft, and they land back here with a trip
         — then this same corridor delivers the ceremony + doors. */
      location.replace('/bali/plan/');
      return false;
    }
    if (!corridorPool) {
      const { data: pool } = await sb.from('curated_places').select('*').eq('destination', 'bali');
      corridorPool = pool || [];
    }
    let ok = TRIP_LEGS.length >= 2;
    if (!ok && !trip.route_generated_at) {
      const g = await ceremonyGenerate();
      ok = g.ok; matched = g.matched;
    } else if (ok) {
      const plan = planFromTrip(trip);
      matched = plan && corridorPool.length
        ? corridorPool.filter((p) => isMatch(scorePlace(p, plan))).length : null;
    }
    if (ok) await ceremonyBeats(matched);
    /* flag set on EVERY corridor completion — the fallback must not loop */
    const ts = new Date().toISOString();
    profile = Object.assign({}, profile, { first_open_done_at: ts });
    sb.from('profiles').update({ first_open_done_at: ts }).eq('id', user.id)
      .then(({ error }) => { if (error) console.warn('[Prevoya] first-open mark failed:', error.message); });
    track(ok ? 'ceremony' : 'ceremony_fallback');
    if (ok) {
      trip.route_revealed_at = ts; /* the ceremony IS the reveal */
      sb.from('trips').update({ route_revealed_at: ts }).eq('id', trip.id)
        .then(({ error }) => { if (error) console.warn('[Prevoya] reveal mark failed:', error.message); });
    }
    return ok;
  }

  async function loadShell() {
    $('acctEmail').textContent = (user.email || '—');

    const { data: trips } = await sb.from('trips').select('*')
      .eq('destination', 'bali').order('created_at', { ascending: false }).limit(1);
    trip = (trips && trips[0]) || null;
    const firstOpen = profile && !profile.first_open_done_at;
    if (trip && trip.vibe) {
      try {
        localStorage.setItem('tripos_plan', JSON.stringify({
          vibe: trip.vibe, dur: String(trip.duration_days == null ? 0 : trip.duration_days), tier: trip.budget_tier,
          vibe_detail: trip.vibe_detail || null, party: trip.party || null, priorities: trip.priorities || [],
          arrive: trip.arrive || null
        }));
      } catch (_) {}
    } else {
      const local = readPlan();
      /* first-open: only a FRESH wizard hand-off (<24h) rides into the account —
         stale residue on a shared browser must never hijack the corridor
         (Guy's own §A test was skipped by exactly this) */
      const freshLocal = !!(local && local.ts && Date.now() - local.ts < 86400e3);
      if (local && (freshLocal || !firstOpen)) {
        trip = await saveBrief(local);
      } else if (!firstOpen) {
        /* signed in, no brief anywhere — chat-first: the conversation owns
           brief-gathering (the in-app questionnaire survives only for
           "change my brief" on existing trips) */
        location.replace('/bali/plan/');
        return;
      }
      /* first open with no (fresh) brief → the corridor owns it (§A → 3 questions) */
    }

    /* AI-1a: the route rides with the trip. First-ever load of a brief that has
       never been routed → generate once in the background (route_generated_at
       stops loops — a 1-leg result won't retry forever). Engine missing/failing
       leaves every surface exactly as the classic single-base app. */
    if (trip) {
      const { data: legRows } = await sb.from('trip_legs').select('*')
        .eq('trip_id', trip.id).order('seq');
      TRIP_LEGS = legRows || [];
    } else TRIP_LEGS = [];

    /* FIRST-OPEN CORRIDOR (§A–§E) — once, ever. Otherwise F2's quiet
       interstitial covers never-routed, never-revealed briefs. */
    let corridorRan = false, ceremonyFired = false;
    if (firstOpen) {
      corridorRan = true;
      ceremonyFired = await runCorridor();
      if (!trip) return; /* runCorridor already redirected to the conversation */
    } else if (TRIP_LEGS.length < 2 && !trip.route_generated_at && !trip.route_revealed_at) {
      await routeInterstitial();
    }
    show('shell');
    track('open', { first: !!firstOpen });
    installNudgeMaybe(); /* R5: the app confesses it's an app — quietly, post-auth */
    dailyK = (trip && trip.budget_daily_k) || TIER_IDR[trip && trip.budget_tier] || 700;
    renderRoute(trip, TRIP_LEGS, baliNow(), { onReplan: replanRoute, onOverride: setOverride, onShare: shareRoute });
    if (TRIP_LEGS.length < 2 && !trip.route_generated_at) {
      /* already-revealed brief that lost its route (rare) → quiet background gen */
      genRoute().then((ok) => {
        if (ok) {
          renderRoute(trip, TRIP_LEGS, baliNow(), { reveal: true, onReplan: replanRoute, onOverride: setOverride, onShare: shareRoute });
          updateStrip(trip, greetName(), baliNow());
          paintNudge();
          loadDayPlan().then(() => { if (todayCtx) renderToday(todayCtx.trip, todayCtx.name, todayCtx.places); });
        }
      });
    } else {
      /* routed already → today's plan rides along (lazy per-leg generation) */
      loadDayPlan().then(() => { if (todayCtx) renderToday(todayCtx.trip, todayCtx.name, todayCtx.places); });
    }

    renderBrief(trip);
    renderPresets();
    setPassenger(profile && profile.title, profile && profile.full_name);
    updatePassRecord(); /* F3: "who's this route for?" on the pass, not a gate */
    updateStrip(trip, greetName(), baliNow());

    /* A1: check-ins load BEFORE the tab mounts — §F's Places layer needs them */
    const { data: ckAll } = await sb.from('checkins').select('*').order('created_at');
    CHECKINS = ckAll || [];
    await autoAnchor(); /* REALITY FIRST: Today anchors on evidence before first paint */

    /* §F · layer state, derived from data only. Corridor day = layer 1;
       day-2 open (Bali clock) unlocks Today + Places; check-ins unlock
       Places early; Pulse unlocks at the 3rd expense (set in loadPulse);
       You's packing waits for T−7, readiness for day-2. */
    const day2 = isDay2Plus(profile && profile.first_open_done_at, baliNow());
    LAYERS.today = day2;
    LAYERS.places = day2 || CHECKINS.length > 0;
    const tdNow = tripDayNumber(trip, baliNow());
    const packOn = tdNow != null && tdNow >= -6; /* T−7 and closer */
    $('readyCard').hidden = !day2;
    $('packCard').hidden = !packOn;
    document.querySelectorAll('#youIndex [data-goto="readyCard"]').forEach((b) => { b.hidden = !day2; });
    document.querySelectorAll('#youIndex [data-goto="packCard"]').forEach((b) => { b.hidden = !packOn; });
    if (packOn && !capSeen('pack7')) {
      $('packCard').insertAdjacentHTML('afterbegin',
        layerCap('pack7', 'bags soon — your packing list is ready'));
    }

    /* §E · the one re-ask: a standing 'not now' + day-2 open → the banner,
       same copy, dismissible forever. Only a yes touches the OS dialog. */
    const reaskDue = day2 && profile && profile.morning_note_asked_at &&
      profile.morning_note_optin === false && !profile.morning_note_closed_at &&
      !(('Notification' in window) && Notification.permission === 'granted');
    const rb = $('reaskBanner');
    if (rb) {
      rb.hidden = !reaskDue;
      if (reaskDue) {
        const closeReask = (optin) => {
          const ts = new Date().toISOString();
          profile = Object.assign({}, profile, { morning_note_optin: optin, morning_note_closed_at: ts });
          if (user) sb.from('profiles').update({ morning_note_optin: optin, morning_note_closed_at: ts }).eq('id', user.id)
            .then(({ error }) => { if (error) console.warn('[Prevoya] re-ask persist failed:', error.message); });
          rb.hidden = true;
          if (optin) ensurePush();
        };
        $('reaskYes').onclick = () => {
          if ('Notification' in window && Notification.permission === 'default') {
            try { Notification.requestPermission().finally(() => closeReask(true)); return; } catch (_) {}
          }
          closeReask(true);
        };
        $('reaskNo').onclick = () => closeReask(false);
      }
    }

    const places = corridorPool && corridorPool.length
      ? corridorPool /* the corridor already fetched the pool — reuse, no double trip */
      : (await sb.from('curated_places').select('*').eq('destination', 'bali')).data;
    corridorPool = null;
    placesCount = (places || []).length || placesCount;
    /* the shortlist loads with the shelf (R2) */
    const { data: savedRows } = await sb.from('places')
      .select('id, curated_place_id, created_at')
      .eq('user_id', user.id).not('curated_place_id', 'is', null);
    SAVES = new Map((savedRows || []).map((r) => [String(r.curated_place_id), new Date(r.created_at).getTime()]));
    SAVE_ROWS = new Map((savedRows || []).map((r) => [String(r.curated_place_id), r.id]));
    mountPlacesTab(places || []);
    renderToday(trip, greetName(), places || []);
    todayCtx = { trip, name: greetName(), places: places || [] };

    const { data: dpAll } = await sb.from('day_plans').select('leg_seq, day_in_leg, slots').eq('trip_id', trip.id);
    TRIP_DAY_PLANS = dpAll || [];
    renderPassport(trip, places || []);
    startClock();
    ensurePush();          /* opted-in + granted devices re-subscribe silently */
    paintMorningToggle();
    loadCurationDesk(places || []);
    try { $('logDate').value = new Date().toISOString().slice(0, 10); } catch (_) {}
    updateInstallCard();
    loadPulse();
    loadReadiness();

    if (freshLogin) {
      const line = passengerLine(profile && profile.title, profile && profile.full_name);
      $('arriveText').innerHTML = '✓ Aboard' + (line ? ', <strong>' + esc(line) + '</strong>' : '') +
        '. Your brief is saved to your account — it travels with you.';
      $('arriveBanner').hidden = false;
      freshLogin = false;
    }
    setTab(location.hash.slice(1) || 'today', false);

    /* F2: any first signed-in open with a fresh routed brief lands on the
       reveal — You, scrolled to the route, stagger. Once per route, persisted
       (never localStorage — the PWA lesson). */
    if (!trip.route_revealed_at && TRIP_LEGS.length >= 2) {
      trip.route_revealed_at = new Date().toISOString();
      sb.from('trips').update({ route_revealed_at: trip.route_revealed_at }).eq('id', trip.id)
        .then(({ error }) => { if (error) console.warn('[Prevoya] reveal mark failed:', error.message); });
      setTab('you');
      renderRoute(trip, TRIP_LEGS, baliNow(), { reveal: true, onReplan: replanRoute, onOverride: setOverride, onShare: shareRoute });
      const el = $('youRoute');
      if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
      /* F3: identity is the victory lap — once the route has landed, glide up
         to the pass asking "who's this route for?" */
      if (profile && !profile.full_name && !profile.record_skipped_at) {
        setTimeout(() => {
          const yp = $('youPass');
          if (yp) yp.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 2800);
      }
    } else {
      /* M4: leg/trip wrap greets the first open past a boundary — never on
         the same open as the F2 reveal, never over a live repack nudge */
      maybeWrap();
    }

    /* §B beat 8: the corridor ends with the bar rising onto Today —
       ceremony path gets the rise; the fallback mounts plainly (no theater) */
    if (corridorRan) {
      setTab('today', false);
      if (ceremonyFired) tabRise();
    }
  }

  function openRecord() {
    show('record');
    /* prefill from the account so editing never starts from zero */
    recTitle = (profile && profile.title) || '';
    $('recName').value = (profile && profile.full_name) || '';
    document.querySelectorAll('#titleChips .chip-btn').forEach((b) =>
      b.classList.toggle('on', b.getAttribute('data-title') === recTitle));
    $('recPassenger').textContent = passengerLine(recTitle, $('recName').value) || '—';
    $('recClass').textContent = (readPlan() && VIBE_LABEL[readPlan().vibe]) || '—';
    setTimeout(() => $('recName').focus(), 60);
  }

  /* S4 provenance pickup: the shared passport page seeded tripos_via when
   * this visitor left someone's public trip. Persist it to the profile once
   * (never overwrite an existing attribution), then clear the seed. On a
   * failed write the seed stays put — the next app open IS the retry. */
  async function pickupProvenance() {
    let seed = null;
    try { seed = JSON.parse(localStorage.getItem('tripos_via') || 'null'); } catch (_) {}
    /* S4 hardening (Guy's B-pass found the drop): the magic link lands in a
       different browser context where localStorage never saw the share page.
       The token rides the redirect URL — resolve the sharer's name through
       the same public endpoint the share page uses. */
    if (!seed || !seed.via || !seed.token) {
      const tok = new URLSearchParams(location.search).get('via');
      if (tok) {
        try {
          const r = await fetch(cfg.url + '/functions/v1/shared-trip?t=' + encodeURIComponent(tok));
          if (r.ok) {
            const d = await r.json();
            if (d && d.name) seed = { via: d.name, place: null, token: tok, at: Date.now() };
          }
        } catch (_) {}
        /* consumed either way — the param must not re-fire on every open */
        try { history.replaceState(null, '', location.pathname + location.hash); } catch (_) {}
      }
    }
    if (!seed || !seed.via || !seed.token) return;
    const clear = () => { try { localStorage.removeItem('tripos_via'); } catch (_) {} };
    if (!profile) return;                    /* profile row not there yet — keep the seed */
    if (profile.via_token) { clear(); return; } /* already attributed — first one wins */
    const { error } = await sb.from('profiles').update({
      via_name: String(seed.via).slice(0, 80),
      via_place: seed.place ? String(seed.place).slice(0, 120) : null,
      via_token: String(seed.token).slice(0, 120),
      via_at: typeof seed.at === 'number' ? new Date(seed.at).toISOString() : new Date().toISOString()
    }).eq('id', user.id);
    if (!error) clear();
  }

  async function route() {
    if (!user) {
      /* R4 (chat-first): a held route draft stays visible through the ask —
         the welcome door doubles as "keep your plan" when a draft rode in */
      try {
        const draft = JSON.parse(localStorage.getItem('tripos_draft_route') || 'null');
        const plan = JSON.parse(localStorage.getItem('tripos_plan') || 'null');
        const fresh = draft && plan && plan.ts && Date.now() - plan.ts < 86400e3 && (draft.legs || []).length >= 2;
        const wd = $('wDraft');
        if (fresh && wd) {
          const days = draft.legs.reduce((s, l) => s + (l.nights || 0), 0);
          const pts = draft.legs.map((l) => AREA_XY[l.area] || [160, 150]);
          wd.innerHTML =
            '<svg viewBox="0 0 320 260" width="170" aria-hidden="true">' +
              '<path d="' + ISLAND_PATH + '" fill="none" stroke="var(--mut)" stroke-width="1.5" opacity="0.5"/>' +
              '<path d="' + pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ',' + p[1]).join(' ') + '" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round"/>' +
              pts.map((p) => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="6" fill="var(--teal)"/>').join('') +
            '</svg>' +
            '<p class="w-draft-facts">' + days + ' DAYS · ' + draft.legs.length + ' BASES</p>' +
            '<p class="w-draft-line">keep your plan — it syncs to your phone, and keeps planning while you’re on the island.</p>';
          wd.hidden = false;
        }
      } catch (_) {}
      show('welcome');
      return;
    }
    const { data } = await sb.from('profiles')
      .select('title, full_name, presets, via_token, record_skipped_at, first_open_done_at, morning_note_optin, morning_note_asked_at, morning_note_closed_at')
      .eq('id', user.id).limit(1);
    profile = (data && data[0]) || null;
    pickupProvenance();                      /* background — never blocks boarding */
    /* F3 (UX audit): the record gate is DEAD as a standalone screen — value
       first, identity as the victory lap. The pass asks "who's this route
       for?" on You after the route lands; skip persists to the profile. */
    loadShell();
  }

  /* the via token survives auth round-trips via the redirect URL (S4) */
  function viaSuffix() {
    try {
      const s = JSON.parse(localStorage.getItem('tripos_via') || 'null');
      return s && s.token ? '?via=' + encodeURIComponent(s.token) : '';
    } catch (_) { return ''; }
  }

  /* welcome — Google primary */
  $('googleBtn').addEventListener('click', async () => {
    $('welcomeStatus').textContent = 'Opening Google…';
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/app/' + viaSuffix() }
    });
    if (error) $('welcomeStatus').textContent = '⚠ Google didn’t finish — try again or use email.';
  });

  /* welcome — email fallback (code-first) */
  $('emailToggle').addEventListener('click', () => {
    $('emailForm').hidden = false;
    $('emailToggle').hidden = true;
    setTimeout(() => $('emailInput').focus(), 40);
  });
  $('emailForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('emailInput').value.trim();
    if (!email) return;
    pendingEmail = email;
    $('welcomeStatus').textContent = 'Sending…';
    const { error } = await sb.auth.signInWithOtp({
      email, options: { emailRedirectTo: window.location.origin + '/app/' + viaSuffix() }
    });
    if (error) { $('welcomeStatus').textContent = '⚠ ' + error.message; return; }
    $('welcomeStatus').textContent = '✓ Boarding email sent.';
    $('codeBlock').hidden = false;
    setTimeout(() => $('codeInput').focus(), 40);
  });
  $('codeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = $('codeInput').value.trim();
    if (!token || !pendingEmail) return;
    $('welcomeStatus').textContent = 'Boarding…';
    const { error } = await sb.auth.verifyOtp({ email: pendingEmail, token, type: 'email' });
    if (error) $('welcomeStatus').textContent = '⚠ That code didn’t match. Codes last 60 minutes — resend?';
  });

  /* passenger record */
  $('recEdit').addEventListener('click', () => openRecord());
  /* "change my brief" runs the questionnaire in-app — no bounce to the landing
     page. Audit fence: it silently rebuilds route + day plans (swaps and
     adjustments die) — a loaded gun gets a one-line consequence confirm. */
  let briefArm = null;
  $('briefEdit').addEventListener('click', (e) => {
    e.preventDefault();
    const el = $('briefEdit');
    if (briefArm) {
      clearTimeout(briefArm); briefArm = null;
      el.textContent = '↺ change my brief';
      openCheckin();
      return;
    }
    el.textContent = '⚠ rebuilds your route + day plans — swaps don’t survive · tap again to continue';
    briefArm = setTimeout(() => { briefArm = null; el.textContent = '↺ change my brief'; }, 7000);
  });
  let recTitle = '';
  $('titleChips').addEventListener('click', (e) => {
    const btn = e.target.closest('.chip-btn');
    if (!btn) return;
    recTitle = btn.getAttribute('data-title');
    document.querySelectorAll('#titleChips .chip-btn').forEach((b) =>
      b.classList.toggle('on', b === btn));
    $('recPassenger').textContent = passengerLine(recTitle, $('recName').value) || '—';
  });
  $('recName').addEventListener('input', () => {
    $('recPassenger').textContent = passengerLine(recTitle, $('recName').value) || '—';
  });
  $('recSave').addEventListener('click', async () => {
    const name = $('recName').value.trim();
    if (name) {
      const { error } = await sb.from('profiles')
        .update({ title: recTitle || null, full_name: name }).eq('id', user.id);
      if (error) console.error('[Prevoya] passenger record save failed:', error.message);
      profile = { title: recTitle || null, full_name: name };
    }
    try { localStorage.setItem('tripos_record_done', '1'); } catch (_) {}
    loadShell();
  });
  $('recSkip').addEventListener('click', () => {
    try { localStorage.setItem('tripos_record_done', '1'); } catch (_) {}
    loadShell();
  });

  /* ─── F3 · the record ON the pass: shows only while the profile has no
     name and no persisted skip; typing fills the PASSENGER line live (N3).
     Skip persists to profiles.record_skipped_at — the localStorage flag
     re-gated PWA users (the audit's residue find). ─── */
  let bpRecTitle = '';
  function updatePassRecord() {
    const block = $('bpRecord');
    if (!block) return;
    const pending = profile && !profile.full_name && !profile.record_skipped_at;
    block.hidden = !pending;
    if (!pending) return;
    bpRecTitle = (profile && profile.title) || '';
    document.querySelectorAll('#bpTitleChips .chip-btn').forEach((b) =>
      b.classList.toggle('on', b.getAttribute('data-title') === bpRecTitle));
  }
  $('bpTitleChips').addEventListener('click', (e) => {
    const btn = e.target.closest('.chip-btn');
    if (!btn) return;
    bpRecTitle = btn.getAttribute('data-title');
    document.querySelectorAll('#bpTitleChips .chip-btn').forEach((b) =>
      b.classList.toggle('on', b === btn));
    setPassenger(bpRecTitle, $('bpRecName').value.trim());
  });
  $('bpRecName').addEventListener('input', () => {
    setPassenger(bpRecTitle, $('bpRecName').value.trim());
  });
  $('bpRecSave').addEventListener('click', async () => {
    const name = $('bpRecName').value.trim();
    if (!name) { $('bpRecStatus').textContent = 'Your name prints on the pass — or skip for now.'; return; }
    const { error } = await sb.from('profiles')
      .update({ title: bpRecTitle || null, full_name: name }).eq('id', user.id);
    if (error) {
      $('bpRecStatus').textContent = '⚠ didn’t save — tap to retry';
      return;
    }
    profile = Object.assign({}, profile, { title: bpRecTitle || null, full_name: name });
    setPassenger(profile.title, profile.full_name);
    updatePassRecord();
    updateStrip(trip, greetName(), baliNow());
    if (todayCtx) { todayCtx.name = greetName(); renderToday(todayCtx.trip, todayCtx.name, todayCtx.places); }
  });
  $('bpRecSkip').addEventListener('click', async () => {
    const ts = new Date().toISOString();
    profile = Object.assign({}, profile, { record_skipped_at: ts });
    updatePassRecord();
    const { error } = await sb.from('profiles').update({ record_skipped_at: ts }).eq('id', user.id);
    if (error) console.warn('[Prevoya] record skip persist failed:', error.message);
  });

  /* shell wiring */
  $('arriveClose').addEventListener('click', () => { $('arriveBanner').hidden = true; });

  const ppShareTrack = $('ppShare');
  if (ppShareTrack) ppShareTrack.addEventListener('click', () => track('share_passport_tap'));

  /* §F: captions die on the first interaction with their area — forever */
  document.addEventListener('click', (e) => {
    const panel = e.target.closest('.panel');
    if (!panel) return;
    panel.querySelectorAll('.layer-cap').forEach((c) => {
      capMark(c.getAttribute('data-cap'));
      c.remove();
    });
  }, true);

  /* ─── F4 · the update chip: stale builds linger in the standalone PWA (bit
     Guy on the 7-point day). No service worker to ask, so the deploy stamp is
     the asset's own ETag — baseline at boot, recheck when the app comes back
     to the foreground. Dismiss = this session; next open re-arms naturally. ─── */
  (function watchForNewBuild() {
    const chip = $('updateChip');
    if (!chip || !window.fetch) return;
    let baseline = null, dismissed = false;
    const stamp = async () => {
      try {
        const r = await fetch('/shared/app.js', { method: 'HEAD', cache: 'no-store' });
        return r.headers.get('etag') || r.headers.get('last-modified') || null;
      } catch (_) { return null; }
    };
    const check = async () => {
      if (dismissed || !chip.hidden) return;
      const s = await stamp();
      if (baseline && s && s !== baseline) chip.hidden = false;
    };
    stamp().then((s) => { baseline = s; });
    setInterval(check, 15 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    chip.addEventListener('click', (e) => {
      if (e.target.closest('.uc-x')) { dismissed = true; chip.hidden = true; return; }
      location.reload();
    });
  })();
  $('appLogout').addEventListener('click', async (e) => {
    e.preventDefault();
    await sb.auth.signOut();
    try { localStorage.removeItem('tripos_record_done'); } catch (_) {}
    window.location.reload();
  });
  $('quickLog').addEventListener('click', (e) => {
    const btn = e.target.closest('.chip-btn');
    if (!btn) return;
    if (presetEdit) {
      /* in edit mode ONLY the ✕ deletes — tapping the chip body does nothing
         (tap-anywhere-deletes silently ate two of Guy's presets) */
      if (!e.target.closest('.chip-x')) return;
      const i = parseInt(btn.getAttribute('data-i'), 10);
      savePresets(getPresets().filter((_, idx) => idx !== i));
      return;
    }
    logSpend(parseInt(btn.getAttribute('data-amt'), 10), btn.getAttribute('data-cat'), $('logDate').value);
  });
  $('presetEditBtn').addEventListener('click', () => {
    presetEdit = !presetEdit;
    renderPresets();
  });
  $('presetAdd').addEventListener('submit', (e) => {
    e.preventDefault();
    const label = $('presetLabel').value.trim();
    const { k } = normalizeK($('presetAmt').value);
    if (!label || !(k > 0)) return;
    savePresets(getPresets().concat([{ label, amt: k, cat: $('presetCat').value }]));
    $('presetLabel').value = '';
    $('presetAmt').value = '';
  });
  $('logForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const { k, corrected } = normalizeK($('logAmt').value);
    if (!(k > 0)) return;
    if (corrected) $('logStatus').textContent = 'Read that as ' + fmtK(k) + ' (amounts are in thousands)';
    logSpend(k, $('logCat').value, $('logDate').value);
    $('logAmt').value = '';
    $('amtPreview').textContent = 'amounts are in thousands · 150 = 150,000 IDR';
  });
  /* PU3: live preview while typing — on the log field AND the preset field
     (the preset field's missing preview is how "Fuel 1500" became a 1.5M log) */
  $('logAmt').addEventListener('input', () => {
    const { k, corrected } = normalizeK($('logAmt').value);
    $('amtPreview').textContent = k > 0
      ? '= ' + (k * 1000).toLocaleString('en-US') + ' IDR' + (corrected ? ' (read as thousands)' : '')
      : 'amounts are in thousands · 150 = 150,000 IDR';
  });
  $('presetAmt').addEventListener('input', () => {
    const { k, corrected } = normalizeK($('presetAmt').value);
    $('presetPreview').textContent = k > 0
      ? '= ' + (k * 1000).toLocaleString('en-US') + ' IDR each time' + (corrected ? ' (read as thousands)' : '')
      : '';
  });
  /* PU1: tap the budget cell → edit your daily line */
  $('budgetCell').addEventListener('click', () => {
    const f = $('budgetEdit');
    f.hidden = !f.hidden;
    if (!f.hidden) {
      $('budgetInput').value = dailyK;
      setTimeout(() => $('budgetInput').focus(), 40);
    }
  });
  $('budgetEdit').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { k } = normalizeK($('budgetInput').value);
    if (!(k > 0)) return;
    dailyK = k;
    $('budgetEdit').hidden = true;
    loadPulse();
    if (trip && trip.id) {
      const { error } = await sb.from('trips').update({ budget_daily_k: k }).eq('id', trip.id);
      if (error) console.error('[Prevoya] budget save failed:', error.message);
      else trip.budget_daily_k = k;
    }
  });

  /* readiness + packing wiring */
  const listHandler = (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    const id = li.getAttribute('data-id');
    if (e.target.closest('.chk')) toggleItem(id);
    else if (e.target.closest('.sl-del')) deleteItem(id);
  };
  $('pretripList').addEventListener('click', listHandler);
  $('packList').addEventListener('click', listHandler);
  $('pretripAdd').addEventListener('submit', (e) => {
    e.preventDefault();
    addItem('pretrip', $('pretripInput').value);
    $('pretripInput').value = '';
  });
  $('packAdd').addEventListener('submit', (e) => {
    e.preventDefault();
    addItem('packing', $('packInput').value);
    $('packInput').value = '';
  });
  $('repackBtn').addEventListener('click', () => {
    if (repack) { repack = null; setRepackUI(); return; }
    $('repackStart').hidden = !$('repackStart').hidden;
    if (!$('repackStart').hidden) setTimeout(() => $('repackLoc').focus(), 40);
  });
  $('repackStart').addEventListener('submit', (e) => {
    e.preventDefault();
    repack = { location: $('repackLoc').value.trim() || 'last place', packed: new Set() };
    $('repackLoc').value = '';
    setRepackUI();
  });
  $('repackDone').addEventListener('click', finishRepack);

  /* preview harness: the corridor pieces, drivable without a session */
  Object.assign(window.__appDebug, {
    corridorScreenA, ceremonyBeats, ceremonyGenerate: null /* needs engine */,
    tabRise, warmAsk, renderRouteCard,
    setCorridorState: (t, legs, pool) => {
      trip = t; TRIP_LEGS = legs || []; corridorPool = pool || null;
    },
    setProfile: (p) => { profile = p; }
  });

  /* boot */
  (async () => {
    const { data } = await sb.auth.getSession();
    user = data.session ? data.session.user : null;
    route();
    sb.auth.onAuthStateChange((evt, session) => {
      const hadUser = !!user;
      user = session ? session.user : null;
      if (user && !hadUser && evt === 'SIGNED_IN') { freshLogin = true; route(); }
    });
  })();
}
