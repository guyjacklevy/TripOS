/* ─── TripOS · plan → places matching engine ─────────────────
 * Pure scoring logic shared by the check-in wizard (real picks in
 * the generated plan) and the places browser (badge + float your
 * matches). One brain, two surfaces.
 *
 * Import { scorePlace, isMatch, readPlan } for pure logic, or call
 * initMatch() once per page to fetch places and expose
 * window.tripMatch for non-module scripts (the wizard).
 * ──────────────────────────────────────────────────────────── */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/* wizard answer → curated_places persona tag */
export const PERSONA = { nomad: 'nomad', surf: 'surfer', wellness: 'wellness', party: 'party' };

/* wizard answer → home-base region (matches area prefix) */
export const HOME_AREA = { nomad: 'Canggu', surf: 'Uluwatu', wellness: 'Ubud', party: 'Seminyak' };

/* budget tier → highest price_level that fits the brief */
export const TIER_CAP = { back: 2, comf: 3, prem: 4 };

export const VIBE_LABEL = { nomad: 'digital nomad', surf: 'surf', wellness: 'wellness', party: 'party' };
export const TIER_LABEL = { back: 'backpacker', comf: 'comfortable', prem: 'premium' };
export const durLabel = (d) =>
  d === 0 ? 'open-ended' : d === 14 ? '2 weeks' : d === 30 ? '1 month' : '3+ months';

export const CAT_ICON = {
  beach: '🏖', food: '🍽', nightlife: '🎉', work: '☕', wellness: '💆', explore: '🗺', gym: '🏋️'
};

/* the saved check-in answers, if any */
export function readPlan() {
  try {
    const p = JSON.parse(localStorage.getItem('tripos_plan') || 'null');
    return p && p.vibe && p.tier ? p : null;
  } catch (_) { return null; }
}

/* score one place against a plan. -1 = out of budget, ≥3 = a real match */
export function scorePlace(p, plan) {
  const persona = PERSONA[plan.vibe];
  const cap = TIER_CAP[plan.tier] || 4;
  const lvl = p.price_level || 1;
  if (plan.tier !== 'prem' && lvl > cap) return -1;
  let s = 0;
  if ((p.personas || []).indexOf(persona) !== -1) s += 3;
  if (persona && String(p.area || '').indexOf(HOME_AREA[plan.vibe]) === 0) s += 2;
  if (p.verified) s += 1;
  if (plan.tier === 'prem' && lvl >= 3) s += 1;
  if (plan.tier === 'back' && lvl === 1) s += 1;
  return s;
}

export const isMatch = (score) => score >= 3;

/* top-n picks with category diversity (a plan of three beach bars isn't a plan) */
export function pickTop(places, plan, n) {
  const scored = places
    .map((p) => ({ p, s: scorePlace(p, plan) }))
    .filter((x) => isMatch(x.s))
    .sort((a, b) => b.s - a.s || (a.p.name < b.p.name ? -1 : 1));
  const out = [];
  const usedCats = {};
  for (const x of scored) {
    if (out.length >= n) break;
    if (usedCats[x.p.category]) continue;
    usedCats[x.p.category] = true;
    out.push(x.p);
  }
  /* if diversity left slots empty, top up by raw score */
  for (const x of scored) {
    if (out.length >= n) break;
    if (out.indexOf(x.p) === -1) out.push(x.p);
  }
  return out;
}

/* fetch once + expose to non-module scripts (the wizard's inline JS) */
export function initMatch() {
  const cfg = window.TRIPOS_SUPABASE || {};
  if (!cfg.url || cfg.url.indexOf('YOUR_') !== -1) return;
  const sb = createClient(cfg.url, cfg.anonKey);
  const ready = sb
    .from('curated_places')
    .select('*')
    .eq('destination', 'bali')
    .then(({ data, error }) => {
      if (error) throw error;
      return data || [];
    });
  window.tripMatch = {
    ready,
    picks: (plan, n) => ready.then((list) => pickTop(list, plan, n)).catch(() => [])
  };
  /* classic scripts run before deferred modules — let them catch up */
  document.dispatchEvent(new CustomEvent('tripos:match-ready'));
  ready.then((list) => { window.tripMatch.count = list.length; }).catch((e) => {
    console.error('[TripOS] match engine load failed:', e.message || e);
  });
}
