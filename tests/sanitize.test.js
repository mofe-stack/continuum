// tests/sanitize.test.js — vanilla Node + assert, no framework.
//
// Run with:  node tests/sanitize.test.js
//
// Guards the two text-cleanup helpers that keep the resume PDF/transcript clean:
//
//  1. sanitizeText (src/ui/capture-panel.js) — strips genuinely-invisible junk in
//     message TEXT: ChatGPT's Private-Use citation markers (U+E200..E202) and
//     stray format/zero-width chars. It does NOT touch spacing.
//
//  2. stripUnencodable (src/core/pdf-export.js) — the actual fix for the
//     "M a d r i d" letter-spacing: jsPDF's built-in fonts can't encode emoji /
//     astral-plane chars, and a single one forces the WHOLE line into UTF-16,
//     inserting a null byte before every char (rendered as a gap). This drops
//     unencodable chars + folds smart punctuation to ASCII before rendering.
//
// Both helpers are pure and dependency-free; we extract their source and eval it
// so we test exactly what ships.

"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

// Extract a function body by brace-matching from its declaration, so we eval
// EXACTLY the shipped source (both helpers are pure / dependency-free).
function extract(file, name) {
  const src = fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
  const start = src.indexOf("function " + name + "(s)");
  if (start < 0) throw new Error("could not locate " + name + " in " + file);
  const open = src.indexOf("{", start);
  let depth = 0, i = open;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) { i++; break; } }
  }
  return new Function("return (" + src.slice(start, i) + ")")();
}

const sanitizeText = extract("src/ui/capture-panel.js", "sanitizeText");
const stripUnencodable = extract("src/core/pdf-export.js", "stripUnencodable");

let passed = 0, failed = 0;
function run(label, fn) {
  try { fn(); passed++; console.log("  PASS  " + label); }
  catch (err) { failed++; console.log("  FAIL  " + label); console.log("        " + err.message); }
}

const cp = (n) => String.fromCharCode(n);
const PUA = cp(0xE200) + "filecite" + cp(0xE202) + "src" + cp(0xE201);
const ZWSP = cp(0x200B), BOM = cp(0xFEFF);
const isPUA = (s) => [...s].some((c) => { const h = c.charCodeAt(0); return h >= 0xE000 && h <= 0xF8FF; });

console.log("sanitizeText (strips invisible junk, keeps everything visible):");

run("ChatGPT PUA citation markers removed, inner text kept", () => {
  const out = sanitizeText("x" + PUA + "y");
  assert.ok(!isPUA(out), "no Private-Use chars remain");
  assert.strictEqual(out, "xfilecitesrcy");
});
run("zero-width chars and BOM removed", () => {
  assert.strictEqual(sanitizeText("a" + ZWSP + "b" + BOM + "c"), "abc");
});
run("normal text (incl. real spaces) is untouched — NOT de-letter-spaced", () => {
  assert.strictEqual(sanitizeText("I am a Real Madrid fan"), "I am a Real Madrid fan");
  assert.strictEqual(sanitizeText("a b c d"), "a b c d"); // must NOT collapse
  assert.strictEqual(sanitizeText("line one\nline two"), "line one\nline two");
});
run("emoji is left in the transcript text (PDF layer handles it, not this)", () => {
  const e = "great " + String.fromCodePoint(0x1F449) + " point";
  assert.strictEqual(sanitizeText(e), e);
});

console.log("\nstripUnencodable (PDF render fix for jsPDF font limitation):");

run("emoji / astral-plane chars are dropped", () => {
  assert.strictEqual(stripUnencodable("Madrid 😭 forgot"), "Madrid  forgot");
  assert.strictEqual(stripUnencodable("a" + String.fromCodePoint(0x1F44F) + "b"), "ab");
});
run("smart punctuation folds to ASCII", () => {
  assert.strictEqual(stripUnencodable("“x”"), '"x"');
  assert.strictEqual(stripUnencodable("can’t"), "can't");
  assert.strictEqual(stripUnencodable("a—b"), "a-b");
  assert.strictEqual(stripUnencodable("wait…"), "wait...");
});
run("accented Latin-1 (encodable by the font) is preserved", () => {
  assert.strictEqual(stripUnencodable("café résumé"), "café résumé");
});
run("plain ASCII is unchanged", () => {
  assert.strictEqual(stripUnencodable("Madrid really took a test"), "Madrid really took a test");
});

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
