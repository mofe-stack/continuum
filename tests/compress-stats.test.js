// tests/compress-stats.test.js — vanilla Node + assert, no framework.
//
// Run with:  node tests/compress-stats.test.js
//
// Covers two browser-targeted units run under a synthetic window:
//   1. llmCompressor.worthCompressing  — the token-based compress gate
//   2. storage.addCompressSaving / getCompressStats — lifetime savings accumulator
// Both IIFEs install onto a shared global `window.Continuum`.

"use strict";

const assert = require("assert");
const path = require("path");

// Minimal browser shims so the browser-targeted sources load under Node.
// (Node already provides a read-only `navigator`; storage.js only sniffs it for
// Firefox, which won't match, so we leave it alone.)
global.window = {
  Continuum: {},
  addEventListener() {}, // storage.js registers a message listener at load
};

const SRC = (f) => path.resolve(__dirname, "..", "src", f);

// compressor.js gives us estimateTokens/formatTokens (the gate depends on it).
require(SRC("core/compressor.js"));

// Stub the handoff builder the gate calls: return a per-session text blob whose
// length drives the token estimate (chars / 4.2). MIN_COMPRESS_TOKENS = 2000 →
// the worth/not-worth boundary is 2000 * 4.2 = 8400 chars.
global.window.Continuum.handoff = {
  buildHandoff: (s) => (s && s._text) || "",
};

require(SRC("core/llm-compressor.js"));
const { worthCompressing, MIN_COMPRESS_TOKENS, MIN_TURNS } = global.window.Continuum.llmCompressor;
const { payloadTokens, estimateTokens, VISION_TOKENS_PER_IMAGE } = global.window.Continuum.compressor;

// In-memory chrome.storage.local so storage.js's get/set work without a browser.
const _store = {};
global.chrome = {
  runtime: { lastError: null },
  storage: {
    local: {
      get(keys, cb) {
        const out = {};
        const list = Array.isArray(keys) ? keys : [keys];
        for (const k of list) if (k in _store) out[k] = _store[k];
        cb(out);
      },
      set(obj, cb) {
        Object.assign(_store, obj);
        cb();
      },
      remove(keys, cb) {
        for (const k of Array.isArray(keys) ? keys : [keys]) delete _store[k];
        cb();
      },
    },
  },
};

require(SRC("core/storage.js"));
const { getCompressStats, addCompressSaving } = global.window.Continuum.storage;

let passed = 0;
let failed = 0;
const tests = [];
const run = (label, fn) => tests.push({ label, fn });

const turns = (n) => ({ turns: Array.from({ length: n }, () => ({ role: "user", content: [] })) });
const withText = (n, chars) => Object.assign(turns(n), { _text: "x".repeat(chars) });

run("constants: MIN_TURNS floor is 2, threshold is 2000 tokens", () => {
  assert.strictEqual(MIN_TURNS, 2);
  assert.strictEqual(MIN_COMPRESS_TOKENS, 2000);
});

run("worthCompressing: below the 2-message floor → false (even when huge)", () => {
  assert.strictEqual(worthCompressing(withText(1, 100000)), false);
});
run("worthCompressing: enough messages but under the token threshold → false", () => {
  assert.strictEqual(worthCompressing(withText(4, 4000)), false); // ~950 tokens
});
run("worthCompressing: enough messages and over the token threshold → true", () => {
  assert.strictEqual(worthCompressing(withText(2, 9000)), true); // ~2143 tokens
});
run("worthCompressing: right at the boundary (8400 chars ≈ 2000 tokens) → true", () => {
  assert.strictEqual(worthCompressing(withText(2, 8400)), true);
});
run("worthCompressing: empty / missing session → false", () => {
  assert.strictEqual(worthCompressing(null), false);
  assert.strictEqual(worthCompressing({}), false);
});

run("payloadTokens: Markdown = text only (no image vision cost)", () => {
  const s = Object.assign(withText(2, 4200), {
    turns: [{ role: "user", attachments: [{ type: "image", mediaId: "a" }, { type: "image", mediaId: "b" }] }],
    _text: "x".repeat(4200),
  });
  assert.strictEqual(payloadTokens(s, { markdown: true }), estimateTokens(s._text));
});
run("payloadTokens: PDF adds vision tokens per embedded image", () => {
  const s = {
    turns: [{ role: "user", attachments: [{ type: "image", mediaId: "a" }, { type: "image", mediaId: "b" }] }],
    _text: "x".repeat(4200),
  };
  const md = payloadTokens(s, { markdown: true });
  const pdf = payloadTokens(s, { markdown: false });
  assert.strictEqual(pdf - md, 2 * VISION_TOKENS_PER_IMAGE);
  assert.ok(pdf > md, "PDF should cost more than MD when images are embedded");
});

run("accumulator: starts at zero", async () => {
  assert.deepStrictEqual(await getCompressStats(), { before: 0, after: 0, chats: 0 });
});
run("accumulator: first saving records before/after and chats=1", async () => {
  await addCompressSaving(1000, 400);
  assert.deepStrictEqual(await getCompressStats(), { before: 1000, after: 400, chats: 1 });
});
run("accumulator: second saving accumulates raw sums and chats=2", async () => {
  await addCompressSaving(500, 100);
  assert.deepStrictEqual(await getCompressStats(), { before: 1500, after: 500, chats: 2 });
});
run("accumulator: rounds floats and clamps negatives to 0", async () => {
  await addCompressSaving(10.7, -5);
  assert.deepStrictEqual(await getCompressStats(), { before: 1511, after: 500, chats: 3 });
});

// Sequential so the shared in-memory store mutates in a deterministic order.
(async () => {
  for (const { label, fn } of tests) {
    try {
      await fn();
      passed++;
      console.log("  PASS  " + label);
    } catch (err) {
      failed++;
      console.log("  FAIL  " + label);
      console.log("        " + err.message);
    }
  }
  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
})();
