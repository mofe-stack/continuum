// measure.js — layout QA for the store frames, across every locale.
//
//   node tools/store-shots/measure.js
//
// Eyeballing 55 screenshots does not scale, and the failure mode is specific: a
// translation runs longer than the English it replaced, the headline takes an
// extra line, and the composition breaks — or the panel outgrows the 800px frame
// and the bottom is cropped away.
//
// So the page measures itself. Each frame is rendered with a probe appended,
// --dump-dom returns the DOM after it ran, and the numbers come back on the
// title. Nothing is written to disk.
//
// Pairs with diff-vs-original.js, which checks the ENGLISH frames against the
// approved artwork. This one checks that the other ten still fit.
"use strict";

const fs = require("fs");
const path = require("path");
const { runPool } = require("./pool.js");

const { LOCALES } = require("../../i18n/listing.js");
const { FRAMES } = require("../../i18n/frames.js");
const { FRAMES_SPEC } = require("./frames-spec.js");
const { framePage } = require("./frame-html.js");

const root = path.join(__dirname, "..", "..");
const TMP = path.join(root, "store-listings", ".measure-tmp");
const FRAME_H = 800;

function messagesFor(locale) {
  const raw = JSON.parse(
    fs.readFileSync(path.join(root, "_locales", locale, "messages.json"), "utf8")
  );
  const m = {};
  for (const [k, v] of Object.entries(raw)) m[k] = v.message;
  m.uiDownloadPDF = m.uiDownloadFmt.replace("$1", "PDF");
  return m;
}

const PROBE = `
var h1 = document.querySelector("h1");
var cs = getComputedStyle(h1);
var lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.1;
var copy = document.querySelector(".copy");
var pr = sh.querySelector(".continuum-panel").getBoundingClientRect();
document.title = JSON.stringify({
  h1Lines: Math.round(h1.getBoundingClientRect().height / lh),
  copyH: Math.round(copy.getBoundingClientRect().height),
  panelH: Math.round(pr.height),
  panelBottom: Math.round(pr.bottom),
  panelTop: Math.round(pr.top)
});
</script></body>`;

const BROWSERS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
];
const browser = BROWSERS.find((p) => fs.existsSync(p));
if (!browser) {
  console.error("No Chromium browser found.");
  process.exit(1);
}

fs.mkdirSync(TMP, { recursive: true });
const problems = [];

const jobs = [];
for (const locale of LOCALES) {
  const messages = messagesFor(locale);
  for (let i = 0; i < FRAMES_SPEC.length; i++) {
    const spec = FRAMES_SPEC[i];
    const html = framePage({
      locale,
      theme: spec.theme,
      geom: spec.geom,
      frame: FRAMES[locale][i],
      messages,
      setup: spec.setup(messages),
    }).replace("</script></body>", PROBE);

    const file = path.join(TMP, `${locale}-${i + 1}.html`);
    fs.writeFileSync(file, html, "utf8");
    jobs.push({ locale, index: i, file });
  }
}

runPool(
  jobs,
  (job, workerId) => ({
    file: browser,
    args: ["--headless=new", "--disable-gpu", "--no-sandbox", "--allow-file-access-from-files",
      "--virtual-time-budget=3000",
      "--user-data-dir=" + path.join(TMP, "ud-" + workerId),
      "--window-size=1280,800", "--dump-dom",
      "file:///" + job.file.replace(/\\/g, "/")],
  }),
  (job, dom) => {
    const where = `${job.locale} frame ${job.index + 1}`;
    const match = dom.match(/<title>(.*?)<\/title>/);
    if (!match) {
      problems.push(`${where}: probe did not run`);
      return;
    }
    const m = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
    const intended =
      (FRAMES[job.locale][job.index].headline.match(/<br>/g) || []).length + 1;
    if (m.h1Lines > intended) {
      problems.push(`${where}: headline wraps to ${m.h1Lines} lines, authored for ${intended}`);
    }
    if (m.panelH > FRAME_H) {
      problems.push(`${where}: panel ${m.panelH}px > ${FRAME_H}px — clipped`);
    }
    if (m.copyH > FRAME_H) {
      problems.push(`${where}: copy column ${m.copyH}px > ${FRAME_H}px`);
    }
  }
).then(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
  if (problems.length) {
    problems.sort();
    console.error(`${problems.length} layout problem(s):\n`);
    for (const p of problems) console.error("  " + p);
    process.exit(1);
  }
  console.log(`All ${LOCALES.length * FRAMES_SPEC.length} frames fit.`);
}).catch((err) => {
  console.error("Measure failed: " + err.message);
  process.exit(1);
});
