// tests/compressor.test.js — vanilla Node + assert, no framework.
//
// Run with:  node tests/compressor.test.js
//
// compressor.js is browser-targeted: its IIFE installs Continuum.compressor
// onto a global `window`. We supply a synthetic window so the same source runs
// unmodified under Node, then pull the export off the resulting object.
//
// NOTE: the rule-based compression passes were removed (compression is being
// rebuilt LLM-based), so this now only covers the token estimator.

"use strict";

const assert = require("assert");
const path = require("path");

global.window = {};
require(path.resolve(__dirname, "..", "src", "core", "compressor.js"));

const { estimateTokens } = global.window.Continuum.compressor;

if (typeof estimateTokens !== "function") {
  console.error("FATAL: estimateTokens is not exported on Continuum.compressor");
  process.exit(2);
}

let passed = 0;
let failed = 0;

function run(label, fn) {
  try {
    fn();
    passed++;
    console.log("  PASS  " + label);
  } catch (err) {
    failed++;
    console.log("  FAIL  " + label);
    console.log("        " + err.message);
  }
}

console.log("estimateTokens:");

run("empty / null → 0", () => {
  assert.strictEqual(estimateTokens(""), 0);
  assert.strictEqual(estimateTokens(null), 0);
});

run("scales as chars / 4.2 (the o200k-calibrated divisor)", () => {
  const e = estimateTokens("x".repeat(42000));
  assert.ok(Math.abs(e - 10000) <= 1, "expected ~10000, got " + e);
});

run("prose lands in a sane band", () => {
  // "The quick brown fox jumps over the lazy dog." → ~10-11 real tokens.
  const t = estimateTokens("The quick brown fox jumps over the lazy dog.");
  assert.ok(t >= 8 && t <= 14, "expected ~8-14, got " + t);
});

run("monotonic — more text, more tokens", () => {
  const a = estimateTokens("hello world");
  const b = estimateTokens("hello world hello world hello world");
  assert.ok(b > a, "expected " + b + " > " + a);
});

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
