// tests/llm-compressor.test.js — vanilla Node + assert, no framework.
//
// Run with:  node tests/llm-compressor.test.js
//
// Covers the PURE pieces of the LLM compressor (turn slicing + compressed-session
// assembly). The network call (summarizeMiddle) is not exercised here.

"use strict";

const assert = require("assert");
const path = require("path");

global.window = {};
require(path.resolve(__dirname, "..", "src", "core", "llm-compressor.js"));

const { sliceTurns, assembleCompressed, collectMiddleImages, collectMiddleFiles, protectImportant, restoreImportant, stripImageRefs } = global.window.Continuum.llmCompressor;

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

const mk = (n) => Array.from({ length: n }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: [{ type: "text", text: "m" + i }] }));

console.log("sliceTurns:");

run("short chat (<= keepCount*2) → all top, empty middle", () => {
  const r = sliceTurns(mk(10), 8); // 10 <= 16
  assert.strictEqual(r.middle.length, 0, "no middle");
  assert.strictEqual(r.top.length, 10, "everything kept");
  assert.strictEqual(r.bottom.length, 0);
});

run("long chat → first N top, last N bottom, rest middle", () => {
  const r = sliceTurns(mk(30), 8);
  assert.strictEqual(r.top.length, 8, "top N");
  assert.strictEqual(r.bottom.length, 8, "bottom N");
  assert.strictEqual(r.middle.length, 14, "middle = 30 - 16");
  assert.strictEqual(r.top[0].content[0].text, "m0", "top starts at first");
  assert.strictEqual(r.bottom[7].content[0].text, "m29", "bottom ends at last");
  assert.strictEqual(r.middle[0].content[0].text, "m8", "middle starts after top");
});

run("exactly keepCount*2 → no middle (boundary)", () => {
  const r = sliceTurns(mk(16), 8);
  assert.strictEqual(r.middle.length, 0, "16 == 8*2 → nothing to summarize");
});

run("keepCount is floored to >= 1; bad input tolerated", () => {
  assert.doesNotThrow(() => sliceTurns(null, 8));
  assert.deepStrictEqual(sliceTurns(null, 8), { top: [], middle: [], bottom: [] });
});

console.log("\nassembleCompressed:");

run("builds top + summary turn + bottom", () => {
  const session = { id: "x", media: { a: 1 }, stats: { messages: 30 }, turns: mk(30) };
  const { top, bottom } = sliceTurns(session.turns, 8);
  const out = assembleCompressed(session, top, bottom, "CONDENSED", 14);
  assert.strictEqual(out.turns.length, 8 + 1 + 8, "8 + summary + 8");
  const summary = out.turns[8];
  assert.strictEqual(summary.role, "summary");
  assert.strictEqual(summary.omittedCount, 14);
  assert.strictEqual(summary.content[0].text, "CONDENSED");
  assert.strictEqual(out.id, "x", "id preserved");
  assert.strictEqual(out.media, session.media, "media map shared");
  assert.notStrictEqual(out, session, "returns a clone, not the original");
  assert.strictEqual(session.turns.length, 30, "original session untouched");
});

console.log("\nmiddle images carried onto the summary turn:");

const imgAtt = (id, name) => ({ type: "image", mediaId: id, name: name || id + ".png" });

run("collectMiddleImages gathers middle images, deduped by mediaId", () => {
  const middle = [
    { attachments: [imgAtt("a"), imgAtt("b")] },
    { attachments: [imgAtt("a")] }, // dupe of a
    { content: [{ type: "text", text: "no atts" }] },
  ];
  const imgs = collectMiddleImages(middle, [], []);
  assert.deepStrictEqual(imgs.map((x) => x.mediaId), ["a", "b"], "a,b once each");
});

run("collectMiddleImages skips images already in verbatim top/bottom", () => {
  const top = [{ attachments: [imgAtt("a")] }];
  const bottom = [{ attachments: [imgAtt("z")] }];
  const middle = [{ attachments: [imgAtt("a"), imgAtt("b"), imgAtt("z")] }];
  const imgs = collectMiddleImages(middle, top, bottom);
  assert.deepStrictEqual(imgs.map((x) => x.mediaId), ["b"], "only the middle-only image");
});

run("collectMiddleImages ignores non-image / mediaId-less attachments", () => {
  const middle = [{ attachments: [{ type: "file", mediaId: "f" }, { type: "image" }, imgAtt("ok")] }];
  assert.deepStrictEqual(collectMiddleImages(middle, [], []).map((x) => x.mediaId), ["ok"]);
});

run("assembleCompressed carries middle images onto the summary turn", () => {
  const session = { id: "x", media: {}, turns: mk(30) };
  const { top, bottom } = sliceTurns(session.turns, 8);
  const middle = [{ attachments: [imgAtt("m1"), imgAtt("m2")] }];
  const out = assembleCompressed(session, top, bottom, "CONDENSED", 14, middle);
  assert.deepStrictEqual(out.turns[8].attachments.map((a) => a.mediaId), ["m1", "m2"]);
});

const fileAtt = (id, name) => ({ type: "file", mediaId: id, name: name || id + ".pdf" });

run("collectMiddleFiles gathers middle files, deduped + top/bottom excluded", () => {
  const top = [{ attachments: [fileAtt("a")] }];
  const middle = [{ attachments: [fileAtt("a"), fileAtt("b"), imgAtt("img")] }, { attachments: [fileAtt("b")] }];
  assert.deepStrictEqual(collectMiddleFiles(middle, top, []).map((x) => x.mediaId), ["b"], "file-only, deduped, minus top");
});

run("assembleCompressed carries BOTH middle images and files onto the summary turn", () => {
  const session = { id: "x", media: {}, turns: mk(30) };
  const { top, bottom } = sliceTurns(session.turns, 8);
  const middle = [{ attachments: [imgAtt("m1"), fileAtt("f1"), fileAtt("f2")] }];
  const out = assembleCompressed(session, top, bottom, "CONDENSED", 14, middle);
  assert.deepStrictEqual(out.turns[8].attachments.map((a) => a.mediaId), ["m1", "f1", "f2"], "images then files");
});

run("assembleCompressed without middle → empty attachments (back-compat)", () => {
  const session = { id: "x", media: {}, turns: mk(30) };
  const { top, bottom } = sliceTurns(session.turns, 8);
  const out = assembleCompressed(session, top, bottom, "CONDENSED", 14);
  assert.deepStrictEqual(out.turns[8].attachments, []);
});

console.log("\nstripImageRefs (image refs leave the LLM text):");

run("image refs become plain hints, keeping alt text", () => {
  assert.strictEqual(stripImageRefs("see ![a chart](images/c.png) here"), "see [image: a chart] here");
  assert.strictEqual(stripImageRefs("![](images/x.png)"), "[image]");
  assert.strictEqual(stripImageRefs("no images here"), "no images here");
});

console.log("\nprotect/restore (hard code guarantee):");

run("a fenced code block round-trips byte-for-byte through summarization", () => {
  const code = "```js\nconst x = 1;\nfunction f(){ return x; }\n```";
  const text = "We then wrote this:\n\n" + code + "\n\nand it worked.";
  const { masked, blocks } = protectImportant(text);
  assert.ok(masked.indexOf("```") === -1, "no fenced code left in what the LLM sees");
  assert.ok(/\[\[CONTINUUM-KEEP-0\]\]/.test(masked), "code replaced by a marker");
  assert.strictEqual(blocks[0], code, "original code captured verbatim");
  // Simulate the LLM keeping the marker but rewording the prose around it.
  const llm = "Earlier code: [[CONTINUUM-KEEP-0]] (it worked).";
  const restored = restoreImportant(llm, blocks);
  assert.ok(restored.indexOf(code) !== -1, "exact code reinserted at the marker");
  assert.ok(restored.indexOf("CONTINUUM-KEEP") === -1, "no leftover markers");
});

run("code is NEVER lost even if the model drops the marker", () => {
  const code = "```py\nprint('keep me')\n```";
  const { blocks } = protectImportant("before\n\n" + code + "\n\nafter");
  // Model returns a summary that forgot the marker entirely.
  const restored = restoreImportant("A short summary with no marker.", blocks);
  assert.ok(restored.indexOf(code) !== -1, "dropped code is appended, not lost");
  assert.ok(/## Preserved content/.test(restored), "fallback heading present");
});

run("inline code spans are protected too", () => {
  const { masked, blocks } = protectImportant("run `npm install` then `npm test`");
  assert.strictEqual(blocks.length, 2, "both inline spans captured");
  assert.ok(masked.indexOf("`") === -1, "no backticks left for the LLM to mangle");
});

run("multiple code blocks keep distinct markers + order", () => {
  const a = "```\nA\n```";
  const b = "```\nB\n```";
  const { masked, blocks } = protectImportant(a + "\n\nmiddle\n\n" + b);
  assert.strictEqual(blocks.length, 2);
  assert.ok(masked.indexOf("[[CONTINUUM-KEEP-0]]") < masked.indexOf("[[CONTINUUM-KEEP-1]]"), "markers in order");
  const restored = restoreImportant(masked, blocks);
  assert.ok(restored.indexOf(a) < restored.indexOf(b), "both restored in original order");
});

run("text with no code is unchanged by protect", () => {
  const text = "just plain prose, nothing to protect.";
  const { masked, blocks } = protectImportant(text);
  assert.strictEqual(masked, text);
  assert.strictEqual(blocks.length, 0);
});

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
