// build-chrome.js — packages the Chrome/Opera/Edge build from the shared source.
//
// It copies the source AS-IS — no transforming, minifying, bundling, or code
// generation. The Chrome manifest (manifest.chrome.json) is written into the
// package as manifest.json; icons/ and src/ are included byte-for-byte. The
// Firefox build (build-firefox.js) uses the exact same src/ — only the manifest
// differs between the two (Chrome uses a service-worker background; Firefox uses
// a scripts background + gecko settings).
//
// Usage:  node build-chrome.js
//   → build/chrome/             (unpacked — load via chrome://extensions → Load unpacked)
//   → continuum-chrome.zip      (packaged — upload to the Chrome Web Store)
"use strict";

const fs = require("fs");
const path = require("path");
const { buildZip } = require("./zip-writer.js");

const root = __dirname;
const MANIFEST = "manifest.chrome.json"; // written into the package as manifest.json
const OUTDIR = path.join(root, "build", "chrome");
const OUTPKG = path.join(root, "continuum-chrome.zip");

const INCLUDE = ["icons", "src"];
const SKIP = new Set(["icons/generate_icons.py"]); // dev-only file

const files = {};
files["manifest.json"] = new Uint8Array(fs.readFileSync(path.join(root, MANIFEST)));

function walk(rel) {
  const abs = path.join(root, rel);
  if (fs.statSync(abs).isDirectory()) {
    for (const entry of fs.readdirSync(abs)) walk(rel + "/" + entry);
  } else {
    const key = rel.split(path.sep).join("/"); // zip entries must use forward slashes
    if (!SKIP.has(key)) files[key] = new Uint8Array(fs.readFileSync(abs));
  }
}
for (const item of INCLUDE) walk(item);

// Unpacked folder (point "Load unpacked" at this).
fs.rmSync(OUTDIR, { recursive: true, force: true });
for (const [rel, bytes] of Object.entries(files)) {
  const dest = path.join(OUTDIR, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, bytes);
}

// Packaged .zip (for the store). Zipped via Node's zlib, NOT fflate —
// AMO's upload validation 500s on fflate-deflated zips (see zip-writer.js).
fs.writeFileSync(OUTPKG, buildZip(files));

console.log("Chrome build: " + Object.keys(files).length + " files");
console.log("  unpacked → " + OUTDIR);
console.log("  package  → " + OUTPKG);
