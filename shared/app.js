/* ─── TripOS · the app (/app) — per-user home ─────────────────
 * The real product surface: login gate → YOUR brief (from your
 * trips row), YOUR matched places, YOUR budget pulse writing to
 * YOUR expenses rows. RLS keeps every user inside their own data.
 * Plan & Places is the main screen; budget is the pulse below it.
 * ──────────────────────────────────────────────────────────── */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { pickTop, isMatch, scorePlace, readPlan, VIBE_LABEL, TIER_LABEL, HOME_AREA, durLabel, CAT_ICON } from './match.js';

const cfg = window.TRIPOS_SUPABASE || {};
const $ = (id) => document.getElementById(id);

const gate = $('gate');
const home = $('home');
const logoutBtn = $('appLogout');

/* daily budget per tier, in k IDR */
const TIER_IDR = { back: 350, comf: 700, prem: 1500 };

/* "what you can still do" anchors, in k IDR */
const ANCHORS = [[300, 'beach club day'], [150, 'massage'], [35, 'warung meal']];

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const fmtK = (k) => (k >= 1000 ? (Math.round(k / 100) / 10) + 'M' : Math.round(k) + 'k');

/* ── rendering (pure — testable without a session) ── */

function renderBrief(trip) {
  if (!trip) {
    $('briefTitle').textContent = 'No brief yet.';
    $('briefLine').innerHTML = 'Answer three questions and TripOS personalizes everything — your picks, your budget, your plan.';
    $('briefEdit').textContent = '✈ do the check-in — 30 seconds';
    return;
  }
  const d = trip.duration_days;
  $('briefTitle').textContent = 'Your ' + (VIBE_LABEL[trip.vibe] || '') + ' ' +
    (d === 0 ? 'life' : durLabel(d)) + ' in Bali';
  $('briefLine').innerHTML = 'Base: <strong>' + esc(HOME_AREA[trip.vibe] || 'Bali') + '</strong> · ' +
    'daily budget <strong>' + fmtK(TIER_IDR[trip.budget_tier] || 700) + ' IDR</strong> (' +
    esc(TIER_LABEL[trip.budget_tier] || '') + ')';
}

function pickCard(p, matched) {
  const icon = CAT_ICON[p.category] || '📍';
  const maps = p.maps_query
    ? '<a class="place-maps" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' +
      encodeURIComponent(p.maps_query) + '">Maps ↗</a>'
    : '';
  let money = '';
  for (let m = 0; m < (p.price_level || 1); m++) money += '$';
  return (
    '<article class="place-card" style="--cc:var(--teal)">' +
      (matched ? '<span class="match-badge">✦ your match</span>' : '') +
      '<div class="place-top"><div>' +
        '<div class="place-name">' + esc(p.name) + (p.verified ? '<span class="place-verified">✓</span>' : '') + '</div>' +
        '<div class="poi-type">' + icon + ' ' + esc(p.area) + ' · <span class="price-sym">' + money + '</span></div>' +
      '</div></div>' +
      (p.why ? '<p class="place-why">' + esc(p.why) + '</p>' : '') +
      (p.tip ? '<p class="place-tip">' + esc(p.tip) + '</p>' : '') +
      '<div class="place-foot"><span class="place-price">' + esc(p.timing_note || '') + '</span>' + maps + '</div>' +
    '</article>'
  );
}

function renderPicks(places, trip) {
  let list, matched;
  if (trip) {
    const plan = { vibe: trip.vibe, dur: String(trip.duration_days), tier: trip.budget_tier };
    list = pickTop(places, plan, 6);
    matched = new Set(list.filter((p) => isMatch(scorePlace(p, plan))));
    $('picksSub').textContent = 'Matched to your brief from our curated intel.';
  } else {
    list = places.filter((p) => p.verified).slice(0, 6);
    matched = new Set();
    $('picksSub').textContent = 'Our most-loved curated spots — check in to personalize.';
  }
  $('pickGrid').innerHTML = list.map((p) => pickCard(p, matched.has(p))).join('');
}

function renderPulse(dailyK, spentK, rows) {
  const leftK = Math.max(0, dailyK - spentK);
  $('pulseSpent').textContent = fmtK(spentK);
  $('pulseBudget').textContent = fmtK(dailyK) + ' IDR';
  $('pulseLeft').textContent = fmtK(leftK) + ' IDR';
  const pct = Math.min(100, Math.round((spentK / dailyK) * 100));
  $('pulseFill').style.width = pct + '%';
  $('pulseFill').style.background = pct >= 100
    ? 'linear-gradient(90deg, rgba(255,107,107,0.5), var(--rd))'
    : '';
  if (spentK >= dailyK) {
    $('pulseNote').textContent = 'Over today’s line — tomorrow resets the runway.';
  } else {
    const bits = ANCHORS
      .map(([k, label]) => [Math.floor(leftK / k), label])
      .filter(([n]) => n >= 1)
      .slice(0, 2)
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
}

/* expose pure renderers for preview/debug verification */
window.__appDebug = { renderBrief, renderPicks, renderPulse, showHomeShell: () => { gate.hidden = true; home.hidden = false; } };

/* ── live wiring ── */

if (!cfg.url || cfg.url.indexOf('YOUR_') !== -1) {
  gate.hidden = false;
  $('gateStatus').textContent = 'Supabase is not configured.';
} else {
  const sb = createClient(cfg.url, cfg.anonKey);
  let user = null;
  let trip = null;
  let dailyK = 700;

  const startOfToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  };

  async function loadPulse() {
    const { data, error } = await sb
      .from('expenses')
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
      user_id: user.id,
      trip_id: trip && trip.id ? trip.id : null,
      amount_idr: Math.round(amtK * 1000),
      category: cat
    });
    $('logStatus').textContent = error ? '⚠ ' + error.message : '✓ logged';
    if (!error) {
      setTimeout(() => { $('logStatus').textContent = ''; }, 1600);
      loadPulse();
    }
  }

  async function showHome() {
    gate.hidden = true;
    home.hidden = false;
    logoutBtn.hidden = false;

    /* your brief — DB first, localStorage fallback (pre-login wizard run) */
    const { data: trips, error: tErr } = await sb
      .from('trips')
      .select('*')
      .eq('destination', 'bali')
      .order('created_at', { ascending: false })
      .limit(1);
    if (tErr) console.error('[TripOS] trip load failed:', tErr.message);
    trip = (trips && trips[0]) || null;
    if (!trip) {
      const local = readPlan();
      if (local) {
        const { data: up } = await sb.from('trips').upsert({
          user_id: user.id,
          destination: 'bali',
          vibe: local.vibe,
          duration_days: local.dur != null ? parseInt(local.dur, 10) : null,
          budget_tier: local.tier
        }, { onConflict: 'user_id,destination' }).select();
        trip = (up && up[0]) || {
          vibe: local.vibe,
          duration_days: local.dur != null ? parseInt(local.dur, 10) : 0,
          budget_tier: local.tier
        };
      }
    }
    dailyK = TIER_IDR[trip && trip.budget_tier] || 700;
    renderBrief(trip);

    /* your picks */
    const { data: places, error: pErr } = await sb
      .from('curated_places')
      .select('*')
      .eq('destination', 'bali');
    if (pErr) console.error('[TripOS] places load failed:', pErr.message);
    renderPicks(places || [], trip);

    /* your pulse */
    loadPulse();
  }

  $('gateForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('gateEmail').value.trim();
    if (!email) return;
    $('gateStatus').textContent = 'Sending…';
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href.split('#')[0] }
    });
    $('gateStatus').textContent = error
      ? '⚠ ' + error.message
      : '✓ Boarding link sent — check your inbox.';
  });

  logoutBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    await sb.auth.signOut();
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

  (async () => {
    const { data } = await sb.auth.getSession();
    user = data.session ? data.session.user : null;
    if (user) showHome();
    else gate.hidden = false;

    sb.auth.onAuthStateChange((_evt, session) => {
      const was = !!user;
      user = session ? session.user : null;
      if (user && !was) showHome();
    });
  })();
}
