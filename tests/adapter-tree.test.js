// tests/adapter-tree.test.js — vanilla Node + assert, no framework.
//
// Run with:  node tests/adapter-tree.test.js
//
// Covers claude-adapter's _resolveActivePath: the fix that stops captureFast
// from flattening abandoned edit/regenerate branches returned by the
// `?tree=True` API. The adapter is browser-targeted (its IIFE installs onto a
// global `window` and only touches document/fetch INSIDE functions), so a bare
// `global.window` is enough to load it under Node and pull the pure helper off.

"use strict";

const assert = require("assert");
const path = require("path");

global.window = {};
require(path.resolve(__dirname, "..", "src", "adapters", "claude-adapter.js"));

const { _resolveActivePath, _classifyApiAttachment, _extractMessageText } =
  global.window.Continuum.claudeAdapter;

if (typeof _resolveActivePath !== "function") {
  console.error("FATAL: _resolveActivePath is not exported on Continuum.claudeAdapter");
  process.exit(2);
}
if (typeof _classifyApiAttachment !== "function") {
  console.error("FATAL: _classifyApiAttachment is not exported on Continuum.claudeAdapter");
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

const ids = (msgs) => msgs.map((m) => m.uuid);

console.log("_resolveActivePath:");

run("linear chat → all messages in chronological order", () => {
  const raw = [
    { uuid: "m1", parent_message_uuid: null, sender: "human", text: "hi" },
    { uuid: "m2", parent_message_uuid: "m1", sender: "assistant", text: "hello" },
    { uuid: "m3", parent_message_uuid: "m2", sender: "human", text: "go on" },
  ];
  const data = { current_leaf_message_uuid: "m3" };
  const out = _resolveActivePath(data, raw);
  assert.deepStrictEqual(ids(out), ["m1", "m2", "m3"]);
});

run("edited prompt → off-path branch dropped, active path kept", () => {
  // m1 → m2(reply) → m3(user edits, abandoned) and m4(user kept) both child of m2;
  // m4 → m5(reply, current leaf). m3 is the abandoned edit branch.
  const raw = [
    { uuid: "m1", parent_message_uuid: null, sender: "human", text: "first" },
    { uuid: "m2", parent_message_uuid: "m1", sender: "assistant", text: "ans1" },
    { uuid: "m3", parent_message_uuid: "m2", sender: "human", text: "draft I deleted" },
    { uuid: "m4", parent_message_uuid: "m2", sender: "human", text: "what I actually sent" },
    { uuid: "m5", parent_message_uuid: "m4", sender: "assistant", text: "ans2" },
  ];
  const data = { current_leaf_message_uuid: "m5" };
  const out = _resolveActivePath(data, raw);
  assert.deepStrictEqual(ids(out), ["m1", "m2", "m4", "m5"]);
  assert.ok(!ids(out).includes("m3"), "abandoned branch m3 must be dropped");
});

run("regenerated reply → only the leaf reply on the path", () => {
  // Two assistant replies to the same prompt; only the regenerated one (m4) is
  // the current leaf. The first reply m3 is off-path.
  const raw = [
    { uuid: "m1", parent_message_uuid: null, sender: "human", text: "q" },
    { uuid: "m3", parent_message_uuid: "m1", sender: "assistant", text: "first try" },
    { uuid: "m4", parent_message_uuid: "m1", sender: "assistant", text: "regenerated" },
  ];
  const data = { current_leaf_message_uuid: "m4" };
  const out = _resolveActivePath(data, raw);
  assert.deepStrictEqual(ids(out), ["m1", "m4"]);
});

run("camelCase leaf + parent field names supported", () => {
  const raw = [
    { uuid: "a", parentMessageUuid: null, sender: "human", text: "x" },
    { uuid: "b", parentMessageUuid: "a", sender: "assistant", text: "y" },
  ];
  const out = _resolveActivePath({ currentLeafMessageUuid: "b" }, raw);
  assert.deepStrictEqual(ids(out), ["a", "b"]);
});

run("no leaf pointer → null (caller keeps flat list)", () => {
  const raw = [
    { uuid: "m1", parent_message_uuid: null, text: "a" },
    { uuid: "m2", parent_message_uuid: "m1", text: "b" },
  ];
  assert.strictEqual(_resolveActivePath({}, raw), null);
});

run("absent parent pointers on a multi-node tree → null", () => {
  // Leaf is present but nothing links back, so the walk collapses to 1 node.
  const raw = [
    { uuid: "m1", text: "a" },
    { uuid: "m2", text: "b" },
  ];
  assert.strictEqual(_resolveActivePath({ current_leaf_message_uuid: "m2" }, raw), null);
});

run("cyclic parent links don't hang (guard terminates)", () => {
  const raw = [
    { uuid: "m1", parent_message_uuid: "m2", text: "a" },
    { uuid: "m2", parent_message_uuid: "m1", text: "b" },
  ];
  // Should terminate and return a finite path rather than loop forever.
  const out = _resolveActivePath({ current_leaf_message_uuid: "m2" }, raw);
  assert.ok(Array.isArray(out), "expected an array, not a hang");
  assert.ok(out.length <= 2, "guard should stop after visiting each node once");
});

console.log("\n_classifyApiAttachment:");

run("image in `files` array → isImg, name + preview_url, no inline text", () => {
  // Real shape from the live API diagnostic.
  const f = {
    success: true,
    file_kind: "image",
    file_uuid: "e0e9b1cc-114d-4e80-94c7-6c194ca9c32a",
    file_name: "image_2026-05-28_042005160.png",
    preview_url: "/api/org/files/e0e9b1cc/preview",
  };
  const a = _classifyApiAttachment(f);
  assert.strictEqual(a.isImg, true, "should be an image");
  assert.strictEqual(a.isText, false);
  assert.strictEqual(a.name, "image_2026-05-28_042005160.png");
  assert.strictEqual(a.url, "/api/org/files/e0e9b1cc/preview");
  assert.strictEqual(a.text, null, "images carry no inline text");
});

run("uploaded doc in `attachments` array → isText, inline text, plain 'attachment' name", () => {
  // Real shape: empty file_name, file_type holds the extension, extracted_content
  // holds the full document text. This was the dropped case.
  const f = {
    id: "769507b4-08e2-4782-92c1-477ce89f45bc",
    file_name: "",
    file_size: 12596,
    file_type: "txt",
    extracted_content: "Here is Claude's plan: do the thing.",
  };
  const a = _classifyApiAttachment(f);
  assert.strictEqual(a.isImg, false);
  assert.strictEqual(a.isText, true, "extracted_content ⇒ text file");
  assert.strictEqual(a.text, "Here is Claude's plan: do the thing.", "inline content preserved");
  assert.strictEqual(a.name, "attachment", "no real filename ⇒ plain 'attachment' (normal naming)");
  assert.strictEqual(a.url, null, "no fetch needed — content is inline");
});

run("non-image file with real name + url → isText by extension, fetchable", () => {
  const f = { file_name: "export.json", preview_url: "/api/org/files/x/preview" };
  const a = _classifyApiAttachment(f);
  assert.strictEqual(a.isImg, false);
  assert.strictEqual(a.isText, true, ".json ⇒ text");
  assert.strictEqual(a.name, "export.json");
  assert.strictEqual(a.url, "/api/org/files/x/preview");
});

run("uploaded PDF (file_kind document) → bytes via document_asset.url, not text, name cleaned", () => {
  // Real shape from the live API: a user-uploaded PDF, no extracted_content, bytes
  // nested under document_asset.url, and a filename with stray newlines.
  const f = {
    success: true,
    file_kind: "document",
    file_uuid: "88e3b462-b8d1-42bd-a928-a661f062cb00",
    file_name: "MAVRK March and April hours\n delivery\n Art.pdf",
    document_asset: { url: "/api/org/files/88e3b462/document", page_count: 3 },
    thumbnail_asset: { url: "/api/org/files/88e3b462/thumbnail" },
  };
  const a = _classifyApiAttachment(f);
  assert.strictEqual(a.isImg, false, "a document is not an image");
  assert.strictEqual(a.isText, false, "binary PDF is not inlined as text");
  assert.strictEqual(a.text, null, "no extracted_content");
  assert.strictEqual(a.url, "/api/org/files/88e3b462/document", "fetch bytes from document_asset.url");
  assert.ok(!/[\r\n\t]/.test(a.name), "newlines/tabs stripped from filename, got: " + JSON.stringify(a.name));
});

run("newer-shape image via preview_asset.url resolves", () => {
  const f = { file_kind: "image", file_name: "shot.png", preview_asset: { url: "/api/org/files/y/preview" } };
  const a = _classifyApiAttachment(f);
  assert.strictEqual(a.isImg, true);
  assert.strictEqual(a.url, "/api/org/files/y/preview");
});

run("uploaded .zip → not skipped, binary (not text), bytes resolved from document_asset.url", () => {
  const f = { file_kind: "document", file_name: "continuum-export.zip", document_asset: { url: "/api/org/files/z/document" } };
  const a = _classifyApiAttachment(f);
  assert.strictEqual(a.isImg, false);
  assert.strictEqual(a.isText, false, ".zip is binary, not inlined as text");
  assert.strictEqual(a.url, "/api/org/files/z/document", "zip bytes are fetchable");
  assert.strictEqual(a.name, "continuum-export.zip");
});

run("generic fallback: unknown *_url field resolves the bytes", () => {
  const f = { file_name: "data.bin", content_url: "/api/org/files/b/raw" };
  assert.strictEqual(_classifyApiAttachment(f).url, "/api/org/files/b/raw");
});

run("generic fallback: unknown *_asset object with a .url resolves", () => {
  const f = { file_name: "archive.zip", storage_asset: { url: "/api/org/files/s/blob", size: 9 } };
  assert.strictEqual(_classifyApiAttachment(f).url, "/api/org/files/s/blob");
});

run("generic fallback does NOT grab a stray non-asset url-bearing object", () => {
  // A url nested under a non-asset key (e.g. metadata) must not be mistaken for bytes.
  const f = { file_name: "x.bin", metadata: { url: "https://example.com/page" } };
  assert.strictEqual(_classifyApiAttachment(f).url, null, "only *_url keys / asset-ish objects count");
});

console.log("\n_extractMessageText (thinking skipped):");

run("drops the thinking block entirely, keeps the final answer", () => {
  const msg = {
    sender: "assistant",
    content: [
      { type: "thinking", thinking: "Let me reason about this step by step." },
      { type: "text", text: "Here's the answer." },
    ],
  };
  const out = _extractMessageText(msg);
  assert.ok(!out.includes("Let me reason about this step by step."), "thinking text dropped");
  assert.ok(!out.includes("_[Thinking]_"), "no thinking label");
  assert.strictEqual(out, "Here's the answer.", "only the final answer remains");
});

run("text-only assistant message is unchanged", () => {
  const out = _extractMessageText({ content: [{ type: "text", text: "Just an answer." }] });
  assert.strictEqual(out, "Just an answer.");
});

run("falls back to msg.text when there are no content blocks", () => {
  assert.strictEqual(_extractMessageText({ text: "Older shape." }), "Older shape.");
});

run("a thinking-only message yields empty text (filtered as a placeholder node)", () => {
  const out = _extractMessageText({ content: [{ type: "thinking", thinking: "internal only" }] });
  assert.strictEqual(out, "", "no answer content → empty");
});

run("raw-mode 'not supported' placeholder (and its empty fence) is stripped, real text kept", () => {
  // Mirrors the screenshot: real prose, then a media block collapsed to the
  // placeholder wrapped in an empty code fence.
  const out = _extractMessageText({
    content: [
      {
        type: "text",
        text:
          "Let me find some visual references for the flower bed.\n\n```\nThis block is not supported on your current device yet.\n```\n\nNow for the windows:",
      },
    ],
  });
  assert.ok(!/not supported on your current device/i.test(out), "placeholder gone, got: " + out);
  assert.ok(out.includes("Let me find some visual references for the flower bed."), "leading prose kept");
  assert.ok(out.includes("Now for the windows:"), "trailing prose kept");
  assert.ok(!/```\s*```/.test(out), "no leftover empty fence");
});

run("a real code block next to a placeholder is NOT eaten", () => {
  const out = _extractMessageText({
    content: [
      {
        type: "text",
        text: "Here:\n```js\nconst x = 1;\n```\n```\nThis block is not supported on your current device yet.\n```",
      },
    ],
  });
  assert.ok(out.includes("const x = 1;"), "real code survives, got: " + out);
  assert.ok(!/not supported/i.test(out), "placeholder still removed");
});

run("web-search tool_use → labeled with the query", () => {
  const out = _extractMessageText({
    content: [
      { type: "server_tool_use", name: "web_search", input: { query: "best picture 2026 oscars" } },
      { type: "text", text: "It won Best Picture." },
    ],
  });
  assert.ok(out.includes("_[Web search]_ best picture 2026 oscars"), "search query captured, got: " + out);
  assert.ok(out.includes("It won Best Picture."));
});

run("search results → titles + links captured with a count", () => {
  const out = _extractMessageText({
    content: [
      {
        type: "web_search_tool_result",
        content: [
          { type: "web_search_result", title: "Oscars 2026 winners", url: "https://cbc.ca" },
          { title: "Best Picture nominees", url: "https://rottentomatoes.com" },
        ],
      },
    ],
  });
  assert.ok(out.includes("_[Search results (2)]_"), "count captured, got: " + out);
  assert.ok(out.includes("Oscars 2026 winners (https://cbc.ca)"), "result title+url captured");
});

run("code tool_use → labeled with the code", () => {
  const out = _extractMessageText({
    content: [{ type: "tool_use", name: "code_execution", input: { code: "print(1+1)" } }],
  });
  assert.ok(out.includes("_[Code: code_execution]_"), "code label, got: " + out);
  assert.ok(out.includes("print(1+1)"), "code body captured");
});

run("unknown block type is recorded by its type", () => {
  const out = _extractMessageText({ content: [{ type: "container_upload", foo: 1 }] });
  assert.strictEqual(out, "_[container_upload]_", "unknown block type recorded, got: " + out);
});

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
