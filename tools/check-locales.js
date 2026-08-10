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

const orphans = [...defined].filter(
  (k) => !used.has(k) && !MANIFEST_KEYS.has(k) && !DYNAMIC_KEYS.has(k)
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
