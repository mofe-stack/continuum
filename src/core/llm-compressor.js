// llm-compressor.js — LLM-based handoff compression.
//
// Keeps the first N and last N messages verbatim and replaces the MIDDLE with a
// single LLM-generated summary that preserves the working context (code, files,
// URLs, numbers, decisions, current state). Used ONLY on the resume path; the
// ZIP and "Copy chat history" stay verbatim.
//
// The actual provider API call is made by the background service worker
// (src/background.js) — a content-script fetch can't reach OpenAI/Perplexity
// (no browser CORS), but the worker's fetch bypasses CORS via host_permissions.
// We just message it with the provider + key + text and await the summary.
//
// Compression % (target ~30–55%) is a goal the prompt steers toward, not a
// guarantee: the verbatim ends bound how much can be removed.

(function () {
  "use strict";
  const Continuum = (window.Continuum = window.Continuum || {});

  const SYSTEM_PROMPT =
    "You are condensing the MIDDLE section of a conversation transcript for handoff to a fresh chat. " +
    "The first and last several messages are kept separately, verbatim — you are given ONLY the middle. " +
    "Your job is FAITHFUL condensation, not extreme summarization: keep everything needed to continue " +
    "the work. PRESERVE — all decisions and the reasons for them, every requirement/constraint/" +
    "instruction the user gave, file names, URLs, numbers/measurements. Keep concrete specifics, not " +
    "just topic labels — a reader must be able to pick up the work from your summary alone. " +
    // Targeted anti-context-loss rules — the failure modes a naive summary causes.
    "ATTRIBUTION: make clear WHO wanted each thing — distinguish the user's explicit requirements and " +
    "instructions from the assistant's suggestions; never blur the two. " +
    "NEGATIVE CONSTRAINTS: keep what was REJECTED or ruled out and why (approaches tried and abandoned, " +
    "'don't do X' instructions) — these stop the work from repeating dead ends. " +
    "OPEN ITEMS: keep unresolved questions, pending TODOs, and anything left undecided — not just what " +
    "was concluded. " +
    "CURRENT STATE: when something changed over the conversation, state the LATEST decision as current " +
    "and note it superseded the earlier one; never present a reversed/outdated decision as if it still " +
    "stands. Preserve chronological/causal order where it matters to the outcome. " +
    "Remove ONLY pleasantries, acknowledgements, and verbatim repetition. Aim to roughly HALVE the " +
    "length; do NOT crush it down to a few bullets. Output Markdown. Never invent anything not in the " +
    "transcript; if something is ambiguous, preserve it as-is rather than guessing. Output only the " +
    "condensed content (no preamble like \"Here is\"). " +
    // Hard-guarantee contract for protected content (see protectImportant): code
    // blocks / errors / paths are pulled OUT before you see them and replaced with
    // [[CONTINUUM-KEEP-n]] markers. They are restored verbatim afterward.
    "IMPORTANT: The text contains placeholder markers of the form [[CONTINUUM-KEEP-1]], " +
    "[[CONTINUUM-KEEP-2]], etc. These stand in for verbatim content (code, errors, file paths) that " +
    "MUST be preserved exactly. Keep every marker EXACTLY as written, in its original position relative " +
    "to the surrounding text. Do NOT delete, renumber, merge, reword, or add markers. Treat each marker " +
    "as an opaque token — the real content is reinserted later.";

  // ── Hard guarantee: protect code (and other exact-match content) ─────────
  // Before summarizing, pull every fenced code block (and a few other things that
  // MUST survive byte-for-byte) out of the middle text and swap in a placeholder
  // marker. The LLM only ever sees the markers, so it can't paraphrase, truncate,
  // or drop the real content — it's reinserted verbatim afterward (restoreImportant).
  // This turns "the prompt asks the model to keep code" into an actual guarantee.
  const KEEP_MARKER = (n) => "[[CONTINUUM-KEEP-" + n + "]]";
  // Patterns whose matches are extracted verbatim, in priority order. Fenced code
  // blocks first (the big one), then inline-code spans. Both are common carriers
  // of must-not-change content (commands, identifiers, snippets).
  const PROTECT_PATTERNS = [
    /```[\s\S]*?```/g, // fenced code blocks (``` … ```)
    /`[^`\n]+`/g,       // inline code spans (`foo`)
  ];

  // Inline markdown image refs (![alt](images/…)). Replaced with a plain "[image:
  // alt]" hint before the middle goes to the LLM — the real images are carried onto
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

  // Reinsert the verbatim blocks. Markers the model kept are swapped back in place;
  // any the model dropped/garbled are appended at the end under a heading, so the
  // protected content can NEVER be lost — only, at worst, relocated.
  function restoreImportant(summary, blocks) {
    let out = String(summary == null ? "" : summary);
    const missing = [];
    for (let i = 0; i < blocks.length; i++) {
      const token = KEEP_MARKER(i);
      if (out.indexOf(token) !== -1) {
        out = out.split(token).join(blocks[i]);
      } else {
        missing.push(blocks[i]);
      }
    }
    if (missing.length) {
      out += "\n\n## Preserved content\n\n" + missing.join("\n\n");
    }
    return out;
  }

  // Pure: split turns into the verbatim ends and the middle to summarize.
  // When the chat is too short (≤ keepCount*2), everything is "top" and the
  // middle is empty (caller then skips summarization).
  function sliceTurns(turns, keepCount) {
    const list = Array.isArray(turns) ? turns : [];
    const k = Math.max(1, keepCount | 0);
    if (list.length <= k * 2) return { top: list.slice(), middle: [], bottom: [] };
    return {
      top: list.slice(0, k),
      middle: list.slice(k, list.length - k),
      bottom: list.slice(list.length - k),
    };
  }

  // Attachments of one `type` ("image"|"file") from the summarized middle, carried
  // onto the summary turn so they survive compression. The LLM only summarizes
  // TEXT, so without this the middle's images/files would be unreachable (the
  // summary turn replaces those middle turns). buildHandoff's summary branch lists
  // them under "Images/Files from condensed messages" after the summary text (not
  // in-flow); the resume PDF then embeds the images. Skips attachments whose bytes
  // already ride a verbatim top/bottom turn, and dedupes by mediaId.
  function collectMiddleAttachments(middle, top, bottom, type) {
    if (!Array.isArray(middle) || !middle.length) return [];
    const seen = new Set();
    for (const turn of [].concat(top || [], bottom || [])) {
      for (const att of (turn && turn.attachments) || []) {
        if (att && att.mediaId) seen.add(att.mediaId);
      }
    }
    const out = [];
    for (const turn of middle) {
      for (const att of (turn && turn.attachments) || []) {
        if (!att || att.type !== type || !att.mediaId) continue;
        if (seen.has(att.mediaId)) continue;
        seen.add(att.mediaId);
        out.push(att);
      }
    }
    return out;
  }
  const collectMiddleImages = (middle, top, bottom) => collectMiddleAttachments(middle, top, bottom, "image");
  const collectMiddleFiles = (middle, top, bottom) => collectMiddleAttachments(middle, top, bottom, "file");

  // Pure: build the compressed session clone — verbatim ends with one synthetic
  // `summary` turn between them. Shares id/media/stats with the original. `middle`
  // (the summarized turns) is optional; when given, its images AND files are carried
  // onto the summary turn so they survive into the handoff (see collectMiddle*).
  function assembleCompressed(session, top, bottom, summaryText, omittedCount, middle) {
    const summaryTurn = {
      role: "summary",
      omittedCount: omittedCount,
      content: [{ type: "text", text: summaryText }],
      attachments: collectMiddleImages(middle, top, bottom).concat(collectMiddleFiles(middle, top, bottom)),
      artifacts: [],
    };
    return Object.assign({}, session, { turns: top.concat([summaryTurn], bottom) });
  }

  // Ask the background worker to summarize. Provider/model/key are passed through
  // to it; it owns the per-provider endpoint + request shape (see background.js).
  function summarizeMiddle(middleText, opts) {
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
            text: middleText,
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

  // Returns a compressed clone of `session`, or the original when there's nothing
  // to summarize. Throws on API failure so the caller can fall back to verbatim.
  async function compressSession(session, opts) {
    const o = opts || {};
    const onProgress = typeof o.onProgress === "function" ? o.onProgress : function () {};
    const turns = (session && session.turns) || [];
    const parts = sliceTurns(turns, o.keepCount || 8);
    if (!parts.middle.length) return session; // too short to compress
    if (!o.apiKey) throw new Error("No API key");

    // Render the middle to transcript text (reuse buildHandoff for fidelity:
    // inlined text-file contents, same ## User/## Assistant format). The title
    // header it prepends is harmless context for the summarizer.
    const tempSession = Object.assign({}, session, { turns: parts.middle });
    const middleText =
      Continuum.handoff && Continuum.handoff.buildHandoff
        ? Continuum.handoff.buildHandoff(tempSession)
        : parts.middle.map((t) => (t.content || []).map((b) => b.text || "").join("\n")).join("\n\n");

    // Strip inline image refs before summarizing: the middle's images are carried
    // onto the summary turn and appended after it (assembleCompressed), so a
    // markdown ref in the prose would be a dead/colliding link. Keep the alt text
    // as a plain hint so the summary can still mention the image existed.
    const middleTextNoImgs = stripImageRefs(middleText);

    // Hard guarantee: lift code (and other exact-match content) out before the
    // LLM sees it, summarize the prose around the markers, then restore verbatim.
    const { masked, blocks } = protectImportant(middleTextNoImgs);

    onProgress("Summarizing " + parts.middle.length + " older messages…");
    const rawSummary = await summarizeMiddle(masked, o);
    const summary = restoreImportant(rawSummary, blocks);
    return assembleCompressed(session, parts.top, parts.bottom, summary, parts.middle.length, parts.middle);
  }

  // Lightweight provider/key check — a tiny request via the background worker.
  // Resolves on success, throws the provider's error (e.g. HTTP 401 for a bad
  // key) otherwise. Lets the panel surface key errors before opening a new tab.
  function verifyKey(opts) {
    const o = opts || {};
    if (!o.apiKey) return Promise.reject(new Error("No API key"));
    return summarizeMiddle("ping", { provider: o.provider, apiKey: o.apiKey, model: o.model || "" });
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
    compressSession, sliceTurns, assembleCompressed, collectMiddleImages, collectMiddleFiles,
    verifyKey, friendlyError, protectImportant, restoreImportant, stripImageRefs,
  };
})();
