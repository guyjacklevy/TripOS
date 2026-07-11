/* ─── TripOS · auth + personal data (Supabase) ───────────────
 * Progressive enhancement: if supabase-config.js still has
 * placeholders, this whole module quietly no-ops and every link
 * keeps working. Once real keys are in, it adds magic-link login
 * and saves each visitor's check-in plan to their own account.
 *
 * Loaded as an ES module. Supabase JS comes from the esm.sh CDN
 * (fine on Vercel — the "no CDN" rule only applies inside GAS).
 * ──────────────────────────────────────────────────────────── */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cfg = window.TRIPOS_SUPABASE || {};
const CONFIGURED =
  !!cfg.url && !!cfg.anonKey &&
  cfg.url.indexOf('YOUR_') === -1 &&
  cfg.anonKey.indexOf('YOUR_') === -1;

const APP_URL = '/app/';

window.tripAuth = { ready: CONFIGURED };

if (!CONFIGURED) {
  // No-auth mode — leave the site fully functional, just not personal yet.
  console.info('[TripOS] Supabase not configured yet — running in no-auth mode.');
} else {
  const sb = createClient(cfg.url, cfg.anonKey);
  let user = null;

  /* ── modal (injected once, shared by every page) ── */
  const modal = document.createElement('div');
  modal.className = 'auth-modal';
  modal.hidden = true;
  modal.innerHTML =
    '<div class="auth-card" role="dialog" aria-modal="true" aria-label="Sign in to TripOS">' +
      '<button class="auth-x" type="button" aria-label="Close">✕</button>' +
      '<div class="orb planet-teal auth-orb"></div>' +
      '<h3 class="auth-title">Unlock your Bali plan</h3>' +
      '<p class="auth-sub">Enter your email — we\'ll send a one-tap magic link. No password, ever.</p>' +
      '<form class="auth-form">' +
        '<input class="auth-input" type="email" required placeholder="you@email.com" autocomplete="email">' +
        '<button class="btn btn-primary auth-send" type="submit">Send magic link</button>' +
      '</form>' +
      '<p class="auth-status" role="status"></p>' +
    '</div>';
  document.body.appendChild(modal);

  const statusEl = modal.querySelector('.auth-status');
  const inputEl = modal.querySelector('.auth-input');

  const openModal = () => { modal.hidden = false; setTimeout(() => inputEl.focus(), 40); };
  const closeModal = () => { modal.hidden = true; statusEl.textContent = ''; };

  modal.querySelector('.auth-x').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  modal.querySelector('.auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = inputEl.value.trim();
    if (!email) return;
    statusEl.textContent = 'Sending…';
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href.split('#')[0] }
    });
    statusEl.textContent = error
      ? '⚠ ' + error.message
      : '✓ Check your inbox — tap the link to unlock your plan.';
  });

  /* ── save the wizard's plan to the user's account ──
   * Upsert (not insert) keyed on (user_id, destination): fires safely
   * on every auth event and re-runs when the visitor edits answers,
   * always updating the single row instead of piling up duplicates. */
  let savingPlan = false;
  async function savePlan() {
    if (savingPlan || !user) return;
    let plan;
    try { plan = JSON.parse(localStorage.getItem('tripos_plan') || 'null'); } catch (_) { plan = null; }
    if (!plan) return;
    savingPlan = true;
    try {
      const { error } = await sb.from('trips').upsert({
        user_id: user.id,
        destination: 'bali',
        vibe: plan.vibe || null,
        duration_days: plan.dur != null ? parseInt(plan.dur, 10) : null,
        budget_tier: plan.tier || null
      }, { onConflict: 'user_id,destination' });
      if (error) console.error('[TripOS] Could not save plan:', error.message);
    } finally {
      savingPlan = false;
    }
  }

  /* ── nav pill reflects login state ── */
  function paintNav() {
    let slot = document.querySelector('[data-auth-slot]');
    if (!slot) {
      const nav = document.querySelector('.nav');
      if (!nav) return;
      slot = document.createElement('a');
      slot.setAttribute('data-auth-slot', '');
      slot.className = 'nav-auth';
      slot.href = '#';
      nav.insertBefore(slot, nav.querySelector('.nav-cta'));
    }
    if (user) {
      slot.textContent = 'Log out';
      slot.title = user.email || '';
      slot.onclick = async (e) => { e.preventDefault(); await sb.auth.signOut(); location.reload(); };
    } else {
      slot.textContent = 'Log in';
      slot.onclick = (e) => { e.preventDefault(); openModal(); };
    }
  }

  /* ── mark the unlock card as unlocked once signed in ── */
  function reflectUnlocked() {
    if (!user) return;
    const list = document.getElementById('planList');
    const lock = document.querySelector('.plan-lock');
    if (list) list.classList.remove('locked');
    if (lock) lock.hidden = true;
    document.querySelectorAll('[data-auth-gate]').forEach((g) => {
      g.textContent = 'Open your TripOS →';
    });
  }

  /* ── gate clicks: unlock buttons + login links ── */
  document.addEventListener('click', (e) => {
    const gate = e.target.closest('[data-auth-gate]');
    if (gate) {
      if (user) return; // already in — let the link through to the app
      e.preventDefault();
      openModal();
      return;
    }
    const opener = e.target.closest('[data-auth-open]');
    if (opener) { e.preventDefault(); openModal(); }
  });

  /* ── boot: pick up any magic-link session, then paint everything ── */
  (async () => {
    const { data } = await sb.auth.getSession();
    user = data.session ? data.session.user : null;
    if (user) { await savePlan(); }
    paintNav();
    reflectUnlocked();

    sb.auth.onAuthStateChange((_evt, session) => {
      user = session ? session.user : null;
      if (user) savePlan();
      paintNav();
      reflectUnlocked();
    });
  })();

  window.tripAuth = { ready: true, open: openModal, client: sb, savePlan: savePlan };
}
