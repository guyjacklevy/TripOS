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

/* wizard answer → curated_places persona tag (mix = no single persona) */
export const PERSONA = { nomad: 'nomad', surf: 'surfer', wellness: 'wellness', party: 'party', mix: null };

/* wizard answer → home-base region (matches area prefix) */
export const HOME_AREA = { nomad: 'Canggu', surf: 'Uluwatu', wellness: 'Ubud', party: 'Seminyak', mix: 'Canggu' };

/* budget tier → highest price_level that fits the brief */
export const TIER_CAP = { back: 2, comf: 3, prem: 4 };

export const VIBE_LABEL = { nomad: 'digital nomad', surf: 'surf', wellness: 'wellness', party: 'party', mix: 'mix of everything' };

/* branch answer → place tags it should pull toward (+2 on intersection) */
export const DETAIL_TAGS = {
  deep:       ['cowork', 'wifi', 'work-friendly', 'quiet'],
  half:       ['work-friendly', 'coffee'],
  barely:     ['beach-club', 'sunset', 'social'],
  first:      ['beginner'],
  improver:   ['surf'],
  charger:    ['barrels', 'reef', 'cliffs'],
  yoga:       ['yoga', 'breathwork'],
  healing:    ['sound-healing', 'ritual', 'sacred', 'wellness', 'community'],
  fitness:    ['gym', 'fitness'],
  beachclubs: ['beach-club', 'pools', 'djs'],
  clubs:      ['nightclub', 'late-night', 'djs', 'party'],
  bars:       ['beach-bar', 'social', 'live-music']
};

/* branch answer → tags that would be a WRONG recommendation (-2 on intersection):
   a first-waves surfer should never see reef barrels as pick 1 */
export const DETAIL_AVOID = {
  first:   ['barrels', 'reef', 'cliffs'],
  charger: ['beginner'],
  deep:    ['late-night', 'nightclub']
};

/* honeymoon / anniversary couples pull toward the romantic tier */
export const OCCASION_TAGS = ['date-night', 'fine-dining', 'beachfront'];

/* priorities multi-select → what counts as a hit (+1 each, capped at +2) */
export const PRIORITY_MATCH = {
  work:      { cats: ['work'], tags: ['work-friendly', 'cowork'] },
  food:      { cats: ['food'], tags: ['brunch', 'warung'] },
  nightlife: { cats: ['nightlife'], tags: ['party', 'djs'] },
  nature:    { cats: ['explore'], tags: ['nature', 'waterfall', 'jungle', 'ricefield', 'tide-pools'] },
  fitness:   { cats: ['gym'], tags: ['gym', 'fitness', 'surf'] },
  wellness:  { cats: ['wellness'], tags: ['yoga', 'wellness'] }
};
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

/* human labels for the branch answers (mirrors checkin.js, kept tiny) */
const DETAIL_WHY = {
  deep: 'deep-work ready', half: 'work-friendly', barely: 'off-duty energy',
  first: 'your level', improver: 'your level', charger: 'your level',
  yoga: 'your focus', healing: 'your focus', fitness: 'your focus',
  beachclubs: 'your scene', clubs: 'your scene', bars: 'your scene'
};

/* T5: score WITH receipts — every point traceable to a reason the user
 * can read. scorePlace stays the single source of truth via this. */
export function scoreBreakdown(p, plan) {
  const persona = PERSONA[plan.vibe];
  const cap = TIER_CAP[plan.tier] || 4;
  const lvl = p.price_level || 1;
  const tags = p.tags || [];
  const reasons = [];
  /* the best score THIS plan could give any place — makes % honest */
  let max = (plan.vibe === 'mix' ? 2 : 3) + 2 + 1 + 1 +
    (plan.vibe_detail ? 2 : 0) +
    (plan.priorities && plan.priorities.length ? Math.min(2, plan.priorities.length) : 0) +
    ((plan.party_detail === 'honeymoon' || plan.party_detail === 'anniversary') ? 2 : 0);
  if (plan.tier !== 'prem' && lvl > cap) return { score: -1, max, pct: 0, reasons };
  let s = 0;
  if (persona && (p.personas || []).indexOf(persona) !== -1) {
    s += 3; reasons.push((VIBE_LABEL[plan.vibe] || plan.vibe) + ' fit');
  }
  if (plan.vibe === 'mix' && (p.personas || []).length >= 2) { s += 2; reasons.push('crossover spot'); }
  if (HOME_AREA[plan.vibe] && String(p.area || '').indexOf(HOME_AREA[plan.vibe]) === 0) {
    s += 2; reasons.push(HOME_AREA[plan.vibe] + ' base');
  }
  if (p.verified) { s += 1; reasons.push('verified'); }
  if (plan.tier === 'prem' && lvl >= 3) { s += 1; reasons.push('premium tier'); }
  else if (plan.tier === 'back' && lvl === 1) { s += 1; reasons.push('backpacker price'); }
  else if (lvl <= cap) reasons.push('in budget');
  const detailTags = DETAIL_TAGS[plan.vibe_detail];
  if (detailTags && tags.some((t) => detailTags.indexOf(t) !== -1)) {
    s += 2; reasons.push(DETAIL_WHY[plan.vibe_detail] || 'your style');
  }
  const avoidTags = DETAIL_AVOID[plan.vibe_detail];
  if (avoidTags && tags.some((t) => avoidTags.indexOf(t) !== -1)) s -= 2;
  if ((plan.party_detail === 'honeymoon' || plan.party_detail === 'anniversary') &&
      tags.some((t) => OCCASION_TAGS.indexOf(t) !== -1)) {
    s += plan.party_detail === 'honeymoon' ? 2 : 1;
    reasons.push(plan.party_detail + ' pick');
  }
  if (plan.priorities && plan.priorities.length) {
    let hits = 0;
    for (const pr of plan.priorities) {
      const m = PRIORITY_MATCH[pr];
      if (!m) continue;
      if ((m.cats && m.cats.indexOf(p.category) !== -1) ||
          (m.tags && tags.some((t) => m.tags.indexOf(t) !== -1))) {
        hits++;
        if (hits <= 2) reasons.push(pr + ' priority');
      }
    }
    s += Math.min(2, hits);
  }
  return { score: s, max, pct: s <= 0 ? 0 : Math.min(100, Math.round((s / max) * 100)), reasons };
}

export function scorePlace(p, plan) {
  return scoreBreakdown(p, plan).score;
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

/* ─── time-aware layer: "what should I do right now?" (Today tab) ─── */

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* hour → the block names used by curated_places.best_time[] */
export function timeBlock(h) {
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 16) return 'afternoon';
  if (h >= 16 && h < 19) return 'sunset';
  if (h >= 19 && h < 22) return 'evening';
  return 'night';
}

const BLOCK_WORD = {
  morning: 'Morning window', afternoon: 'Midday window',
  sunset: 'Golden hour', evening: 'Tonight', night: 'Late one'
};

/* score for RIGHT NOW: brief fit + is this the place's moment? */
export function scoreNow(p, plan, date) {
  const base = scorePlace(p, plan);
  if (base < 0) return -1;
  let s = base;
  const block = timeBlock(date.getHours());
  const day = DAY_KEYS[date.getDay()];
  const bt = p.best_time || [];
  const bd = p.best_days || [];
  if (bt.indexOf(block) !== -1) s += 3;
  if (bd.length) {
    if (bd.indexOf(day) !== -1) s += 4;      /* Single Fin on a Sunday — the whole point */
    else s -= 3;                              /* day-specific place on the wrong day */
  }
  return s;
}

/* the honest one-liner: WHY this, right now (built from curated data only) */
export function whyNow(p, date) {
  const block = timeBlock(date.getHours());
  const day = DAY_KEYS[date.getDay()];
  const bd = p.best_days || [];
  const note = p.timing_note || '';
  if (bd.indexOf(day) !== -1) {
    return 'It’s ' + DAY_FULL[date.getDay()] + ' — ' + (note || 'this is its day.');
  }
  if ((p.best_time || []).indexOf(block) !== -1) {
    return BLOCK_WORD[block] + (note ? ' — ' + note : '.');
  }
  return note || null;
}

/* top-n for right now, category-diverse; returns [] if nothing time-fits */
export function pickNow(places, plan, date, n) {
  const scored = places
    .map((p) => ({ p, s: scoreNow(p, plan, date), base: scorePlace(p, plan), timeFit:
      (p.best_time || []).indexOf(timeBlock(date.getHours())) !== -1 ||
      (p.best_days || []).indexOf(DAY_KEYS[date.getDay()]) !== -1 }))
    /* must be a real brief match AND the right moment — timing alone never qualifies */
    .filter((x) => x.timeFit && isMatch(x.base))
    .sort((a, b) => b.s - a.s || (a.p.name < b.p.name ? -1 : 1));
  const out = [];
  const cats = {};
  for (const x of scored) {
    if (out.length >= n) break;
    if (cats[x.p.category]) continue;
    cats[x.p.category] = true;
    out.push(x.p);
  }
  return out;
}

/* coming up: tonight's evening block + tomorrow's day-specific spots */
export function pickUpcoming(places, plan, date, n, excludeSet) {
  const out = [];
  const seen = excludeSet || new Set();
  /* tonight (only if we're still before the evening) */
  if (date.getHours() < 19) {
    const tonight = new Date(date); tonight.setHours(20, 0, 0, 0);
    for (const p of pickNow(places, plan, tonight, n)) {
      if (!seen.has(p) && out.length < n) { out.push({ p, label: 'TONIGHT' }); seen.add(p); }
    }
  }
  /* tomorrow */
  const tom = new Date(date); tom.setDate(tom.getDate() + 1); tom.setHours(17, 0, 0, 0);
  const tomDay = DAY_KEYS[tom.getDay()];
  const dayPicks = places
    .map((p) => ({ p, s: scoreNow(p, plan, tom) }))
    .filter((x) => x.s >= 3 && (x.p.best_days || []).indexOf(tomDay) !== -1)
    .sort((a, b) => b.s - a.s);
  for (const x of dayPicks) {
    if (!seen.has(x.p) && out.length < n) { out.push({ p: x.p, label: 'TOMORROW' }); seen.add(x.p); }
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
