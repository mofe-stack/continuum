// build-firefox.js — packages the Firefox .xpi by ZIPPING the committed source
// files as-is. It does NOT transform, minify, bundle, or generate any code: the
// manifest.json, icons/, and src/ files are included byte-for-byte exactly as they
// are in this folder. (The Chrome build lives separately in ../continuum-chrome.)
//
// Usage:  node build-firefox.js   →  writes continuum-firefox.xpi
"use strict";

const fs = require("fs");
const path = require("path");
const fflate = require("./src/vendor/fflate.min.js");

const root = __dirname;
const OUT = "continuum-firefox.xpi";

// Files/dirs to include, and dev-only files to leave out of the package.
const INCLUDE = ["manifest.json", "icons", "src"];
const SKIP = new Set(["icons/generate_icons.py"]);

const files = {};

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

fs.writeFileSync(OUT, Buffer.from(fflate.zipSync(files, { level: 6 })));
console.log("Wrote " + OUT + " (" + Object.keys(files).length + " files)");
