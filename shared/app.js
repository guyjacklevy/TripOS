/* ─── TripOS · the app (/app) — per-user home ─────────────────
 * The real product surface: boarding gate → YOUR boarding-pass
 * brief (from your trips row), YOUR matched places, YOUR budget
 * pulse writing to YOUR expenses rows. RLS keeps every user inside
 * their own data. Plan & Places is the main screen; budget is the
 * pulse below it. Full cosmic/flight treatment — this is the show.
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

/* category → orb + accent (matches the places browser) */
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

/* ── rendering (pure — testable without a session) ── */

function renderBrief(trip) {
  if (!trip || !trip.vibe) {
    $('briefLine').innerHTML = 'No brief yet — answer three questions and everything below personalizes.';
    $('briefGrid').innerHTML = '';
    $('briefEdit').textContent = '✈ do the check-in — 30 seconds';
    return;
  }
  const d = trip.duration_days;
  const dailyK = TIER_IDR[trip.budget_tier] || 700;
  $('briefLine').textContent = 'Denpasar, Bali · ' + (d === 0 ? 'open-ended' : durLabel(d)) + ' · ' +
    (HOME_AREA[trip.vibe] || 'Bali') + ' base';
  $('briefGrid').innerHTML =
    '<div><span>Class</span><strong>' + esc(VIBE_LABEL[trip.vibe] || '—') + '</strong></div>' +
    '<div><span>Duration</span><strong>' + esc(d === 0 ? 'Open-ended' : durLabel(d)) + '</strong></div>' +
    '<div><span>Budget / day</span><strong>' + fmtK(dailyK) + ' IDR</strong></div>' +
    '<div><span>Base</span><strong>' + esc(HOME_AREA[trip.vibe] || 'Bali') + '</strong></div>' +
    '<div><span>Tier</span><strong>' + esc(TIER_LABEL[trip.budget_tier] || '—') + '</strong></div>' +
    '<div><span>Seat</span><strong>Window</strong></div>';
  /* terrain follows your home base */
  const area = (HOME_AREA[trip.vibe] || '').split(' ')[0].toLowerCase();
  if (area) document.body.setAttribute('data-area', area);
}

function pickCard(p, matched) {
  const meta = CAT_META[p.category] || { orb: 'planet-teal', cc: 'var(--teal)' };
  const icon = CAT_ICON[p.category] || '📍';
  const maps = p.maps_query
    ? '<a class="place-maps" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' +
      encodeURIComponent(p.maps_query) + '">Maps ↗</a>'
    : '';
  let money = '';
  for (let m = 0; m < (p.price_level || 1); m++) money += '$';
  return (
    '<article class="place-card" style="--cc:' + meta.cc + '">' +
      (matched ? '<span class="match-badge">✦ your match</span>' : '') +
      '<div class="place-top">' +
        '<span class="orb ' + meta.orb + '"></span>' +
        '<div>' +
          '<div class="place-name">' + esc(p.name) + (p.verified ? '<span class="place-verified">✓</span>' : '') + '</div>' +
          '<div class="poi-type">' + icon + ' ' + esc(p.area) + ' · <span class="price-sym">' + money + '</span></div>' +
        '</div>' +
      '</div>' +
      (p.why ? '<p class="place-why">' + esc(p.why) + '</p>' : '') +
      (p.tip ? '<p class="place-tip">' + esc(p.tip) + '</p>' : '') +
      '<div class="place-foot"><span class="place-price">' + esc(p.timing_note || '') + '</span>' + maps + '</div>' +
    '</article>'
  );
}

function renderPicks(places, trip) {
  let list, matched;
  if (trip && trip.vibe) {
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
  /* staggered POI drop, same as the places browser */
  if (!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
    Array.from($('pickGrid').querySelectorAll('.place-card')).forEach((el, i) => {
      el.style.animationDelay = (i * 30) + 'ms';
      el.classList.add('poi-drop');
    });
  }
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

function showArrival(email) {
  $('arriveEmail').textContent = email || 'your account';
  $('arriveBanner').hidden = false;
}

/* expose pure renderers for preview/debug verification */
window.__appDebug = {
  renderBrief, renderPicks, renderPulse, showArrival,
  showHomeShell: () => { gate.hidden = true; home.hidden = false; }
};

/* ── live wiring ── */

$('arriveClose').addEventListener('click', () => { $('arriveBanner').hidden = true; });

if (!cfg.url || cfg.url.indexOf('YOUR_') !== -1) {
  gate.hidden = false;
  $('gateStatus').textContent = 'Supabase is not configured.';
} else {
  const sb = createClient(cfg.url, cfg.anonKey);
  let user = null;
  let trip = null;
  let dailyK = 700;
  let pendingEmail = '';

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

    /* your brief — the ACCOUNT is the source of truth */
    const { data: trips, error: tErr } = await sb
      .from('trips')
      .select('*')
      .eq('destination', 'bali')
      .order('created_at', { ascending: false })
      .limit(1);
    if (tErr) console.error('[TripOS] trip load failed:', tErr.message);
    trip = (trips && trips[0]) || null;
    if (trip && trip.vibe) {
      /* keep this browser's wizard in sync with the account */
      try {
        localStorage.setItem('tripos_plan', JSON.stringify({
          vibe: trip.vibe,
          dur: String(trip.duration_days == null ? 0 : trip.duration_days),
          tier: trip.budget_tier
        }));
      } catch (_) {}
    } else {
      /* fresh account — adopt this browser's brief if it has one */
      const local = readPlan();
      if (local) {
        const { data: up } = await sb.from('trips').upsert({
          user_id: user.id,
          destination: 'bali',
          vibe: local.vibe,
          duration_days: local.dur != null ? parseInt(local.dur, 10) : null,
          budget_tier: local.tier
        }, { onConflict: 'user_id,destination' }).select();
        trip = (up && up[0]) || null;
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
    pendingEmail = email;
    $('gateStatus').textContent = 'Sending…';
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + '/app/' }
    });
    if (error) {
      $('gateStatus').textContent = '⚠ ' + error.message;
    } else {
      $('gateStatus').textContent = '✓ Boarding link sent — check your inbox.';
      $('gateCode').hidden = false;
      setTimeout(() => $('codeInput').focus(), 40);
    }
  });

  /* same-device fallback: type the code instead of tapping the link —
     also rescues logins where the email opens in a different browser */
  $('codeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = $('codeInput').value.trim();
    if (!token || !pendingEmail) return;
    $('gateStatus').textContent = 'Boarding…';
    const { error } = await sb.auth.verifyOtp({ email: pendingEmail, token, type: 'email' });
    if (error) $('gateStatus').textContent = '⚠ ' + error.message;
    /* success → onAuthStateChange('SIGNED_IN') takes it from here */
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

    sb.auth.onAuthStateChange((evt, session) => {
      const hadUser = !!user;
      user = session ? session.user : null;
      if (user && !hadUser && evt === 'SIGNED_IN') {
        showArrival(user.email);
        showHome();
      }
    });
  })();
}
