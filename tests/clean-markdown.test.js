// tests/clean-markdown.test.js — vanilla Node + assert, no framework.
//
// Run with:  node tests/clean-markdown.test.js
//
// Covers pdf-export.cleanHandoffMarkdown — the resume render layer shared by the
// PDF and the conversation-history.md. The critical property: it strips cosmetic
// Markdown from PROSE but leaves fenced CODE blocks byte-for-byte intact (a
// line-by-line stripper without fence awareness silently corrupts code — losing
// `#` comments, `**` exponents, inline backticks).

"use strict";

const assert = require("assert");
const path = require("path");

global.window = {};
require(path.resolve(__dirname, "..", "src", "core", "pdf-export.js"));
const clean = global.window.Continuum.pdfExport.cleanHandoffMarkdown;

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

console.log("cleanHandoffMarkdown:");

run("strips cosmetic markdown in prose", () => {
  assert.strictEqual(clean("We set **the** flag and `ran` it."), "We set the flag and ran it.");
});

run("keeps brief/speaker headings as ## sections", () => {
  assert.strictEqual(clean("## Current state"), "## Current state");
  assert.strictEqual(clean("## User"), "# User");
  assert.strictEqual(clean("## Assistant"), "## Assistant");
});

run("leaves fenced code blocks byte-for-byte (the bug this guards)", () => {
  const code = [
    "```python",
    "# load the data — comment keeps its #",
    "x = a ** 2  # exponent stays",
    "tpl = `literal backticks stay`",
    "ptr = *thing",
    "```",
  ].join("\n");
  assert.strictEqual(clean(code), code, "code block round-trips unchanged");
});

run("strips prose around a code block but not inside it", () => {
  const input = "**before**\n```\n# x\n```\n**after**";
  assert.strictEqual(clean(input), "before\n```\n# x\n```\nafter");
});

run("handles ~~~ fences too", () => {
  const input = "~~~\n# kept\n~~~";
  assert.strictEqual(clean(input), input);
});

run("an unterminated fence still protects its remaining lines", () => {
  const input = "intro **bold**\n```\n# kept even if fence never closes";
  assert.strictEqual(clean(input), "intro bold\n```\n# kept even if fence never closes");
});

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
