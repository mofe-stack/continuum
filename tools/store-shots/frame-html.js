// frame-html.js — composes one 1280×800 store frame.
//
// The panel is the REAL panel: actual markup from capture-panel.js, actual
// src/ui/panel.css, in a shadow root, with the actual upgradeSelect() run over
// its dropdowns. Nothing about its appearance is re-implemented here — only the
// drawer mechanics are neutralised (see panel-real.js OVERRIDE).
//
// Frame geometry is measured off the approved English artwork in
// Downloads/continuum-store-screenshots rather than eyeballed:
//
//   frame  theme  panel x..x+w      copy x    (measured from shot-N.png)
//     1    dark   734..1109 (375)    118
//     2    light  158..558  (400)    682
//     3    light  735..1109 (374)    118
//     4    light  158..558  (400)    682
//     5    dark   721..1123 (402)    118
//
// panel.css lays the panel out at 360px wide, so each frame scales the shadow
// host by width/360 — which keeps the product's internal proportions exact and
// only changes the size, matching how the originals were produced.
"use strict";

const fs = require("fs");
const path = require("path");
const { panelMarkup, panelCss, OVERRIDE } = require("./panel-real.js");

const root = path.join(__dirname, "..", "..");
const PANEL_JS = path.join(root, "src", "ui", "capture-panel.js");
const FONT_DIR = path.join(root, "website", "assets", "fonts");

const PANEL_CSS_WIDTH = 360;

// Backgrounds sampled from the corners of the approved frames.
//   light  TL 236,239,247  TR 250,251,253  BL 228,233,243  BR 234,237,246
//   dark   TL  12, 16, 24  TR  22, 29, 41  BL   9, 12, 18  BR  11, 15, 22
const BG = {
  light: "linear-gradient(to top right, #e3e8f2 0%, #eef1f8 55%, #fbfcfd 100%)",
  dark: "radial-gradient(130% 110% at 85% 12%, #1a2130 0%, #0d1117 55%, #090c12 100%)",
};

const COPY_INK = { light: "#0b1220", dark: "#ffffff" };
const COPY_INK_2 = { light: "#3f4a5a", dark: "#aab4c4" };

// Outfit covers Latin only; each non-Latin script falls back to the Windows face
// that matches it. Without this the headline silently renders in Times.
const FALLBACK = {
  ja: '"Yu Gothic UI","Yu Gothic",Meiryo,sans-serif',
  ko: '"Malgun Gothic","Apple SD Gothic Neo",sans-serif',
  zh_CN: '"Microsoft YaHei UI","Microsoft YaHei",sans-serif',
  ru: '"Segoe UI","Helvetica Neue",sans-serif',
};

// Fonts are inlined as data URIs rather than linked from disk. Linking made the
// render non-deterministic under load: --virtual-time-budget advances virtual
// time, but a woff2 fetch is real I/O, so with several browsers running at once
// the screenshot could fire before the face arrived and a frame would come out
// in the fallback font. Inlining removes the fetch, so a frame renders
// identically whether it runs alone or alongside five others. 80KB total.
const FONT_CACHE = {};
function fontFace(weight, file) {
  if (!FONT_CACHE[file]) {
    FONT_CACHE[file] = fs.readFileSync(path.join(FONT_DIR, file)).toString("base64");
  }
  return (
    `@font-face{font-family:Outfit;font-style:normal;font-weight:${weight};` +
    `font-display:block;src:url(data:font/woff2;base64,${FONT_CACHE[file]}) format("woff2")}`
  );
}

// setHTML + upgradeSelect, lifted verbatim so the dropdowns in the screenshots
// are the same custom control the product renders.
function panelHelpers() {
  const src = fs.readFileSync(PANEL_JS, "utf8");
  const a = src.indexOf("function setHTML(");
  const b = src.indexOf("function build(");
  if (a < 0 || b <= a) {
    throw new Error("frame-html: could not slice setHTML..build from capture-panel.js");
  }
  return src.slice(a, b);
}

function iconBlock() {
  const src = fs.readFileSync(PANEL_JS, "utf8");
  const a = src.indexOf("const ICON = {");
  const b = src.indexOf("function currentProviderId");
  return src.slice(a, b);
}

function css(theme, locale, geom) {
  const fb = FALLBACK[locale] ? "," + FALLBACK[locale] : "";
  const track = FALLBACK[locale] && locale !== "ru" ? "0" : "-.028em";
  return `
${fontFace(400, "outfit-400.woff2")}
${fontFace(500, "outfit-500.woff2")}
${fontFace(600, "outfit-600.woff2")}
${fontFace(700, "outfit-700.woff2")}
${fontFace(800, "outfit-800.woff2")}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1280px;height:800px;overflow:hidden}
body{background:${BG[theme]};font-family:Outfit${fb},"Segoe UI",system-ui,sans-serif;
  color:${COPY_INK[theme]};-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.copy{position:absolute;left:${geom.copyX}px;top:50%;transform:translateY(-50%);
  width:${geom.copyW}px}
.eyebrow{font-family:ui-monospace,Consolas,monospace;font-size:12px;font-weight:500;
  letter-spacing:.19em;color:${COPY_INK_2[theme]};margin-bottom:22px;white-space:nowrap}
h1{font-size:53px;line-height:1.1;font-weight:800;letter-spacing:${track};
  color:${COPY_INK[theme]};margin-bottom:26px}
h1 .lt{font-weight:400}
/* The body wraps narrower than the headline — measured at ~410px against a
   ~435px headline in the approved art. One shared column width collapses that
   distinction and re-wraps every paragraph. */
.body{font-size:19.5px;line-height:1.62;font-weight:400;color:${COPY_INK_2[theme]};
  max-width:${geom.bodyW}px}
.works{margin-top:40px}
.works-label{font-family:ui-monospace,Consolas,monospace;font-size:11px;font-weight:500;
  letter-spacing:.19em;color:${COPY_INK_2[theme]};margin-bottom:16px}
.works-row{display:flex;gap:26px;align-items:center}
/* Shadow host carrying the real panel, scaled to the measured frame width. */
#host{position:absolute;left:${geom.panelX}px;top:50%;
  transform:translateY(-50%) scale(${geom.scale});transform-origin:left center;
  width:${PANEL_CSS_WIDTH}px}
`;
}

const BRAND_ROW_IDS = ["claude", "chatgpt", "gemini", "perplexity"];

/**
 * @param {object} o
 *   locale, theme, geom {panelX,panelW,copyX,copyW}, frame {eyebrow,headline,body,worksWith},
 *   messages, setup — per-frame DOM script run against the shadow root
 */
function framePage(o) {
  const geom = { ...o.geom, scale: o.geom.panelW / PANEL_CSS_WIDTH };
  const markup = panelMarkup(o.messages);
  // The author's intent: one line per <br>, plus one.
  o.intendedLines = (o.frame.headline.match(/<br>/g) || []).length + 1;

  const works = o.frame.worksWith
    ? '<div class="works"><div class="works-label">' + o.frame.worksWith +
      '</div><div class="works-row" id="brandrow"></div></div>'
    : "";

  return `<!doctype html><html lang="${o.locale.replace("_", "-")}"><head><meta charset="utf-8">
<style>${css(o.theme, o.locale, geom)}</style></head><body>
<div class="copy">
  <div class="eyebrow">${o.frame.eyebrow}</div>
  <h1>${o.frame.headline}</h1>
  <div class="body">${o.frame.body}</div>
  ${works}
</div>
<div id="host"></div>
<script>
${iconBlock()}
${panelHelpers()}
var PANEL_CSS = ${JSON.stringify(panelCss() + OVERRIDE)};
var MARKUP = ${JSON.stringify(markup)};

var host = document.getElementById("host");
host.dataset.theme = ${JSON.stringify(o.theme)};
var sh = host.attachShadow({ mode: "open" });
var st = document.createElement("style");
st.textContent = PANEL_CSS;
sh.appendChild(st);
// build() creates a div.continuum-panel and fills it with the template — the
// card surface, padding, radius and shadow all live on that wrapper, so it has
// to exist here too or the panel renders as bare floating content.
var panelEl = document.createElement("div");
panelEl.className = "continuum-panel";
setHTML(panelEl, MARKUP);
sh.appendChild(panelEl);

// The real custom dropdowns, not native selects.
sh.querySelectorAll("select.cn-input").forEach(upgradeSelect);

var $ = function (s) { return sh.querySelector(s); };
var $$ = function (s) { return Array.prototype.slice.call(sh.querySelectorAll(s)); };
function show(el, on) { if (el) el.hidden = !on; }

${o.setup}

// Some locales render a taller panel than English — German settings copy in
// particular. Rather than let the card run off the 800px frame, shrink it just
// enough to fit. English is unaffected (it already fits at the designed scale),
// so the approved artwork is preserved.
// A translated headline can be far longer than the English it replaces and take
// an extra line, which breaks the composition. Shrink the type a little rather
// than re-cutting 27 headlines by hand; English sits at the design size and is
// never touched. Floor of 82% keeps it from going visibly small — measure.js
// still reports anything that cannot fit even then.
(function fitHeadline() {
  var h1 = document.querySelector("h1");
  var intended = ${JSON.stringify(o.intendedLines)};
  var size = 53;
  function lines() {
    var lh = parseFloat(getComputedStyle(h1).lineHeight) || size * 1.1;
    return Math.round(h1.getBoundingClientRect().height / lh);
  }
  while (lines() > intended && size > 53 * 0.82) {
    size -= 1;
    h1.style.fontSize = size + "px";
  }
})();

(function fit() {
  var DESIGN = ${JSON.stringify(geom.scale)};
  // The approved frame-5 panel is 789px tall in an 800px frame, so the cap has
  // to allow that much or English gets shrunk away from its signed-off size.
  var MAX_H = 790;
  var natural = panelEl.offsetHeight; // layout height, before the host transform
  var scale = Math.min(DESIGN, MAX_H / natural);
  host.style.transform = "translateY(-50%) scale(" + scale + ")";
})();

// Brand marks beside "works with", drawn with the panel's own providerLogo().
var row = document.getElementById("brandrow");
if (row) {
  ${JSON.stringify(BRAND_ROW_IDS)}.forEach(function (id) {
    var span = document.createElement("span");
    setHTML(span, providerLogo(id, 27));
    span.style.display = "flex";
    row.appendChild(span);
  });
}
</script></body></html>`;
}

module.exports = { framePage, FALLBACK, BG };
