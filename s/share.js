/* ─── Prevoya · the shared passport page (A3) ─────────────────────────
 * Renders EXCLUSIVELY what the sanitizing endpoint sends — this file has
 * no slot for spend, coordinates, times, or the current day (defense by
 * anatomy, ASSET_SURFACES_SPEC §2.2). Anonymous, token-gated, no login. */

const cfg = window.TRIPOS_SUPABASE || {};
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (id) => document.getElementById(id);

const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const AREA_TINT = {
  Canggu: 'var(--area-canggu)', Uluwatu: 'var(--area-uluwatu)', Ubud: 'var(--area-ubud)',
  Seminyak: 'var(--area-seminyak)', Sanur: 'var(--area-sanur)', Denpasar: 'var(--area-denpasar)',
  'East Bali': 'var(--area-eastbali)', 'Nusa Penida': 'var(--area-penida)',
  'Gili Trawangan': 'var(--area-gili)', Lombok: 'var(--area-lombok)'
};
const CAT_CC = {
  beach: 'var(--cat-beach)', food: 'var(--cat-food)', nightlife: 'var(--cat-night)',
  work: 'var(--cat-work)', wellness: 'var(--cat-wellness)', explore: 'var(--cat-explore)', gym: 'var(--cat-gym)',
  cafe: 'var(--cat-work)', 'day-club': 'var(--cat-dayclub)', surf: 'var(--cat-surf)'
};
const PHASE_COLOR = { dawn: '#ffb454', day: '#3dffd0', golden: '#ffb454', dusk: '#a78bfa', night: '#4cc9f0' };

/* the abstract map — same grammar as every Prevoya surface (SVG needs literals) */
const AREA_XY = {
  Canggu: [100, 128], Seminyak: [127, 144], Denpasar: [153, 131], Sanur: [172, 145],
  Ubud: [142, 105], Uluwatu: [156, 180], 'Nusa Penida': [229, 175],
  'East Bali': [252, 122], 'Gili Trawangan': [300, 150], 'Lombok': [306, 182]
};
const AREA_HEX = {
  Canggu: '#3dffd0', Ubud: '#4ade80', Seminyak: '#ffb454', Uluwatu: '#a78bfa',
  'Nusa Penida': '#4cc9f0', Sanur: '#4cc9f0', Denpasar: '#ff6b6b',
  'East Bali': '#fbbf24', 'Gili Trawangan': '#7dd3fc', 'Lombok': '#f472b6'
};

/* REALITY (Guy 2026-09-08): the shared route = where the stamps say the
   trip went, chronological area runs. Day counts are run spans (first→last
   stamp date). A 1-day out-and-back bounce is a stamp cluster, not a route
   change — dropped from the line, its dots still land. */
function liveStops(stamps) {
  const seq = [];
  stamps.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((s) => {
    const reg = String(s.area || '').split('/')[0].trim();
    if (!AREA_XY[reg]) return;
    const last = seq[seq.length - 1];
    if (last && last.area === reg) { last.to = s.date; return; }
    seq.push({ area: reg, from: s.date, to: s.date });
  });
  const out = seq.map((s) => ({ area: s.area, days: Math.round((new Date(s.to) - new Date(s.from)) / 864e5) + 1 }));
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 1; i < out.length - 1; i++) {
      if (out[i].days <= 1 && out[i - 1].area === out[i + 1].area) {
        out[i - 1].days += out[i + 1].days;
        out.splice(i, 2); changed = true; break;
      }
    }
  }
  return out;
}

/* the live dial — Bali's actual light, public information only */
function paintDial() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Makassar' }));
  const mins = now.getHours() * 60 + now.getMinutes();
  const phase = mins >= 300 && mins < 480 ? 'dawn' : mins >= 480 && mins < 960 ? 'day'
    : mins >= 960 && mins < 1110 ? 'golden' : mins >= 1110 && mins < 1230 ? 'dusk' : 'night';
  const dial = $('shDial');
  dial.dataset.phase = phase;
  dial.style.setProperty('--od-angle', (mins / 4 + 30).toFixed(1) + 'deg');
  const c = PHASE_COLOR[phase];
  const rim = dial.querySelector('.od-rim'), pin = dial.querySelector('.od-pin'), ping = dial.querySelector('.od-ping');
  if (rim) rim.style.stroke = c;
  if (pin) { pin.style.fill = c; pin.style.filter = 'drop-shadow(0 0 4px ' + c + ')'; }
  if (ping) ping.style.stroke = c;
}

function stampSeed(k) { let h = 0; const s = String(k || ''); for (let i = 0; i < s.length; i++) h = ((h * 31) + s.charCodeAt(i)) >>> 0; return h; }
const dateLbl = (iso) => { const [, m, d] = String(iso).split('-'); return MONTH_ABBR[+m - 1] + ' ' + (+d); };

function stampHTML(s, count, viaName, hide) {
  const seed = stampSeed(s.key);
  const rot = (((seed % 61) / 10) - 3).toFixed(1);
  const shape = ((seed >> 3) % 2) ? 'st-diamond' : 'st-circle';
  const tint = AREA_TINT[s.area] || 'var(--teal)';
  const cc = CAT_CC[s.category] || 'var(--teal)';
  const badge = s.verified ? '<span class="st-v">✓</span>' : (s.discovered ? '<span class="st-v st-disc">◔</span>' : '');
  return '<button type="button"' + (hide ? ' hidden' : '') + ' class="stamp ' + shape + '" data-name="' + esc(s.name) + '" data-area="' + esc(s.area) + '" data-cat="' + esc(s.category || '') + '"' +
    ' style="--st:' + tint + ';--rot:' + rot + 'deg">' +
    (count > 1 ? '<span class="st-count">×' + count + '</span>' : '') +
    '<span class="st-dot" style="background:' + cc + '"></span>' +
    '<span class="st-name">' + esc(s.name) + '</span>' +
    '<span class="st-date">' + dateLbl(s.date) + (s.category ? ' · ' + esc(s.category) : '') + ' ' + badge + '</span>' +
  '</button>';
}

(async function () {
  const token = new URLSearchParams(location.search).get('t') || '';
  const gone = () => { $('shLoading').hidden = true; $('shGone').hidden = false; };
  if (!cfg.url || !token) { gone(); return; }
  let data = null;
  try {
    const r = await fetch(cfg.url + '/functions/v1/shared-trip?t=' + encodeURIComponent(token));
    if (r.ok) data = await r.json();
  } catch (_) {}
  if (!data || data.error) { gone(); return; }
  /* a route-card token belongs to the route page — send it home (the old
     unfiltered share button handed those out; links live forever) */
  if (data.kind === 'route') { location.replace('/route/?t=' + encodeURIComponent(token)); return; }
  if (!data.counts) { gone(); return; }

  paintDial();
  setInterval(paintDial, 60000);

  const name = (data.name || 'a traveler');
  const poss = name.toUpperCase() + (name.toUpperCase().endsWith('S') ? '’' : '’S');
  $('shTitle').textContent = poss + ' ' + (data.destination || 'BALI').toUpperCase();
  const monthWord = data.month ? MONTH_FULL[+data.month.split('-')[1] - 1] : null;
  $('shCounts').innerHTML = (monthWord ? esc(monthWord.toUpperCase()) + ' · ' : '') +
    '<em>' + data.counts.places + '</em> PLACES · <em>' + data.counts.areas + '</em> AREAS · <em>' + data.counts.stamps + '</em> STAMPS';
  $('shCtaLine').textContent = 'Plan your Bali from ' + name + '’s ' + (monthWord || 'trip') + '.';
  $('shFootCta').textContent = 'plan your own Bali like ' + name + '’s →';

  /* provenance travels with the new user into sign-up (S4 seed) — every
   * exit from this page carries it, not only the stamp mini-card */
  const seedVia = (place) => {
    try { window.pvTrack && window.pvTrack('share_save_tap', { kind: 'passport' }); } catch (_) {}
    try {
      localStorage.setItem('tripos_via', JSON.stringify({
        via: name, place: place || null, token: token, at: Date.now(),
        places: (data.counts && data.counts.places) || null,
        month: data.month || null
      }));
    } catch (_) {}
  };
  ['shCtaBtn', 'shFootCta'].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener('click', () => seedVia(null));
  });

  /* beat 2a · THE LIVED MAP — trace + dots from stamps, never the plan */
  const stops = liveStops(data.stamps || []);
  if (stops.length >= 2) {
    $('shMapSec').hidden = false;
    const pts = stops.map((s) => AREA_XY[s.area]);
    $('shTrace').setAttribute('d', pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ',' + p[1]).join(' '));
    /* one dot per place, hash-offset around its AREA anchor — a dot claims
       an area, never a point (M3: no coordinates on any public surface) */
    const seenDot = new Set();
    $('shMapDots').innerHTML = (data.stamps || []).map((s) => {
      const reg = String(s.area || '').split('/')[0].trim();
      const xy = AREA_XY[reg];
      const k = String(s.key);
      if (!xy || seenDot.has(k)) return '';
      seenDot.add(k);
      let h = 0;
      for (let i = 0; i < k.length; i++) h = ((h * 31) + k.charCodeAt(i)) >>> 0;
      const ang = (h % 360) * Math.PI / 180, rad = 7 + ((h >> 4) % 8);
      return '<circle cx="' + (xy[0] + Math.cos(ang) * rad).toFixed(1) +
        '" cy="' + (xy[1] + Math.sin(ang) * rad).toFixed(1) + '" r="1.7" fill="#e8e8f0" opacity="0.8"/>';
    }).join('');
    /* orbs + labels: one label per area, dense-band anchors, collision rows */
    const ANCH = { Canggu: [-9, 3, 'end'], Uluwatu: [0, 16, 'middle'], 'Nusa Penida': [0, 15, 'middle'],
      'Gili Trawangan': [12, -10, 'end'], Lombok: [6, 14, 'end'] };
    const Wd = (t) => t.length * 5;
    /* one label per area — total days across every return visit */
    const daysBy = {};
    stops.forEach((s) => { daysBy[s.area] = (daysBy[s.area] || 0) + s.days; });
    const seenL = new Set();
    const labs = stops.map((s, i) => {
      if (seenL.has(s.area)) return null;
      seenL.add(s.area);
      const t = s.area.toUpperCase() + (daysBy[s.area] > 1 ? ' · ' + daysBy[s.area] + 'D' : '');
      const a = ANCH[s.area];
      let x = pts[i][0] + 9, y = pts[i][1] + 3, anchor = 'start';
      if (a) { x = pts[i][0] + a[0]; y = pts[i][1] + a[1]; anchor = a[2]; }
      else if (x + Wd(t) > 316) { anchor = 'end'; x = pts[i][0] - 9; }
      return { t, x, y, anchor, i };
    }).filter(Boolean);
    const sL = (o) => o.anchor === 'end' ? o.x - Wd(o.t) : (o.anchor === 'middle' ? o.x - Wd(o.t) / 2 : o.x);
    labs.sort((a, b) => a.y - b.y);
    for (let i = 1; i < labs.length; i++) {
      for (let k = 0; k < i; k++) {
        if (Math.abs(labs[i].y - labs[k].y) < 9 && sL(labs[k]) < sL(labs[i]) + Wd(labs[i].t) && sL(labs[i]) < sL(labs[k]) + Wd(labs[k].t)) {
          labs[i].y = labs[k].y + 9; k = -1;
        }
      }
    }
    $('shMapOrbs').innerHTML =
      stops.map((s, i) => '<circle cx="' + pts[i][0] + '" cy="' + pts[i][1] + '" r="' + (s.days > 2 ? 5 : 3.2) + '" fill="' + (AREA_HEX[s.area] || '#3dffd0') + '"/>').join('') +
      labs.map((o) => '<text x="' + o.x + '" y="' + o.y + '"' + (o.anchor !== 'start' ? ' text-anchor="' + o.anchor + '"' : '') +
        ' fill="' + (AREA_HEX[stops[o.i].area] || '#3dffd0') + '" font-size="8" style="font-family:ui-monospace,Menlo,monospace;letter-spacing:0.06em">' + esc(o.t) + '</text>').join('');
  }

  /* beat 2 · the route rows — the lived stops; the plan only when there are
     no stamps yet (a day-1 share), and then it says so */
  if (stops.length >= 2) {
    $('shRouteSec').hidden = false;
    $('shLegs').innerHTML = stops.map((s) =>
      '<div class="ri-leg done" style="--at:' + (AREA_TINT[s.area] || 'var(--teal)') + '">' +
        '<span class="ri-orb"></span>' +
        '<div class="ri-row" style="cursor:default">' +
          '<span class="ri-name">' + esc(s.area.toUpperCase()) + '</span>' +
          '<span class="ri-dots"></span>' +
          '<span class="ri-n">' + s.days + (s.days === 1 ? ' DAY' : ' DAYS') + '</span>' +
        '</div>' +
      '</div>').join('');
    $('shStillOut').hidden = !data.ongoing;
  } else if ((data.legs || []).length || data.ongoing) {
    $('shRouteSec').hidden = false;
    $('shRouteCap').textContent = 'the route — the plan (no stamps yet)';
    $('shLegs').innerHTML = (data.legs || []).map((l) =>
      '<div class="ri-leg done" style="--at:' + (AREA_TINT[l.area] || 'var(--teal)') + '">' +
        '<span class="ri-orb"></span>' +
        '<div class="ri-row" style="cursor:default">' +
          '<span class="ri-name">' + esc(l.area.toUpperCase()) + '</span>' +
          '<span class="ri-dots"></span>' +
          '<span class="ri-n">' + l.nights + ' NIGHTS</span>' +
        '</div>' +
      '</div>').join('');
    $('shStillOut').hidden = !data.ongoing;
  }

  /* beat 2b · the highlights — the places stamped again and again */
  const perPlace = new Map();
  (data.stamps || []).forEach((s) => {
    const k = String(s.key);
    if (!perPlace.has(k)) perPlace.set(k, { s, count: 0 });
    perPlace.get(k).count++;
  });
  const top = [...perPlace.values()].filter((v) => v.count >= 2)
    .sort((a, b) => b.count - a.count).slice(0, 6);
  if (top.length >= 3) {
    $('shHiSec').hidden = false;
    $('shHi').innerHTML = top.map((v) => stampHTML(v.s, v.count, name)).join('');
  }

  /* beat 3 · the spread — one stamp per place, pages by area, FOLDED:
     a page shows 6, the rest wait behind one tap (Guy 2026-09-08: nobody
     scrolls a 227-stamp pile) */
  const pages = new Map();
  perPlace.forEach((v) => {
    if (!pages.has(v.s.area)) pages.set(v.s.area, { first: v.s.date, items: [] });
    const g = pages.get(v.s.area);
    if (v.s.date < g.first) g.first = v.s.date;
    g.items.push(v);
  });
  $('shSpread').innerHTML = [...pages.entries()]
    .sort((a, b) => (a[1].first < b[1].first ? -1 : 1))
    .map(([area, g]) => {
      const items = g.items.sort((a, b) => (b.count - a.count) || (a.s.date < b.s.date ? -1 : 1));
      const more = items.length > 6
        ? '<button type="button" class="st-more">+ ' + (items.length - 6) + ' more in ' + esc(area.toUpperCase()) + '</button>' : '';
      return '<div class="pp-page">' +
        '<div class="visa" style="--st:' + (AREA_TINT[area] || 'var(--teal)') + '">' +
          '<span class="visa-name">' + esc(area.toUpperCase()) + '</span>' +
          '<span class="visa-date">ENTRY · ' + dateLbl(g.first) + ' · ' + items.length + ' PLACES</span>' +
        '</div>' +
        '<div class="stamp-grid">' +
          items.map((v, i) => stampHTML(v.s, v.count, name, i >= 6)).join('') + more +
        '</div>' +
      '</div>';
    }).join('');

  /* beat 4 · the last stamped days (past only — the endpoint guarantees it) */
  const byDay = new Map();
  (data.stamps || []).forEach((s) => {
    if (!byDay.has(s.date)) byDay.set(s.date, []);
    byDay.get(s.date).push(s);
  });
  const days = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-5);
  if (days.length) {
    $('shDaysSec').hidden = false;
    $('shDays').innerHTML = days.map(([d, ss]) =>
      '<div class="pp-day"><span class="pp-day-label">' + dateLbl(d) + '</span>' +
        '<div class="stamp-grid">' + ss.map((s) => stampHTML(s, 1, name)).join('') + '</div>' +
      '</div>').join('');
  }

  /* stamp tap → mini card with the provenance chip (S4 lands here) */
  document.addEventListener('click', (e) => {
    const more = e.target.closest('.st-more');
    if (more) {
      more.parentElement.querySelectorAll('.stamp[hidden]').forEach((el) => { el.hidden = false; });
      more.remove();
      return;
    }
    const st = e.target.closest('.stamp');
    const mini = $('shMini');
    if (st) {
      $('shMiniCard').innerHTML =
        '<div class="place-name">' + esc(st.getAttribute('data-name')) + '</div>' +
        '<div class="poi-type">' + (st.getAttribute('data-cat') ? esc(st.getAttribute('data-cat')) + ' · ' : '') +
          esc(st.getAttribute('data-area')) + ' · from ' + esc(name) + '’s passport</div>' +
        '<a class="btn btn-primary sh-save" href="../bali/">save · via ' + esc(name) + '</a>' +
        '<button type="button" class="ck-reset sh-close">close</button>';
      mini.hidden = false;
      mini.querySelector('.sh-save').addEventListener('click', () =>
        seedVia(st.getAttribute('data-name')));
      mini.querySelector('.sh-close').onclick = () => { mini.hidden = true; };
      return;
    }
    if (e.target === mini) mini.hidden = true;
  });

  $('shLoading').hidden = true;
  $('shBody').hidden = false;
  try { window.pvTrack && window.pvTrack('share_visit', { kind: 'passport' }); } catch (_) {}

  /* counts count-up — with the stall-proof fallback */
  const ems = $('shCounts').querySelectorAll('em');
  if (!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
    ems.forEach((el) => {
      const target = +el.textContent; let t0 = null;
      el.textContent = '0';
      const step = (ts) => {
        if (!t0) t0 = ts;
        const p = Math.min(1, (ts - t0) / 700);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      setTimeout(() => { el.textContent = target; }, 900);
    });
  }
})();
