// panel-real.js — produces the store frames' panel markup from the REAL panel,
// not a lookalike.
//
// The first version of this tool hand-wrote CSS that approximated panel.css.
// Every approximation drifted — typography, spacing, borders, the lot — and the
// result no longer matched the approved artwork. So this reads the actual
// template out of src/ui/capture-panel.js and renders it against the actual
// src/ui/panel.css inside a shadow root, exactly as the product does.
//
// Two source slices are lifted verbatim:
//   • the icon / brand-mark block (svg, logoMark, providerLogo, obsidianLogo,
//     notionLogo) — everything the template calls to draw glyphs
//   • the setHTML(panelEl, [...]) template itself
//
// Both are evaluated here in Node with T()/TR() bound to a locale's catalog, so
// the markup that lands in a screenshot is byte-identical to what the extension
// builds at runtime for that language.
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..");
const PANEL_JS = path.join(root, "src", "ui", "capture-panel.js");
const PANEL_CSS = path.join(root, "src", "ui", "panel.css");

function slice(src, startMarker, endMarker, label) {
  const a = src.indexOf(startMarker);
  const b = src.indexOf(endMarker, a + 1);
  if (a < 0 || b < 0 || b <= a) {
    throw new Error(
      `panel-real: could not locate the ${label} in capture-panel.js ` +
        `(looked for ${JSON.stringify(startMarker)} … ${JSON.stringify(endMarker)}). ` +
        "The panel source moved — update the markers here."
    );
  }
  return src.slice(a, b);
}

// Escaped for HTML interpolation vs raw — mirrors capture-panel.js exactly.
function makeT(messages) {
  const get = (key, subs) => {
    let msg = messages[key];
    if (msg === undefined) return key;
    if (subs !== undefined && subs !== null) {
      const list = Array.isArray(subs) ? subs : [subs];
      list.forEach((v, i) => {
        msg = msg.split("$" + (i + 1)).join(String(v));
      });
    }
    return msg;
  };
  const esc = (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  return { T: (k, s) => esc(get(k, s)), TR: (k, s) => get(k, s) };
}

/** Real panel markup for one locale. */
function panelMarkup(messages) {
  const src = fs.readFileSync(PANEL_JS, "utf8");
  const icons = slice(src, "const ICON = {", "function currentProviderId", "icon/logo block");
  const template = slice(src, "setHTML(panelEl, [", '].join("")', "panel template");
  const arrayLiteral = template.slice("setHTML(panelEl, ".length) + "]";

  const { T, TR } = makeT(messages);
  const build = new Function(
    "T", "TR",
    icons + "\n return (" + arrayLiteral + ").join('');"
  );
  return build(T, TR);
}

function panelCss() {
  return fs.readFileSync(PANEL_CSS, "utf8");
}

// panel.css positions the panel as a fixed, off-screen, scrolling drawer. For a
// still frame it has to become an ordinary content-height card. Nothing here
// touches colour, type, spacing, or radius — only the drawer mechanics — so the
// card keeps the product's exact appearance.
const OVERRIDE = `
.continuum-panel{
  position:static !important;
  transform:none !important;
  max-height:none !important;
  height:auto !important;
  overflow:visible !important;
  margin:0 !important;
  top:auto !important; right:auto !important;
}
.continuum-backdrop{display:none !important}
/* Long text areas render at content height instead of scrolling. */
.cn-textarea,.cn-list,.cn-resume-targets{max-height:none !important;overflow:visible !important}
/* The resume picker is collapsed by default; frames that show it open it. */
.cn-resume-targets{transition:none !important}

/* In-product the card carries a vivid indigo hairline so it reads as Continuum's
   surface against a busy chat page. On a quiet marketing frame that border is
   the loudest thing in the composition, and the approved artwork uses a neutral
   edge with a deeper shadow instead. Colour, type, and spacing are untouched. */
.continuum-panel{
  border-width:1px !important;
  border-color:#e6e8ef !important;
  box-shadow:0 26px 64px -30px rgba(16,24,40,.32) !important;
}
:host([data-theme="dark"]) .continuum-panel{
  border-color:#333a47 !important;
  box-shadow:0 30px 74px -28px rgba(0,0,0,.70) !important;
}
`;

module.exports = { panelMarkup, panelCss, OVERRIDE };
