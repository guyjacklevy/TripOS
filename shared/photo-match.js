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

/* ─── ROUND 14c (Guy's go, 22 Nov) · IMPORT-FIRST — photos FIND places ──
 * A zero-stamp traveler has nothing to match against: GPS leads instead.
 * Photos cluster by where they were taken; a cluster matches the atlas
 * first (free), and an uncovered spot earns ONE live lookup (the caller
 * owns the cap). Pure — no DOM, no network, node-testable. */

/* greedy centroid clustering — photos within radiusKm share one cluster */
export function clusterPhotos(photos, opt) {
  const radius = (opt && opt.radiusKm) || 0.15;
  const clusters = [];
  const loose = [];
  photos.forEach((p) => {
    if (typeof p.lat !== 'number' || typeof p.lng !== 'number') { loose.push(p); return; }
    let best = null, bd = Infinity;
    clusters.forEach((c) => {
      const d = havKm(c.lat, c.lng, p.lat, p.lng);
      if (d < bd) { bd = d; best = c; }
    });
    if (best && bd <= radius) {
      best.photos.push(p);
      best.lat = best.photos.reduce((s, x) => s + x.lat, 0) / best.photos.length;
      best.lng = best.photos.reduce((s, x) => s + x.lng, 0) / best.photos.length;
    } else {
      clusters.push({ lat: p.lat, lng: p.lng, photos: [p] });
    }
  });
  clusters.sort((a, b) => b.photos.length - a.photos.length);
  return { clusters, loose };
}

/* each cluster against the atlas: ≤autoKm → matched; else it needs a lookup */
export function matchClustersToPlaces(clusters, places, opt) {
  const autoKm = (opt && opt.autoKm) || 0.25;
  return clusters.map((c) => {
    let best = null, bd = Infinity;
    places.forEach((p) => {
      if (typeof p.lat !== 'number' || typeof p.lng !== 'number') return;
      const d = havKm(c.lat, c.lng, p.lat, p.lng);
      if (d < bd) { bd = d; best = p; }
    });
    if (best && bd <= autoKm) {
      return { cluster: c, place: best, km: bd, status: 'atlas', note: mLabel(bd) + ' from ' + best.name };
    }
    return { cluster: c, place: null, km: null, status: 'lookup', note: 'not in the atlas yet' };
  });
}
