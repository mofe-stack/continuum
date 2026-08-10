// tests/i18n-defaults.test.js — vanilla Node + assert, no framework.
//
// Run with:  node tests/i18n-defaults.test.js
//
// Guards the thing that is invisible until a real user in another country
// installs the extension: on a FRESH install, settings.js writes the default
// resume message into storage, and that default must already be in the user's
// language. If the i18n lookup silently fell back to English, nobody would
// notice locally — the stored value is only written once, so the mistake would
// ship and then persist in every affected profile.
//
// settings.js is a DOM IIFE. We run it against a stubbed window + chrome, with
// chrome.i18n backed by a real _locales catalog, and read back what it exported.

"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SETTINGS_SRC = fs.readFileSync(path.join(ROOT, "src", "core", "settings.js"), "utf8");
const I18N_SRC = fs.readFileSync(path.join(ROOT, "src", "core", "i18n.js"), "utf8");

function catalogFor(locale) {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT, "_locales", locale, "messages.json"), "utf8")
  );
}

// Boots i18n.js + settings.js the way the manifest does (i18n first), with
// chrome.i18n serving the given locale. Pass locale=null to simulate chrome.i18n
// being unavailable entirely.
function loadSettings(locale) {
  const win = {};
  const catalog = locale ? catalogFor(locale) : null;
  const chrome = {
    i18n: catalog
      ? {
          getMessage(key, subs) {
            const entry = catalog[key];
            if (!entry) return "";
            let msg = entry.message;
            (subs || []).forEach((v, i) => {
              msg = msg.split("$" + (i + 1)).join(String(v));
            });
            return msg;
          },
        }
      : undefined,
    storage: { local: { get() {}, set() {} } },
    runtime: {},
  };
  new Function("window", "chrome", I18N_SRC + "\n" + SETTINGS_SRC)(win, chrome);
  return win.Continuum.settings;
}

let passed = 0, failed = 0;
function run(label, fn) {
  try { fn(); passed++; console.log("  PASS  " + label); }
  catch (e) { failed++; console.log("  FAIL  " + label); console.log("        " + e.message); }
}

console.log("Localized defaults on a fresh install:");

const LOCALES = fs.readdirSync(path.join(ROOT, "_locales"));

// The four resume messages, and the catalog key each should resolve from.
const PAIRS = [
  ["DEFAULT_RESUME_PREAMBLE", "preamblePdf"],
  ["DEFAULT_RESUME_PREAMBLE_MD", "preambleMd"],
  ["DEFAULT_RESUME_PREAMBLE_COMPRESSED", "preambleBriefPdf"],
  ["DEFAULT_RESUME_PREAMBLE_COMPRESSED_MD", "preambleBriefMd"],
];

for (const locale of LOCALES) {
  run(`${locale}: all four defaults come from the ${locale} catalog`, () => {
    const S = loadSettings(locale);
    const catalog = catalogFor(locale);
    for (const [exported, key] of PAIRS) {
      assert.strictEqual(
        S[exported],
        catalog[key].message,
        `${exported} did not match "${key}" in _locales/${locale}`
      );
    }
  });
}

run("a non-English locale genuinely differs from English", () => {
  const es = loadSettings("es");
  const en = loadSettings("en");
  assert.notStrictEqual(
    es.DEFAULT_RESUME_PREAMBLE,
    en.DEFAULT_RESUME_PREAMBLE,
    "Spanish default is identical to English — the lookup is falling through"
  );
  assert.ok(/Contin[uú]a/.test(es.DEFAULT_RESUME_PREAMBLE), "Spanish default is not Spanish");
});

run("the attachment filename stays literal in every locale", () => {
  for (const locale of LOCALES) {
    const S = loadSettings(locale);
    assert.ok(
      S.DEFAULT_RESUME_PREAMBLE.includes("conversation-history.pdf"),
      `${locale}: PDF default lost the conversation-history.pdf filename`
    );
    assert.ok(
      S.DEFAULT_RESUME_PREAMBLE_MD.includes("conversation-history.md"),
      `${locale}: Markdown default lost the conversation-history.md filename`
    );
  }
});

run("the brief's English section names survive translation", () => {
  const SECTIONS = ["Completed work", "Current state", "In progress", "Next steps",
    "Constraints", "Critical context", "Discarded attempts"];
  for (const locale of LOCALES) {
    const S = loadSettings(locale);
    for (const section of SECTIONS) {
      assert.ok(
        S.DEFAULT_RESUME_PREAMBLE_COMPRESSED.includes(section),
        `${locale}: brief default lost the "${section}" heading`
      );
    }
  }
});

run("falls back to English when chrome.i18n is unavailable", () => {
  const S = loadSettings(null);
  assert.ok(
    S.DEFAULT_RESUME_PREAMBLE.startsWith("Continue from our previous conversation."),
    "fallback did not produce the English default"
  );
  assert.ok(
    !/^preamble/.test(S.DEFAULT_RESUME_PREAMBLE),
    "fallback leaked a message KEY — that would be injected into the user's chat"
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
