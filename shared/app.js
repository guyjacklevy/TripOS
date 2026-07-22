/* ─── TripOS · the app (/app) — v3 slice 1 ────────────────────
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
import { mountPlaces } from './places-browser.js';

const cfg = window.TRIPOS_SUPABASE || {};
const $ = (id) => document.getElementById(id);

const welcome = $('welcome');
const record = $('record');
const shell = $('shell');
const checkinScreen = $('checkinScreen');

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

function pickCard(p, matched, nowLine) {
  const meta = CAT_META[p.category] || { orb: 'planet-teal', cc: 'var(--teal)' };
  const icon = CAT_ICON[p.category] || '📍';
  const maps = p.maps_query
    ? '<a class="place-maps" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' +
      encodeURIComponent(p.maps_query) + '">Maps ↗</a>' : '';
  let money = '';
  for (let m = 0; m < (p.price_level || 1); m++) money += '$';
  const badge = matched && matched.pct
    ? '✦ ' + matched.pct + '% match'
    : (matched ? '✦ your match' : null);
  return (
    '<article class="place-card" style="--cc:' + meta.cc + '">' +
      (badge ? '<span class="match-badge">' + badge + '</span>' : '') +
      '<div class="place-top"><span class="orb ' + meta.orb + '"></span><div>' +
        '<div class="place-name">' + esc(p.name) + (p.verified ? '<span class="place-verified">✓</span>' : '') + '</div>' +
        '<div class="poi-type">' + icon + ' ' + esc(p.area) + ' · <span class="price-sym">' + money + '</span></div>' +
      '</div></div>' +
      (nowLine ? '<p class="why-now">' + esc(nowLine) + '</p>' : '') +
      (p.why ? '<p class="place-why">' + esc(p.why) + '</p>' : '') +
      (p.tip ? '<p class="place-tip">' + esc(p.tip) + '</p>' : '') +
      '<div class="place-foot"><span class="place-price">' + esc(nowLine ? (p.price_note || '') : (p.timing_note || '')) + '</span>' + maps + '</div>' +
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

function updateStrip(trip, firstName, now) {
  const s = dayState(now);
  const hh = String(s.h).padStart(2, '0');
  const mm = String(s.m).padStart(2, '0');
  const base = trip && trip.vibe ? (HOME_AREA[trip.vibe] || 'Bali').split(' ')[0].toUpperCase() : 'BALI';
  const dayc = tripDayLabel(trip, now);
  $('todayStrip').textContent = DAY_ABBR[s.day] + ' · ' + hh + ':' + mm + (dayc ? ' · ' + dayc : '');
  $('todayStrip2').textContent = base + ' BASE · ' + PHASE_WORD[s.phase];
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
function slotCard(p) {
  const meta = CAT_META[p.category] || { cc: 'var(--teal)' };
  return '<a class="slot-card" href="#places" data-place="' + esc(p.id) + '" style="--cc:' + meta.cc + '">' +
    '<span class="slot-dot"></span>' +
    '<span class="slot-name">' + esc(p.name) + (p.verified ? ' ✓' : '') + '</span>' +
    '<span class="slot-hint">' + esc(p.area.split('/')[0].trim()) + '</span>' +
  '</a>';
}
function railInvite(rail) {
  return '<a class="rail-invite" href="#places">no picks this block · browse ' +
    rail.label.toLowerCase() + ' spots →</a>';
}

function renderToday(trip, firstName, places, dateOpt) {
  const now = dateOpt || baliNow();
  updateStrip(trip, firstName, now);
  if (!places || !places.length) return;
  const plan = planFromTrip(trip);
  const s = dayState(now);
  const currentIdx = RAILS.findIndex((r) => r.key === s.rail);
  const postMidnight = s.mins < 300; /* 00:00–04:59, still the NIGHT rail */

  let html = '';
  RAILS.forEach((r, i) => {
    const state = r.key === s.rail ? 'current'
      : postMidnight ? 'future'
      : (i < currentIdx ? 'past' : 'future');
    const { picks, total } = railPicks(places, plan, r.key, state === 'current' ? 2 : 2);

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
      html += '<div class="tl-now"><div class="tl-now-bar"><span class="tl-now-tick" style="left:' +
        (p * 100).toFixed(1) + '%"></span></div>' +
        '<span class="tl-now-label" style="left:' + (p * 100).toFixed(1) + '%">' + hh + ':' + mm + ' · you are here</span></div>';
      /* the old NOW cards: time+day aware, with why-now */
      const nowPicks = plan ? pickNow(places, plan, now, 2) : [];
      const cards = nowPicks.length
        ? nowPicks.map((pp) => pickCard(pp, scoreBreakdown(pp, plan), '◉ NOW — ' + (whyNow(pp, now) || 'your kind of place')))
        : picks.map((pp) => pickCard(pp, plan && isMatch(scorePlace(pp, plan)) ? scoreBreakdown(pp, plan) : null, null));
      html += '<div class="rail-cards">' + (cards.join('') || railInvite(r)) + '</div>';
    } else {
      /* future: slot cards */
      const shown = picks.slice(0, 2);
      html += shown.length
        ? '<div class="rail-slots">' + shown.map(slotCard).join('') +
          (total > shown.length ? '<a class="slot-more" href="#places">+ ' + (total - shown.length) + ' more →</a>' : '') + '</div>'
        : railInvite(r);
    }
    html += '</div>';
  });

  const tl = $('timeline');
  tl.innerHTML = html;
  dropIn(tl);
  /* past rails expand on tap (dimmed, no lift) */
  tl.querySelectorAll('.rail-head-past').forEach((btn) => {
    btn.onclick = () => {
      const body = btn.nextElementSibling;
      if (body.dataset.loaded !== '1') {
        const key = btn.closest('.rail').getAttribute('data-rail');
        const rk = RAILS.find((r) => r.key === key);
        body.innerHTML = railPicks(places, plan, key, 2).picks.map(slotCard).join('') || railInvite(rk);
        body.dataset.loaded = '1';
      }
      body.hidden = !body.hidden;
      btn.closest('.rail').classList.toggle('open', !body.hidden);
    };
  });
  /* auto-scroll the current rail into the top third (once per render) */
  const cur = tl.querySelector('.rail.current');
  if (cur && dateOpt === undefined) {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    cur.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  }
}

function renderPulse(dailyK, spentK) {
  const leftK = Math.max(0, dailyK - spentK);
  $('pulseSpent').textContent = fmtK(spentK);
  $('pulseBudget').textContent = fmtK(dailyK) + ' IDR';
  $('pulseLeft').textContent = fmtK(leftK) + ' IDR';
  const pct = Math.min(100, Math.round((spentK / dailyK) * 100));
  $('pulseFill').style.width = pct + '%';
  $('pulseFill').style.background = pct >= 100
    ? 'linear-gradient(90deg, rgba(255,107,107,0.5), var(--rd))' : '';
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
  /* fuel strip on Today */
  const fs = $('fuelStrip');
  fs.hidden = false;
  fs.innerHTML = '▲ <strong>' + fmtK(leftK) + ' IDR</strong> still yours today · tap for the pulse';
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
}

window.__appDebug = {
  show, setTab, renderBrief, renderPulse, renderPace, renderCats,
  renderRecent, renderToday, setPassenger, passengerLine, mountPlaces,
  updateStrip, dayState, baliNow, tripDayNumber, tripDayLabel
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
    clockTimer = setInterval(() => {
      if (!todayCtx) return;
      const now = baliNow();
      updateStrip(todayCtx.trip, todayCtx.name, now);
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
    if (error) { console.error('[TripOS] expenses load failed:', error.message); return; }
    const rows = data || [];
    const t0 = startOfToday().getTime();
    const todayK = rows.reduce((s, r) =>
      s + (new Date(r.spent_at).getTime() >= t0 ? (r.amount_idr || 0) : 0), 0) / 1000;
    renderPulse(dailyK, todayK);
    renderPace(dailyK, rows, new Date());
    renderCats(rows);
    renderRecent(rows);
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
    if (error) { console.error('[TripOS] delete failed:', error.message); li.style.opacity = ''; return; }
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
    if (error) console.error('[TripOS] presets save failed:', error.message);
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
    const { error } = await sb.from('checkins').insert({
      user_id: user.id, place_id: p.id, place_name: p.name, lat: p.lat, lng: p.lng
    });
    if (error) {
      console.error('[TripOS] check-in failed:', error.message);
      btn.textContent = '⚠ didn’t save — tap to retry';
      btn.disabled = false;
      return;
    }
    setTimeout(() => { btn.textContent = '📍 I’m here'; btn.disabled = false; }, 2600);
    /* T7: the v19 loop — checked in? offer the typical spend, one tap to log */
    const card = btn.closest('.place-card');
    if (card && !card.querySelector('.spend-suggest')) {
      const estK = SPEND_EST[p.price_level || 1];
      const cat = EXP_FROM_PLACE[p.category] || 'food';
      const sug = document.createElement('div');
      sug.className = 'spend-suggest';
      sug.innerHTML = '<button type="button" class="place-maps ss-log">＋ log ~' + fmtK(estK) +
        ' spend here?</button><button type="button" class="ck-reset ss-skip">skip</button>';
      card.appendChild(sug);
      sug.querySelector('.ss-log').addEventListener('click', async () => {
        sug.innerHTML = '<span class="ss-done">…</span>';
        await logSpend(estK, cat);
        sug.innerHTML = '<span class="ss-done">✓ ' + fmtK(estK) + ' logged to your pulse</span>';
        setTimeout(() => sug.remove(), 3000);
      });
      sug.querySelector('.ss-skip').addEventListener('click', () => sug.remove());
      setTimeout(() => { if (sug.parentNode) sug.remove(); }, 20000);
    }
  }

  /* the full spatial browser in the Places tab (remount-safe for brief changes) */
  function mountPlacesTab(places) {
    const panel = $('panel-places');
    panel.querySelectorAll('.match-banner').forEach((b) => b.remove());
    $('appAreaBar').innerHTML = '';
    $('appCatBar').innerHTML = '';
    $('appPlacesGrid').innerHTML = '';
    mountPlaces({
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
      onGoogleSearch: googleSearch,
      onGoogleAdd: googleAdd
    });
  }

  /* Wave 4: the edge function — search Google Maps, add to our data.
     Key never touches the client; supabase-js sends the user's JWT. */
  async function googleSearch(query) {
    const { data, error } = await sb.functions.invoke('places-search', { body: { action: 'search', query } });
    if (error) { console.error('[TripOS] google search failed:', error.message); return null; }
    if (data && data.error) { console.error('[TripOS] search:', data.error); return data.error === 'search-not-configured' ? null : []; }
    return (data && data.candidates) || [];
  }
  async function googleAdd(candidate) {
    const { data, error } = await sb.functions.invoke('places-search', { body: { action: 'add', place_id: candidate.google_place_id } });
    if (error) { console.error('[TripOS] add place failed:', error.message); return null; }
    if (data && data.error) { console.error('[TripOS] add:', data.error); return null; }
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
    /* readiness nudge on Today: the top open pretrip item */
    const urgent = pre.find((i) => !i.done);
    const nudge = $('readyNudge');
    nudge.hidden = !urgent;
    if (urgent) nudge.innerHTML = '⚠ <strong>' + esc(urgent.label) + '</strong> · readiness →';
  }

  async function loadReadiness() {
    const { data, error } = await sb.from('checklist_items').select('*').order('created_at');
    if (error) { console.error('[TripOS] checklist load failed:', error.message); return; }
    checkItems = data || [];
    if (trip && trip.vibe && !checkItems.some((i) => i.auto)) {
      const gen = buildAutoItems(trip).map((g) => ({ ...g, user_id: user.id }));
      const { data: ins, error: e2 } = await sb.from('checklist_items').insert(gen).select();
      if (e2) console.error('[TripOS] checklist generate failed:', e2.message);
      else checkItems = checkItems.concat(ins || []);
    }
    renderChecklists();
    loadMissing();
  }

  async function loadMissing() {
    const { data, error } = await sb.from('repack_runs').select('*')
      .order('created_at', { ascending: false }).limit(3);
    if (error) { console.error('[TripOS] repack load failed:', error.message); return; }
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
    if (error) { console.error('[TripOS] toggle failed:', error.message); item.done = !item.done; renderChecklists(); }
  }

  async function deleteItem(id) {
    checkItems = checkItems.filter((i) => i.id !== id);
    renderChecklists();
    const { error } = await sb.from('checklist_items').delete().eq('id', id);
    if (error) { console.error('[TripOS] item delete failed:', error.message); loadReadiness(); }
  }

  async function addItem(kind, label) {
    if (!label.trim()) return;
    const { data, error } = await sb.from('checklist_items')
      .insert({ user_id: user.id, kind, label: label.trim(), auto: false }).select();
    if (error) { console.error('[TripOS] item add failed:', error.message); return; }
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
    if (error) { console.error('[TripOS] repack save failed:', error.message); return; }
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
    if (standalone) $('installWhy').textContent = 'TripOS lives on your home screen. See you out there.';
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
    buildAutoItems
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
      arrive: a.arrive || null
    }, { onConflict: 'user_id,destination' }).select();
    if (error) console.error('[TripOS] brief save failed:', error.message);
    try { localStorage.setItem('tripos_plan', JSON.stringify(a)); } catch (_) {}
    return (up && up[0]) || null;
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
          $('appCkDots').style.display = '';
          freshLogin = true; /* re-use the arrival moment for a fresh brief */
          loadShell();
        }, 600);
      };
      tick();
    });
  }

  async function loadShell() {
    show('shell');
    $('acctEmail').textContent = (user.email || '—');

    const { data: trips } = await sb.from('trips').select('*')
      .eq('destination', 'bali').order('created_at', { ascending: false }).limit(1);
    trip = (trips && trips[0]) || null;
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
      if (local) {
        trip = await saveBrief(local);
      } else {
        /* signed in, no brief anywhere — stage B: check in right here */
        openCheckin();
        return;
      }
    }
    dailyK = (trip && trip.budget_daily_k) || TIER_IDR[trip && trip.budget_tier] || 700;

    renderBrief(trip);
    renderPresets();
    setPassenger(profile && profile.title, profile && profile.full_name);
    updateStrip(trip, greetName(), baliNow());

    const { data: places } = await sb.from('curated_places').select('*').eq('destination', 'bali');
    placesCount = (places || []).length || placesCount;
    mountPlacesTab(places || []);
    renderToday(trip, greetName(), places || []);
    todayCtx = { trip, name: greetName(), places: places || [] };
    startClock();
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

  async function route() {
    if (!user) { show('welcome'); return; }
    const { data } = await sb.from('profiles').select('title, full_name, presets').eq('id', user.id).limit(1);
    profile = (data && data[0]) || null;
    let skipped = false;
    try { skipped = !!localStorage.getItem('tripos_record_done'); } catch (_) {}
    if (profile && !profile.full_name && !skipped) {
      openRecord();
    } else {
      loadShell();
    }
  }

  /* welcome — Google primary */
  $('googleBtn').addEventListener('click', async () => {
    $('welcomeStatus').textContent = 'Opening Google…';
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/app/' }
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
      email, options: { emailRedirectTo: window.location.origin + '/app/' }
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
  /* "change my brief" runs the questionnaire in-app — no bounce to the landing page */
  $('briefEdit').addEventListener('click', (e) => { e.preventDefault(); openCheckin(); });
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
      if (error) console.error('[TripOS] passenger record save failed:', error.message);
      profile = { title: recTitle || null, full_name: name };
    }
    try { localStorage.setItem('tripos_record_done', '1'); } catch (_) {}
    loadShell();
  });
  $('recSkip').addEventListener('click', () => {
    try { localStorage.setItem('tripos_record_done', '1'); } catch (_) {}
    loadShell();
  });

  /* shell wiring */
  $('arriveClose').addEventListener('click', () => { $('arriveBanner').hidden = true; });
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
      if (error) console.error('[TripOS] budget save failed:', error.message);
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
