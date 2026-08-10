// build-locales.js — generates _locales/<locale>/messages.json from the tables
// in i18n/. Run it after editing any string; the generated files are committed
// because Chrome and Firefox read them straight out of the package.
//
//   node tools/build-locales.js
//
// Why generate instead of hand-writing 11 JSON files: every copy change would
// otherwise mean 11 edits kept manually in sync, and a locale silently missing
// a key falls back to English without telling anyone. Here the tables are
// key-major, so a missing translation is visible at a glance and fatal at
// build time (see checkComplete below).
"use strict";

const fs = require("fs");
const path = require("path");

const { LISTING, LOCALES, DEFAULT_LOCALE } = require("../i18n/listing.js");
const { UI } = require("../i18n/ui.js");
const { UI_SETTINGS } = require("../i18n/ui-settings.js");

const root = path.join(__dirname, "..");
const OUTDIR = path.join(root, "_locales");

// Chrome Web Store / AMO hard limits. Exceeding them is a store-side rejection,
// so it fails here rather than on upload.
const CAPS = { extName: 75, extShortDescription: 132, extLongDescription: 250 };

const UI_TABLES = { ...UI, ...UI_SETTINGS };

const errors = [];

// Chrome treats "$" specially in messages ($1..$9 are substitutions, "$$" is a
// literal dollar). A stray "$" silently eats the next character, so catch it.
function checkDollars(locale, key, text) {
  const stray = text.replace(/\$[1-9]/g, "").replace(/\$\$/g, "");
  if (stray.includes("$")) {
    errors.push(`${locale}/${key}: stray "$" — write "$$" for a literal dollar`);
  }
}

// Every key must exist in every locale. A gap here means Chrome quietly serves
// the English string, which reads as a half-finished translation to the user.
function checkComplete() {
  for (const [key, byLocale] of Object.entries(UI_TABLES)) {
    for (const locale of LOCALES) {
      if (typeof byLocale[locale] !== "string" || !byLocale[locale].trim()) {
        errors.push(`${locale}/${key}: missing translation`);
      }
    }
    // Substitution counts must match, or a translated string drops an argument
    // and renders "Delete ()" or similar.
    const expected = (byLocale[DEFAULT_LOCALE].match(/\$[1-9]/g) || []).sort().join("");
    for (const locale of LOCALES) {
      const got = ((byLocale[locale] || "").match(/\$[1-9]/g) || []).sort().join("");
      if (got !== expected) {
        errors.push(
          `${locale}/${key}: placeholders "${got || "none"}" ≠ "${expected || "none"}" in ${DEFAULT_LOCALE}`
        );
      }
    }
  }
}

function messagesFor(locale) {
  const listing = LISTING[locale];
  const out = {
    extName: {
      message: listing.name,
      description: "Extension name — shown as the store listing title.",
    },
    extShortDescription: {
      message: listing.short,
      description: "Chrome Web Store short description (max 132 characters).",
    },
    extLongDescription: {
      message: listing.long,
      description: "Firefox/AMO summary (max 250 characters).",
    },
  };

  for (const [key, byLocale] of Object.entries(UI_TABLES)) {
    const message = byLocale[locale];
    if (typeof message === "string") {
      checkDollars(locale, key, message);
      out[key] = { message };
    }
  }

  for (const [key, cap] of Object.entries(CAPS)) {
    const len = [...out[key].message].length;
    if (len > cap) errors.push(`${locale}/${key}: ${len} chars > ${cap} limit`);
  }

  return out;
}

checkComplete();

const written = [];
for (const locale of LOCALES) {
  const dir = path.join(OUTDIR, locale);
  const json = JSON.stringify(messagesFor(locale), null, 2) + "\n";
  if (errors.length === 0) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "messages.json"), json, "utf8");
    written.push(locale);
  }
}

if (errors.length) {
  console.error("Locale build FAILED — " + errors.length + " problem(s):\n");
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}

const keyCount = Object.keys(UI_TABLES).length + 3;
console.log(
  `Wrote _locales for ${written.length} locales × ${keyCount} keys: ${written.join(", ")}`
);
