/* ─── TripOS · branched check-in questionnaire (APP_SPEC §3 Stage 2) ───
 * One engine, two surfaces: the /bali landing funnel and the in-app
 * check-in. Renders one question per screen with progress dots and
 * branches Q2 by vibe. Answers shape:
 *   { party, vibe, vibe_detail, dur, tier, priorities[], vibe_detail_label }
 * ──────────────────────────────────────────────────────────────────── */

export const QUESTIONS = {
  party: {
    q: "Who's flying?",
    opts: [
      ['solo',   '🧍 Solo',   'optimize for one'],
      ['couple', '👫 Couple', 'built for two'],
      ['family', '👨‍👩‍👧 Family', 'kid-proof picks'],
      ['crew',   '🎒 Crew',   'coordinate the group']
    ]
  },
  vibe: {
    q: "What's your vibe?",
    opts: [
      ['nomad',    '🧑‍💻 Digital nomad', 'work from paradise'],
      ['surf',     '🏄 Surf',          'chase the swell'],
      ['wellness', '🧘 Wellness',       'reset mind + body'],
      ['party',    '🎉 Party',          'nights that go long'],
      ['mix',      '🌀 Mix',            'a bit of everything']
    ]
  },
  dur: {
    q: 'How long are you staying?',
    opts: [
      ['14', '✈️ 2 weeks',   'the reset'],
      ['30', '🌙 1 month',   'the deep dive'],
      ['90', '🌴 3+ months', 'the slowmad life'],
      ['0',  '🌀 Open-ended', 'stay till it feels done']
    ]
  },
  tier: {
    q: 'Budget tier?',
    opts: [
      ['back', '🎒 Backpacker',  'stretch every rupiah'],
      ['comf', '😌 Comfortable', 'smart, not stingy'],
      ['prem', '🥂 Premium',     'no compromises']
    ]
  }
};

export const BRANCH = {
  nomad: {
    q: 'How much will you actually work?',
    opts: [
      ['deep',   '🧑‍💻 Deep-work days', 'laptop before beach'],
      ['half',   '⛅ Half days',      'mornings on, afternoons off'],
      ['barely', '🌴 Barely',         'the laptop stays mostly shut']
    ]
  },
  surf: {
    q: 'Your level?',
    opts: [
      ['first',    '🌊 First waves', 'soft-top and stoke'],
      ['improver', '🏄 Improver',    'greens and lineups'],
      ['charger',  '⚡ Charger',     'reef and barrels']
    ]
  },
  wellness: {
    q: 'Your focus?',
    opts: [
      ['yoga',    '🧘 Yoga & breath',     'shalas and stillness'],
      ['healing', '🌿 Healing & retreats', 'go deeper than a class'],
      ['fitness', '🏋️ Fitness',           'strong on the road']
    ]
  },
  party: {
    q: 'Your scene?',
    opts: [
      ['beachclubs', '🏖 Beach clubs', 'day-to-sunset energy'],
      ['clubs',      '🪩 Club nights', 'DJs till late'],
      ['bars',       '🍹 Social bars', 'easy nights, good people']
    ]
  }
};

export const DETAIL_LABEL = {
  deep: 'deep-work days', half: 'half days', barely: 'barely working',
  first: 'first waves', improver: 'improver lines', charger: 'charging reef',
  yoga: 'yoga & breath', healing: 'healing & retreats', fitness: 'fitness',
  beachclubs: 'beach clubs', clubs: 'club nights', bars: 'social bars'
};

export const PRIORITIES = [
  ['work',      '☕ Work-friendly'],
  ['food',      '🍽 Food'],
  ['nightlife', '🎉 Nightlife'],
  ['nature',    '🏞 Nature'],
  ['fitness',   '🏋️ Fitness'],
  ['wellness',  '💆 Wellness']
];

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* the question sequence, given answers so far (mix skips the branch) */
function sequence(a) {
  const seq = ['party', 'vibe'];
  if (a.vibe && a.vibe !== 'mix') seq.push('branch');
  seq.push('dur', 'tier', 'priorities');
  return seq;
}

export function mountCheckin(container, dotsEl, onComplete) {
  const answers = { priorities: [] };
  let pos = 0;

  function drawDots() {
    const seq = sequence(answers);
    dotsEl.innerHTML = seq.map((_, i) =>
      '<span class="' + (i <= pos ? 'on' : '') + '"></span>').join('');
  }

  function optButton(k, label, sub) {
    return '<button type="button" class="ck-opt" data-v="' + esc(k) + '">' +
      esc(label) + '<span class="opt-sub">' + esc(sub) + '</span></button>';
  }

  function render() {
    const seq = sequence(answers);
    const key = seq[pos];
    drawDots();

    if (key === 'priorities') {
      container.innerHTML =
        '<div class="ck-step"><p class="ck-q">What matters most? <span class="ck-q-sub">pick any — or skip</span></p>' +
        '<div class="ck-opts ck-multi">' +
        PRIORITIES.map(([k, label]) =>
          '<button type="button" class="ck-opt ck-pill" data-v="' + esc(k) + '">' + esc(label) + '</button>'
        ).join('') +
        '</div>' +
        '<div class="ck-multi-actions">' +
          '<button type="button" class="btn btn-primary" data-act="done">Build my brief</button>' +
          '<button type="button" class="ck-reset" data-act="skip">skip</button>' +
        '</div></div>';
      return;
    }

    const def = key === 'branch' ? BRANCH[answers.vibe] : QUESTIONS[key];
    container.innerHTML =
      '<div class="ck-step"><p class="ck-q">' + esc(def.q) + '</p>' +
      '<div class="ck-opts">' +
      def.opts.map(([k, label, sub]) => optButton(k, label, sub)).join('') +
      '</div></div>';
  }

  container.onclick = (e) => {
    const seq = sequence(answers);
    const key = seq[pos];

    if (key === 'priorities') {
      const act = e.target.closest('[data-act]');
      if (act) {
        if (act.getAttribute('data-act') === 'skip') answers.priorities = [];
        finish();
        return;
      }
      const pill = e.target.closest('.ck-pill');
      if (pill) {
        const v = pill.getAttribute('data-v');
        const i = answers.priorities.indexOf(v);
        if (i === -1) answers.priorities.push(v);
        else answers.priorities.splice(i, 1);
        pill.classList.toggle('on', i === -1);
      }
      return;
    }

    const btn = e.target.closest('.ck-opt');
    if (!btn) return;
    const v = btn.getAttribute('data-v');
    if (key === 'branch') answers.vibe_detail = v;
    else answers[key] = v;
    pos++;
    render();
  };

  function finish() {
    answers.vibe_detail_label = DETAIL_LABEL[answers.vibe_detail] || null;
    container.onclick = null;
    onComplete(answers);
  }

  render();
  return {
    destroy() { container.onclick = null; container.innerHTML = ''; }
  };
}
