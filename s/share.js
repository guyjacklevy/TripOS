/* ─── TripOS · the shared passport page (A3) ─────────────────────────
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
  Islands: 'var(--area-islands)'
};
const CAT_CC = {
  beach: 'var(--cat-beach)', food: 'var(--cat-food)', nightlife: 'var(--cat-night)',
  work: 'var(--cat-work)', wellness: 'var(--cat-wellness)', explore: 'var(--cat-explore)', gym: 'var(--cat-gym)'
};
const PHASE_COLOR = { dawn: '#ffb454', day: '#3dffd0', golden: '#ffb454', dusk: '#a78bfa', night: '#4cc9f0' };

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

function stampHTML(s, count, viaName) {
  const seed = stampSeed(s.key);
  const rot = (((seed % 61) / 10) - 3).toFixed(1);
  const shape = ((seed >> 3) % 2) ? 'st-diamond' : 'st-circle';
  const tint = AREA_TINT[s.area] || 'var(--teal)';
  const cc = CAT_CC[s.category] || 'var(--teal)';
  const badge = s.verified ? '<span class="st-v">✓</span>' : (s.discovered ? '<span class="st-v st-disc">◔</span>' : '');
  return '<button type="button" class="stamp ' + shape + '" data-name="' + esc(s.name) + '" data-area="' + esc(s.area) + '" data-cat="' + esc(s.category || '') + '"' +
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
  if (!data || data.error || !data.counts) { gone(); return; }

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

  /* beat 2 · completed legs only; ongoing trips end in mystery */
  if ((data.legs || []).length || data.ongoing) {
    $('shRouteSec').hidden = false;
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

  /* beat 3 · the spread — one stamp per place, pages by area */
  const perPlace = new Map();
  (data.stamps || []).forEach((s) => {
    const k = String(s.key);
    if (!perPlace.has(k)) perPlace.set(k, { s, count: 0 });
    perPlace.get(k).count++;
  });
  const pages = new Map();
  perPlace.forEach((v) => {
    if (!pages.has(v.s.area)) pages.set(v.s.area, { first: v.s.date, items: [] });
    const g = pages.get(v.s.area);
    if (v.s.date < g.first) g.first = v.s.date;
    g.items.push(v);
  });
  $('shSpread').innerHTML = [...pages.entries()]
    .sort((a, b) => (a[1].first < b[1].first ? -1 : 1))
    .map(([area, g]) =>
      '<div class="pp-page">' +
        '<div class="visa" style="--st:' + (AREA_TINT[area] || 'var(--teal)') + '">' +
          '<span class="visa-name">' + esc(area.toUpperCase()) + '</span>' +
          '<span class="visa-date">ENTRY · ' + dateLbl(g.first) + '</span>' +
        '</div>' +
        '<div class="stamp-grid">' +
          g.items.sort((a, b) => (a.s.date < b.s.date ? -1 : 1))
            .map((v) => stampHTML(v.s, v.count, name)).join('') +
        '</div>' +
      '</div>').join('');

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
