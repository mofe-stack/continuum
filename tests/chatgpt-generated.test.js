// tests/chatgpt-generated.test.js — vanilla Node + assert, no framework.
//
// Run with:  node tests/chatgpt-generated.test.js
//
// Guards capture of ChatGPT AI-GENERATED media, using the EXACT shapes confirmed
// by probeGeneratedImages on a real chat:
//   • generated images ride in a `tool` message (recipient "all",
//     content_type "multimodal_text") whose parts hold an image_asset_pointer
//     with asset_pointer "sediment://file_…" → captured as an image attachment.
//   • generated files are offered as [label](sandbox:/mnt/data/Name.ext) links →
//     captured as NAME-ONLY file attachments (counted, not fetched).
//
// chatgpt-adapter.js is a DOM IIFE; we extract the pure helpers' source and eval
// them (they only depend on each other) — the same shape that ships.

"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.resolve(__dirname, "..", "src", "adapters", "chatgpt-adapter.js"), "utf8");
function grab(decl) {
  const start = src.indexOf(decl);
  if (start < 0) throw new Error("not found: " + decl);
  const open = src.indexOf("{", start);
  let d = 0, i = open;
  for (; i < src.length; i++) { if (src[i] === "{") d++; else if (src[i] === "}") { d--; if (!d) { i++; break; } } }
  return src.slice(start, i);
}
const sandbox = new Function(
  grab("function extractText(msg)") + "\n" +
  grab("function extractAttachments(msg)") + "\n" +
  grab("function hasGeneratedImage(msg)") + "\n" +
  grab("function nodeToRecord(node)") + "\n" +
  "return { extractText, extractAttachments, hasGeneratedImage, nodeToRecord };"
)();
const { extractAttachments, hasGeneratedImage, nodeToRecord } = sandbox;

let passed = 0, failed = 0;
function run(label, fn) {
  try { fn(); passed++; console.log("  PASS  " + label); }
  catch (e) { failed++; console.log("  FAIL  " + label); console.log("        " + e.message); }
}

// Real shape from the probe: a tool message carrying a generated image.
const genImageToolMsg = {
  author: { role: "tool", name: "dalle.text2im" },
  recipient: "all",
  content: { content_type: "multimodal_text", parts: [
    { content_type: "image_asset_pointer", asset_pointer: "sediment://file_00000000c96071fd891b9ac2f0d89002", width: 1024, height: 1024 },
  ] },
  metadata: { image_gen_title: "Crying Madrid fans" },
};

console.log("ChatGPT generated-media capture:");

run("a tool message with an image_asset_pointer is detected as generated image", () => {
  assert.strictEqual(hasGeneratedImage(genImageToolMsg), true);
});

run("nodeToRecord KEEPS the generated-image tool message, attributed to assistant", () => {
  const r = nodeToRecord({ message: genImageToolMsg });
  assert.ok(r, "not dropped");
  assert.strictEqual(r.role, "assistant", "tool→assistant");
  assert.strictEqual(r.atts.length, 1, "one image attachment");
  assert.strictEqual(r.atts[0].isImg, true);
  assert.strictEqual(r.atts[0].id, "file_00000000c96071fd891b9ac2f0d89002", "sediment:// stripped");
});

run("a plain tool message (no image) is still dropped", () => {
  const r = nodeToRecord({ message: { author: { role: "tool" }, recipient: "all", content: { content_type: "execution_output", parts: [] }, metadata: { aggregate_result: {} } } });
  assert.strictEqual(r, null);
});

// Tool-plumbing leaks — exact shapes from the real active-path message table.
run("assistant CODE call to the python tool is dropped (recipient != all)", () => {
  // row 20/29: the 'from zipfile import …' code-interpreter input
  const r = nodeToRecord({ message: { author: { role: "assistant" }, recipient: "python", content: { content_type: "code", parts: ["from zipfile import ZipFile\nimport os\n…"] } } });
  assert.strictEqual(r, null);
});

run("assistant DALL·E tool call is dropped (recipient != all)", () => {
  // row 12/26: the '{"size":"1024x1024","n":4}' tool params
  const r = nodeToRecord({ message: { author: { role: "assistant" }, recipient: "t2uay3k.sj1i4kz", content: { content_type: "code", parts: ['{"size":"1024x1024","n":4}'] } } });
  assert.strictEqual(r, null);
});

run("model_editable_context noise is dropped", () => {
  // rows 4/11/34
  const r = nodeToRecord({ message: { author: { role: "assistant" }, recipient: "all", content: { content_type: "model_editable_context", parts: [""] } } });
  assert.strictEqual(r, null);
});

run("a REAL assistant answer (recipient all, text) is KEPT", () => {
  // row 5/22: the actual reply / download-link message
  const r = nodeToRecord({ message: { author: { role: "assistant" }, recipient: "all", content: { content_type: "text", parts: ["You want something subtle but still stings a little."] } } });
  assert.ok(r && r.role === "assistant" && /still stings/.test(r.text));
});

run("generated FILE link → sandbox file attachment carrying path + msgId for fetch", () => {
  const msg = { id: "08d8cdbe-6d35-4254-a40e-b8e5ac797ea6", content: { content_type: "text", parts: [
    "I've created the PDF for you:\n\n[Download the PDF](sandbox:/mnt/data/Real_Madrid_Fan_Images.pdf)",
  ] } };
  const atts = extractAttachments(msg);
  const pdf = atts.find((a) => /\.pdf$/i.test(a.name));
  assert.ok(pdf, "pdf captured");
  assert.strictEqual(pdf.id, null, "no upload id");
  assert.strictEqual(pdf.isImg, false, "counts as a file");
  assert.strictEqual(pdf.name, "Real_Madrid_Fan_Images.pdf");
  assert.strictEqual(pdf.sandbox, "/mnt/data/Real_Madrid_Fan_Images.pdf", "raw sandbox path kept for fetch");
  assert.strictEqual(pdf.msgId, "08d8cdbe-6d35-4254-a40e-b8e5ac797ea6", "owning message id kept");
});

run("generated ZIP link is also captured with sandbox path (unlike uploaded .zip)", () => {
  const msg = { id: "m2", content: { parts: ["[Download the ZIP file](sandbox:/mnt/data/Crying_Madrid_Fans_Image_Pack.zip)"] } };
  const atts = extractAttachments(msg);
  const zip = atts.find((a) => a.name === "Crying_Madrid_Fans_Image_Pack.zip");
  assert.ok(zip && !zip.isImg && zip.id === null && zip.sandbox === "/mnt/data/Crying_Madrid_Fans_Image_Pack.zip");
});

run("normal user upload still works (metadata.attachments)", () => {
  const msg = { metadata: { attachments: [{ id: "file-abc", name: "photo.png", mime_type: "image/png" }] }, content: { parts: [] } };
  const atts = extractAttachments(msg);
  assert.ok(atts.some((a) => a.id === "file-abc" && a.isImg === true));
});

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
