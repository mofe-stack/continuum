// tests/llm-compressor.test.js — vanilla Node + assert, no framework.
//
// Run with:  node tests/llm-compressor.test.js
//
// Covers the PURE pieces of the LLM compressor: attachment collection, compressed-
// session assembly (whole-conversation → one summary turn), the attachment-context
// trailer parser, and the code-protect/restore guarantee. The network call
// (summarize) is not exercised here.

"use strict";

const assert = require("assert");
const path = require("path");

global.window = {};
require(path.resolve(__dirname, "..", "src", "core", "llm-compressor.js"));

const {
  collectAllAttachments,
  assembleCompressed,
  buildAttachmentManifest,
  parseAttachmentContext,
  protectImportant,
  restoreImportant,
  stripImageRefs,
  MIN_TURNS,
} = global.window.Continuum.llmCompressor;

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

const imgAtt = (id, name) => ({ type: "image", mediaId: id, name: name || id + ".png" });
const fileAtt = (id, name) => ({ type: "file", mediaId: id, name: name || id + ".pdf" });

console.log("collectAllAttachments:");

run("gathers every image + file across all turns, deduped by mediaId", () => {
  const turns = [
    { attachments: [imgAtt("a"), fileAtt("f1")] },
    { attachments: [imgAtt("a"), imgAtt("b")] }, // a is a dupe
    { content: [{ type: "text", text: "no atts" }] },
    { attachments: [fileAtt("f1"), fileAtt("f2")] }, // f1 dupe
  ];
  const out = collectAllAttachments(turns);
  assert.deepStrictEqual(out.map((x) => x.mediaId), ["a", "f1", "b", "f2"], "first-seen order, deduped");
});

run("dedupes mediaId-less attachments by type+name", () => {
  const turns = [
    { attachments: [{ type: "image", name: "x.png" }, { type: "image", name: "x.png" }] },
  ];
  assert.strictEqual(collectAllAttachments(turns).length, 1, "same type+name collapses");
});

run("ignores non image/file blocks and bad input", () => {
  assert.deepStrictEqual(collectAllAttachments(null), []);
  assert.deepStrictEqual(collectAllAttachments([{ attachments: [{ type: "other" }] }]), []);
});

run("skips pasted-content 'files' (isPasted) — they're transcript text, not files", () => {
  const turns = [
    { attachments: [{ type: "file", name: "attachment", isPasted: true }, fileAtt("real", "data.json")] },
  ];
  assert.deepStrictEqual(collectAllAttachments(turns).map((x) => x.name), ["data.json"], "only the real file");
});

console.log("\nassembleCompressed (whole convo → one summary turn):");

run("collapses the whole session into a single summary turn", () => {
  const turns = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? "assistant" : "user" }));
  const session = { id: "x", media: { a: 1 }, stats: { messages: 30 }, turns: turns };
  const atts = [imgAtt("m1"), fileAtt("f1")];
  const out = assembleCompressed(session, "BRIEF", 30, atts);
  assert.strictEqual(out.turns.length, 1, "exactly one turn");
  const summary = out.turns[0];
  assert.strictEqual(summary.role, "summary");
  assert.strictEqual(summary.omittedCount, 30, "omittedCount = all source turns");
  assert.strictEqual(summary.content[0].text, "BRIEF");
  assert.deepStrictEqual(summary.attachments.map((a) => a.mediaId), ["m1", "f1"], "all attachments carried");
  assert.strictEqual(out.id, "x", "id preserved");
  assert.strictEqual(out.media, session.media, "media map shared");
  assert.notStrictEqual(out, session, "returns a clone, not the original");
  assert.strictEqual(session.turns.length, 30, "original session untouched");
});

run("no attachments → empty attachments array", () => {
  const out = assembleCompressed({ id: "x", media: {}, turns: [] }, "BRIEF", 0, []);
  assert.deepStrictEqual(out.turns[0].attachments, []);
});

run("MIN_TURNS is exported and sane", () => {
  assert.ok(typeof MIN_TURNS === "number" && MIN_TURNS >= 2, "a small positive threshold");
});

console.log("\nbuildAttachmentManifest:");

run("lists image + file names and asks for the machine trailer", () => {
  const m = buildAttachmentManifest([imgAtt("a", "chart.png"), fileAtt("b", "data.json")]);
  assert.ok(/Images: chart\.png/.test(m), "image name listed");
  assert.ok(/Files: data\.json/.test(m), "file name listed");
  assert.ok(/continuum-attachments/.test(m), "asks for the parseable trailer");
});

run("empty when there are no attachments", () => {
  assert.strictEqual(buildAttachmentManifest([]), "");
  assert.strictEqual(buildAttachmentManifest(null), "");
});

console.log("\nparseAttachmentContext (trailer → per-attachment context, stripped):");

run("parses tab-separated context, strips the block, sets _context", () => {
  const atts = [imgAtt("a", "chart.png"), fileAtt("b", "data.json")];
  const raw =
    "## Current state\n- stuff\n\n```continuum-attachments\nchart.png\tthe architecture sketch\ndata.json\tinput dataset\n```";
  const { text, attachments } = parseAttachmentContext(raw, atts);
  assert.ok(text.indexOf("continuum-attachments") === -1, "trailer removed from the visible brief");
  assert.ok(/## Current state/.test(text), "brief body kept");
  assert.strictEqual(attachments[0]._context, "the architecture sketch");
  assert.strictEqual(attachments[1]._context, "input dataset");
});

run("matches names fuzzily (case / punctuation) and tolerates a ' - ' separator", () => {
  const atts = [fileAtt("b", "My Report (1).pdf")];
  const raw = "brief\n\n```continuum-attachments\n- my-report-1.pdf - the spec we followed\n```";
  const { attachments } = parseAttachmentContext(raw, atts);
  assert.strictEqual(attachments[0]._context, "the spec we followed");
});

run("no trailer → attachments unchanged, text unchanged", () => {
  const atts = [imgAtt("a")];
  const { text, attachments } = parseAttachmentContext("just a brief", atts);
  assert.strictEqual(text, "just a brief");
  assert.ok(!attachments[0]._context, "no context set");
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

run("kept markers restore in place; dropped markers are omitted (no dump)", () => {
  const a = "```js\nconst A = 1;\n```";
  const b = "```js\nconst B = 2;\n```";
  const { blocks } = protectImportant(a + "\n\n" + b); // blocks[0]=a, blocks[1]=b
  // Model keeps only the first marker (uses A in the brief) and drops the second.
  const restored = restoreImportant("Current state: [[CONTINUUM-KEEP-0]] is set.", blocks);
  assert.ok(restored.indexOf(a) !== -1, "kept marker → code restored in place, in context");
  assert.ok(restored.indexOf(b) === -1, "dropped marker → that code is omitted from the brief");
  assert.ok(restored.indexOf("## Preserved content") === -1, "no Preserved content dump (L3)");
  assert.ok(restored.indexOf("CONTINUUM-KEEP") === -1, "no leftover markers either way");
});

run("dropped markers never resurrect code as a trailing dump", () => {
  const { blocks } = protectImportant("```py\nprint('x')\n```\n\nrun `npm test`");
  const restored = restoreImportant("A brief that references no code.", blocks);
  assert.strictEqual(restored, "A brief that references no code.", "nothing appended for dropped code");
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
