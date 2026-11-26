/* ─── Prevoya · the shared passport page (A3) ─────────────────────────
 * Renders EXCLUSIVELY what the sanitizing endpoint sends — this file has
 * no slot for spend, coordinates, times, or the current day (defense by
 * anatomy, ASSET_SURFACES_SPEC §2.2). Anonymous, token-gated, no login. */

import { anonMap, anonToggle } from '../shared/anon-saves.js';

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

/* ─── THE GIFT (kind=list, Week 3) — a collection given person to person.
   Own photos lead (1h signed URLs minted by the endpoint, consent-gated);
   category photography fills the rest — never a photo we can't vouch for. */
const CAT_FILE = {
  food: 'food', cafe: 'work', work: 'work', gym: 'gym', wellness: 'wellness',
  explore: 'explore', beach: 'beach', nightlife: 'nightlife', 'day-club': 'beach',
  stay: 'explore', health: 'wellness', services: 'explore', rental: 'explore'
};
const catSrc = (c) => '/shared/img/cat-' + (CAT_FILE[c] || 'explore') + '.webp';
const MARK = {
  been: ['✓ been', 'var(--teal)'],
  worth: ['♥ worth it', '#ff6b8a'],
  saved: ['⚑ saved', 'var(--tx)']
};

/* ─── REAL PLACE PHOTOS (Guy, 19 Nov): the gift shows the place as it
   looks — the sender's own photo first (consent-gated by the endpoint),
   else the place's Google photo, resolved DISPLAY-TIME through our
   places-search function (TOS: display, never store), with its required
   author credit. Category art stays the honest floor. ── */
const GUR = new Map(); /* google photo resource name → display uri (this visit) */
async function resolveGPhotos(names) {
  const need = [...new Set(names.filter((n) => n && !GUR.has(n)))].slice(0, 16);
  if (!need.length || !cfg.url || !cfg.anonKey) return;
  try {
    const r = await fetch(cfg.url + '/functions/v1/places-search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.anonKey,
        Authorization: 'Bearer ' + cfg.anonKey
      },
      body: JSON.stringify({ action: 'photos', names: need, maxw: 640 })
    });
    if (!r.ok) return;
    const j = await r.json();
    Object.entries((j && j.uris) || {}).forEach(([n, u]) => { if (u) GUR.set(n, u); });
  } catch (_) {}
}
/* lazy loader for the gift rows — only photos that scroll into view resolve */
function watchRowPhotos() {
  const imgs = document.querySelectorAll('#gChaps img[data-pn]');
  if (!imgs.length) return;
  /* swap only once the real photo has decoded — the category art stays
     up until the very frame it's replaced, never a blank or broken box */
  const swapIn = (img, uri) => {
    const im = new Image();
    im.onload = () => { img.src = uri; };
    im.src = uri;
  };
  const apply = () => {
    document.querySelectorAll('#gChaps img[data-pn]').forEach((img) => {
      const n = img.getAttribute('data-pn');
      if (n && GUR.has(n)) { swapIn(img, GUR.get(n)); img.removeAttribute('data-pn'); }
    });
  };
  /* the first screen never waits for a scroll; the rest trickle in behind
     it (audit 24 Nov: a scrolled list showed a wall of category art) */
  const all = [...imgs].map((i) => i.getAttribute('data-pn')).filter(Boolean);
  const trickle = (i) => {
    if (i >= all.length) return;
    resolveGPhotos(all.slice(i, i + 16)).then(() => {
      apply();
      setTimeout(() => trickle(i + 16), 150);
    });
  };
  resolveGPhotos(all.slice(0, 12)).then(() => { apply(); trickle(12); });
  if (!('IntersectionObserver' in window)) return;
  let pending = new Set();
  let timer = null;
  const flush = () => {
    timer = null;
    const batch = [...pending].slice(0, 16);
    pending = new Set([...pending].filter((n) => batch.indexOf(n) === -1));
    if (!batch.length) return;
    resolveGPhotos(batch).then(() => {
      apply();
      if (pending.size && !timer) timer = setTimeout(flush, 200);
    });
  };
  const io = new IntersectionObserver((ents) => {
    ents.forEach((en) => {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      const n = en.target.getAttribute('data-pn');
      if (n && GUR.has(n)) { swapIn(en.target, GUR.get(n)); en.target.removeAttribute('data-pn'); return; }
      if (n) pending.add(n);
    });
    if (pending.size && !timer) timer = setTimeout(flush, 150);
  }, { rootMargin: '300px' });
  imgs.forEach((i) => io.observe(i));
}
/* one cascade order for the story: any photo leads (own first, then a
   real place photo), then been > worth > saved */
function storyOrder(places) {
  const rank = { been: 0, worth: 1, saved: 2 };
  const ph = (p) => (p.photo ? 2 : (p.photo_name ? 1 : 0));
  return places.slice().sort((a, b) =>
    (ph(b) - ph(a)) ||
    ((rank[a.mark] != null ? rank[a.mark] : 3) - (rank[b.mark] != null ? rank[b.mark] : 3)));
}

/* ─── ROUND 16 (Guy, 26 Nov): THE GIFT IN DAYLIGHT — his composite of
   the /x/16 examples. A: the sender's header + handwritten note. C: a
   tappable photo story (own photos first, then real place photos,
   display-time + credited). B: a "What's inside" contents card and the
   list divided by area, with the keep bar riding the bottom. The old
   4-beat ceremony retired: the story IS the opening. */
function renderGift(data, token) {
  const DEST = data.destination || null; /* v15: null = places span destinations */
  const name = data.name || 'a traveler';
  const places = data.places || [];
  const n = (data.counts && data.counts.places) || places.length;
  const been = places.filter((p) => p.mark === 'been').length;
  const withPh = (data.counts && data.counts.withPhotos) || 0;
  const NAME_U = name.toUpperCase();
  document.title = name + '\u2019s ' + (DEST || 'places') + ' \u2014 a gift \u00b7 Prevoya';

  /* ── A · the header + the note ── */
  $('gAva').textContent = (name[0] || 'P').toUpperCase();
  $('gTitle').textContent = DEST
    ? name + ' saved you their ' + DEST
    : name + ' saved you ' + n + ' place' + (n === 1 ? '' : 's');
  if (data.note) { $('gNoteTx').textContent = data.note; $('gNoteW').hidden = false; }
  $('gCts').innerHTML = '<b>' + n + ' PLACES</b> \u00b7 ' +
    ((data.counts && data.counts.areas) || 1) + ' AREAS' +
    (been ? ' \u00b7 ' + been + ' BEEN TO' : '') +
    (withPh ? ' \u00b7 ' + withPh + ' WITH ' + esc(NAME_U) + '\u2019S PHOTOS' : '');

  /* ── C · the photo story — own photos lead; top up with real place
     photos (Google, display-time, credited) when there are few ── */
  const ordered = storyOrder(places);
  const ownFr = ordered.filter((p) => p.photo).slice(0, 10);
  const gFr = ownFr.length < 4
    ? ordered.filter((p) => !p.photo && p.photo_name).slice(0, 6 - ownFr.length) : [];
  const buildStory = (frames) => {
    if (!frames.length) return;
    const story = $('gStory');
    $('gSava').textContent = (name[0] || 'P').toUpperCase();
    $('gSline').textContent = name + ' was here';
    $('gSw').textContent = NAME_U + '\u2019S CAMERA ROLL';
    $('gFrames').innerHTML = frames.map((f) =>
      '<div class="fr"><img alt="' + esc(f.p.name) + '" src="' + esc(f.src) + '"></div>').join('');
    const ticks = $('gTicks');
    ticks.innerHTML = frames.map(() => '<i></i>').join('');
    const frEls = [].slice.call($('gFrames').children);
    const tkEls = [].slice.call(ticks.children);
    const MARKL = { been: '\u2713 BEEN', worth: '\u2665 WORTH IT', saved: '\u2691 SAVED' };
    let cur = 0, timer = null;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let inView = true;
    const show = (i) => {
      cur = (i + frames.length) % frames.length;
      frEls.forEach((el, j) => el.classList.toggle('on', j === cur));
      tkEls.forEach((el, j) => el.classList.toggle('done', j <= cur));
      const f = frames[cur];
      $('gCapN').textContent = f.p.name;
      $('gCapA').textContent = [String(f.p.category || '').toUpperCase(), String(f.p.area || '').toUpperCase()]
        .filter(Boolean).join(' \u00b7 ');
      $('gCapM').textContent = (MARKL[f.p.mark] || MARKL.saved) + ' \u00b7 ' +
        (f.own ? NAME_U + '\u2019S PHOTO' : '\ud83d\udcf7 ' + (f.p.photo_author || 'Google').toUpperCase() + ' \u00b7 GOOGLE');
      if (timer) clearTimeout(timer);
      if (!reduced && inView && !document.hidden) timer = setTimeout(() => show(cur + 1), 4600);
    };
    story.addEventListener('click', () => show(cur + 1));
    story.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(cur + 1); }
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((ents) => {
        inView = ents[0].isIntersecting;
        if (inView) show(cur);
        else if (timer) clearTimeout(timer);
      }, { threshold: 0.25 }).observe(story);
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) show(cur); });
    story.hidden = false;
    $('gScap').textContent = ownFr.length
      ? frames.length + ' PLACE' + (frames.length === 1 ? '' : 'S') + ' ' + NAME_U + ' STOOD IN \u2014 TAP THROUGH'
      : 'THE PLACES AS THEY LOOK \u2014 TAP THROUGH';
    $('gScap').hidden = false;
    show(0);
  };
  const ownFrames = ownFr.map((p) => ({ p, src: p.photo, own: true }));
  if (gFr.length) {
    resolveGPhotos(gFr.map((p) => p.photo_name)).then(() => {
      buildStory(ownFrames.concat(
        gFr.filter((p) => GUR.has(p.photo_name))
          .map((p) => ({ p, src: GUR.get(p.photo_name), own: false }))));
    });
  } else buildStory(ownFrames);

  /* ── B · what's inside + the chapters — by area, biggest first; the
     small areas gather into one last chapter so the contents stay short ── */
  const byArea = new Map();
  places.forEach((p) => {
    const a = String(p.area || '').trim() || 'More places';
    if (!byArea.has(a)) byArea.set(a, []);
    byArea.get(a).push(p);
  });
  const areas = [...byArea.entries()].sort((a, b) => b[1].length - a[1].length);
  const big = areas.filter(([, ps]) => ps.length >= 3).slice(0, 4);
  const tail = areas.filter(([a]) => !big.some(([b]) => b === a));
  const chapters = big.map(([a, ps]) => ({ id: 'ga-' + a.toLowerCase().replace(/[^a-z0-9]+/g, '-'), title: a, areas: [a], ps }));
  if (tail.length) {
    const ps = tail.reduce((s, [, p]) => s.concat(p), []);
    if (ps.length) chapters.push({
      id: 'ga-further', title: chapters.length ? 'Further out' : (DEST || 'The places'),
      areas: tail.map(([a]) => a), ps
    });
  }
  if (chapters.length > 1) {
    $('gTocRows').innerHTML = chapters.map((c) =>
      '<a href="#' + c.id + '"><span>' + esc(c.areas.join(' \u00b7 ')) + '</span><span class="dots"></span>' +
      '<span class="n">' + c.ps.length + ' PLACE' + (c.ps.length === 1 ? '' : 'S') + '</span></a>').join('');
    $('gToc').hidden = false;
  }
  const MARKC = { been: ['\u2713 BEEN', ''], worth: ['\u2665 WORTH IT', ' w'], saved: ['\u2691 SAVED', ' s'] };
  $('gChaps').innerHTML = chapters.map((c) => {
    const cb = c.ps.filter((p) => p.mark === 'been').length;
    return '<section class="g-chap" id="' + c.id + '">' +
      '<h2>' + esc(c.title) + '</h2>' +
      '<p class="cc">' + c.ps.length + ' PLACE' + (c.ps.length === 1 ? '' : 'S') +
        (cb ? ' \u00b7 ' + cb + ' VISITED' : '') +
        (c.areas.length > 1 ? ' \u00b7 ' + esc(c.areas.join(' \u00b7 ').toUpperCase()) : '') + '</p>' +
      c.ps.map((p) => {
        const [mk, mc] = MARKC[p.mark] || MARKC.saved;
        const pn = (!p.photo && p.photo_name) ? ' data-pn="' + esc(p.photo_name) + '"' : '';
        const cred = (!p.photo && p.photo_name && p.photo_author)
          ? ' title="photo: ' + esc(p.photo_author) + ' \u00b7 Google"' : '';
        return '<div class="g-pl">' +
          '<img alt="" loading="lazy"' + pn + cred + ' src="' + esc(p.photo || catSrc(p.category)) + '">' +
          '<span class="n">' + esc(p.name) + (p.verified ? ' <span class="pv">\u2713</span>' : '') +
            '<span class="s">' + esc([p.category, c.areas.length > 1 ? p.area : null]
              .filter(Boolean).join(' \u00b7 ').toUpperCase()) + '</span></span>' +
          '<span class="mk' + mc + '">' + mk + '</span></div>';
      }).join('') +
    '</section>';
  }).join('');
  if (places.some((p) => !p.photo && p.photo_name)) {
    $('gChaps').insertAdjacentHTML('beforeend',
      '<p class="g-gcred">PLACE PHOTOS \u00b7 THEIR GOOGLE CONTRIBUTORS</p>');
    watchRowPhotos();
  }
  $('gColo').textContent = been
    ? 'Made from ' + been + ' real visit' + (been === 1 ? '' : 's') + ', stamped as they happened.'
    : 'Saved one by one \u2014 a collection, not a listicle.';

  /* provenance travels into sign-up — same seed the passport share plants */
  const seed = (place) => {
    try {
      localStorage.setItem('tripos_via', JSON.stringify({
        via: name, place: place || null, token: token, at: Date.now(),
        places: n, kind: 'list'
      }));
    } catch (_) {}
  };
  $('gfOwn').addEventListener('click', () => seed(null));
  const top = $('gTopCta');
  if (top) top.addEventListener('click', () => seed(null));

  /* the door: every place lands in the anonymous buffer — the same buffer
     the public shelf fills, claimed on the first signed-in open */
  const btn = $('gfSaveAll');
  const already = places.length && places.every((p) => anonMap().has(String(p.id)));
  const taken = () => {
    btn.classList.add('done');
    btn.textContent = 'On your list \u2713';
    btn.onclick = () => { seed(null); location.href = '/app/'; };
  };
  if (already) taken();
  else {
    btn.textContent = 'Keep all ' + n + ' \u2014 free';
    btn.onclick = () => {
      const have = anonMap();
      places.forEach((p) => {
        if (!have.has(String(p.id))) anonToggle({
          id: p.id, name: p.name, area: p.area, category: p.category,
          via: { t: token, name: name } /* ROUND 12: the gift stays the giver's until promoted */
        });
      });
      seed(null);
      try { window.pvTrack && window.pvTrack('share_save_tap', { kind: 'list', n: n, t: token }); } catch (_) {}
      taken();
    };
  }

  /* ROUND 11: the token rides along (a share slug, not PII) — it's what
     lets the SENDER hear the echo as counts, never as identities */
  try { window.pvTrack && window.pvTrack('share_visit', { kind: 'list', t: token }); } catch (_) {}

  $('shLoading').hidden = true;
  $('g16').hidden = false;
  $('gKeepbar').hidden = false;
  $('dayFoot').hidden = false;
}

function stampHTML(s, count, viaName, hide) {
  const seed = stampSeed(s.key);
  const rot = (((seed % 61) / 10) - 3).toFixed(1);
  const shape = ((seed >> 3) % 2) ? 'st-diamond' : 'st-circle';
  const tint = AREA_TINT[s.area] || 'var(--teal)';
  const cc = CAT_CC[s.category] || 'var(--teal)';
  const badge = s.verified ? '<span class="st-v">✓</span>' : (s.discovered ? '<span class="st-v st-disc">◔</span>' : '');
  /* the owner's like travels with the share — read-only heart (v7 payload) */
  const worth = s.worth ? '<span class="st-like st-like-ro on">♥</span>' : '';
  return '<button type="button"' + (hide ? ' hidden' : '') + ' class="stamp ' + shape + '" data-name="' + esc(s.name) + '" data-area="' + esc(s.area) + '" data-cat="' + esc(s.category || '') + '"' +
    ' style="--st:' + tint + ';--rot:' + rot + 'deg">' +
    (count > 1 ? '<span class="st-count">×' + count + '</span>' : '') +
    '<span class="st-dot" style="background:' + cc + '"></span>' +
    worth +
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
  /* the gift — a collection, not a passport: its own render, then done */
  if (data.kind === 'list') { renderGift(data, token); return; }
  if (!data.counts) { gone(); return; }

  /* the passport keeps its cosmic world — flip the page out of daylight */
  document.body.classList.remove('day');
  const mt = document.getElementById('metaTheme');
  if (mt) mt.setAttribute('content', '#0a0a14');

  paintDial();
  setInterval(paintDial, 60000);

  const name = (data.name || 'a traveler');
  const poss = name.toUpperCase() + (name.toUpperCase().endsWith('S') ? '’' : '’S');
  $('shTitle').textContent = poss + ' ' + (data.destination || 'BALI').toUpperCase();
  const monthWord = data.month ? MONTH_FULL[+data.month.split('-')[1] - 1] : null;
  $('shCounts').innerHTML = (monthWord ? esc(monthWord.toUpperCase()) + ' · ' : '') +
    '<em>' + data.counts.places + '</em> PLACES · <em>' + data.counts.areas + '</em> AREAS · <em>' + data.counts.stamps + '</em> STAMPS';
  $('shCtaLine').textContent = 'Plan your ' + (data.destination || 'Bali') + ' from ' + name + '’s ' + (monthWord || 'trip') + '.';
  $('shFootCta').textContent = 'plan your own ' + (data.destination || 'Bali') + ' like ' + name + '’s →';

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
