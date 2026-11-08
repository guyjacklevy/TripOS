/* ─── Prevoya · public places page adapter (/bali/places) ─────
 * Thin mount: fetches curated_places, reads the browser's saved
 * brief, and hands everything to the shared spatial browser core
 * (shared/places-browser.js) — the same core the app's Places tab
 * uses. No check-in handler here: that's a signed-in app feature.
 * ──────────────────────────────────────────────────────────── */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { readPlan } from './match.js';
import { mountPlaces } from './places-browser.js';
import { anonMap, anonToggle, anonCount } from './anon-saves.js';

const cfg = window.TRIPOS_SUPABASE || {};
const statusEl = document.getElementById('placesStatus');

(async function () {
  if (!cfg.url || cfg.url.indexOf('YOUR_') !== -1) {
    statusEl.textContent = 'Places load once Supabase is connected.';
    return;
  }
  try {
    const sb = createClient(cfg.url, cfg.anonKey);
    const { data, error } = await sb
      .from('curated_places')
      .select('*')
      .eq('destination', 'bali')
      .order('area', { ascending: true })
      .order('category', { ascending: true });
    if (error) throw error;
    if (!data || !data.length) {
      statusEl.textContent = 'No places yet — check back soon.';
      return;
    }
    /* SAVE-FIRST pivot (Nov 2026): the public shelf saves without an
       account — the ⚑ buffers in this browser and claims itself into the
       account on first signed-in open. The bar below keeps the count and
       the door visible. */
    const saves = anonMap();
    const bar = document.getElementById('saveBar');
    const paintBar = () => {
      if (!bar) return;
      const n = anonCount();
      bar.hidden = n === 0;
      bar.innerHTML = '<span class="sb-count">⚑ your list · ' + n + ' place' + (n === 1 ? '' : 's') + '</span>' +
        '<a class="btn btn-primary sb-keep" href="/app/">keep it — free account →</a>';
    };
    paintBar();
    mountPlaces({
      els: {
        alt: document.getElementById('altValue'),
        coordArea: document.getElementById('coordArea'),
        areaBar: document.getElementById('placeAreas'),
        catBar: document.getElementById('placeFilters'),
        status: statusEl,
        grid: document.getElementById('placesGrid'),
        bannerHost: document.getElementById('placeAreas'),
        search: document.getElementById('placeSearch')
      },
      places: data,
      plan: readPlan(),
      saves,
      onSave: (p) => { anonToggle(p); paintBar(); return true; }
    });
  } catch (err) {
    console.error('[Prevoya] places load failed:', err.message || err);
    statusEl.textContent = 'Could not load places right now.';
  }
})();
