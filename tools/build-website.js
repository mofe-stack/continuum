// build-website.js — generates the localized landing pages under website/<locale>/.
//
//   node tools/build-website.js            # build all locales
//   node tools/build-website.js --check    # verify translation keys still match
//
// HOW THE LANGUAGE ROUTING WORKS
//   /            English, and the only path Netlify language-detects on. A
//                visitor whose Accept-Language is Spanish gets bounced to /es/.
//   /en/ … /tr/  One static page per language. These are never redirected, so
//                the header switcher can always override detection — the classic
//                failure where picking "English" bounces you straight back to
//                your browser language cannot happen here.
//
// Each page carries its own <title> and <meta description> (this is what shows
// in a search result, and the reason the whole exercise is worth doing) plus a
// full hreflang set so Google indexes them as alternates rather than duplicates.
//
// Sample data in the hero mock — chat titles, dates — is deliberately left in
// English; it stands in for the user's own content, which Continuum never
// translates. See i18n/site.js.
"use strict";

const fs = require("fs");
const path = require("path");

const { SITE } = require("../i18n/site.js");
const { SITE2 } = require("../i18n/site2.js");
const { LISTING } = require("../i18n/listing.js");

const root = path.join(__dirname, "..");
const SITE_DIR = path.join(root, "website");
const SRC = path.join(SITE_DIR, "index.html");
const BASE_URL = "https://continuum-capture.netlify.app";

const LOCALES = Object.keys(LISTING); // en first, then the ten translations
const TRANSLATIONS = { ...SITE, ...SITE2 };

// Seven strings the hero's mock panel shares with the real extension. Pulling
// them from the shipped catalog means the marketing page can never claim a
// label the product does not use.
const FROM_EXTENSION = {
  Review: "uiReview",
  "Current chat": "uiCurrentChat",
  "Capture this session": "uiCaptureSession",
  Select: "uiSelect",
  "Search saved chats": "uiSearchSaved",
  "All saved chats": "uiAllSavedChats",
};

function extensionStrings(locale) {
  const raw = JSON.parse(
    fs.readFileSync(path.join(root, "_locales", locale, "messages.json"), "utf8")
  );
  const out = {};
  for (const [english, key] of Object.entries(FROM_EXTENSION)) {
    if (raw[key]) out[english] = raw[key].message;
  }
  return out;
}

// Netlify serves the localized pages from a subdirectory, so document-relative
// asset and page links need one level up. Anchors, absolute paths, and external
// URLs are left alone.
function reroot(html) {
  return html.replace(
    /\b(href|src)="(?!https?:|\/\/|\/|#|data:|mailto:)([^"]+)"/g,
    (_, attr, url) => `${attr}="../${url}"`
  );
}

function hreflang(currentLocale) {
  const tag = (loc) => loc.replace("_", "-").toLowerCase();
  const lines = LOCALES.map(
    (loc) =>
      `  <link rel="alternate" hreflang="${tag(loc)}" href="${BASE_URL}/${loc}/" />`
  );
  lines.push(`  <link rel="alternate" hreflang="x-default" href="${BASE_URL}/" />`);
  const canonical =
    currentLocale === null
      ? `${BASE_URL}/`
      : `${BASE_URL}/${currentLocale}/`;
  lines.unshift(`  <link rel="canonical" href="${canonical}" />`);
  return "\n<!-- i18n:hreflang -->\n" + lines.join("\n") + "\n<!-- /i18n:hreflang -->\n";
}

const NATIVE_NAME = {
  en: "English", es: "Español", pt_BR: "Português", de: "Deutsch",
  fr: "Français", ja: "日本語", zh_CN: "简体中文", ru: "Русский",
  ko: "한국어", it: "Italiano", tr: "Türkçe",
};

// A plain <select> that navigates on change. No framework, no fetch, and it
// still works as a labelled control for a screen reader.
function switcher(currentLocale) {
  const options = LOCALES.map(
    (loc) =>
      `<option value="/${loc}/"${loc === currentLocale ? " selected" : ""}>` +
      NATIVE_NAME[loc] +
      "</option>"
  ).join("");
  return (
    "\n<!-- i18n:switcher -->\n" +
    '<div class="lang-switch">' +
    '<label class="sr-only" for="lang-select">Language</label>' +
    '<select id="lang-select" onchange="location.href=this.value">' +
    options +
    "</select></div>\n" +
    "<style>.lang-switch{position:fixed;right:16px;bottom:16px;z-index:50}" +
    ".lang-switch select{font:inherit;font-size:13px;padding:7px 10px;border-radius:8px;" +
    "border:1px solid rgba(128,128,128,.35);background:rgba(255,255,255,.92);" +
    "color:#1f2937;cursor:pointer}" +
    "@media (prefers-color-scheme:dark){.lang-switch select{background:rgba(27,31,39,.92);" +
    "color:#e5e7eb;border-color:rgba(200,200,200,.25)}}" +
    ".sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}" +
    "</style>\n<!-- /i18n:switcher -->\n"
  );
}

// Replaces a marked block if present, otherwise inserts before `anchor`. Keeps
// repeat runs idempotent instead of stacking duplicate blocks.
function upsert(html, name, block, anchor) {
  const re = new RegExp(`\\n?<!-- i18n:${name} -->[\\s\\S]*?<!-- /i18n:${name} -->\\n?`);
  if (re.test(html)) return html.replace(re, block);
  return html.replace(anchor, block + anchor);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// A translatable run is text sitting between two tags, possibly indented across
// lines ("<a>\n  Add to Chrome\n</a>"), or the whole value of a content=""
// attribute. Surrounding whitespace is preserved so the generated HTML keeps
// the source formatting.
function textNodeRe(english) {
  return new RegExp("(>)(\\s*)" + escapeRe(english) + "(\\s*)(<)", "g");
}
function attrRe(english) {
  return new RegExp('(content=")' + escapeRe(english) + '(")', "g");
}

function occursIn(html, english) {
  return textNodeRe(english).test(html) || attrRe(english).test(html);
}

function translate(html, locale) {
  const ext = extensionStrings(locale);
  const missing = [];

  // Longest first: "Resume on any AI platform." must not be partially eaten by
  // the shorter "Resume" key.
  const entries = [
    ...Object.entries(ext),
    ...Object.entries(TRANSLATIONS).map(([en, byLoc]) => [en, byLoc[locale]]),
  ].sort((a, b) => b[0].length - a[0].length);

  let out = html;
  for (const [english, translated] of entries) {
    if (!translated) {
      missing.push(english);
      continue;
    }
    out = out.replace(textNodeRe(english), (_, gt, w1, w2, lt) => gt + w1 + translated + w2 + lt);
    out = out.replace(attrRe(english), (_, pre, post) => pre + translated + post);
  }
  return { html: out, missing };
}

// ── --check: has an English edit orphaned any translation? ────────────────
if (process.argv.includes("--check")) {
  const src = fs.readFileSync(SRC, "utf8");
  const orphans = Object.keys(TRANSLATIONS).filter((k) => !occursIn(src, k));
  if (orphans.length) {
    console.error(`${orphans.length} translation key(s) no longer match index.html:\n`);
    for (const o of orphans) console.error("  " + JSON.stringify(o));
    process.exit(1);
  }
  console.log(`OK — all ${Object.keys(TRANSLATIONS).length} keys still present in index.html.`);
  process.exit(0);
}

// ── Build ─────────────────────────────────────────────────────────────────
const source = fs.readFileSync(SRC, "utf8");
let totalMissing = 0;

for (const locale of LOCALES) {
  const dir = path.join(SITE_DIR, locale);
  fs.mkdirSync(dir, { recursive: true });

  const { html, missing } = translate(source, locale);
  // The tables are keyed BY the English string, so English has no entries and
  // "falls back" to itself by definition. Only real gaps are worth counting.
  const gaps = locale === "en" ? [] : missing;
  totalMissing += gaps.length;

  let page = reroot(html)
    .replace(/<html lang="[^"]*"/, '<html lang="' + locale.replace("_", "-") + '"')
    .replace(/<html(?!\s+lang)/, '<html lang="' + locale.replace("_", "-") + '"');

  page = upsert(page, "hreflang", hreflang(locale), "</head>");
  page = upsert(page, "switcher", switcher(locale), "</body>");

  fs.writeFileSync(path.join(dir, "index.html"), page, "utf8");
  console.log(
    "  " + locale.padEnd(6) + " website/" + locale + "/index.html" +
    (gaps.length ? "  (" + gaps.length + " untranslated)" : "")
  );
}

// The English root keeps the same hreflang set and switcher so search engines
// see one alternates group and visitors can switch from the entry page.
let rootPage = fs.readFileSync(SRC, "utf8");
rootPage = upsert(rootPage, "hreflang", hreflang(null), "</head>");
rootPage = upsert(rootPage, "switcher", switcher("en"), "</body>");
fs.writeFileSync(SRC, rootPage, "utf8");
console.log("  root   website/index.html (hreflang + switcher)");

console.log(
  "\n" + LOCALES.length + " localized pages built" +
  (totalMissing ? " — " + totalMissing + " string(s) fell back to English" : "")
);
