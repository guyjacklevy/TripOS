/* ─── TripOS · the app (/app) — v3 slice 1 ────────────────────
 * Foundation: welcome (Google primary + email code fallback),
 * tab shell (Today/Places/Pulse/You, hash routing, runway light),
 * Stage 6 passenger record typed onto the boarding pass, and the
 * v2 data surfaces distributed into their tabs as interim content.
 * Spec: _agents/cto/APP_SPEC.md v3.2 — nothing here is improvised.
 * ──────────────────────────────────────────────────────────── */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { pickTop, isMatch, scorePlace, readPlan, VIBE_LABEL, TIER_LABEL, HOME_AREA, durLabel, CAT_ICON } from './match.js';
import { mountCheckin } from './checkin.js';

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
    '<div><span>Tier</span><strong>' + esc(TIER_LABEL[trip.budget_tier] || '—') + '</strong></div>';
  const area = (HOME_AREA[trip.vibe] || '').split(' ')[0].toLowerCase();
  if (area) document.body.setAttribute('data-area', area);
}

function setPassenger(title, fullName) {
  const line = passengerLine(title, fullName);
  const el = $('bpPassenger');
  if (el) el.textContent = line || '—';
}

function pickCard(p, matched) {
  const meta = CAT_META[p.category] || { orb: 'planet-teal', cc: 'var(--teal)' };
  const icon = CAT_ICON[p.category] || '📍';
  const maps = p.maps_query
    ? '<a class="place-maps" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' +
      encodeURIComponent(p.maps_query) + '">Maps ↗</a>' : '';
  let money = '';
  for (let m = 0; m < (p.price_level || 1); m++) money += '$';
  return (
    '<article class="place-card" style="--cc:' + meta.cc + '">' +
      (matched ? '<span class="match-badge">✦ your match</span>' : '') +
      '<div class="place-top"><span class="orb ' + meta.orb + '"></span><div>' +
        '<div class="place-name">' + esc(p.name) + (p.verified ? '<span class="place-verified">✓</span>' : '') + '</div>' +
        '<div class="poi-type">' + icon + ' ' + esc(p.area) + ' · <span class="price-sym">' + money + '</span></div>' +
      '</div></div>' +
      (p.why ? '<p class="place-why">' + esc(p.why) + '</p>' : '') +
      (p.tip ? '<p class="place-tip">' + esc(p.tip) + '</p>' : '') +
      '<div class="place-foot"><span class="place-price">' + esc(p.timing_note || '') + '</span>' + maps + '</div>' +
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

function renderPicks(places, trip) {
  let list, matched;
  if (trip && trip.vibe) {
    const plan = {
      vibe: trip.vibe, dur: String(trip.duration_days), tier: trip.budget_tier,
      vibe_detail: trip.vibe_detail || null, party: trip.party || null, priorities: trip.priorities || []
    };
    list = pickTop(places, plan, 6);
    matched = new Set(list.filter((p) => isMatch(scorePlace(p, plan))));
  } else {
    list = places.filter((p) => p.verified).slice(0, 6);
    matched = new Set();
  }
  $('pickGrid').innerHTML = list.map((p) => pickCard(p, matched.has(p))).join('');
  dropIn($('pickGrid'));
  /* interim Today: top 2 of the same picks as "now" cards */
  $('nowGrid').innerHTML = list.slice(0, 2).map((p) => pickCard(p, matched.has(p))).join('');
  dropIn($('nowGrid'));
}

function renderToday(trip, firstName) {
  const now = new Date();
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const glyph = (now.getHours() >= 6 && now.getHours() < 20) ? '☀' : '☾';
  const base = trip && trip.vibe ? (HOME_AREA[trip.vibe] || 'Bali').split(' ')[0].toUpperCase() : 'BALI';
  $('todayStrip').textContent = glyph + ' ' + days[now.getDay()] + ' · ' + hh + ':' + mm + ' · ' + base + ' BASE';
  const h = now.getHours();
  const block = h < 11 ? 'Morning' : h < 16 ? 'Midday' : h < 20 ? 'Golden hour soon' : 'Night mode';
  $('todayGreet').textContent = block + (firstName ? ', ' + firstName : '') + '.';
}

function renderPulse(dailyK, spentK, rows) {
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
  $('spendList').innerHTML = (rows || []).map((r) =>
    '<li><span class="sl-cat">' + esc(r.category || '—') + '</span>' +
    '<span class="sl-amt">' + fmtK((r.amount_idr || 0) / 1000) + '</span>' +
    '<span class="sl-time">' + new Date(r.spent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</span></li>'
  ).join('');
  /* fuel strip on Today */
  const fs = $('fuelStrip');
  fs.hidden = false;
  fs.innerHTML = '▲ <strong>' + fmtK(leftK) + ' IDR</strong> still yours today · tap for the pulse';
}

/* ─── screens ─── */
function show(which) {
  welcome.hidden = which !== 'welcome';
  record.hidden = which !== 'record';
  shell.hidden = which !== 'shell';
  checkinScreen.hidden = which !== 'checkin';
}

window.__appDebug = {
  show, setTab, renderBrief, renderPicks, renderPulse, renderToday, setPassenger,
  passengerLine
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

  const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };

  async function loadPulse() {
    const { data, error } = await sb.from('expenses')
      .select('amount_idr, category, spent_at')
      .gte('spent_at', startOfToday())
      .order('spent_at', { ascending: false });
    if (error) { console.error('[TripOS] expenses load failed:', error.message); return; }
    const spentK = (data || []).reduce((s, r) => s + (r.amount_idr || 0), 0) / 1000;
    renderPulse(dailyK, spentK, data || []);
  }

  async function logSpend(amtK, cat) {
    if (!user || !(amtK > 0)) return;
    $('logStatus').textContent = 'Logging…';
    const { error } = await sb.from('expenses').insert({
      user_id: user.id, trip_id: trip && trip.id ? trip.id : null,
      amount_idr: Math.round(amtK * 1000), category: cat
    });
    $('logStatus').textContent = error ? '⚠ ' + error.message : '✓ logged';
    if (!error) { setTimeout(() => { $('logStatus').textContent = ''; }, 1600); loadPulse(); }
  }

  /* upsert a brief (from the questionnaire or a pre-login landing run) */
  async function saveBrief(a) {
    const { data: up, error } = await sb.from('trips').upsert({
      user_id: user.id, destination: 'bali',
      vibe: a.vibe || null,
      vibe_detail: a.vibe_detail || null,
      party: a.party || null,
      duration_days: a.dur != null ? parseInt(a.dur, 10) : null,
      budget_tier: a.tier || null,
      priorities: a.priorities && a.priorities.length ? a.priorities : null
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
          vibe_detail: trip.vibe_detail || null, party: trip.party || null, priorities: trip.priorities || []
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
    dailyK = TIER_IDR[trip && trip.budget_tier] || 700;

    renderBrief(trip);
    setPassenger(profile && profile.title, profile && profile.full_name);
    renderToday(trip, firstName());

    const { data: places } = await sb.from('curated_places').select('*').eq('destination', 'bali');
    renderPicks(places || [], trip);
    loadPulse();

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
    const { data } = await sb.from('profiles').select('title, full_name').eq('id', user.id).limit(1);
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
    logSpend(parseInt(btn.getAttribute('data-amt'), 10), btn.getAttribute('data-cat'));
  });
  $('logForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const amt = parseInt($('logAmt').value, 10);
    if (!(amt > 0)) return;
    logSpend(amt, $('logCat').value);
    $('logAmt').value = '';
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
