/* ─── Prevoya · the save catcher (/app/save) — SAVE-FIRST pivot ─────────
 * One page that accepts anything a traveler throws at it: a typed name, a
 * pasted Google Maps link, shared text from another app (Android Web Share
 * Target and the iOS Shortcut both land here with ?url/?text/?title).
 *
 * Resolution order (never-fake):
 *   1. OUR curated pool first — a match here saves with full context.
 *   2. Signed in + no curated match → the live Google door (places-search
 *      edge fn: search → add), same machinery as the stamp sheet.
 *   3. Anonymous + no curated match → honest message + sign-in door; the
 *      buffer only ever holds places we already vouch for.
 * Anonymous curated saves buffer in localStorage and claim themselves on
 * the first signed-in open (shared/anon-saves.js). */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { anonMap, anonToggle, anonCount } from './anon-saves.js';

const cfg = window.TRIPOS_SUPABASE || {};
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (id) => document.getElementById(id);
const track = (n, p) => { try { window.pvTrack && window.pvTrack(n, p || {}); } catch (_) {} };

/* ── pull a usable search seed out of whatever arrived ── */
const GOOGLE_LINK = /^https:\/\/(maps\.app\.goo\.gl|goo\.gl|g\.co|maps\.google\.com|www\.google\.com|google\.com)\//i;
function seedFrom(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  /* a full Google Maps place URL carries the name in the path */
  const m = s.match(/maps[^ ]*\/place\/([^/?]+)/i);
  if (m) {
    try { return decodeURIComponent(m[1]).replace(/\+/g, ' ').trim(); } catch (_) { /* fall through */ }
  }
  /* a bare URL with no readable name (short links, reels) → nothing to
     guess from here; google short links get a second chance server-side */
  if (/^https?:\/\/\S+$/i.test(s)) return '';
  /* shared text: first line, trimmed of emoji noise, capped. If the text
     wraps a google link ("Check out X! https://maps.app.goo.gl/…"), prefer
     the human part before the link. */
  const beforeLink = s.replace(/https?:\/\/\S+/g, ' ');
  return beforeLink.split('\n')[0].replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/^check out\s*/i, '').trim().replace(/[!.,:;·]+$/g, '').trim().slice(0, 80);
}
/* google short links (maps.app.goo.gl & friends) carry no name — a tiny
   allowlisted edge fn follows the redirect and reads the name server-side */
function googleLinkIn(raw) {
  const m = String(raw || '').match(/https:\/\/\S+/);
  return m && GOOGLE_LINK.test(m[0]) ? m[0] : null;
}

(async function () {
  if (!cfg.url || cfg.url.indexOf('YOUR_') !== -1) {
    $('svStatus').textContent = 'Not configured.';
    return;
  }
  const sb = createClient(cfg.url, cfg.anonKey);
  const { data: sess } = await sb.auth.getSession().catch(() => ({ data: null }));
  const user = sess && sess.session ? sess.session.user : null;

  /* the signed-in user's existing saves (so ⚑ reads true) */
  let SAVES = anonMap();
  let SAVE_ROWS = new Map();
  if (user) {
    const { data: rows } = await sb.from('places')
      .select('id, curated_place_id').eq('user_id', user.id).not('curated_place_id', 'is', null);
    SAVES = new Map((rows || []).map((r) => [String(r.curated_place_id), 1]));
    SAVE_ROWS = new Map((rows || []).map((r) => [String(r.curated_place_id), r.id]));
  }

  const paintBar = () => {
    const bar = $('saveBar');
    if (!bar) return;
    const n = user ? SAVES.size : anonCount();
    bar.hidden = n === 0;
    bar.innerHTML = '<span class="sb-count">⚑ your list · ' + n + ' place' + (n === 1 ? '' : 's') + '</span>' +
      (user
        ? '<a class="btn btn-primary sb-keep" href="/app/#places">open my places →</a>'
        : '<a class="btn btn-primary sb-keep" href="/app/">keep it — free account →</a>');
  };
  paintBar();

  async function toggleSave(p) {
    const id = String(p.id);
    if (!user) { anonToggle(p); SAVES = anonMap(); track('anon_save', { via: 'catcher' }); return true; }
    if (SAVES.has(id)) {
      const rowId = SAVE_ROWS.get(id);
      if (!rowId) return false;
      const { error } = await sb.from('places').delete().eq('id', rowId);
      if (error) return false;
      SAVES.delete(id); SAVE_ROWS.delete(id);
      return true;
    }
    const { data: row, error } = await sb.from('places').insert({
      user_id: user.id, curated_place_id: p.id,
      name: p.name, area: p.area, category: p.category, curated: true
    }).select('id').single();
    if (error) return false;
    SAVES.set(id, Date.now()); SAVE_ROWS.set(id, row.id);
    track('place_saved', { via: 'catcher' });
    return true;
  }

  const rowHtml = (p, sub) => {
    const on = SAVES.has(String(p.id));
    return '<div class="sv-row">' +
      '<div class="sv-row-main"><strong>' + esc(p.name) + '</strong>' +
      (p.verified ? '<span class="place-verified">✓</span>' : '') +
      '<span class="sv-row-sub">' + esc(sub || [String(p.area || '').split('/')[0].trim(), p.category].filter(Boolean).join(' · ')) + '</span></div>' +
      '<button type="button" class="gps-save sv-flag' + (on ? ' on' : '') + '" data-id="' + esc(p.id) + '" aria-label="save">' +
      '<svg width="16" height="16" aria-hidden="true"><use href="#icon-' + (on ? 'saved' : 'save') + '"/></svg></button></div>';
  };

  let lastCurated = [];
  let lastGoogle = [];

  async function run(query) {
    const q = String(query || '').trim();
    if (!q) return;
    $('svStatus').textContent = 'looking…';
    $('svResults').innerHTML = '';
    /* 1 · our pool first — context beats a raw pin */
    const { data: hits } = await sb.from('curated_places')
      .select('id, name, area, category, verified, why')
      .eq('destination', 'bali').ilike('name', '%' + q.replace(/[%_]/g, '') + '%').limit(6);
    lastCurated = hits || [];
    let html = lastCurated.map((p) => rowHtml(p)).join('');
    /* 2 · the live door */
    if (user) {
      if (lastCurated.length < 3) {
        const { data: g } = await sb.functions.invoke('places-search', { body: { action: 'search', query: q } })
          .catch(() => ({ data: null }));
        lastGoogle = ((g && g.candidates) || []).filter((c) =>
          !lastCurated.some((p) => p.name.toLowerCase() === String(c.name).toLowerCase())).slice(0, 4);
        html += lastGoogle.map((c, i) =>
          '<div class="sv-row"><div class="sv-row-main"><strong>' + esc(c.name) + '</strong>' +
          '<span class="sv-row-sub">' + esc(c.area || 'found live') + ' · not in the atlas yet</span></div>' +
          '<button type="button" class="gps-save sv-gadd" data-g="' + i + '" aria-label="add and save">' +
          '<svg width="16" height="16" aria-hidden="true"><use href="#icon-save"/></svg></button></div>').join('');
      }
    } else if (!lastCurated.length) {
      html += '<p class="pulse-note">not in our atlas yet — <a href="/app/" style="color:var(--teal)">sign in</a> and I’ll fetch it live, with real coordinates.</p>';
    }
    $('svStatus').textContent = html ? '' : 'nothing matched — try fewer words.';
    $('svResults').innerHTML = html;
  }

  $('svResults').addEventListener('click', async (e) => {
    const f = e.target.closest('.sv-flag');
    if (f) {
      const p = lastCurated.find((x) => String(x.id) === f.getAttribute('data-id'));
      if (!p) return;
      const ok = await toggleSave(p);
      if (!ok) return;
      const on = user ? SAVES.has(String(p.id)) : anonMap().has(String(p.id));
      f.classList.toggle('on', on);
      f.querySelector('use').setAttribute('href', '#icon-' + (on ? 'saved' : 'save'));
      paintBar();
      return;
    }
    const g = e.target.closest('.sv-gadd');
    if (g && user) {
      g.disabled = true;
      const cand = lastGoogle[+g.getAttribute('data-g')];
      const { data } = await sb.functions.invoke('places-search', { body: { action: 'add', place_id: cand.google_place_id } })
        .catch(() => ({ data: null }));
      const p = data && data.place;
      if (!p) { g.disabled = false; $('svStatus').textContent = 'couldn’t add that one — try again.'; return; }
      const ok = await toggleSave(p);
      if (ok) {
        g.classList.add('on');
        g.querySelector('use').setAttribute('href', '#icon-saved');
        paintBar();
      } else g.disabled = false;
    }
  });

  $('svForm').addEventListener('submit', (e) => { e.preventDefault(); run($('svInput').value); });

  /* share_target / shortcut / deep-link arrivals */
  const qs = new URLSearchParams(location.search);
  const incoming = qs.get('q') || qs.get('url') || qs.get('text') || qs.get('title') || '';
  if (incoming) {
    track('save_catcher_arrival', { shared: true });
    const seed = seedFrom(incoming);
    if (seed) { $('svInput').value = seed; run(seed); }
    else {
      const glink = googleLinkIn(incoming);
      if (glink) {
        $('svStatus').textContent = 'reading the link…';
        const { data } = await sb.functions.invoke('expand-link', { body: { url: glink } })
          .catch(() => ({ data: null }));
        if (data && data.name) { $('svInput').value = data.name; run(data.name); }
        else {
          $('svInput').value = '';
          $('svStatus').textContent = 'that link doesn’t carry the place name — type it and I’ll find it.';
        }
      } else {
        $('svInput').value = '';
        $('svStatus').textContent = 'that link doesn’t carry the place name — type it and I’ll find it.';
      }
    }
  }
})();
