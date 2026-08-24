/* ─── Prevoya · the concierge front door (CHAT-FIRST Spike 1) ──────────
 * Per CHAT_FIRST_SURFACE_RULINGS R1–R6 + from_atlas_chat_first_ruling:
 * turn 0 is SCRIPTED client copy (never a model call) · chips come from the
 * questionnaire's QUESTIONS/BRANCH map keyed to the concierge's last ask and
 * ECHO as the user's own bubble · mic is capability-gated, never auto-sends ·
 * the route draft persists NOWHERE server-side — KEEP THIS PLAN writes the
 * tripos_plan hand-off and the existing corridor machinery does the rest
 * (silent claim → build terminal → 8-beat ceremony → doors, on first authed
 * entry — exactly R4's supersession). Never-fake: minis render only from
 * tool payloads; this file has no slot for an invented place.
 * ─────────────────────────────────────────────────────────────────── */
import { QUESTIONS, BRANCH, PARTY_BRANCH, PRIORITIES } from './checkin.js';

const cfg = window.TRIPOS_SUPABASE || {};
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const track = (n, p) => { try { window.pvTrack && window.pvTrack(n, p || {}); } catch (_) {} };
const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* the one island (ISLAND_PATH v2 + anchors — same constants as route.js) */
const ISLAND = 'M31,130 Q43,109 67,103 Q100,91 136,85 Q178,79 217,85 Q253,89.5 277,106 Q289,115 283,125.5 Q271,136 247,139 Q223,142 202,139 Q184,137.5 172,140.5 Q167.5,148 166,157 Q178,163 181,175 Q178,190 163,196 Q145,199 136,187 Q130,175 139,164.5 Q145,158.5 154,157 Q152.5,148 148,142 Q124,136 94,134.5 Q61,133 40,137.5 Q29.5,137.5 31,130 Z';
const AREA_XY = {
  Canggu: [100, 128], Seminyak: [127, 144], Denpasar: [153, 131], Sanur: [172, 145],
  Ubud: [142, 105], Uluwatu: [156, 180], Islands: [229, 175]
};
const AREA_HEX = {
  Canggu: '#3dffd0', Ubud: '#4ade80', Seminyak: '#ffb454', Uluwatu: '#a78bfa',
  Islands: '#4cc9f0', Sanur: '#4cc9f0', Denpasar: '#ff6b6b'
};

/* sid is per browser SESSION on purpose — a sticky device id burned one
   shared daily budget across visits (Guy's "stuck chat", 2026-08-24). The
   per-IP daily cap still guards abuse. */
const newSid = () => {
  const a = new Uint8Array(12); crypto.getRandomValues(a);
  return Array.from(a, (b) => (b % 36).toString(36)).join('');
};
const sid = (() => {
  try {
    let s = sessionStorage.getItem('tripos_cx_sid');
    if (!s) { s = newSid(); sessionStorage.setItem('tripos_cx_sid', s); }
    return s;
  } catch (_) { return 'anon-' + Math.random().toString(36).slice(2, 14); }
})();

/* chip sets: the branching pre-knowledge, keyed to the last ask (R2 — static
   data, no model in the loop; cap 4 visible, the long tail belongs to text) */
function chipsFor(ask, brief) {
  const strip = (label) => label.replace(/^[^A-Za-z0-9]+\s*/, '').trim();
  const fromOpts = (opts) => (opts || []).slice(0, 4).map(([, label]) => ({ show: label, say: strip(label) }));
  if (ask === 'party') return fromOpts(QUESTIONS.party.opts);
  if (ask === 'vibe') return fromOpts(QUESTIONS.vibe.opts);
  if (ask === 'branch') {
    const def = BRANCH[brief.vibe] || PARTY_BRANCH[brief.party];
    return def ? fromOpts(def.opts) : [];
  }
  if (ask === 'dur') return fromOpts(QUESTIONS.dur.opts);
  if (ask === 'tier') return fromOpts(QUESTIONS.tier.opts);
  if (ask === 'arrive') return [{ show: '🌴 I’m already here', say: 'I’m already here' }, { show: '🗓 Flexible dates', say: 'flexible dates' }];
  if (ask === 'priorities') return PRIORITIES.slice(0, 4).map(([, label]) => ({ show: label, say: strip(label) }));
  if (ask === 'musts') return [{ show: '✨ nothing set — surprise me', say: 'nothing set — surprise me' }];
  return [];
}

export function mountConcierge(els) {
  const brief = {};
  const msgs = [];      /* the thread, client-held: [{role, content}] */
  let route = null;
  let busy = false;
  let mustsAsked = false; /* the locked-in question fires exactly once (server-enforced) */

  /* ── thread ops ── */
  function bubble(role, html) {
    const b = document.createElement('div');
    b.className = 'cx-msg ' + (role === 'user' ? 'cx-user' : 'cx-bot');
    b.innerHTML = html;
    els.thread.appendChild(b);
    els.thread.scrollTop = els.thread.scrollHeight;
    return b;
  }
  const say = (text) => { msgs.push({ role: 'assistant', content: text }); return bubble('assistant', esc(text)); };
  const heard = (text) => { msgs.push({ role: 'user', content: text }); return bubble('user', esc(text)); };

  function setChips(list) {
    /* Guy 2026-08-24 #1: programmatic input.value='' never fires oninput, so
       the typing-yield class survived the send and hid EVERY later chip —
       including KEEP THIS PLAN. Chips always re-show when re-set. */
    els.chips.classList.remove('cx-chips-hidden');
    els.chips.innerHTML = (list || []).map((c, i) =>
      '<button type="button" class="ck-opt cx-chip" data-i="' + i + '">' + esc(c.show) + '</button>').join('');
    els.chips._list = list || [];
  }

  /* ── turn 0: scripted, instant, provenance-aware (R1 + R6) ── */
  let via = null;
  try { via = JSON.parse(localStorage.getItem('tripos_via') || 'null'); } catch (_) {}
  const viaName = via && via.via ? String(via.via).slice(0, 40) : null;
  say(viaName
    ? 'You came from ' + viaName + '’s month. Want yours built the same way? What kind of trip are you on?'
    : 'Bali, right? I build your month — bases, days, real places. What kind of trip is this?');
  setChips([
    { show: '🏄 surf trip', say: 'a surf trip' }, { show: '💍 honeymoon', say: 'a honeymoon' },
    { show: '🧑‍💻 remote work', say: 'remote work — I’m a nomad' }, { show: '🎉 party month', say: 'a party month' }
  ]);

  /* proof line — the count real or absent (R1) */
  (async () => {
    try {
      const r = await fetch(cfg.url + '/rest/v1/curated_places?select=id&destination=eq.bali&verified=is.true', {
        method: 'HEAD', headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey, Prefer: 'count=exact', Range: '0-0' }
      });
      const n = parseInt(String(r.headers.get('content-range') || '').split('/')[1], 10);
      els.proof.textContent = (Number.isFinite(n) && n > 0 ? n + ' verified places · ' : '') +
        'three questions from a route you can argue with';
    } catch (_) { els.proof.textContent = 'three questions from a route you can argue with'; }
  })();

  /* ── the reveal (full-screen), then the route-mini in-thread (R3) ── */
  const miniSVG = (legs, w) => {
    const pts = legs.map((l) => AREA_XY[l.area] || [160, 150]);
    return '<svg viewBox="0 0 320 260" width="' + (w || '100%') + '" aria-hidden="true">' +
      '<path d="' + ISLAND + '" fill="none" stroke="var(--mut)" stroke-width="1.5" opacity="0.5"/>' +
      '<ellipse cx="229" cy="175" rx="12" ry="8.25" transform="rotate(-14 229 175)" fill="none" stroke="var(--mut)" stroke-width="1.2" opacity="0.5"/>' +
      '<path d="' + pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ',' + p[1]).join(' ') + '" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round"/>' +
      pts.map((p, i) => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="6" fill="' + (AREA_HEX[legs[i].area] || '#3dffd0') + '"/>').join('') +
      '</svg>';
  };

  function showReveal() {
    const legs = route.legs;
    const days = legs.reduce((s, l) => s + (l.nights || 0), 0);
    els.reveal.hidden = false;
    document.body.classList.add('cx-revealing');
    els.revealHead.textContent = days + ' DAYS · ' + legs.length + ' BASES';
    const pts = legs.map((l) => AREA_XY[l.area] || [160, 150]);
    els.revealTrace.setAttribute('d', pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ',' + p[1]).join(' '));
    els.revealOrbs.innerHTML = legs.map((l, i) =>
      '<circle cx="' + pts[i][0] + '" cy="' + pts[i][1] + '" r="6" fill="' + (AREA_HEX[l.area] || '#3dffd0') + '"/>' +
      '<text x="' + (pts[i][0] + 10) + '" y="' + (pts[i][1] + 3) + '" fill="' + (AREA_HEX[l.area] || '#3dffd0') +
      '" font-size="9" style="font-family:ui-monospace,Menlo,monospace;letter-spacing:0.08em">' + esc(l.area.toUpperCase()) + '</text>').join('');
    els.revealLegs.innerHTML = legs.map((l) =>
      '<div class="cer-leg"><div class="cer-leg-row">' +
        '<span class="cer-leg-orb" style="background:' + (AREA_HEX[l.area] || '#3dffd0') + '"></span>' +
        '<span class="cer-leg-name">' + esc(l.area.toUpperCase()) + '</span>' +
        '<span class="cer-leg-n">' + l.nights + ' NIGHTS</span>' +
      '</div>' + (l.why ? '<p class="cer-leg-why">' + esc(l.why) + '</p>' : '') + '</div>').join('');
    els.revealSummary.textContent = route.summary ? '“' + route.summary + '”' : '';
    /* the trace draws — reveal-class moment on the front door */
    if (!REDUCED) {
      try {
        const len = els.revealTrace.getTotalLength();
        els.revealTrace.style.strokeDasharray = String(len);
        els.revealTrace.style.strokeDashoffset = String(len);
        requestAnimationFrame(() => {
          els.revealTrace.style.transition = 'stroke-dashoffset 1.6s ease-out';
          els.revealTrace.style.strokeDashoffset = '0';
        });
      } catch (_) {}
    }
    els.revealGo.onclick = () => {
      els.reveal.hidden = true;
      document.body.classList.remove('cx-revealing');
      collapseIntoThread();
    };
  }

  /* R3: the ceremony collapses INTO the thread; R4: the ask, value on screen */
  function collapseIntoThread() {
    const legs = route.legs;
    const days = legs.reduce((s, l) => s + (l.nights || 0), 0);
    msgs.push({ role: 'assistant', content: '[route: ' + legs.map((l) => l.area + ' ' + l.nights + 'n').join(' → ') + ']' });
    const mini = bubble('assistant',
      '<div class="cx-mini">' + miniSVG(legs, '210') +
      '<div class="cx-mini-facts">' + days + 'D · ' + legs.length + ' BASES</div></div>');
    mini.classList.add('cx-has-mini');
    mini.querySelector('.cx-mini').onclick = () => { els.reveal.hidden = false; document.body.classList.add('cx-revealing'); };
    say('this is yours if you want it.');
    setChips([]);
    els.chips.classList.remove('cx-chips-hidden');
    els.chips.innerHTML =
      '<button type="button" class="ck-opt cx-chip cx-keep" id="cxKeep">KEEP THIS PLAN</button>' +
      '<button type="button" class="ck-reset cx-explore" id="cxExplore">keep exploring</button>';
    document.getElementById('cxKeep').onclick = keepPlan;
    document.getElementById('cxExplore').onclick = () => {
      say('ask me anything about the route — or tell me what to change.');
      setChips([]);
    };
  }

  /* KEEP THIS PLAN → the tripos_plan hand-off; the corridor does the rest */
  function keepPlan() {
    track('keep_plan_tap');
    try {
      localStorage.setItem('tripos_plan', JSON.stringify({
        vibe: brief.vibe, vibe_detail: brief.vibe_detail || null,
        party: brief.party || null, party_detail: brief.party_detail || null,
        dur: brief.dur != null ? String(brief.dur) : '0',
        tier: brief.tier || 'comf',
        priorities: brief.priorities || [],
        arrive: brief.arrive || null,
        musts: brief.musts || null,
        ts: Date.now()
      }));
      localStorage.setItem('tripos_draft_route', JSON.stringify({ legs: route.legs, summary: route.summary, at: Date.now() }));
    } catch (_) {}
    location.href = '../app/';
  }

  /* ── the send loop ── */
  async function callFn(payload) {
    const r = await fetch(cfg.url + '/functions/v1/concierge', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ sid, brief, musts_asked: mustsAsked, via_name: viaName || undefined }, payload))
    });
    return r.json().catch(() => null);
  }

  async function build() {
    const building = bubble('assistant', '<span class="cx-building">building your month<span class="cx-dots">…</span></span>');
    let r = null;
    try { r = await callFn({ action: 'build' }); } catch (_) {}
    building.remove();
    if (!r || !r.route || !r.route.legs) {
      say('the route engine is catching its breath — try me again in a minute.');
      return;
    }
    route = r.route;
    track('chat_route', { legs: route.legs.length });
    showReveal();
  }

  /* the cap is never a dead end (ATLAS): the door forward is always on screen */
  function cappedState(reply) {
    say(reply || 'sign in and I’m yours without limits.');
    els.chips.classList.remove('cx-chips-hidden');
    els.chips.innerHTML =
      '<a class="ck-opt cx-chip" href="../app/">↗ sign in — no limits</a>' +
      '<button type="button" class="ck-reset cx-explore" id="cxRestart2">start over</button>';
    const rb = document.getElementById('cxRestart2');
    if (rb) rb.onclick = restart;
  }

  async function send(text) {
    if (busy || !text) return;
    busy = true;
    heard(text);
    setChips([]);
    els.input.value = '';
    const thinking = bubble('assistant', '<span class="cx-dots">…</span>');
    let r = null;
    try { r = await callFn({ messages: msgs.slice(-12) }); }
    catch (_) { r = null; }
    finally { thinking.remove(); busy = false; } /* the chat NEVER locks (Guy #5) */
    if (!r) { say('I lost the signal for a second — say that again?'); return; }
    if (r.capped) { cappedState(r.reply); return; }
    if (r.error) { say('I lost the thread for a second — say that again?'); return; }
    Object.assign(brief, r.patch || {});
    if (r.ask === 'musts') mustsAsked = true;
    track('chat_turn', { ask: r.ask || 'none' });
    say(r.reply);
    if (r.done) { setChips([]); await build(); }
    else setChips(chipsFor(r.ask, brief));
  }

  /* Guy #4: start over — fresh thread, fresh brief, fresh session budget */
  function restart() {
    try { sessionStorage.removeItem('tripos_cx_sid'); } catch (_) {}
    location.reload();
  }

  els.chips.addEventListener('click', (e) => {
    const b = e.target.closest('.cx-chip[data-i]');
    if (!b) return;
    const c = (els.chips._list || [])[+b.getAttribute('data-i')];
    if (c) send(c.say); /* R2: the chip echoes as the user's own speech */
  });
  els.form.onsubmit = (e) => { e.preventDefault(); send(els.input.value.trim()); };
  els.input.oninput = () => {
    /* R2 yield: chips crossfade out while the input holds text */
    els.chips.classList.toggle('cx-chips-hidden', els.input.value.trim().length > 0);
  };

  /* ── mic: capability-gated, fills the input, NEVER auto-sends (R2) ── */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR && els.mic) {
    els.mic.hidden = false;
    let rec = null;
    els.mic.onclick = () => {
      if (rec) { rec.stop(); return; }
      rec = new SR();
      rec.lang = 'en-US'; rec.interimResults = true; rec.continuous = false;
      els.mic.classList.add('on');
      rec.onresult = (ev) => {
        els.input.value = Array.from(ev.results).map((r0) => r0[0].transcript).join(' ').trim();
        els.input.dispatchEvent(new Event('input'));
      };
      rec.onend = () => { els.mic.classList.remove('on'); rec = null; els.input.focus(); };
      rec.onerror = () => { els.mic.classList.remove('on'); rec = null; };
      rec.start();
    };
  }

  /* ── the small live clock (the island's pulse stays in the header) ── */
  function paintClock() {
    if (!els.clock) return;
    const n = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Makassar' }));
    const h = n.getHours();
    const phase = h >= 5 && h < 7 ? 'dawn' : h >= 7 && h < 16 ? 'day' : h >= 16 && h < 19 ? 'golden hour' : 'night';
    const color = { dawn: '#ffb454', day: '#3dffd0', 'golden hour': '#ffb454', night: '#a78bfa' }[phase];
    els.clock.innerHTML = '<span class="cx-clock-dot" style="background:' + color + '"></span>BALI · ' +
      String(h).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0') + ' · ' + phase.toUpperCase();
  }
  paintClock();
  setInterval(paintClock, 30000);

  if (els.restart) els.restart.onclick = (e) => { e.preventDefault(); restart(); };

  track('chat_open', { via: !!viaName });
}
