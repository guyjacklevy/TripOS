/* ─── Prevoya · public route page (FIRST_OPEN_SPEC §D) ───────────────
 * Renders EXCLUSIVELY what shared-trip?kind=route sends: areas, nights,
 * summary, vibe word, month word, verified count. No dates, no money,
 * no coordinates — this file has no slot for them (defense by anatomy).
 * Anonymous, token-gated. Provenance seeds exactly like the A3 page. */

const cfg = window.TRIPOS_SUPABASE || {};
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (id) => document.getElementById(id);

const AREA_XY = {
  Canggu: [96, 150], Seminyak: [104, 168], Denpasar: [130, 172], Sanur: [150, 166],
  Ubud: [138, 118], Uluwatu: [118, 215], Islands: [222, 204]
};
const AREA_HEX = {
  Canggu: '#3dffd0', Ubud: '#4ade80', Seminyak: '#ffb454', Uluwatu: '#a78bfa',
  Islands: '#4cc9f0', Sanur: '#4cc9f0', Denpasar: '#ff6b6b'
};

(async function () {
  const token = new URLSearchParams(location.search).get('t') || '';
  const gone = () => { $('rtLoading').hidden = true; $('rtGone').hidden = false; };
  if (!cfg.url || !token) { gone(); return; }

  let data = null;
  try {
    const r = await fetch(cfg.url + '/functions/v1/shared-trip?t=' + encodeURIComponent(token));
    if (r.ok) data = await r.json();
  } catch (_) {}
  if (!data || data.error || data.kind !== 'route' || !(data.legs || []).length) { gone(); return; }

  const name = data.name || 'a traveler';
  const poss = name.toUpperCase() + (name.toUpperCase().slice(-1) === 'S' ? '’' : '’S');
  $('rtTitle').textContent = poss + ' ' + String(data.destination || 'BALI').toUpperCase() + ' ROUTE';
  const facts = [data.days + ' DAYS', data.legs.length + ' BASES'];
  if (data.vibe) facts.push(String(data.vibe).toUpperCase());
  if (data.month) facts.push(String(data.month).toUpperCase());
  $('rtFacts').textContent = facts.join(' · ');

  /* the island + the trace — same abstract grammar as the ceremony */
  const pts = data.legs.map((l) => AREA_XY[l.area] || [160, 150]);
  $('rtTrace').setAttribute('d', pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ',' + p[1]).join(' '));
  $('rtOrbs').innerHTML = data.legs.map((l, i) =>
    '<circle cx="' + pts[i][0] + '" cy="' + pts[i][1] + '" r="6" fill="' + (AREA_HEX[l.area] || '#3dffd0') + '"/>' +
    '<text x="' + (pts[i][0] + 10) + '" y="' + (pts[i][1] + 3) + '" fill="' + (AREA_HEX[l.area] || '#3dffd0') +
    '" font-size="9" style="font-family:ui-monospace,Menlo,monospace;letter-spacing:0.08em">' +
    esc(l.area.toUpperCase()) + '</text>').join('');

  $('rtLegs').innerHTML = data.legs.map((l) =>
    '<div class="cer-leg"><div class="cer-leg-row">' +
      '<span class="cer-leg-orb" style="background:' + (AREA_HEX[l.area] || '#3dffd0') + '"></span>' +
      '<span class="cer-leg-name">' + esc(l.area.toUpperCase()) + '</span>' +
      '<span class="cer-leg-n">' + l.nights + ' NIGHTS</span>' +
    '</div></div>').join('');

  if (data.summary) { $('rtSummary').textContent = '“' + data.summary + '”'; $('rtSummary').hidden = false; }
  if (data.counts && data.counts.verified) {
    $('rtCounts').textContent = 'built from ' + data.counts.verified + ' verified places · 0 tabs';
  }

  /* provenance travels with the visitor (S4) — same seed the A3 page plants */
  const seedVia = () => {
    try {
      localStorage.setItem('tripos_via', JSON.stringify({
        via: name, place: null, token: token, at: Date.now(), month: null, places: null
      }));
    } catch (_) {}
  };
  $('rtCta').addEventListener('click', seedVia);

  $('rtLoading').hidden = true;
  $('rtBody').hidden = false;
})();
