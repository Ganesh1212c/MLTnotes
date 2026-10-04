/* PCA Lab: MLT Week 1 notes
   Plain JavaScript, no libraries. Sections:
   1. small helpers      2. theme      3. sound effects (Web Audio, no audio files)
   4. page chrome        5. "Spin the torch" demo      6. "How many directions" demo
   7. the quiz
*/
(function () {
  "use strict";

  /* ============================================================
     1. helpers
     ============================================================ */
  var NS = "http://www.w3.org/2000/svg";
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function svgEl(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) { if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]); }
    if (parent) parent.appendChild(e);
    return e;
  }
  var root = document.documentElement;

  /* storage that never throws (private windows, blocked storage, file previews) */
  var memStore = {};
  function load(key) {
    try { var v = localStorage.getItem(key); if (v !== null) return v; } catch (e) {}
    return Object.prototype.hasOwnProperty.call(memStore, key) ? memStore[key] : null;
  }
  function save(key, val) {
    memStore[key] = val;
    try { localStorage.setItem(key, val); } catch (e) {}
  }

  var toastEl = $("#toast"), toastTimer = 0;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("on"); }, 1500);
  }

  /* ============================================================
     2. theme
     ============================================================ */
  var themeBtn = $("#theme-toggle"), themeLabel = $("#theme-label");
  function applyTheme(t, persist) {
    root.setAttribute("data-theme", t);
    var dark = t === "dark";
    if (themeBtn) {
      themeBtn.setAttribute("aria-pressed", dark ? "true" : "false");
      themeBtn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    }
    if (themeLabel) themeLabel.textContent = dark ? "Light" : "Dark";
    if (persist) save("mlt1-theme", t);
  }
  applyTheme(root.getAttribute("data-theme") === "dark" ? "dark" : "light", false);
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      applyTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark", true);
    });
  }
  if (window.matchMedia) {
    var mq = matchMedia("(prefers-color-scheme: dark)");
    var onMq = function (e) { if (!load("mlt1-theme")) applyTheme(e.matches ? "dark" : "light", false); };
    if (mq.addEventListener) mq.addEventListener("change", onMq);
  }

  /* ============================================================
     3. sound effects
        Everything is synthesised with the Web Audio API, so there are no
        sound files to host. The AudioContext is created on the first click.
     ============================================================ */
  var Sound = (function () {
    var AC = window.AudioContext || window.webkitAudioContext;
    var ctx = null, master = null;
    var on = load("mlt1-sound") !== "off";

    function ensure() {
      if (!AC) return false;
      try {
        if (!ctx) {
          ctx = new AC();
          master = ctx.createGain();
          master.gain.value = 0.55;
          master.connect(ctx.destination);
        }
        if (ctx.state === "suspended" && ctx.resume) ctx.resume();
        return true;
      } catch (e) { return false; }
    }

    /* one note: frequency f (Hz), start t, length d (s), wave type, volume v,
       optional glide target `to`, optional low-pass cutoff `lp` */
    function tone(f, t, d, type, v, to, lp) {
      var o = ctx.createOscillator(), g = ctx.createGain(), out = g;
      o.type = type || "sine";
      o.frequency.setValueAtTime(f, t);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v || 0.2, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g);
      if (lp) {
        var flt = ctx.createBiquadFilter();
        flt.type = "lowpass"; flt.frequency.value = lp;
        g.connect(flt); out = flt;
      }
      out.connect(master);
      o.start(t); o.stop(t + d + 0.05);
    }

    /* a swoosh: filtered noise sweeping from f0 to f1 */
    function swoosh(t, d, v, f0, f1) {
      var n = Math.floor(ctx.sampleRate * d), buf = ctx.createBuffer(1, n, ctx.sampleRate), data = buf.getChannelData(0);
      for (var i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
      var src = ctx.createBufferSource(); src.buffer = buf;
      var flt = ctx.createBiquadFilter(); flt.type = "bandpass"; flt.Q.value = 1.2;
      flt.frequency.setValueAtTime(f0, t); flt.frequency.exponentialRampToValueAtTime(f1, t + d);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + d * 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      src.connect(flt); flt.connect(g); g.connect(master);
      src.start(t); src.stop(t + d + 0.02);
    }

    var lib = {
      /* tapping an option: a soft "pop" */
      pick: function (t) { tone(520, t, 0.09, "sine", 0.2, 900); },
      /* right answer: bright rising arpeggio with a sparkle on top */
      ok: function (t) {
        [523.25, 659.25, 783.99].forEach(function (f, i) { tone(f, t + i * 0.085, 0.24, "triangle", 0.24); });
        tone(1046.5, t + 0.26, 0.4, "sine", 0.18);
        tone(2093, t + 0.3, 0.25, "sine", 0.05);
      },
      /* partly right: two hopeful notes that do not quite land */
      part: function (t) {
        tone(440, t, 0.15, "triangle", 0.24);
        tone(554.37, t + 0.14, 0.26, "triangle", 0.22);
      },
      /* wrong: a cartoon "wah wah wah wahhh" slide down */
      bad: function (t) {
        var notes = [233.08, 220, 207.65];
        notes.forEach(function (f, i) { tone(f, t + i * 0.17, 0.2, "sawtooth", 0.17, null, 1100); });
        tone(196, t + 0.51, 0.55, "sawtooth", 0.17, 160, 900);
      },
      /* moving between questions */
      next: function (t) { swoosh(t, 0.16, 0.16, 500, 2600); },
      back: function (t) { swoosh(t, 0.16, 0.16, 2600, 500); },
      /* finishing with a good score: little fanfare */
      win: function (t) {
        [523.25, 523.25, 523.25, 659.25, 783.99].forEach(function (f, i) {
          tone(f, t + i * 0.11, i === 4 ? 0.18 : 0.12, "square", 0.1, null, 2600);
        });
        [523.25, 659.25, 783.99, 1046.5].forEach(function (f) { tone(f, t + 0.58, 0.9, "triangle", 0.14); });
      },
      /* finishing with a lower score: gentle, encouraging */
      meh: function (t) {
        tone(392, t, 0.2, "triangle", 0.2);
        tone(440, t + 0.18, 0.2, "triangle", 0.2);
        tone(523.25, t + 0.36, 0.45, "triangle", 0.2);
      },
      /* extra sparkle for a perfect score */
      sparkle: function (t) {
        [1318.5, 1568, 1760, 2093, 2637].forEach(function (f, i) { tone(f, t + i * 0.07, 0.3, "sine", 0.09); });
      }
    };

    function play(name, delay) {
      if (!on || !lib[name]) return;
      if (!ensure()) return;
      lib[name](ctx.currentTime + 0.01 + (delay || 0));
    }
    function setOn(v) { on = !!v; save("mlt1-sound", on ? "on" : "off"); }
    return { play: play, setOn: setOn, isOn: function () { return on; } };
  })();

  var soundBtn = $("#sound-toggle");
  function syncSoundBtn() {
    if (!soundBtn) return;
    var on = Sound.isOn();
    soundBtn.setAttribute("aria-pressed", on ? "true" : "false");
    soundBtn.setAttribute("aria-label", on ? "Quiz sounds are on. Press to mute." : "Quiz sounds are off. Press to turn them on.");
  }
  syncSoundBtn();
  if (soundBtn) {
    soundBtn.addEventListener("click", function () {
      Sound.setOn(!Sound.isOn());
      syncSoundBtn();
      toast(Sound.isOn() ? "Sound on" : "Sound off");
      if (Sound.isOn()) Sound.play("pick");
    });
  }

  /* ============================================================
     4. page chrome: reading progress, active section, basics, anchors
     ============================================================ */
  var bar = $("#read-progress");
  var spyLinks = $$("[data-spy]");
  var spyTargets = spyLinks.map(function (a) { return document.getElementById(a.getAttribute("data-spy")); });
  var ticking = false;
  function onScroll() {
    ticking = false;
    var h = document.documentElement;
    var max = h.scrollHeight - h.clientHeight;
    if (bar) bar.style.width = (max > 0 ? Math.min(100, (h.scrollTop / max) * 100) : 0) + "%";
    var line = 130, current = -1;
    spyTargets.forEach(function (el, i) {
      if (el && el.getBoundingClientRect().top <= line) current = i;
    });
    spyLinks.forEach(function (a, i) {
      if (i === current) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
    });
  }
  window.addEventListener("scroll", function () {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  window.addEventListener("resize", onScroll);
  onScroll();

  var basics = $$("details.basics");
  var basicsBtn = $("#basics-toggle");
  function syncBasicsBtn() {
    if (!basicsBtn) return;
    var allOpen = basics.every(function (d) { return d.open; });
    basicsBtn.textContent = allOpen ? "Close all" : "Open all";
    basicsBtn.setAttribute("aria-pressed", allOpen ? "true" : "false");
  }
  if (basicsBtn) {
    basicsBtn.addEventListener("click", function () {
      var allOpen = basics.every(function (d) { return d.open; });
      basics.forEach(function (d) { d.open = !allOpen; });
      syncBasicsBtn();
    });
    basics.forEach(function (d) { d.addEventListener("toggle", syncBasicsBtn); });
    syncBasicsBtn();
  }
  function openForHash() {
    if (!location.hash) return;
    var t = null;
    try { t = document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch (e) {}
    if (!t) return;
    var d = t.closest ? t.closest("details") : null;
    if (d) d.open = true;
    if (t.tagName === "DETAILS") t.open = true;
  }
  window.addEventListener("hashchange", openForHash);
  openForHash();

  /* ============================================================
     5. "Spin the torch" demo (Lesson 4)
        The four centred points from the notes. For a direction w at angle
        theta we compute, straight from the data:
          spread = mean of (x . w)^2     error = mean of squared residues
     ============================================================ */
  (function torchDemo() {
    var svg = $("#torch-svg");
    if (!svg) return;
    var slider = $("#torch-angle");
    var P = [{ n: "A", x: -3, y: -1 }, { n: "B", x: -1, y: -3 }, { n: "C", x: 1, y: 3 }, { n: "D", x: 3, y: 1 }];
    var cx = 180, cy = 165, S = 40;          // origin in the drawing, pixels per unit
    var TOTAL = P.reduce(function (a, p) { return a + p.x * p.x + p.y * p.y; }, 0) / P.length;  // 10
    function X(x) { return cx + x * S; }
    function Y(y) { return cy - y * S; }

    /* fixed parts */
    svgEl("path", { "class": "tp-axis", d: "M14 " + cy + "H346M" + cx + " 12V318" }, svg);
    var best = svgEl("path", { "class": "tp-best", d: "M" + X(-3.7) + " " + Y(-3.7) + "L" + X(3.7) + " " + Y(3.7), visibility: "hidden" }, svg);
    var line = svgEl("path", { "class": "tp-line" }, svg);
    var resG = svgEl("g", {}, svg), resL = P.map(function () { return svgEl("path", { "class": "tp-res" }, resG); });
    var shG = svgEl("g", {}, svg), shC = P.map(function () { return svgEl("circle", { "class": "tp-shadow", r: 5 }, shG); });
    var arrow = svgEl("path", { "class": "tp-arrow" }, svg);
    var tip = svgEl("polygon", { "class": "tp-arrow-tip" }, svg);
    var wl = svgEl("text", { "class": "tp-lab", "font-style": "italic" }, svg);
    wl.textContent = "w";
    P.forEach(function (p) {
      svgEl("circle", { "class": "tp-pt", cx: X(p.x), cy: Y(p.y), r: 6.5 }, svg);
      var right = p.x > 0;
      var t = svgEl("text", { "class": "tp-lab", x: X(p.x) + (right ? 11 : -11), y: Y(p.y) + (p.y > 0 ? -7 : 18), "text-anchor": right ? "start" : "end" }, svg);
      t.textContent = p.n;
    });

    var outDeg = $("#torch-deg"), outX = $("#torch-wx"), outY = $("#torch-wy");
    var vVar = $("#v-var"), vErr = $("#v-err"), bVar = $("#bar-var"), bErr = $("#bar-err"), msg = $("#torch-msg");

    function update() {
      var deg = parseFloat(slider.value), th = deg * Math.PI / 180;
      var wx = Math.cos(th), wy = Math.sin(th);
      var spread = 0;
      P.forEach(function (p, i) {
        var t = p.x * wx + p.y * wy;
        spread += t * t;
        var px = t * wx, py = t * wy;
        shC[i].setAttribute("cx", X(px)); shC[i].setAttribute("cy", Y(py));
        resL[i].setAttribute("d", "M" + X(p.x) + " " + Y(p.y) + "L" + X(px) + " " + Y(py));
      });
      spread /= P.length;
      var err = TOTAL - spread;

      /* the line, and the w arrow with a hand-built arrowhead */
      line.setAttribute("d", "M" + X(-3.9 * wx) + " " + Y(-3.9 * wy) + "L" + X(3.9 * wx) + " " + Y(3.9 * wy));
      var L = 1.45, tx = X(L * wx), ty = Y(L * wy), ux = wx, uy = -wy;   // unit direction in screen space
      var bx = tx - 11 * ux, by = ty - 11 * uy, nx = -uy, ny = ux;
      arrow.setAttribute("d", "M" + cx + " " + cy + "L" + bx + " " + by);
      tip.setAttribute("points", tx + "," + ty + " " + (bx + 6 * nx) + "," + (by + 6 * ny) + " " + (bx - 6 * nx) + "," + (by - 6 * ny));
      wl.setAttribute("x", tx + 16 * ux + (ux < 0 ? -4 : 4)); wl.setAttribute("y", ty + 16 * uy + 5);

      outDeg.textContent = Math.round(deg) + "°";
      outX.textContent = wx.toFixed(2); outY.textContent = wy.toFixed(2);
      vVar.textContent = spread.toFixed(2); vErr.textContent = err.toFixed(2);
      bVar.style.width = (spread / TOTAL * 100) + "%"; bErr.style.width = (err / TOTAL * 100) + "%";
      slider.setAttribute("aria-valuetext", Math.round(deg) + " degrees, spread " + spread.toFixed(2) + ", error " + err.toFixed(2));

      msg.className = "lab-msg";
      var nearBest = Math.abs(deg - 45) <= 2, nearWorst = Math.abs(deg - 135) <= 2;
      best.setAttribute("visibility", nearBest ? "visible" : "hidden");
      if (nearBest) {
        msg.classList.add("good");
        msg.textContent = "That is the best direction. The shadows are as spread out as they can be (8.00) and the error is as small as it gets (2.00). This is the first principal component: the eigenvector of C with the largest eigenvalue, 8.";
      } else if (nearWorst) {
        msg.classList.add("bad");
        msg.textContent = "The worst direction: the shadows are squeezed together (spread 2.00) and the error is as large as it gets (8.00). Notice it is exactly at right angles to the best one. That is the second principal component.";
      } else if (spread > 7) {
        msg.textContent = "Very close. Nudge the slider a little more to push the green bar up.";
      } else {
        msg.textContent = "Spread " + spread.toFixed(2) + " and error " + err.toFixed(2) + ". Try to make the spread (green) as large as you can.";
      }
    }
    slider.addEventListener("input", update);
    $("#torch-best").addEventListener("click", function () { slider.value = 45; update(); });
    $("#torch-worst").addEventListener("click", function () { slider.value = 135; update(); });
    update();
  })();

  /* ============================================================
     6. "How many directions?" demo (Lesson 6)
     ============================================================ */
  (function screeDemo() {
    var svg = $("#scree-svg");
    if (!svg) return;
    var LAMBDA = [50, 25, 12, 8, 3, 2], TOTAL = LAMBDA.reduce(function (a, b) { return a + b; }, 0);
    var k = 3, kMax = LAMBDA.length;
    var x0 = 54, x1 = 508, base = 196, top = 34, slot = (x1 - x0) / kMax, bw = 24, yMax = 50;
    function Y(v) { return base - (v / yMax) * (base - top); }

    [0, 25, 50].forEach(function (v) {
      svgEl("path", { "class": v === 0 ? "sc-axis" : "sc-grid", d: "M" + x0 + " " + Y(v) + "H" + x1 }, svg);
      var t = svgEl("text", { "class": "sc-t", x: x0 - 8, y: Y(v) + 4, "text-anchor": "end" }, svg); t.textContent = v;
    });
    var cut = svgEl("path", { "class": "sv-cut" }, svg);
    var cutLab = svgEl("text", { "class": "sc-t", "text-anchor": "middle", y: 14 }, svg);
    var bars = [], hits = [];
    LAMBDA.forEach(function (v, i) {
      var bx = x0 + i * slot + (slot - bw) / 2, y = Y(v), r = 4;
      var b = svgEl("path", { d: "M" + bx + " " + base + "V" + (y + r) + "Q" + bx + " " + y + " " + (bx + r) + " " + y + "H" + (bx + bw - r) + "Q" + (bx + bw) + " " + y + " " + (bx + bw) + " " + (y + r) + "V" + base + "Z" }, svg);
      bars.push(b);
      var lv = svgEl("text", { "class": "sc-v", x: bx + bw / 2, y: y - 7, "text-anchor": "middle" }, svg); lv.textContent = v;
      var lx = svgEl("text", { "class": "sc-t", x: bx + bw / 2, y: base + 20, "text-anchor": "middle" }, svg); lx.textContent = "PC " + (i + 1);
      var h = svgEl("rect", { x: x0 + i * slot, y: top - 18, width: slot, height: base - top + 40, fill: "transparent", style: "cursor:pointer" }, svg);
      h.addEventListener("click", function () { k = i + 1; update(); });
      hits.push(h);
    });

    var kOut = $("#k-val"), minus = $("#k-minus"), plus = $("#k-plus");
    var mVal = $("#m-val"), mFill = $("#m-fill"), mBadge = $("#m-badge"), meter = $("#scree-meter");

    function update() {
      var sum = 0;
      LAMBDA.forEach(function (v, i) {
        var keep = i < k; if (keep) sum += v;
        bars[i].setAttribute("class", keep ? "sc-keep" : "sc-drop");
      });
      var pct = sum * 100 / TOTAL;
      var cx = x0 + k * slot;
      cut.setAttribute("d", k >= kMax ? "M0 0" : "M" + cx + " " + (top - 14) + "V" + (base + 2));
      cutLab.textContent = k >= kMax ? "" : "keep ←  → drop";
      cutLab.setAttribute("x", cx);
      kOut.textContent = k;
      minus.disabled = k <= 1; plus.disabled = k >= kMax;
      mVal.textContent = Math.round(pct) + "%";
      mFill.style.width = pct + "%";
      var enough = sum * 100 >= 95 * TOTAL;   // exact integer test, so 95 counts
      mBadge.textContent = enough ? "✓ 95% rule met" : "Not yet, need 95%";
      mBadge.className = "m-badge" + (enough ? " ok" : "");
      meter.setAttribute("data-ok", enough ? "1" : "0");
      svg.setAttribute("aria-label", "Bar chart of the six eigenvalues 50, 25, 12, 8, 3 and 2. The first " + k + " bars are kept (green), the rest are dropped (pink). Variance captured: " + Math.round(pct) + " percent.");
    }
    minus.addEventListener("click", function () { if (k > 1) { k--; update(); } });
    plus.addEventListener("click", function () { if (k < kMax) { k++; update(); } });
    update();
  })();

  /* ============================================================
     7. the quiz
     ============================================================ */
  (function quiz() {
    var rootEl = $("#quiz-root");
    if (!rootEl) return;

    /* tiny helpers for writing maths inside question text */
    function V(s) { return '<var class="v">' + s + "</var>"; }
    function v(s) { return "<var>" + s + "</var>"; }
    var xTw = V("x") + "<sup>T</sup>" + V("w");
    function mat2(a, b, c, d) { return '<span class="mat" style="--c:2"><span>' + a + "</span><span>" + b + "</span><span>" + c + "</span><span>" + d + "</span></span>"; }

    var SKILLS = [
      { name: "The big picture", link: "#lesson-1", linkName: "Lesson 1: What is machine learning?" },
      { name: "Projection and error", link: "#lesson-3", linkName: "Lesson 3: Representation learning" },
      { name: "Covariance and eigenvectors", link: "#lesson-4", linkName: "Lesson 4: Least error means most spread" },
      { name: "Algorithm and how many", link: "#lesson-6", linkName: "Lesson 6: PCA, which directions and how many?" }
    ];

    var Q = [
      /* ---- the big picture ---- */
      { skill: 0, type: "mcq", short: "Which paradigm groups unlabelled customers?",
        text: "A shop has customer records (age, spending, visits) but no labels. It wants to group similar customers together. Which paradigm is this?",
        options: [["A", "Supervised learning"], ["B", "Unsupervised learning"], ["C", "Sequential learning"], ["D", "None of these"]],
        ans: ["B"],
        why: ["There is no label (no “right answer”) attached to any customer, so this is <strong>unsupervised</strong>.",
              "Grouping similar points is clustering, one of the notes’ unsupervised examples (K-means, hierarchical, density-based)."] },
      { skill: 0, type: "msq", short: "Which techniques are unsupervised?",
        text: "Which of these are unsupervised learning techniques?",
        options: [["A", "K-means clustering"], ["B", "Principal Component Analysis"], ["C", "Linear regression"], ["D", "Anomaly detection"], ["E", "Logistic regression"]],
        ans: ["A", "B", "D"],
        why: ["Unsupervised means inputs only. The notes list clustering (A), dimensionality reduction such as PCA (B) and anomaly detection (D).",
              "Linear regression (C) and logistic regression (E) learn from labelled outputs, so they are <strong>supervised</strong>."] },
      { skill: 0, type: "mcq", short: "Predicting tomorrow’s energy use: which paradigm?",
        text: "According to the notes, predicting tomorrow’s energy consumption from the past few weeks of consumption is an example of which paradigm?",
        options: [["A", "Supervised learning"], ["B", "Unsupervised learning"], ["C", "Sequential learning"], ["D", "Representation learning"]],
        ans: ["C"],
        why: ["Each prediction depends on the earlier time steps. That is the notes’ definition of <strong>sequential learning</strong>, and time-series forecasting is one of its examples.",
              "Representation learning is not one of the three paradigms. It is about finding compact descriptions of data."] },

      /* ---- projection and error ---- */
      { skill: 1, type: "nat", short: "Compute xᵀw for x = (5, 0) and w = (0.6, 0.8)",
        text: "Let " + V("w") + " = (0.6, 0.8) and " + V("x") + " = (5, 0). Find " + xTw + ".",
        ctx: "Multiply matching entries and add them up.",
        ans: 3, tol: 0.01,
        why: ["Multiply matching entries and add: 5 × 0.6 + 0 × 0.8 = <strong>3</strong>.",
              "Because " + V("w") + " is a unit vector, 3 is how far " + V("x") + " reaches along " + V("w") + "."] },
      { skill: 1, type: "nat", short: "Squared residue length for the same x and w",
        text: "With the same " + V("w") + " = (0.6, 0.8) and " + V("x") + " = (5, 0), what is the squared length of the residue, ‖" + V("x") + " − (" + xTw + ")" + V("w") + "‖<sup>2</sup>?",
        ans: 16, tol: 0.01,
        why: ["Projection = 3 · (0.6, 0.8) = (1.8, 2.4). Residue = (5, 0) − (1.8, 2.4) = (3.2, −2.4). Squared length = 10.24 + 5.76 = <strong>16</strong>.",
              "Shortcut: ‖" + V("x") + "‖<sup>2</sup> − (" + xTw + ")<sup>2</sup> = 25 − 9 = 16."] },
      { skill: 1, type: "mcq", short: "Why the projection formula simplifies",
        text: "Why does the projection formula in the notes simplify to (" + xTw + ")" + V("w") + "?",
        options: [["A", "Because the data has been centred"], ["B", "Because ‖" + V("w") + "‖ = 1, so " + V("w") + "<sup>T</sup>" + V("w") + " = 1"], ["C", "Because the mean of the data is zero"], ["D", "Because " + V("w") + " is an eigenvector of " + V("C")]],
        ans: ["B"],
        why: ["The general projection is (" + xTw + " / " + V("w") + "<sup>T</sup>" + V("w") + ") " + V("w") + ". When ‖" + V("w") + "‖ = 1 the bottom is 1 and it disappears.",
              "Centring and eigenvectors matter elsewhere in PCA, but not for this simplification."] },
      { skill: 1, type: "mcq", short: "Minimising the error is the same as…",
        text: "Minimising the reconstruction error over unit vectors " + V("w") + " is the same as doing which of the following?",
        options: [["A", "Minimising (1/" + v("n") + ") Σ (" + V("x") + "<sub>" + v("i") + "</sub><sup>T</sup>" + V("w") + ")<sup>2</sup>"],
                  ["B", "Maximising (1/" + v("n") + ") Σ (" + V("x") + "<sub>" + v("i") + "</sub><sup>T</sup>" + V("w") + ")<sup>2</sup>"],
                  ["C", "Maximising ‖" + V("w") + "‖"],
                  ["D", "Minimising " + V("w") + "<sup>T</sup>" + V("C") + V("w")]],
        ans: ["B"],
        why: ["‖residue‖<sup>2</sup> = ‖" + V("x") + "‖<sup>2</sup> − (" + xTw + ")<sup>2</sup>. The first part does not depend on " + V("w") + ", so a smaller error means a <em>larger</em> average of (" + xTw + ")<sup>2</sup>, which equals " + V("w") + "<sup>T</sup>" + V("C") + V("w") + ".",
              "A and D are the opposite of this. C makes no sense because ‖" + V("w") + "‖ is fixed at 1."] },

      /* ---- covariance and eigenvectors ---- */
      { skill: 2, type: "msq", short: "True statements about the covariance matrix",
        text: "For centred data with " + V("x") + "<sub>" + v("i") + "</sub> ∈ ℝ<sup>" + v("d") + "</sup> and " + V("C") + " = (1/" + v("n") + ") Σ " + V("x") + "<sub>" + v("i") + "</sub>" + V("x") + "<sub>" + v("i") + "</sub><sup>T</sup>, which statements are true?",
        options: [["A", V("C") + " is a " + v("d") + " × " + v("d") + " matrix"],
                  ["B", "The eigenvalues of " + V("C") + " are never negative"],
                  ["C", "The eigenvector of the smallest eigenvalue is the first principal component"],
                  ["D", "If " + V("w") + " is a unit eigenvector of " + V("C") + " with eigenvalue " + v("λ") + ", then " + v("λ") + " is the variance of the data along " + V("w")]],
        ans: ["A", "B", "D"],
        why: ["A: each " + V("x") + V("x") + "<sup>T</sup> is " + v("d") + " × " + v("d") + ", and so is their average. B: " + V("C") + " is positive semi-definite, so every " + v("λ") + " ≥ 0.",
              "D: " + V("w") + "<sup>T</sup>" + V("C") + V("w") + " = " + v("λ") + V("w") + "<sup>T</sup>" + V("w") + " = " + v("λ") + ", and " + V("w") + "<sup>T</sup>" + V("C") + V("w") + " is the average squared shadow, the variance for centred data.",
              "C is false: the first principal component uses the <strong>largest</strong> eigenvalue, because we want the most spread."] },
      { skill: 2, type: "mcq", short: "What the first principal component is",
        text: "The first principal component of a data set is…",
        options: [["A", "the eigenvector of " + V("C") + " with the largest eigenvalue"], ["B", "the eigenvector of " + V("C") + " with the smallest eigenvalue"], ["C", "the mean of the data"], ["D", "the data point with the largest length"]],
        ans: ["A"],
        why: ["Maximising " + V("w") + "<sup>T</sup>" + V("C") + V("w") + " over unit vectors " + V("w") + " is solved by the eigenvector with the largest eigenvalue.",
              "The mean is what we subtract when centring. It is not a principal component."] },
      { skill: 2, type: "nat", short: "Largest eigenvalue of [[5, 3], [3, 5]]",
        text: "A centred data set has covariance matrix " + V("C") + " = " + mat2(5, 3, 3, 5) + ". What is its largest eigenvalue?",
        ctx: "Hint: for a matrix of the form [[a, b], [b, a]] the eigenvalues are a + b and a − b.",
        ans: 8, tol: 0.01,
        why: ["The eigenvalues are 5 + 3 = <strong>8</strong> and 5 − 3 = 2.",
              "Check: " + V("C") + "(1, 1) = (5 + 3, 3 + 5) = (8, 8) = 8 · (1, 1), so (1, 1) is an eigenvector with " + v("λ") + " = 8."] },

      /* ---- algorithm and how many ---- */
      { skill: 3, type: "mcq", short: "First step of the potential algorithm",
        text: "In the “potential algorithm” for representation learning, which step comes first?",
        options: [["A", "Find the best direction " + V("w") + " with ‖" + V("w") + "‖ = 1"], ["B", "Subtract each point’s projection"], ["C", "Centre the data by subtracting the mean"], ["D", "Sort the eigenvalues in ascending order"]],
        ans: ["C"],
        why: ["Step 1 is to centre the data: " + V("x") + "<sub>" + v("i") + "</sub> <span class=\"gets\" aria-hidden=\"true\"></span> " + V("x") + "<sub>" + v("i") + "</sub> − " + v("μ") + ".",
              "Then find the best " + V("w") + ", subtract the projection from every point, and repeat until the residues are zero."] },
      { skill: 3, type: "nat", short: "Smallest k for 95% variance (50, 25, 12, 8, 3, 2)",
        text: "A data set has eigenvalues 50, 25, 12, 8, 3, 2. What is the smallest " + v("k") + " that captures at least 95% of the variance?",
        ans: 4, tol: 0.01,
        why: ["The total is 100. The running totals are 50, 75, 87, 95, 98, 100.",
              v("k") + " = <strong>4</strong> is the first to reach 95%, and “at least 95%” includes exactly 95%."] },
      { skill: 3, type: "nat", short: "Storage for d = 100, n = 1000, k = 5",
        text: "A data set has " + v("d") + " = 100 features and " + v("n") + " = 1000 points. How many numbers are needed to store its PCA representation with " + v("k") + " = 5 components?",
        ctx: "Remember the storage formula from Lesson 6.",
        ans: 5500, tol: 0.5,
        why: [v("k") + "(" + v("d") + " + " + v("n") + ") = 5 × (100 + 1000) = <strong>5,500</strong>.",
              "The original " + v("d") + " × " + v("n") + " table needs 100,000 numbers, so this is about 18 times smaller."] },
      { skill: 3, type: "msq", short: "True statements about PCA",
        text: "Which statements about PCA are true?",
        options: [["A", "It needs class labels for every data point"],
                  ["B", "It produces new features that are de-correlated"],
                  ["C", "Capturing more variance means a lower reconstruction error"],
                  ["D", "Keeping all " + v("d") + " components needs " + v("d") + "(" + v("d") + " + " + v("n") + ") numbers, more than the original " + v("d") + " × " + v("n")],
                  ["E", "The eigenvalues are sorted in ascending order before choosing the top " + v("k")]],
        ans: ["B", "C", "D"],
        why: ["B is true: PCA finds feature combinations that are de-correlated. C is true: the more variance we keep, the less error we pay.",
              "D is true: " + v("d") + "(" + v("d") + " + " + v("n") + ") = " + v("d") + "<sup>2</sup> + " + v("d") + v("n") + ", which is bigger than " + v("d") + v("n") + ".",
              "A is false: PCA is unsupervised. E is false: the eigenvalues are sorted in <strong>descending</strong> order."] },
      { skill: 3, type: "mcq", short: "Components needed for data on one line in ℝ¹⁰",
        text: "All the data points in ℝ<sup>10</sup> lie exactly on one straight line through the origin. How many principal components are needed for zero residue?",
        options: [["A", "1"], ["B", "2"], ["C", "5"], ["D", "10"]],
        ans: ["A"],
        why: ["The data lives in a 1-dimensional subspace, so one direction explains all of it and the residue is zero.",
              "This is the notes’ “" + v("k") + " ≪ " + v("d") + "” case: if the data sits in a lower-dimensional subspace, we do not need all " + v("d") + " components."] }
    ];
    var N = Q.length;

    /* ---------- state ---------- */
    var KEY = "mlt1-quiz-v1";
    var state = { idx: 0, ans: {}, done: {}, finished: false };
    (function restore() {
      var raw = load(KEY);
      if (!raw) return;
      try {
        var s = JSON.parse(raw);
        if (s && typeof s === "object") {
          state.idx = Math.max(0, Math.min(N - 1, s.idx | 0));
          state.ans = s.ans || {}; state.done = s.done || {}; state.finished = !!s.finished;
        }
      } catch (e) {}
    })();
    function persist() { save(KEY, JSON.stringify(state)); }

    /* ---------- scoring ---------- */
    function parseNum(s) {
      if (s === null || s === undefined) return NaN;
      s = String(s).replace(/−/g, "-").replace(/[,\s]/g, "");
      if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
      return parseFloat(s);
    }
    function marks(i) {
      var q = Q[i], a = state.ans[i];
      if (!state.done[i]) return 0;
      if (q.type === "nat") { var n = parseNum(a); return (!isNaN(n) && Math.abs(n - q.ans) <= q.tol) ? 1 : 0; }
      a = a || [];
      var hit = 0, wrong = 0;
      a.forEach(function (k) { if (q.ans.indexOf(k) > -1) hit++; else wrong++; });
      if (q.type === "mcq") return (hit === 1 && wrong === 0) ? 1 : 0;
      return Math.max(0, (hit - wrong) / q.ans.length);
    }
    function fmt(x) { return String(Math.round(x * 100) / 100); }
    function fmt1(x) { return String(Math.round(x * 10) / 10); }
    function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
    function plain(html) { return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(); }
    function hasAnswer(i) {
      var a = state.ans[i], q = Q[i];
      return q.type === "nat" ? (a !== undefined && String(a).trim() !== "") : (a && a.length > 0);
    }

    /* ---------- Eigen's face, with a mood ---------- */
    function face(mood) {
      var mouth = {
        cheer: '<path class="e-mouth fill" d="M43 85Q60 111 77 85Z"/>',
        hmm: '<path class="e-mouth" d="M46 93Q53 86 60 93T74 93"/>',
        oops: '<path class="e-mouth" d="M46 99Q60 83 74 99"/><path class="e-drop" d="M101 44Q94 56 101 62Q108 56 101 44Z"/>'
      }[mood];
      return '<svg class="qz-fb-face" viewBox="0 0 120 120" aria-hidden="true"><use href="#eigen-nm"/>' + mouth + "</svg>";
    }

    /* ---------- rendering ---------- */
    function segHTML() {
      var h = '<div class="qz-seg" role="group" aria-label="Progress. Press a segment to jump to that question.">';
      for (var i = 0; i < N; i++) {
        var cls = "";
        var label = "Question " + (i + 1);
        if (state.done[i]) {
          var m = marks(i);
          cls = m === 1 ? "ok" : (m > 0 ? "part" : "bad");
          label += m === 1 ? ", correct" : (m > 0 ? ", partly right" : ", not right");
        } else { label += ", not answered yet"; }
        if (i === state.idx && !state.finished) { cls += " cur"; label += ", current"; }
        h += '<button type="button" class="' + cls + '" data-act="goto" data-i="' + i + '" aria-label="' + label + '"></button>';
      }
      return h + "</div>";
    }

    function optionHTML(q, i, o) {
      var k = o[0], t = o[1], done = !!state.done[i];
      var chosen = state.ans[i] || [];
      var sel = chosen.indexOf(k) > -1, right = q.ans.indexOf(k) > -1;
      var cls = "qz-opt" + (sel ? " sel" : ""), tag = "";
      if (done) {
        cls += " locked";
        if (sel && right) { cls += " ok"; tag = "Correct"; }
        else if (sel && !right) { cls += " bad"; tag = "Not this one"; }
        else if (!sel && right) { cls += " miss"; tag = q.type === "msq" ? "You missed this" : "Right answer"; }
      }
      var type = q.type === "msq" ? "checkbox" : "radio";
      return '<label class="' + cls + '"><input type="' + type + '" name="qz-' + i + '" value="' + k + '"' + (sel ? " checked" : "") + (done ? " disabled" : "") + ">" +
        '<span class="qz-key">' + k + '</span><span class="qz-txt">' + t + "</span>" + (tag ? '<span class="qz-mark">' + tag + "</span>" : "") + "</label>";
    }

    function feedbackHTML(q, i) {
      var m = marks(i), full = m === 1, none = m === 0;
      var cls = full ? "good" : (none ? "bad" : "partial");
      var head = full ? "Correct!" : (none ? "Not quite." : "Partly right.");
      var line = full ? "1 mark." : (none ? "No marks this time." : fmt(m) + " of 1 mark.");
      var right = "";
      if (!full) {
        if (q.type === "nat") right = '<p class="qz-ans">The right answer is <span class="pill">' + q.ans.toLocaleString("en-US") + "</span></p>";
        else right = '<p class="qz-ans">The right answer' + (q.ans.length > 1 ? "s are" : " is") + " " + q.ans.map(function (k) { return '<span class="pill">' + k + "</span>"; }).join("") + "</p>";
      }
      var sk = SKILLS[q.skill];
      return '<div class="qz-fb ' + cls + '" role="status">' + face(full ? "cheer" : (none ? "oops" : "hmm")) +
        '<div class="qz-fb-b"><p class="qz-fb-h">' + head + " <small>" + line + "</small></p>" + right +
        '<div><p class="qz-why-t">How to work it out</p><ul class="qz-why">' + q.why.map(function (w) { return "<li>" + w + "</li>"; }).join("") + "</ul></div>" +
        '<p class="qz-rev">Revise this: <a href="' + sk.link + '">' + sk.linkName + "</a></p></div></div>";
    }

    function questionHTML() {
      var i = state.idx, q = Q[i], done = !!state.done[i];
      var h = '<div class="qz-top"><p class="qz-count">Question ' + (i + 1) + " of " + N + '</p><span class="qz-tag">' + SKILLS[q.skill].name + "</span></div>" + segHTML();
      h += '<h3 class="qz-q" id="qz-q" tabindex="-1">' + q.text + "</h3>";
      var hint = q.type === "msq" ? "Select all that apply" : (q.type === "mcq" ? "Choose one" : "Type a number");
      h += '<p class="qz-hint">' + hint + "</p>";
      if (q.ctx) h += '<p class="qz-ctx">' + q.ctx + "</p>";

      if (q.type === "nat") {
        var val = state.ans[i] === undefined ? "" : String(state.ans[i]);
        var cls = done ? (marks(i) === 1 ? " ok" : " bad") : "";
        h += '<div class="qz-nat"><label for="qz-in">Your answer</label><input id="qz-in" class="' + cls.trim() + '" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" value="' + esc(val) + '"' + (done ? " disabled" : "") + ">";
        if (done) h += '<span class="qz-mark ' + (marks(i) === 1 ? "ok" : "bad") + '">' + (marks(i) === 1 ? "Correct" : "Not quite") + "</span>";
        h += "</div>";
      } else {
        h += '<div class="qz-opts' + (q.type === "msq" ? " multi" : "") + '" role="' + (q.type === "msq" ? "group" : "radiogroup") + '" aria-labelledby="qz-q">' +
          q.options.map(function (o) { return optionHTML(q, i, o); }).join("") + "</div>";
      }

      h += '<div class="qz-actions">';
      if (i > 0) h += '<button type="button" class="qz-btn ghost back" data-act="back">Back</button>';
      if (!done) {
        h += '<button type="button" class="qz-btn go" data-act="check"' + (hasAnswer(i) ? "" : " disabled") + ">Check answer</button>";
      } else {
        h += '<button type="button" class="qz-btn ghost" data-act="retry">Try again</button>';
        h += '<button type="button" class="qz-btn go" data-act="next">' + (i === N - 1 ? "See my results" : "Next question") + "</button>";
      }
      h += "</div>";
      if (done) h += feedbackHTML(q, i);
      return h;
    }

    function resultsHTML() {
      var total = 0, answered = 0;
      for (var i = 0; i < N; i++) { if (state.done[i]) { answered++; total += marks(i); } }
      var pct = total / N;
      var msg = total === N ? "Perfect score! You can handle every kind of Week 1 question."
        : pct >= 0.8 ? "Great work. A few small things to tidy up and you are there."
        : pct >= 0.5 ? "Good start. Re-read the lessons marked below, then try those questions again."
        : "Keep going. Read the lessons again, work through the numeric problems, and retry.";
      if (answered < N) msg += " You have " + (N - answered) + " unanswered " + (N - answered === 1 ? "question" : "questions") + ".";

      var rows = SKILLS.map(function (s, si) {
        var got = 0, cnt = 0;
        Q.forEach(function (q, i) { if (q.skill === si) { cnt++; got += state.done[i] ? marks(i) : 0; } });
        return '<li><span>' + s.name + '</span><span class="qz-bar"><i style="width:' + Math.round(got / cnt * 100) + '%"></i></span><span class="qz-sc">' + fmt1(got) + " / " + cnt + "</span></li>";
      }).join("");

      var missed = [];
      Q.forEach(function (q, i) { if (!state.done[i] || marks(i) < 1) missed.push(i); });
      var list = missed.length
        ? '<h4 class="qz-sub">Worth another look</h4><ul class="qz-review">' + missed.map(function (i) {
            var label = Q[i].short || plain(Q[i].text);
            var st = state.done[i] ? "Score " + fmt(marks(i)) + " of 1" : "Not answered";
            return '<li><button type="button" data-act="goto" data-i="' + i + '"><span>' + esc(label) + '</span><span class="qz-rs">' + st + "</span></button></li>";
          }).join("") + "</ul>" : "";

      return '<div class="qz-res"><div class="qz-score"><span class="qz-big">' + fmt1(total) + '</span><span class="qz-out">out of ' + N + "</span></div>" +
        '<p class="qz-msg" id="qz-q" tabindex="-1">' + msg + '</p><ul class="qz-skills">' + rows + "</ul>" + list +
        '<div class="qz-actions">' + (missed.length ? '<button type="button" class="qz-btn ghost" data-act="retry-missed">Retry the ones I missed</button>' : "") +
        '<button type="button" class="qz-btn go" data-act="restart">Start again</button></div></div>';
    }

    function render(focusHeading) {
      rootEl.innerHTML = state.finished ? resultsHTML() : questionHTML();
      if (focusHeading) { var f = $("#qz-q", rootEl); if (f && f.focus) f.focus({ preventScroll: true }); }
    }
    function bringIntoView() {
      var r = rootEl.getBoundingClientRect();
      if (r.top < 70 || r.top > window.innerHeight * 0.7) {
        window.scrollTo({ top: window.pageYOffset + r.top - 92, behavior: "smooth" });
      }
    }

    /* ---------- actions ---------- */
    function go(i, sound) {
      state.idx = i; state.finished = false; persist(); render(true); bringIntoView();
      if (sound) Sound.play(sound);
    }
    function finish() {
      state.finished = true; persist(); render(true); bringIntoView();
      var total = 0; for (var i = 0; i < N; i++) if (state.done[i]) total += marks(i);
      if (total / N >= 0.8) { Sound.play("win"); if (total === N) Sound.play("sparkle", 0.75); } else { Sound.play("meh"); }
    }
    function check() {
      var i = state.idx;
      if (state.done[i] || !hasAnswer(i)) return;
      state.done[i] = true; persist();
      var m = marks(i);
      render(false);
      var fb = $(".qz-fb", rootEl); if (fb && fb.scrollIntoView) fb.scrollIntoView({ block: "nearest", behavior: "smooth" });
      Sound.play(m === 1 ? "ok" : (m > 0 ? "part" : "bad"));
    }

    rootEl.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("[data-act]") : null;
      if (!b || b.disabled) return;
      var act = b.getAttribute("data-act");
      if (act === "check") check();
      else if (act === "next") { if (state.idx >= N - 1) finish(); else go(state.idx + 1, "next"); }
      else if (act === "back") go(Math.max(0, state.idx - 1), "back");
      else if (act === "goto") go(parseInt(b.getAttribute("data-i"), 10) || 0, "next");
      else if (act === "retry") { var i = state.idx; delete state.done[i]; delete state.ans[i]; persist(); render(false); Sound.play("pick"); }
      else if (act === "retry-missed") {
        var first = -1;
        for (var j = 0; j < N; j++) { if (!state.done[j] || marks(j) < 1) { delete state.done[j]; delete state.ans[j]; if (first < 0) first = j; } }
        state.idx = Math.max(0, first); state.finished = false; persist(); render(true); bringIntoView(); Sound.play("next");
      }
      else if (act === "restart") { state = { idx: 0, ans: {}, done: {}, finished: false }; persist(); render(true); bringIntoView(); Sound.play("next"); }
    });

    function refreshSelection() {
      var i = state.idx, chosen = state.ans[i] || [];
      $$(".qz-opt", rootEl).forEach(function (lab) {
        var inp = $("input", lab);
        lab.classList.toggle("sel", chosen.indexOf(inp.value) > -1);
      });
      var btn = $('[data-act="check"]', rootEl); if (btn) btn.disabled = !hasAnswer(i);
    }
    rootEl.addEventListener("change", function (e) {
      var inp = e.target;
      if (!inp || inp.tagName !== "INPUT" || inp.type === "text") return;
      var i = state.idx, q = Q[i];
      if (state.done[i]) return;
      if (q.type === "mcq") state.ans[i] = [inp.value];
      else {
        var cur = (state.ans[i] || []).slice(), at = cur.indexOf(inp.value);
        if (inp.checked && at < 0) cur.push(inp.value);
        if (!inp.checked && at > -1) cur.splice(at, 1);
        state.ans[i] = cur;
      }
      persist(); refreshSelection(); Sound.play("pick");
    });
    rootEl.addEventListener("input", function (e) {
      if (e.target && e.target.id === "qz-in") {
        state.ans[state.idx] = e.target.value; persist();
        var btn = $('[data-act="check"]', rootEl); if (btn) btn.disabled = !hasAnswer(state.idx);
      }
    });
    rootEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.target && e.target.id === "qz-in") { e.preventDefault(); check(); }
    });

    render(false);
  })();
})();
