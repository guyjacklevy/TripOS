/* ─── Prevoya · photo-match (ROUND 10, Guy's go 19 Nov) ───────────────
 * PURE matcher — no DOM, no network, node-testable. A photo finds its
 * place by its own position against the user's STAMPED places; time
 * breaks ties and rescues photos without location. Statuses:
 *   auto    — ≤250 m from a stamped place → attached, checked ON
 *   suggest — 250–600 m, or time-only match, or more photos than stamps:
 *             shown with its guess, checked OFF (the exception strip)
 *   replace — would replace an existing photo: checked OFF
 *   none    — nothing near → pick a place by hand or leave it out
 * All comparisons in NAIVE BALI MS (see exif-lite). */

const havKm = (la1, ln1, la2, ln2) => {
  const R = 6371, dLa = (la2 - la1) * Math.PI / 180, dLn = (ln2 - ln1) * Math.PI / 180;
  const a = Math.sin(dLa / 2) ** 2 +
    Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLn / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};
const mLabel = (km) => km < 1
  ? Math.max(10, Math.round(km * 1000 / 10) * 10) + ' m'
  : km.toFixed(1) + ' km';

export function buildMatches({ photos, places, checkins, stampCounts, hasPhoto }) {
  const ckBali = (c) => new Date(c.created_at).getTime() + 8 * 3600e3;
  const rows = photos.map((ph) => {
    let placeId = null, status = 'none', note = 'no location on this photo';
    if (typeof ph.lat === 'number' && typeof ph.lng === 'number') {
      let best = null, bd = Infinity;
      places.forEach((p) => {
        if (typeof p.lat !== 'number' || typeof p.lng !== 'number') return;
        const d = havKm(ph.lat, ph.lng, p.lat, p.lng);
        if (d < bd) { bd = d; best = p; }
      });
      if (best && bd <= 0.25) { placeId = String(best.id); status = 'auto'; note = mLabel(bd) + ' from your stamp'; }
      else if (best && bd <= 0.6) { placeId = String(best.id); status = 'suggest'; note = mLabel(bd) + ' away — this one?'; }
      else note = 'not near any of your stamps';
    }
    if (!placeId && ph.time) {
      const near = (checkins || []).filter((c) => c.place_id && Math.abs(ckBali(c) - ph.time) <= 3 * 3600e3);
      const pids = [...new Set(near.map((c) => String(c.place_id)))];
      if (pids.length === 1) { placeId = pids[0]; status = 'suggest'; note = 'taken around your check-in there'; }
    }
    if (placeId && status === 'auto' && ph.time) {
      const day = Math.floor(ph.time / 86400000);
      const same = (checkins || []).some((c) =>
        String(c.place_id) === placeId && Math.floor(ckBali(c) / 86400000) === day);
      if (same) note += ' · same day';
    }
    return { i: ph.i, placeId, status, note };
  });

  /* one photo per stamp: AUTO extras beyond a place's stamp count become
     asks (suggests are off by default already, so they don't count);
     a place that already wears a photo asks before being replaced */
  const autosSeen = new Map();
  rows.forEach((r) => {
    if (!r.placeId || r.status !== 'auto') return;
    const n = (autosSeen.get(r.placeId) || 0) + 1;
    autosSeen.set(r.placeId, n);
    const cap = (stampCounts && stampCounts.get(r.placeId)) || 1;
    if (n > cap) {
      r.status = 'suggest';
      r.note += ' · more photos than stamps here';
    } else if (hasPhoto && hasPhoto.has(r.placeId)) {
      r.status = 'replace';
      r.note += ' · replaces the current photo';
    }
  });
  return rows;
}
