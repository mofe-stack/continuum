// render.js — renders the localized Chrome Web Store screenshots.
//
//   node tools/store-shots/render.js            # all locales
//   node tools/store-shots/render.js es de ja   # just these
//
// Output: store-listings/<locale>/shot-1..5.png (1280×800, the size the store
// wants) plus listing.txt, which holds the title, short description, and the
// detailed description to paste into the dashboard for that language.
//
// Rendering goes through headless Edge (Chromium) rather than a screenshot
// library so the toolchain stays dependency-free — the repo has no node_modules
// and this keeps it that way.
"use strict";

const fs = require("fs");
const path = require("path");
const { runPool, DEFAULT_WORKERS, cleanup } = require("./pool.js");

const { LISTING, LOCALES } = require("../../i18n/listing.js");
const { FRAMES } = require("../../i18n/frames.js");
const { framePage } = require("./frame-html.js");
const { FRAMES_SPEC } = require("./frames-spec.js");

const root = path.join(__dirname, "..", "..");
const OUT = path.join(root, "store-listings");
const TMP = path.join(OUT, ".render-tmp");

const BROWSERS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];

function findBrowser() {
  const found = BROWSERS.find((p) => fs.existsSync(p));
  if (!found) {
    console.error("No Chromium browser found. Looked in:\n  " + BROWSERS.join("\n  "));
    process.exit(1);
  }
  return found;
}

// _locales/<locale>/messages.json → { key: "text" }, plus the couple of derived
// labels the mocks need pre-substituted.
function messagesFor(locale) {
  const file = path.join(root, "_locales", locale, "messages.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const m = {};
  for (const [k, v] of Object.entries(raw)) m[k] = v.message;
  m.uiDownloadPDF = m.uiDownloadFmt.replace("$1", "PDF");
  return m;
}

function page(locale, index) {
  const spec = FRAMES_SPEC[index];
  const messages = messagesFor(locale);
  return framePage({
    locale,
    theme: spec.theme,
    geom: spec.geom,
    frame: FRAMES[locale][index],
    messages,
    setup: spec.setup(messages),
  });
}

function shootArgs(htmlFile, outFile, workerId) {
  return [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--allow-file-access-from-files", // @font-face from file:// otherwise blocks
    "--virtual-time-budget=4000", // let Outfit finish loading before capture
    // One profile per worker — concurrent Chromium processes sharing a profile
    // is what corrupts runs.
    "--user-data-dir=" + path.join(TMP, "udata-" + workerId),
    "--window-size=1280,800",
    "--screenshot=" + outFile,
    "file:///" + htmlFile.replace(/\\/g, "/"),
  ];
}

function listingText(locale) {
  const l = LISTING[locale];
  return (
    "LOCALE: " + locale + "\n" +
    "=".repeat(64) + "\n\n" +
    "NAME (" + [...l.name].length + "/75)\n" + l.name + "\n\n" +
    "SHORT DESCRIPTION — Chrome Web Store (" + [...l.short].length + "/132)\n" +
    l.short + "\n\n" +
    "SUMMARY — Firefox AMO (" + [...l.long].length + "/250)\n" + l.long + "\n\n" +
    "DETAILED DESCRIPTION — paste into the dashboard\n" +
    "-".repeat(64) + "\n" + l.detailed + "\n\n" +
    "SCREENSHOTS: shot-1.png … shot-5.png (1280×800), upload in that order.\n" +
    "NOTE: name and short description also ship inside the package via\n" +
    "_locales/" + locale + "/messages.json — the store reads them from there.\n" +
    "Only the detailed description and these images are entered by hand.\n"
  );
}

const targets = process.argv.slice(2).filter((a) => LOCALES.includes(a));
const locales = targets.length ? targets : LOCALES;
const browser = findBrowser();

fs.mkdirSync(TMP, { recursive: true });

// Build every page up front, then render the lot through the pool.
const jobs = [];
for (const locale of locales) {
  const dir = path.join(OUT, locale);
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < FRAMES_SPEC.length; i++) {
    const htmlFile = path.join(TMP, locale + "-" + (i + 1) + ".html");
    fs.writeFileSync(htmlFile, page(locale, i), "utf8");
    jobs.push({ locale, htmlFile, out: path.join(dir, "shot-" + (i + 1) + ".png") });
  }
  fs.writeFileSync(path.join(dir, "listing.txt"), listingText(locale), "utf8");
}

const done = {};
runPool(
  jobs,
  (job, workerId) => ({ file: browser, args: shootArgs(job.htmlFile, job.out, workerId) }),
  (job) => {
    done[job.locale] = (done[job.locale] || 0) + 1;
    if (done[job.locale] === FRAMES_SPEC.length) {
      console.log("  " + job.locale.padEnd(6) + " 5 shots + listing.txt");
    }
  }
)
  .then(() => {
    cleanup(TMP);
    console.log(
      "\n" + jobs.length + " screenshots across " + locales.length +
      " locales → store-listings/  (" + DEFAULT_WORKERS + " workers)"
    );
  })
  .catch((err) => {
    console.error("\nRender failed: " + err.message);
    process.exit(1);
  });
