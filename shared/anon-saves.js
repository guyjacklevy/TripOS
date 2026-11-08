/* ─── Prevoya · anonymous save buffer (SAVE-FIRST pivot, Nov 2026) ─────
 * A visitor can ⚑ before they have an account. Saves buffer in THIS
 * browser (localStorage) and claim themselves into the `places` table on
 * the first signed-in open — the same handoff pattern as tripos_plan.
 * The buffer holds only curated identities (id + name + area + category),
 * never free text: an anonymous ⚑ can only point at a place we already
 * vouch for. Server-side writes stay behind auth; RLS untouched. */
const KEY = 'prevoya_saves_anon';

export function anonList() {
  try {
    const l = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(l) ? l : [];
  } catch (_) { return []; }
}

function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 200))); } catch (_) {}
}

/* a live Map in the shape places-browser expects (id → save-time ms) */
export function anonMap() {
  const m = new Map();
  anonList().forEach((s) => { if (s && s.id != null) m.set(String(s.id), s.ts || 0); });
  return m;
}

export function anonToggle(p) {
  if (!p || p.id == null) return false;
  const list = anonList();
  const id = String(p.id);
  const i = list.findIndex((s) => String(s.id) === id);
  if (i !== -1) { list.splice(i, 1); write(list); return false; }
  list.push({ id, name: p.name, area: p.area, category: p.category || null, ts: Date.now() });
  write(list);
  return true;
}

export function anonCount() { return anonList().length; }
export function anonClear() { try { localStorage.removeItem(KEY); } catch (_) {} }
