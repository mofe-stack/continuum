// diff-vs-original.js — compares the generated ENGLISH frames against the
// approved artwork in Downloads/continuum-store-screenshots.
//
//   node tools/store-shots/diff-vs-original.js
//
// English is the control: it is the one locale where the generated frame should
// be near-identical to what was signed off. If English matches, the other ten
// differ only by their translated strings. Without this the only check was
// "does it look right to me", which is exactly how the first version drifted.
//
// Reports mean per-pixel difference and the worst horizontal bands, so a
// mismatch points at *where* rather than just how much.
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..", "..");
const MINE = path.join(root, "store-listings", "en");
const THEIRS = path.join(
  process.env.USERPROFILE || path.join("C:", "Users", "Mofe Atanda"),
  "Downloads",
  "continuum-store-screenshots"
);

// PNG decoding without a dependency: hand the pair to a headless browser, draw
// both to canvas, and let it do the arithmetic.
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

const TMP = path.join(root, "store-listings", ".diff-tmp");
fs.mkdirSync(TMP, { recursive: true });

function comparePage(aPath, bPath) {
  const url = (p) => "file:///" + p.replace(/\\/g, "/");
  return `<!doctype html><meta charset="utf-8"><body><script>
var A = new Image(), B = new Image(), done = 0;
function go(){
  if (++done < 2) return;
  var w = Math.min(A.width, B.width), h = Math.min(A.height, B.height);
  var ca = document.createElement("canvas"); ca.width = w; ca.height = h;
  var cb = document.createElement("canvas"); cb.width = w; cb.height = h;
  var xa = ca.getContext("2d"), xb = cb.getContext("2d");
  xa.drawImage(A,0,0); xb.drawImage(B,0,0);
  var da = xa.getImageData(0,0,w,h).data, db = xb.getImageData(0,0,w,h).data;
  var total = 0, bands = new Array(16).fill(0), bandN = new Array(16).fill(0);
  for (var y = 0; y < h; y++) {
    var band = Math.min(15, Math.floor(y / (h / 16)));
    for (var x = 0; x < w; x++) {
      var i = (y * w + x) * 4;
      var d = (Math.abs(da[i]-db[i]) + Math.abs(da[i+1]-db[i+1]) + Math.abs(da[i+2]-db[i+2])) / 3;
      total += d; bands[band] += d; bandN[band]++;
    }
  }
  document.title = JSON.stringify({
    size: [A.width, A.height, B.width, B.height],
    mean: +(total / (w * h)).toFixed(2),
    bands: bands.map(function(v,i){ return +(v / bandN[i]).toFixed(1); })
  });
}
A.onload = go; B.onload = go;
A.onerror = B.onerror = function(){ document.title = JSON.stringify({error:"load failed"}); };
A.src = ${JSON.stringify(url(aPath))};
B.src = ${JSON.stringify(url(bPath))};
</script></body>`;
}

function diff(n) {
  const mine = path.join(MINE, `shot-${n}.png`);
  const theirs = path.join(THEIRS, `shot-${n}.png`);
  if (!fs.existsSync(theirs)) return { error: "no original" };
  const page = path.join(TMP, `d${n}.html`);
  fs.writeFileSync(page, comparePage(mine, theirs), "utf8");
  const dom = execFileSync(
    browser,
    ["--headless=new", "--disable-gpu", "--no-sandbox", "--allow-file-access-from-files",
     "--virtual-time-budget=4000", "--user-data-dir=" + path.join(TMP, "ud"),
     "--dump-dom", "file:///" + page.replace(/\\/g, "/")],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 24 }
  );
  const m = dom.match(/<title>(.*?)<\/title>/);
  if (!m) return { error: "probe did not run" };
  try {
    return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  } catch (e) {
    return { error: "unparsable: " + m[1].slice(0, 60) };
  }
}

console.log("Generated EN vs approved artwork (mean per-pixel difference, 0-255)\n");
let worst = 0;
for (let n = 1; n <= 5; n++) {
  const r = diff(n);
  if (r.error) {
    console.log(`  shot-${n}  ${r.error}`);
    continue;
  }
  worst = Math.max(worst, r.mean);
  const verdict = r.mean < 4 ? "close" : r.mean < 12 ? "check" : "OFF";
  console.log(`  shot-${n}  mean ${String(r.mean).padStart(6)}  ${verdict}`);
  if (r.mean >= 4) {
    const top = r.bands
      .map((v, i) => [v, i])
      .sort((a, b) => b[0] - a[0])
      .slice(0, 3)
      .map(([v, i]) => `y${i * 50}-${(i + 1) * 50}:${v}`)
      .join("  ");
    console.log(`            worst bands  ${top}`);
  }
}
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\nworst frame mean: ${worst.toFixed(2)}`);
