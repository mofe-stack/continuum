// build-firefox.js — packages the Firefox build from the shared source.
//
// It copies the source AS-IS — no transforming, minifying, bundling, or code
// generation. The Firefox manifest (manifest.firefox.json) is written into the
// package as manifest.json; icons/ and src/ are included byte-for-byte. The
// Chrome build (build-chrome.js) uses the exact same src/ — only the manifest
// differs between the two.
//
// Usage:  node build-firefox.js
//   → build/firefox/            (unpacked — load via about:debugging for testing)
//   → continuum-firefox.xpi     (packaged — upload to AMO)
"use strict";

const fs = require("fs");
const path = require("path");
const { buildZip } = require("./zip-writer.js");

const root = __dirname;
const MANIFEST = "manifest.firefox.json"; // written into the package as manifest.json
const OUTDIR = path.join(root, "build", "firefox");
const OUTPKG = path.join(root, "continuum-firefox.xpi");

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

// Unpacked folder (for load-as-temporary-add-on testing).
fs.rmSync(OUTDIR, { recursive: true, force: true });
for (const [rel, bytes] of Object.entries(files)) {
  const dest = path.join(OUTDIR, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, bytes);
}

// Packaged .xpi (for the store). Zipped via Node's zlib, NOT fflate —
// AMO's upload validation 500s on fflate-deflated zips (see zip-writer.js).
fs.writeFileSync(OUTPKG, buildZip(files));

console.log("Firefox build: " + Object.keys(files).length + " files");
console.log("  unpacked → " + OUTDIR);
console.log("  package  → " + OUTPKG);
