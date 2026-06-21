// llm-compressor.js — LLM-based handoff compression.
//
// Compresses the WHOLE conversation into a single structured HANDOFF BRIEF for
// resume into a fresh chat. The brief is organized under 7 fixed headings
// (Completed work · Current state · In progress · Next steps · Constraints ·
// Critical context · Discarded attempts) with a global retrieval/verbatim rule
// (weight the start + end most heavily, quote exact values). Used ONLY on the
// resume path; the ZIP and "Copy chat history" stay fully verbatim.
//
// The actual provider API call is made by the background service worker
// (src/background.js) — a content-script fetch can't reach OpenAI/Perplexity
// (no browser CORS), but the worker's fetch bypasses CORS via host_permissions.
// We just message it with the provider + key + text and await the brief.
//
// Compression % (target ~60–75%) is a goal the prompt steers toward, not a
// guarantee: the OVERRIDING goal is keeping context intact — nothing is lost —
// and code-heavy chats compress less because code is preserved verbatim.

(function () {
  "use strict";
  const Continuum = (window.Continuum = window.Continuum || {});

  // Below this many turns there's nothing worth condensing — resume verbatim.
  const MIN_TURNS = 4;

  const SYSTEM_PROMPT =
    "You are condensing a full conversation transcript into a structured HANDOFF BRIEF so a " +
    "fresh chat can continue the work with zero loss of context. " +
    "OVERRIDING GOAL: keep the CONTEXT FULLY INTACT — nothing is lost. Every decision, " +
    "requirement, constraint, file, URL, number, identifier, error, open item, and rejected " +
    "approach from the conversation MUST survive into the brief. With the full context preserved, " +
    "compress the WORDING — aim to cut total length by roughly 60–75% using tight, " +
    "information-dense bullet points rather than full prose. Never drop or blur a piece of context " +
    "to hit that number, and never invent anything not in the transcript; if something is " +
    "ambiguous, preserve it as-is rather than guessing. " +
    // Output format — the 7 fixed headings, in order, omit-empty.
    "OUTPUT FORMAT — organize the brief under these exact headings, in this order, with tight, " +
    "information-dense bullet points under each. Omit any heading that has nothing to report. Do " +
    "NOT include a heading with placeholder text like \"None\" or \"N/A\" — leave it out entirely. " +
    // Global retrieval + verbatim rule.
    "RETRIEVAL & VERBATIM (applies to the WHOLE brief, not any one section): when deciding what to " +
    "pull in, weight the LATEST and EARLIEST messages most heavily — the end holds the current " +
    "state, the start holds the original goal and framing — while still drawing relevant context " +
    "from the middle. Anywhere in the brief, reproduce VERBATIM (exact quote, not paraphrase) " +
    "anything that must be exact — the user's latest request, exact values/names/states, error " +
    "text, identifiers, URLs, numbers, config, must-follow instructions — judging by importance, " +
    "from anywhere in the chat; condense everything else. " +
    "1. Completed work — tasks and changes that were finished, and what they accomplished " +
    "(finished items only — not the live task below). " +
    "2. Current state — a snapshot of where things stand right now: the files/components " +
    "touched and their current status (created / modified / working / broken / partially done), " +
    "plus the exact current values, config, or state that define it. Include the CURRENT/latest " +
    "version of important code, files, and config here VERBATIM (the actual block, not just a " +
    "description of it) — this is the working state the next chat continues from, so it must be " +
    "complete enough to pick up without the original transcript. Superseded/earlier versions are " +
    "condensed away; only the current one is reproduced in full. " +
    "3. In progress — a STATUS description of the specific task actively underway at the latest " +
    "point but NOT yet finished: what's being worked on and how far along it is (what's done so far, " +
    "what's left). Describe the state of the work — do NOT list the actions to take here (those go " +
    "in Next steps). Distinct from the file/status snapshot in Current state and the finished items " +
    "in Completed work. " +
    "4. Next steps — a PRESCRIPTIVE, ordered to-do list of the concrete actions to take next " +
    "(including finishing the in-progress task, then what follows). Imperative steps, not status. " +
    "Include any unresolved decision as an explicit \"DECIDE: X vs Y\" item, so open questions are " +
    "not lost. " +
    "5. Constraints — the user's stated preferences and explicit requirements, project " +
    "requirements, and key decisions made (make clear WHO decided each). " +
    "6. Critical context — anything else essential to continue that doesn't fit the headings " +
    "above: gotchas, environment/config facts, dependencies, key references, non-obvious rationale. " +
    "7. Discarded attempts — approaches that were tried and rejected, and why, so they are not " +
    "repeated. " +
    "Be concise but preserve enough detail that the work can continue seamlessly. Images and files " +
    "from the conversation are preserved and listed separately after this brief — refer to them by " +
    "name; do not attempt to reproduce their contents. For EACH image and file, give a one-line " +
    "note of what it is / why it matters in context, and reference it by name wherever it's " +
    "relevant in the brief above. " +
    "Output Markdown using the 7 headings as ## sections. Output only the brief itself (no " +
    "preamble like \"Here is\"). " +
    // Hard-guarantee contract for protected content (see protectImportant): code
    // blocks / errors / paths are pulled OUT before you see them and replaced with
    // [[CONTINUUM-KEEP-n]] markers. They are restored verbatim afterward.
    "IMPORTANT: The text contains placeholder markers of the form [[CONTINUUM-KEEP-1]], " +
    "[[CONTINUUM-KEEP-2]], etc. These stand in for verbatim content (code, errors, file paths) that " +
    "MUST be preserved exactly. Keep every marker EXACTLY as written, in its original position " +
    "relative to the surrounding text. Do NOT delete, renumber, merge, reword, or add markers. Treat " +
    "each marker as an opaque token — the real content is reinserted later.";

  // ── Hard guarantee: protect code (and other exact-match content) ─────────
  // Before summarizing, pull every fenced code block (and a few other things that
  // MUST survive byte-for-byte) out of the text and swap in a placeholder marker.
  // The LLM only ever sees the markers, so it can't paraphrase, truncate, or drop
  // the real content — it's reinserted verbatim afterward (restoreImportant). This
  // turns "the prompt asks the model to keep code" into an actual guarantee.
  const KEEP_MARKER = (n) => "[[CONTINUUM-KEEP-" + n + "]]";
  // Patterns whose matches are extracted verbatim, in priority order. Fenced code
  // blocks first (the big one), then inline-code spans. Both are common carriers
  // of must-not-change content (commands, identifiers, snippets).
  const PROTECT_PATTERNS = [
    /```[\s\S]*?```/g, // fenced code blocks (``` … ```)
    /`[^`\n]+`/g,       // inline code spans (`foo`)
  ];

  // Inline markdown image refs (![alt](images/…)). Replaced with a plain "[image:
  // alt]" hint before the text goes to the LLM — the real images are carried onto
  // the summary turn and appended after it, so leaving a markdown ref in the prose
  // would be a dead link (or collide with the appended block on path-match).
  const IMG_REF_RE = /!\[([^\]]*)\]\([^)]*\)/g;
  function stripImageRefs(text) {
    return String(text == null ? "" : text).replace(IMG_REF_RE, (_m, alt) =>
      alt ? "[image: " + alt + "]" : "[image]"
    );
  }

  function protectImportant(text) {
    let out = String(text == null ? "" : text);
    const blocks = [];
    for (const re of PROTECT_PATTERNS) {
      out = out.replace(re, (match) => {
        const token = KEEP_MARKER(blocks.length);
        blocks.push(match);
        return token;
      });
    }
    return { masked: out, blocks };
  }

  // Reinsert the verbatim code the model KEPT a marker for — restored in place, so
  // referenced code is byte-exact and in context. Markers the model DROPPED are
  // simply omitted from the resume: the model judged that code non-essential to
  // continue, and the FULL verbatim code is always in the ZIP / "Copy chat history"
  // capture, so nothing is permanently lost. (There is deliberately no
  // `## Preserved content` dump — it was unlabeled, out-of-context, and bloated the
  // brief; "code preserved exactly" therefore means *referenced* code.)
  function restoreImportant(summary, blocks) {
    let out = String(summary == null ? "" : summary);
    for (let i = 0; i < blocks.length; i++) {
      // split/join is a no-op when the marker is absent (a dropped block), so kept
      // markers restore and dropped ones leave nothing behind.
      out = out.split(KEEP_MARKER(i)).join(blocks[i]);
    }
    return out;
  }

  // ── Attachments ──────────────────────────────────────────────────────────
  // The brief replaces ALL turns with one synthetic summary turn, so every image
  // and file referenced anywhere in the conversation must be carried onto it or it
  // becomes unreachable. Deduped by mediaId (else name+type). buildHandoff's summary
  // branch renders these (images embedded in the PDF, files referenced) with the
  // per-attachment context the model wrote (see parseAttachmentContext).
  function collectAllAttachments(turns) {
    const seen = new Set();
    const out = [];
    for (const turn of turns || []) {
      for (const att of (turn && turn.attachments) || []) {
        if (!att || (att.type !== "image" && att.type !== "file")) continue;
        // Pasted content (no filename → name "attachment", isPasted) is NOT a real
        // file — its text already rides in the transcript the LLM summarized. Don't
        // carry it onto the brief, or it shows up as a bogus `## Files` entry (and
        // the file count, which excludes pasted, would disagree with the brief).
        if (att.isPasted) continue;
        const key = att.mediaId || att.type + ":" + (att.name || "");
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(att);
      }
    }
    return out;
  }

  // Appended to the model input so it knows which attachments exist and can write a
  // one-line context for each, AND emit a machine-readable trailer we parse back
  // (parseAttachmentContext) to caption each image/file. Empty when no attachments.
  function buildAttachmentManifest(atts) {
    if (!atts || !atts.length) return "";
    const imgs = atts.filter((a) => a.type === "image").map((a) => a.name).filter(Boolean);
    const files = atts.filter((a) => a.type === "file").map((a) => a.name).filter(Boolean);
    if (!imgs.length && !files.length) return "";
    const lines = ["---",
      "ATTACHMENTS IN THIS CONVERSATION — refer to each by its exact name where relevant in the " +
        "brief above, with a one-line note of what it is / why it matters:"];
    if (imgs.length) lines.push("Images: " + imgs.join(", "));
    if (files.length) lines.push("Files: " + files.join(", "));
    lines.push("");
    lines.push(
      "After the brief, append a fenced code block tagged continuum-attachments with ONE line per " +
        "attachment in the exact form  name<TAB>one-line context  (a literal tab between the name and " +
        "its note). Include every name listed above; no extra commentary. This block is read by " +
        "software, not shown to the user."
    );
    return lines.join("\n");
  }

  // Normalize a filename for fuzzy matching (the model may re-spell/sanitize names).
  function normAtt(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  // Extract the continuum-attachments trailer the model emitted, map name→context,
  // strip the block from the visible brief, and clone each attachment with its
  // `_context`. Graceful: no trailer → atts unchanged, text unchanged.
  const ATT_BLOCK_RE = /```continuum-attachments\s*\n([\s\S]*?)```/i;
  function parseAttachmentContext(rawSummary, atts) {
    let text = String(rawSummary == null ? "" : rawSummary);
    const ctxByName = new Map();
    const m = text.match(ATT_BLOCK_RE);
    if (m) {
      for (const raw of String(m[1] || "").split("\n")) {
        const line = raw.replace(/^[-*]\s*/, "").trim();
        if (!line) continue;
        let name, ctx;
        const tab = line.indexOf("\t");
        if (tab !== -1) {
          name = line.slice(0, tab);
          ctx = line.slice(tab + 1);
        } else {
          // Fall back to a " - " / " : " separator if the model dropped the tab.
          const sep = line.search(/\s[-–—:]\s/);
          if (sep !== -1) {
            name = line.slice(0, sep);
            ctx = line.slice(sep).replace(/^\s[-–—:]\s/, "");
          } else {
            name = line;
            ctx = "";
          }
        }
        name = (name || "").trim();
        ctx = (ctx || "").trim();
        if (name) ctxByName.set(normAtt(name), ctx);
      }
      text = text.replace(ATT_BLOCK_RE, "").replace(/\n{3,}/g, "\n\n").trim();
    }
    const withCtx = (atts || []).map((a) => {
      const c = ctxByName.get(normAtt(a.name || ""));
      return c ? Object.assign({}, a, { _context: c }) : a;
    });
    return { text: text, attachments: withCtx };
  }

  // Pure: build the compressed session clone — a single synthetic `summary` turn
  // carrying the brief text + every image/file from the whole conversation (with
  // per-attachment `_context` where the model provided it). Shares id/media/stats
  // with the original. `omittedCount` is the number of source turns condensed.
  function assembleCompressed(session, summaryText, omittedCount, attachments) {
    const summaryTurn = {
      role: "summary",
      omittedCount: omittedCount,
      content: [{ type: "text", text: summaryText }],
      attachments: attachments || [],
      artifacts: [],
    };
    return Object.assign({}, session, { turns: [summaryTurn] });
  }

  // Ask the background worker to summarize. Provider/model/key are passed through
  // to it; it owns the per-provider endpoint + request shape (see background.js).
  function summarize(text, opts) {
    return new Promise((resolve, reject) => {
      let settled = false;
      try {
        chrome.runtime.sendMessage(
          {
            type: "continuum-summarize",
            provider: opts.provider || "anthropic",
            apiKey: opts.apiKey,
            model: opts.model || "",
            system: SYSTEM_PROMPT,
            text: text,
          },
          (resp) => {
            if (settled) return;
            settled = true;
            const lastErr = chrome.runtime.lastError;
            if (lastErr) return reject(new Error(lastErr.message || "background unavailable"));
            if (!resp) return reject(new Error("no response from background worker"));
            if (!resp.ok) return reject(new Error(resp.error || "summarization failed"));
            resolve(resp.text);
          }
        );
      } catch (e) {
        if (!settled) {
          settled = true;
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      }
    });
  }

  // Returns a compressed clone of `session` (one summary turn = the 7-heading
  // brief), or the original when the chat is too short. Throws on API failure so
  // the caller can fall back to verbatim.
  async function compressSession(session, opts) {
    const o = opts || {};
    const onProgress = typeof o.onProgress === "function" ? o.onProgress : function () {};
    const turns = (session && session.turns) || [];
    if (turns.length < MIN_TURNS) return session; // too short to compress
    if (!o.apiKey) throw new Error("No API key");

    // Render the WHOLE conversation to transcript text (reuse buildHandoff for
    // fidelity: inlined text-file contents, same ## User/## Assistant format).
    const fullText =
      Continuum.handoff && Continuum.handoff.buildHandoff
        ? Continuum.handoff.buildHandoff(session)
        : turns.map((t) => (t.content || []).map((b) => b.text || "").join("\n")).join("\n\n");

    // Carry every image/file onto the summary turn (the brief replaces all turns).
    const atts = collectAllAttachments(turns);

    // Strip inline image refs (dead links once the turns are gone — keep alt as a
    // hint), then lift code out behind markers so the LLM can't lose it.
    const textNoImgs = stripImageRefs(fullText);
    const { masked, blocks } = protectImportant(textNoImgs);
    const manifest = buildAttachmentManifest(atts);
    const modelInput = manifest ? masked + "\n\n" + manifest : masked;

    onProgress("Summarizing " + turns.length + " messages…");
    const rawSummary = await summarize(modelInput, o);
    // Parse the attachment-context trailer FIRST (before code restore, so restored
    // ``` fences can't confuse the parser), then restore the verbatim code blocks.
    const parsed = parseAttachmentContext(rawSummary, atts);
    const summary = restoreImportant(parsed.text, blocks);
    return assembleCompressed(session, summary, turns.length, parsed.attachments);
  }

  // Lightweight provider/key check — a tiny request via the background worker.
  // Resolves on success, throws the provider's error (e.g. HTTP 401 for a bad
  // key) otherwise. Lets the panel surface key errors before opening a new tab.
  function verifyKey(opts) {
    const o = opts || {};
    if (!o.apiKey) return Promise.reject(new Error("No API key"));
    return summarize("ping", { provider: o.provider, apiKey: o.apiKey, model: o.model || "" });
  }

  // Turns a raw provider/network error into one short, clean phrase for a toast.
  // (The full error is still logged to the console for debugging.)
  function friendlyError(err) {
    const raw = (err && err.message ? err.message : String(err || "")).trim();
    if (/401|incorrect api key|invalid api key|invalid x-api-key|unauthorized/i.test(raw)) return "invalid API key";
    if (/403|forbidden|permission/i.test(raw)) return "this key can't use that model";
    if (/404|no such model|unknown model|model.*not.*(found|exist)/i.test(raw)) return "model not available for this key";
    if (/429|rate.?limit|quota|insufficient|billing|credit/i.test(raw)) return "rate limited or out of credits";
    if (/failed to fetch|networkerror|network error|load failed/i.test(raw)) return "couldn't reach the provider";
    if (/\b5\d\d\b/.test(raw)) return "provider server error";
    return "couldn't compress";
  }

  Continuum.llmCompressor = {
    compressSession, assembleCompressed, collectAllAttachments, buildAttachmentManifest,
    parseAttachmentContext, verifyKey, friendlyError, protectImportant, restoreImportant,
    stripImageRefs, MIN_TURNS,
  };
})();
