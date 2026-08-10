// check-locales.js — cross-checks the message keys used in src/ against the
// generated catalogs. Run after touching either side:
//
//   node tools/check-locales.js
//
// Catches the two failure modes that produce no error at runtime and are easy
// to miss in review:
//   • a typo'd key — chrome.i18n returns "" and the control renders blank, or
//     our helper falls back to printing the raw key at the user.
//   • an orphaned message — copy left in i18n/ after the UI stopped using it,
//     which every future translation pass then has to keep alive for nothing.
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const SRC = path.join(root, "src");
const EN = path.join(root, "_locales", "en", "messages.json");

// Keys the manifests reference directly; they never appear in a T()/t() call.
const MANIFEST_KEYS = new Set([
  "extName",
  "extShortDescription",
  "extLongDescription",
]);

// Keys assembled at runtime rather than written as a literal, so the scan below
// cannot see them. plural() builds "uiStat<Unit><One|Other>" from its argument.
// Listed explicitly — a prefix wildcard would hide genuine orphans.
const PREAMBLE_KEYS = new Set(["preamblePdf","preambleMd","preambleBriefPdf","preambleBriefMd"]);
const DYNAMIC_KEYS = new Set([
  "uiStatMessagesOne", "uiStatMessagesOther",
  "uiStatImagesOne", "uiStatImagesOther",
  "uiStatFilesOne", "uiStatFilesOther",
]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "vendor") walk(p, out); // vendor is third-party, skip
    } else if (entry.name.endsWith(".js")) {
      out.push(p);
    }
  }
  return out;
}

const catalog = JSON.parse(fs.readFileSync(EN, "utf8"));
const defined = new Set(Object.keys(catalog));

// Matches T("key"), TR("key"), t("key"), i18n.t("key"), tEsc("key"), tRaw("key").
const CALL = /\b(?:T|TR|t|tEsc|tRaw)\(\s*"([A-Za-z0-9_]+)"/g;

const used = new Set();
const problems = [];

for (const file of walk(SRC)) {
  const text = fs.readFileSync(file, "utf8");
  let m;
  while ((m = CALL.exec(text))) {
    const key = m[1];
    used.add(key);
    if (!defined.has(key)) {
      const line = text.slice(0, m.index).split("\n").length;
      problems.push(
        `${path.relative(root, file)}:${line}: uses "${key}" — not in _locales/en`
      );
    }
  }
}

// settings.js keeps the English resume messages inline as a last-resort fallback
// (getResumePreamble() must never hand a message key to the injector). That means
// the same text lives in two places, so verify they have not drifted — a silently
// stale fallback would only surface when chrome.i18n was already unavailable.
const PREAMBLE_PAIRS = [
  ["preamblePdf", "EN_RESUME_PREAMBLE"],
  ["preambleMd", "EN_RESUME_PREAMBLE_MD"],
  ["preambleBriefPdf", "EN_RESUME_PREAMBLE_COMPRESSED"],
  ["preambleBriefMd", "EN_RESUME_PREAMBLE_COMPRESSED_MD"],
];

function checkPreambleDrift() {
  const src = fs.readFileSync(path.join(root, "src", "core", "settings.js"), "utf8");
  for (const [key, constName] of PREAMBLE_PAIRS) {
    const start = src.indexOf("const " + constName + " =");
    if (start < 0) {
      problems.push(`settings.js: ${constName} not found — preamble wiring changed`);
      continue;
    }
    // Newline-agnostic: the file may be CRLF or LF depending on how it was last
    // written, and hardcoding one silently matched nothing.
    const after = src.slice(start + ("const " + constName + " =").length);
    const stop = after.search(/;[\r\n]/);
    if (stop < 0) {
      problems.push(`settings.js: could not find the end of ${constName}`);
      continue;
    }
    let english;
    try {
      english = new Function("return (" + after.slice(0, stop) + ");")();
    } catch (e) {
      problems.push(`settings.js: could not evaluate ${constName} — ${e.message}`);
      continue;
    }
    const catalogued = catalog[key] && catalog[key].message;
    if (catalogued !== english) {
      problems.push(
        `${constName} in settings.js differs from "${key}" in _locales/en — ` +
          "update i18n/preambles.js and re-run tools/build-locales.js"
      );
    }
  }
}
checkPreambleDrift();

const orphans = [...defined].filter(
  (k) =>
    !used.has(k) && !MANIFEST_KEYS.has(k) && !DYNAMIC_KEYS.has(k) && !PREAMBLE_KEYS.has(k)
);

// A dynamic key that vanished from the catalog is just as broken as a typo, so
// verify the other direction too.
for (const k of DYNAMIC_KEYS) {
  if (!defined.has(k)) problems.push(`DYNAMIC_KEYS lists "${k}" — not in _locales/en`);
}

if (problems.length) {
  console.error(`Missing message keys (${problems.length}):\n`);
  for (const p of problems) console.error("  " + p);
}
if (orphans.length) {
  console.error(`\nDefined but never used (${orphans.length}):\n`);
  for (const o of orphans) console.error("  " + o);
}
if (problems.length || orphans.length) process.exit(1);

console.log(`OK — ${used.size} keys used, all defined; no orphans.`);
