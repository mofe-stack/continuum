/* Continuum landing interactions. Principles borrowed from Emil Kowalski's
   design-eng skill: only transform/opacity animate, IntersectionObserver instead
   of scroll listeners, custom ease-out, everything degrades under reduced motion.
   No dependencies. */
(function () {
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ── scroll reveal (once) ─────────────────────────────────────── */
  var reveals = document.querySelectorAll("[data-reveal]");
  if (reduce || !("IntersectionObserver" in window)) {
    reveals.forEach(function (el) { el.classList.add("is-in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });
    reveals.forEach(function (el) { io.observe(el); });
  }

  /* ── spotlight follow on glass cards ──────────────────────────── */
  if (fine) {
    document.querySelectorAll("[data-spotlight]").forEach(function (card) {
      card.addEventListener("pointermove", function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty("--mx", ((e.clientX - r.left) / r.width) * 100 + "%");
        card.style.setProperty("--my", ((e.clientY - r.top) / r.height) * 100 + "%");
      });
    });
  }

  /* ── magnetic buttons (transition-smoothed, composable transform) ─ */
  if (fine && !reduce) {
    document.querySelectorAll("[data-magnetic]").forEach(function (btn) {
      var STR = 0.28, MAX = 7;
      btn.addEventListener("pointermove", function (e) {
        var r = btn.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) * STR;
        var dy = (e.clientY - (r.top + r.height / 2)) * STR;
        dx = Math.max(-MAX, Math.min(MAX, dx));
        dy = Math.max(-MAX, Math.min(MAX, dy));
        btn.style.setProperty("--mx-b", dx + "px");
        btn.style.setProperty("--my-b", dy + "px");
      });
      btn.addEventListener("pointerleave", function () {
        btn.style.setProperty("--mx-b", "0px");
        btn.style.setProperty("--my-b", "0px");
      });
    });
  }

  /* ── hero float + pointer tilt: ONE rAF loop drives both, so the idle
        float and the pointer parallax never fight over `transform`. Runs only
        while the hero is on screen; idle float eases away while you steer it. ─ */
  var stage = document.querySelector(".hero-stage");
  var tilt = stage && stage.querySelector("[data-tilt]");
  if (stage && tilt && !reduce) {
    var pTX = 0, pTY = 0;        // pointer target (deg)
    var pcx = 0, pcy = 0;        // eased pointer
    var hoverT = 0, hover = 0;   // hover amount 0..1 (fades idle float in/out)
    var raf = null, t0 = 0, running = false;

    function frame(ts) {
      if (!t0) t0 = ts;
      var t = (ts - t0) / 1000;
      hover += (hoverT - hover) * 0.07;
      pcx += (pTX - pcx) * 0.09;
      pcy += (pTY - pcy) * 0.09;
      var idle = 1 - hover * 0.92;                       // idle recedes while steering
      var floatY = Math.sin(t * 0.85) * 6 * idle;
      var rotX = Math.sin(t * 0.70) * 1.1 * idle + pcy;
      var rotY = Math.cos(t * 0.60) * 1.5 * idle + pcx;
      tilt.style.transform =
        "translateY(" + floatY.toFixed(2) + "px) rotateX(" + rotX.toFixed(2) + "deg) rotateY(" + rotY.toFixed(2) + "deg)";
      raf = requestAnimationFrame(frame);
    }
    function start() { if (!running) { running = true; t0 = 0; raf = requestAnimationFrame(frame); } }
    function stop() { running = false; if (raf) { cancelAnimationFrame(raf); raf = null; } }

    if (fine) {
      stage.addEventListener("pointermove", function (e) {
        var r = stage.getBoundingClientRect();
        pTX = ((e.clientX - (r.left + r.width / 2)) / r.width) * 16;    // rotateY
        pTY = -((e.clientY - (r.top + r.height / 2)) / r.height) * 12;  // rotateX
        hoverT = 1;
      });
      stage.addEventListener("pointerleave", function () { pTX = 0; pTY = 0; hoverT = 0; });
    }

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { e.isIntersecting ? start() : stop(); });
      }, { threshold: 0.02 }).observe(stage);
    } else { start(); }
  }

  /* ── ripple on press ──────────────────────────────────────────── */
  document.querySelectorAll("[data-ripple]").forEach(function (btn) {
    btn.addEventListener("pointerdown", function (e) {
      var r = btn.getBoundingClientRect();
      var d = Math.max(r.width, r.height);
      var s = document.createElement("span");
      s.className = "ripple";
      s.style.width = s.style.height = d + "px";
      s.style.left = (e.clientX - r.left - d / 2) + "px";
      s.style.top = (e.clientY - r.top - d / 2) + "px";
      btn.appendChild(s);
      setTimeout(function () { s.remove(); }, 600);
    });
  });

  /* ── count-up stats when revealed ─────────────────────────────── */
  function countUp(el) {
    var target = parseInt(el.getAttribute("data-count"), 10);
    if (reduce || isNaN(target)) { el.textContent = target; return; }
    var start = null, dur = 1100;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      el.textContent = Math.round(eased * target);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  var stats = document.querySelectorAll("[data-count]");
  if (stats.length && "IntersectionObserver" in window) {
    var so = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { countUp(e.target); so.unobserve(e.target); }
      });
    }, { threshold: 0.6 });
    stats.forEach(function (s) { so.observe(s); });
  } else {
    stats.forEach(function (s) { s.textContent = s.getAttribute("data-count"); });
  }

  /* ── interactive stepper (how it works) ──────────────────────── */
  var stepper = document.querySelector(".stepper");
  if (stepper) {
    var nodes = [].slice.call(stepper.querySelectorAll(".step-node"));
    var steps = [].slice.call(stepper.querySelectorAll(".flow-step"));
    var fill = stepper.querySelector(".step-line-fill");
    var n = steps.length, cur = 0, timer = null, DWELL = 3400;

    function paint(k) {
      cur = k;
      nodes.forEach(function (nd, i) {
        nd.classList.toggle("is-active", i === cur);
        nd.classList.toggle("is-done", i < cur);
        nd.setAttribute("aria-selected", i === cur ? "true" : "false");
      });
      steps.forEach(function (st, i) { st.classList.toggle("is-active", i === cur); });
      if (fill) fill.style.width = (n > 1 ? (cur / (n - 1)) * 100 : 0) + "%";
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function play() {
      if (reduce) return;
      stop();
      timer = setInterval(function () { paint((cur + 1) % n); }, DWELL);
    }
    nodes.forEach(function (nd, i) {
      nd.addEventListener("click", function () { paint(i); play(); });
    });
    steps.forEach(function (st, i) {
      st.addEventListener("mouseenter", function () { paint(i); stop(); });
      st.addEventListener("mouseleave", play);
    });
    paint(0);
    if ("IntersectionObserver" in window) {
      var po = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) play(); else stop(); });
      }, { threshold: 0, rootMargin: "0px 0px -15% 0px" });
      po.observe(stepper);
    } else { play(); }
  }

  /* ── works-with strip: traveling pulse, pause on hover ────────── */
  var slogos = [].slice.call(document.querySelectorAll(".strip-logos li"));
  if (slogos.length) {
    var sp = 0, stimer = null, hovering = false;
    function clearPulse() { slogos.forEach(function (el) { el.classList.remove("pulse"); }); }
    function tick() { clearPulse(); slogos[sp].classList.add("pulse"); sp = (sp + 1) % slogos.length; }
    function sPlay() { if (reduce || hovering) return; if (!stimer) { tick(); stimer = setInterval(tick, 1500); } }
    function sStop() { if (stimer) { clearInterval(stimer); stimer = null; } clearPulse(); }

    // hovering the strip freezes the rolling highlight; the CSS :hover lights
    // up whichever logo you're on. Leaving resumes the rotation from the start.
    var logoWrap = document.querySelector(".strip-logos");
    if (logoWrap) {
      logoWrap.addEventListener("pointerenter", function () {
        hovering = true;
        sStop();
      });
      logoWrap.addEventListener("pointerleave", function () {
        hovering = false;
        sp = 0;            // restart the loop from Claude
        sPlay();
      });
    }

    var strip = document.querySelector(".strip");
    if (strip && "IntersectionObserver" in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { e.isIntersecting ? sPlay() : sStop(); });
      }, { threshold: 0.4 }).observe(strip);
    } else { sPlay(); }
  }

  /* ── store links (live listing URLs) ─────────────────────────── */
  var STORE = {
    chrome: "https://chromewebstore.google.com/detail/continuum-capture-save-re/nnohcpdjcfhkpmplgpcabpfipnokinbi",
    firefox: "https://addons.mozilla.org/en-US/firefox/addon/continuum/"
  };
  document.querySelectorAll("[data-store]").forEach(function (a) {
    a.setAttribute("href", STORE[a.getAttribute("data-store")] || "#");
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener");
  });

  /* ── changelog: expand/collapse older versions ───────────────── */
  var clToggle = document.querySelector(".cl-toggle");
  var clCollapse = document.getElementById("clOlder");
  if (clToggle && clCollapse) {
    var clTxt = clToggle.querySelector(".cl-toggle-txt");
    clToggle.addEventListener("click", function () {
      var open = clCollapse.classList.toggle("is-open");
      clToggle.setAttribute("aria-expanded", open ? "true" : "false");
      if (clTxt) clTxt.textContent = open ? "Hide older versions" : "Show older versions";
    });
  }

  /* ── in-page nav: scroll to a section without writing #hash to the URL ─ */
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener("click", function (e) {
      var id = a.getAttribute("href").slice(1);
      if (!id) return;
      var el = document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    });
  });
  // Arrived from another page via index.html#section → scroll, then strip the hash.
  if (location.hash.length > 1) {
    var target = document.getElementById(location.hash.slice(1));
    if (target) {
      requestAnimationFrame(function () {
        target.scrollIntoView({ behavior: "auto", block: "start" });
        if (history.replaceState) history.replaceState(null, "", location.pathname + location.search);
      });
    }
  }
})();
