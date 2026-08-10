// frames-spec.js — geometry and per-frame DOM setup for the five store frames.
//
// Geometry is measured off the approved English artwork in
// Downloads/continuum-store-screenshots (see frame-html.js for the table), not
// chosen by eye. Each `setup` is JavaScript that runs in the frame page against
// the real panel inside its shadow root: it picks the view, fills the sample
// data, and hides the rows that frame does not show.
//
// Sample content is identical in every locale — it stands in for the user's own
// data, which Continuum never translates.
"use strict";

// Read from settings.js so the frame can never show a stale hand-off message.
function defaultPreamble() {
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(
    path.join(__dirname, "..", "..", "src", "core", "settings.js"), "utf8"
  );
  // settings.js uses CRLF, hence \r?\n rather than a bare \n.
  const m = src.match(/const DEFAULT_RESUME_PREAMBLE\s*=\s*([\s\S]*?);\r?\n/);
  if (!m) throw new Error("frames-spec: DEFAULT_RESUME_PREAMBLE not found in settings.js");
  // The literal is a run of concatenated quoted strings — evaluate it as one.
  return new Function("return (" + m[1] + ");")();
}
const DEFAULT_PREAMBLE = defaultPreamble();

const SAMPLE = {
  ragBot: "Building a RAG WhatsApp Bot",
  troubleshoot: "Troubleshooting an error",
  tone: "Professionalizing Message Tone",
  floating: "Identifying a Floating Input W…",
  solar: "Solar panel ROI calculation for river walk redesign",
};

// The chip markup showDetail() builds, reproduced with the panel's own svg().
function statChips(messages, counts) {
  const one = (n, unit) =>
    messages["uiStat" + unit + (n === 1 ? "One" : "Other")].replace("$1", n);
  return (
    '<span class="cn-stat">\' + svg("message", 15) + \'<span>' + one(counts.m, "Messages") + "</span></span>" +
    '<span class="cn-stat">\' + svg("image", 15) + \'<span>' + one(counts.i, "Images") + "</span></span>" +
    '<span class="cn-stat">\' + svg("file", 15) + \'<span>' + one(counts.f, "Files") + "</span></span>"
  );
}

const HIDE_DETAIL_ACTIONS = `
["[data-compress-row]","[data-tooshort]","[data-addfiles-row]","[data-addimages-row]",
 "[data-copy]","[data-download-resume]","[data-savefile]","[data-delete]"]
  .forEach(function(s){ var e=$(s); if(e) e.hidden = true; });
`;

const VIEW = `
function view(which){
  show($("[data-view-main]"), which==="main");
  show($("[data-view-detail]"), which==="detail");
  show($("[data-view-settings]"), which==="settings");
}
// Settings sections in template order:
// 0 stats,1 hr,2 sync,3 hr,4 theme,5 hr,6 resume,7 hr,8 message,9 hr,10 ai,11 hr,12 reset
function settingsOnly(keep){
  var kids = Array.prototype.slice.call($("[data-view-settings]").children);
  kids.forEach(function(el,i){ el.style.display = keep.indexOf(i)===-1 ? "none" : ""; });
}
`;

const FRAMES_SPEC = [
  // ── 1 · dark · detail with the resume picker open ──────────────────────
  {
    theme: "dark",
    geom: { panelX: 734, panelW: 375, copyX: 118, copyW: 520, bodyW: 415 },
    setup: (m) => `${VIEW}
view("detail");
$("[data-back]").hidden = false;
$("[data-d-title]").textContent = ${JSON.stringify(SAMPLE.ragBot)};
setHTML($("[data-d-dates]"), "Saved Jun 2, 2026 · 1:15 AM");
setHTML($("[data-d-stats]"), '${statChips(m, { m: 6, i: 1, f: 0 })}');
$("[data-resume-wrap]").classList.add("cn-resume-open");
${HIDE_DETAIL_ACTIONS}`,
  },

  // ── 2 · light · main view with the saved library ───────────────────────
  {
    theme: "light",
    geom: { panelX: 158, panelW: 400, copyX: 682, copyW: 470, bodyW: 415 },
    setup: (m) => `${VIEW}
view("main");
$("[data-back]").hidden = true;
$("[data-chat-title]").textContent = ${JSON.stringify(SAMPLE.troubleshoot)};
$("[data-chat-stats]").textContent = ${JSON.stringify(
      m.uiStatMessagesOther.replace("$1", 124) + " · " +
      m.uiStatImagesOther.replace("$1", 37) + " · " +
      m.uiStatFilesOne.replace("$1", 1)
    )};
$("[data-chat-started]").textContent = "Started Jun 20, 2026";
$("[data-saved-label]").textContent = ${JSON.stringify(m.uiSavedSessionsCount.replace("$1", 3))};
$("[data-select-toggle]").hidden = false;
$("[data-search-row]").hidden = false;

// The folder tree, using makeFolder()'s own class names.
function folder(name, logo, count, depth){
  return '<div class="cn-folder-head" style="--cn-depth:'+depth+'">'
    + '<span class="cn-folder-chevron">' + svg("chevron", 16) + '</span>'
    + '<span class="cn-folder-name">' + name + '</span>'
    + (logo ? '<span class="cn-folder-logo">' + providerLogo(logo, 13) + '</span>' : '')
    + (count!=null ? '<span class="cn-folder-count">(' + count + ')</span>' : '')
    + '<button class="cn-folder-export">' + svg("download", 15) + '</button></div>';
}
// makeSessionRow(): div.cn-item holding .cn-item-title + .cn-item-date.
function leaf(title, date){
  return '<div class="cn-item" style="--cn-depth:2">'
    + '<span class="cn-item-title">' + title + '</span>'
    + '<span class="cn-item-date">' + date + '</span></div>';
}
setHTML($("[data-list]"),
  folder(${JSON.stringify(m.uiAllSavedChats)}, null, null, 0)
  + folder("Claude", "claude", 1, 1) + leaf(${JSON.stringify(SAMPLE.troubleshoot)}, "Jun 21, 2026")
  + folder("ChatGPT", "chatgpt", 1, 1) + leaf(${JSON.stringify(SAMPLE.tone)}, "Jun 21, 2026")
  + folder("Gemini", "gemini", 1, 1) + leaf(${JSON.stringify(SAMPLE.floating)}, "Jun 21, 2026")
);`,
  },

  // ── 3 · light · detail with the full action list ───────────────────────
  {
    theme: "light",
    geom: { panelX: 735, panelW: 374, copyX: 118, copyW: 470, bodyW: 398 },
    setup: (m) => `${VIEW}
view("detail");
$("[data-back]").hidden = false;
$("[data-d-title]").textContent = ${JSON.stringify(SAMPLE.solar)};
setHTML($("[data-d-dates]"), "Started May 17, 2026<br>Saved Jun 2, 2026 · 1:14 AM");
setHTML($("[data-d-stats]"), '${statChips(m, { m: 108, i: 26, f: 1 })}');
$("[data-addfiles-row]").hidden = false;
["[data-tooshort]","[data-addimages-row]"].forEach(function(s){ var e=$(s); if(e) e.hidden = true; });`,
  },

  // ── 4 · light · settings, AI-compression section only ──────────────────
  // The approved frame crops above the header, so it is hidden here too.
  {
    theme: "light",
    geom: { panelX: 158, panelW: 400, copyX: 682, copyW: 470, bodyW: 415 },
    setup: () => `${VIEW}
view("settings");
$(".cn-header").style.display = "none";
settingsOnly([10, 11, 12]);
// A filled key field, as in the approved frame. Dots only — never a real key.
var key = $("[data-api-key]");
if (key) { key.value = "0000000000000000000000000000000000000"; }`,
  },

  // ── 5 · dark · settings, theme + resume + resume message ───────────────
  {
    theme: "dark",
    geom: { panelX: 721, panelW: 402, copyX: 118, copyW: 520, bodyW: 440 },
    setup: () => `${VIEW}
view("settings");
$("[data-back]").hidden = false;
settingsOnly([4, 5, 6, 7, 8]);
// The approved frame shows the default hand-off message in full, at content
// height rather than scrolled. It stays ENGLISH in every locale: this is the
// text Continuum types into the next chat, and the shipped default is English
// until the user edits it.
var ta = $("[data-resume-preamble]");
if (ta) {
  ta.value = ${JSON.stringify(DEFAULT_PREAMBLE)};
  ta.style.height = "auto";
  ta.style.height = ta.scrollHeight + "px";
  ta.style.overflow = "hidden";
}
var themeSw = $("[data-theme-toggle]"); if (themeSw) themeSw.checked = true;`,
  },
];

module.exports = { FRAMES_SPEC, SAMPLE };
