/* ─── Prevoya · exif-lite (ROUND 10, Guy's go 19 Nov) ─────────────────
 * Reads ONLY what the photo-import matcher needs — GPS position and the
 * taken-at time — from a JPEG's EXIF block, ON DEVICE. Nothing here ever
 * leaves the phone: the matcher runs locally and uploads stay re-encoded
 * through memShrink, which strips all metadata (the standing privacy rule).
 * No dependencies, bounds-checked, fails to nulls — never throws out.
 *
 * Returned time is NAIVE BALI MS: EXIF DateTimeOriginal is the camera's
 * local wall clock (Bali during the trip) read as if UTC; check-in times
 * are compared in the same space via created_at + 8h. */

function parseTiff(u8, start, len) {
  const out = { lat: null, lng: null, time: null };
  const dv = new DataView(u8.buffer, u8.byteOffset + start, Math.min(len, u8.length - start));
  const little = dv.getUint16(0, false) === 0x4949;
  const g16 = (p) => dv.getUint16(p, little);
  const g32 = (p) => dv.getUint32(p, little);
  if (g16(2) !== 42) return out;

  const entry = (ifd, i) => ifd + 2 + i * 12;
  /* where a tag's payload lives: inline when ≤4 bytes, else at the stored offset */
  const loc = (e, bytes) => (bytes <= 4 ? e + 8 : g32(e + 8));
  const rat = (p) => { const d = g32(p + 4); return d ? g32(p) / d : 0; };
  const ascii = (p, n) => {
    let s = '';
    for (let k = 0; k < n; k++) { const c = dv.getUint8(p + k); if (!c) break; s += String.fromCharCode(c); }
    return s;
  };
  const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  const walk = (ifd, fn) => {
    const n = g16(ifd);
    for (let i = 0; i < n; i++) {
      const e = entry(ifd, i);
      const tag = g16(e), type = g16(e + 2), cnt = g32(e + 4);
      const bytes = (TYPE_SIZE[type] || 1) * cnt;
      fn(tag, type, cnt, loc(e, bytes), e);
    }
  };

  let gpsOff = 0, exifOff = 0;
  walk(g32(4), (tag, _t, _c, p, e) => {
    if (tag === 0x8825) gpsOff = g32(e + 8);
    if (tag === 0x8769) exifOff = g32(e + 8);
  });

  if (gpsOff) {
    let latRef = 'N', lngRef = 'E', latP = 0, lngP = 0;
    walk(gpsOff, (tag, _t, cnt, p) => {
      if (tag === 1) latRef = ascii(p, cnt) || 'N';
      if (tag === 2) latP = p;
      if (tag === 3) lngRef = ascii(p, cnt) || 'E';
      if (tag === 4) lngP = p;
    });
    if (latP && lngP) {
      const dms = (p) => rat(p) + rat(p + 8) / 60 + rat(p + 16) / 3600;
      const la = dms(latP), ln = dms(lngP);
      if (la || ln) {
        out.lat = latRef === 'S' ? -la : la;
        out.lng = lngRef === 'W' ? -ln : ln;
      }
    }
  }

  if (exifOff) {
    walk(exifOff, (tag, _t, cnt, p) => {
      if (tag !== 0x9003 || out.time != null) return; /* DateTimeOriginal */
      const s = ascii(p, cnt); /* "YYYY:MM:DD HH:MM:SS" */
      const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(s);
      if (m) out.time = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    });
  }
  return out;
}

export function parseExif(u8) {
  try {
    if (u8.length < 4 || u8[0] !== 0xff || u8[1] !== 0xd8) return { lat: null, lng: null, time: null };
    let o = 2;
    while (o + 4 <= u8.length) {
      if (u8[o] !== 0xff) break;
      const marker = u8[o + 1];
      const size = (u8[o + 2] << 8) | u8[o + 3];
      if (marker === 0xe1 && size >= 10 &&
          u8[o + 4] === 0x45 && u8[o + 5] === 0x78 && u8[o + 6] === 0x69 && u8[o + 7] === 0x66) {
        return parseTiff(u8, o + 10, size - 8); /* past "Exif\0\0" */
      }
      if (marker === 0xda) break; /* image data — no EXIF ahead */
      o += 2 + size;
    }
  } catch (_) {}
  return { lat: null, lng: null, time: null };
}

/* file → { lat, lng, time, file } · time falls back to the file's own
   modified stamp (iOS hands the asset's capture date there) shifted to
   the same naive-Bali space */
export async function exifMeta(file) {
  let meta = { lat: null, lng: null, time: null };
  try {
    const buf = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer());
    meta = parseExif(buf);
  } catch (_) {}
  if (meta.time == null && file.lastModified) meta.time = file.lastModified + 8 * 3600e3;
  return { lat: meta.lat, lng: meta.lng, time: meta.time, file };
}
