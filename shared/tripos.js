/* ─── TripOS landing — shared behaviour ─── */
(function () {
  document.documentElement.classList.add('js');

  /* reveal on scroll */
  var els = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
    els.forEach(function (el) { io.observe(el); });
  } else {
    els.forEach(function (el) { el.classList.add('in'); });
  }

  /* flight progress bar — plane flies YOU → destination as you scroll */
  var plane = document.getElementById('fbPlane');
  var fill = document.getElementById('fbFill');
  var stageLabel = document.getElementById('fbStage');
  var stages = document.querySelectorAll('[data-stage]');
  if (plane) {
    var ticking = false;
    var update = function () {
      ticking = false;
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      var pct = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      plane.style.left = (pct * 100) + '%';
      if (fill) fill.style.width = (pct * 100) + '%';
      if (stageLabel && stages.length) {
        var cur = stages[0];
        for (var i = 0; i < stages.length; i++) {
          if (stages[i].getBoundingClientRect().top < window.innerHeight * 0.55) cur = stages[i];
        }
        var txt = cur.getAttribute('data-stage');
        if (stageLabel.textContent !== txt) stageLabel.textContent = txt;
      }
    };
    var onScroll = function () {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
  }

  /* count-up stats when they scroll into view */
  var nums = document.querySelectorAll('[data-count]');
  var runCount = function (el) {
    var target = parseInt(el.getAttribute('data-count'), 10);
    var suffix = el.getAttribute('data-suffix') || '';
    var t0 = null;
    var dur = 1100;
    var step = function (ts) {
      if (!t0) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (p < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
  };
  if (nums.length) {
    if ('IntersectionObserver' in window) {
      var nio = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            runCount(e.target);
            nio.unobserve(e.target);
          }
        });
      }, { threshold: 0.4 });
      nums.forEach(function (el) { nio.observe(el); });
    } else {
      nums.forEach(function (el) {
        el.textContent = el.getAttribute('data-count') + (el.getAttribute('data-suffix') || '');
      });
    }
  }
})();
