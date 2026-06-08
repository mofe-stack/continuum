// resume-injector.js — runs in the freshly-opened AI tab (claude.ai,
// chatgpt.com, or gemini.google.com) after the user picks a "Resume in" target. The source tab leaves
// a small marker in chrome.storage.local ({ sessionId, includeFiles, compress,
// target, ts }); here we read it, load that session from IndexedDB, rebuild the
// handoff markdown + attachment files, then auto-fill the composer with the
// editable preamble and attach the files. We do NOT submit — the user reviews
// and presses Send. The composer/send/file selectors cover both sites.
//
// Everything here touches the AI site's live DOM (e.g. Claude's ProseMirror
// composer and the hidden file <input>), so it is FRAGILE in the same way the
// capture selectors are: the sites can rename/restructure without notice. Mitigations: multiple
// selector candidates + fallbacks, a probeComposer() dumper, and the clipboard
// fallback the panel already set (a failed inject never strands the user — the
// handoff is still on their clipboard to paste).

(function () {
  "use strict";

  const Continuum = (window.Continuum = window.Continuum || {});

  const MARKER_KEY = "continuum.pendingResume";
  const MARKER_TTL_MS = 2 * 60 * 1000; // ignore stale markers (>2 min old)
  const COMPOSER_TIMEOUT_MS = 20000;   // how long to wait for the composer to mount

  // Build DOM nodes from a static HTML string WITHOUT innerHTML (which AMO's
  // reviewer linter flags on dynamic values). DOMParser is an accepted, non-sink
  // API; we adopt the parsed body children into the target, replacing its content.
  function setHTML(el, html) {
    const doc = new DOMParser().parseFromString(String(html), "text/html");
    el.replaceChildren(...Array.from(doc.body.childNodes));
  }

  // Composer candidates, most specific first. Covers claude.ai (ProseMirror),
  // chatgpt.com (#prompt-textarea contenteditable / legacy textarea), and
  // gemini.google.com (a Quill .ql-editor inside <rich-textarea>).
  const COMPOSER_SELECTORS = [
    'div[contenteditable="true"].ProseMirror',
    ".ProseMirror[contenteditable='true']",
    "#prompt-textarea",
    'div#prompt-textarea[contenteditable="true"]',
    '[data-testid="chat-input"] [contenteditable="true"]',
    "rich-textarea .ql-editor",
    '.ql-editor[contenteditable="true"]',
    '[contenteditable="true"]',
    'textarea[data-testid="chat-input"]',
    "main textarea",
  ];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ── chrome.storage marker ────────────────────────────────────────────
  function readAndClearMarker() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(MARKER_KEY, (items) => {
          const marker = items && items[MARKER_KEY];
          if (!marker) return resolve(null);
          // Clear immediately so a React re-render / second init can't replay it.
          chrome.storage.local.remove(MARKER_KEY, () => resolve(marker));
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  // ── branded toast (panel.css isn't loaded in the new tab, so styles are
  // inline — but they mirror Continuum's language: charcoal card, hairline
  // border, the bookmark+sparkle mark, a mono "CONTINUUM" label, sans message) ─
  const BRAND_MARK =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true" style="flex:none">' +
    '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M10 5.5 11 7.55 13 8.5 11 9.45 10 11.5 9 9.45 7 8.5 9 7.55Z" fill="currentColor"/>' +
    '<path d="M13 9.4 13.52 10.48 14.6 11 13.52 11.52 13 12.6 12.48 11.52 11.4 11 12.48 10.48Z" fill="currentColor"/>' +
    "</svg>";

  // Matches Continuum's light/dark theme (read from settings) so the toast in the
  // new tab looks like the rest of the extension instead of always dark.
  function isDarkTheme() {
    try {
      return (
        Continuum.settings &&
        Continuum.settings.getResolvedTheme &&
        Continuum.settings.getResolvedTheme() === "dark"
      );
    } catch (e) {
      return false;
    }
  }

  function makeToastCard(message, isError) {
    const dark = isDarkTheme();
    const bg = dark ? "#1b1f27" : "#fcfcfd";
    const borderColor = dark ? "rgba(255,255,255,.10)" : "#d1d5db";
    const msgColor = dark ? "#e5e7eb" : "#1f2937";
    const labelColor = isError ? (dark ? "#f87171" : "#dc2626") : dark ? "#cbd5e1" : "#4b5563";
    const shadow = dark ? "0 8px 30px rgba(0,0,0,.35)" : "0 8px 30px rgba(20,18,14,.18)";

    const card = document.createElement("div");
    card.style.cssText =
      "position:fixed;z-index:2147483647;left:50%;bottom:24px;transform:translateX(-50%);" +
      "box-sizing:border-box;max-width:400px;width:max-content;padding:11px 14px;border-radius:10px;" +
      "background:" + bg + ";border:1px solid " + borderColor + ";" +
      "box-shadow:" + shadow + ";opacity:0;transition:opacity .2s ease;" +
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;";
    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:5px;color:" + labelColor + ";";
    setHTML(header,
      BRAND_MARK +
      '<span style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;' +
      'font-size:10px;letter-spacing:1.5px;text-transform:uppercase;">Continuum</span>');
    const body = document.createElement("div");
    body.textContent = message;
    body.style.cssText = "color:" + msgColor + ";font-size:13px;line-height:1.45;";
    card.appendChild(header);
    card.appendChild(body);
    return { card, body };
  }

  function toast(message, ok) {
    try {
      const { card } = makeToastCard(message, !ok);
      document.body.appendChild(card);
      requestAnimationFrame(() => (card.style.opacity = "1"));
      setTimeout(() => {
        card.style.opacity = "0";
        setTimeout(() => card.remove(), 300);
      }, 5000);
    } catch (e) {
      /* DOM not ready — ignore */
    }
  }

  // A persistent, updatable toast for the (possibly slow) PDF build on big chats,
  // so the user sees progress instead of a frozen-looking tab. Returns
  // { update(msg), done() }.
  function progressToast(initial) {
    let card = null;
    let body = null;
    try {
      const made = makeToastCard(initial, false);
      card = made.card;
      body = made.body;
      document.body.appendChild(card);
      requestAnimationFrame(() => (card.style.opacity = "1"));
    } catch (e) {
      card = null;
    }
    return {
      update(msg) {
        if (body) body.textContent = msg;
      },
      done() {
        if (card) {
          card.style.opacity = "0";
          setTimeout(() => card.remove(), 300);
        }
      },
    };
  }

  // ── composer discovery ───────────────────────────────────────────────
  function findComposer() {
    for (const sel of COMPOSER_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  async function waitForComposer() {
    const deadline = Date.now() + COMPOSER_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const el = findComposer();
      if (el && el.isConnected) return el;
      await sleep(300);
    }
    return null;
  }

  // ── composer text injection ──────────────────────────────────────────
  // The editors are React-controlled contenteditables (Claude's is ProseMirror) or,
  // as a fallback, a textarea. For each we use the mechanism that triggers the
  // framework's own input handling so the value "sticks".
  function setComposerText(editor, text) {
    if (!editor || !text) return false;
    editor.focus();

    // Textarea path: set via the native value setter, then fire input so React sees it.
    if (editor.tagName === "TEXTAREA") {
      try {
        const proto = Object.getPrototypeOf(editor);
        const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
        setter.call(editor, text);
        editor.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      } catch (e) {
        editor.value = text;
        editor.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      }
    }

    // contenteditable / ProseMirror / Lexical path: insertText is intercepted by
    // the editor and routed through its normal input pipeline. selectAll FIRST so
    // the insert REPLACES any existing content instead of appending — this makes
    // the call idempotent, so the verify-retry loop / post-attach re-assert can't
    // stack a second copy of the preamble (the "message sent twice" bug on
    // ChatGPT, whose Lexical editor is slow to reflect textContent so the verify
    // check re-fired).
    try {
      document.execCommand("selectAll", false, null);
      const ok = document.execCommand("insertText", false, text);
      if (ok && (editor.textContent || "").indexOf(text.slice(0, 12)) !== -1) return true;
    } catch (e) {
      /* fall through to paste */
    }

    // Fallback: synthesize a paste with the text on a DataTransfer. The editor
    // handles paste events and inserts the plain text. selectAll first so the
    // paste replaces rather than appends (same idempotency reason as above).
    try {
      document.execCommand("selectAll", false, null);
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      const evt = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt });
      editor.dispatchEvent(evt);
      return true;
    } catch (e) {
      console.warn("[Continuum] setComposerText: all injection methods failed:", e);
      return false;
    }
  }

  // Read the composer's current text (textarea value vs contenteditable text).
  function composerText(editor) {
    if (!editor) return "";
    return (editor.tagName === "TEXTAREA" ? editor.value : editor.textContent) || "";
  }

  // ChatGPT's composer on a freshly-opened tab can sit in the DOM a beat before
  // its rich-text (Lexical) controller is wired up — a lone execCommand
  // insertText then silently no-ops (or gets wiped on hydration). That's the
  // "PDF attached but the message never filled, and a retry worked" symptom. So:
  // fill, verify the text actually landed on the *current* composer node, and
  // retry until it sticks (re-querying each pass in case ChatGPT remounted it).
  async function fillComposerVerified(text, attempts) {
    const probe = (text || "").trim().slice(0, 16);
    for (let i = 0; i < (attempts || 6); i++) {
      const editor = findComposer();
      if (editor && editor.isConnected) {
        setComposerText(editor, text);
        await sleep(250);
        if (!probe || composerText(editor).trim().indexOf(probe) !== -1) return true;
      } else {
        await sleep(250);
      }
    }
    return false;
  }

  // ── file attachment ──────────────────────────────────────────────────
  // Build File objects and hand them to the site's uploader. Primary path: set
  // the hidden <input type=file>.files via a DataTransfer + change event.
  // Fallback: dispatch a drop event carrying the files on the composer.
  function buildFiles(fileSpecs) {
    const out = [];
    for (const f of fileSpecs) {
      try {
        out.push(new File([f.blob], f.name || "file", { type: f.type || f.blob.type || "" }));
      } catch (e) {
        /* skip a file we can't construct */
      }
    }
    return out;
  }

  // Does a file satisfy an input's `accept` attribute?
  function fileMatchesAccept(file, accept) {
    if (!accept) return true; // no restriction → accepts anything
    const type = (file.type || "").toLowerCase();
    const name = (file.name || "").toLowerCase();
    return accept
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .some((tok) => {
        if (tok === "*" || tok === "*/*") return true;
        if (tok.endsWith("/*")) return type.startsWith(tok.slice(0, -1)); // e.g. "image/"
        if (tok.startsWith(".")) return name.endsWith(tok); // extension
        return type === tok; // exact mime
      });
  }

  // Choose the SINGLE file input most likely to accept our files: score by how
  // many files it accepts, prefer unrestricted accept, prefer `multiple`. Picking
  // one (not all) avoids ChatGPT's "you've already uploaded this file" dup error.
  function pickBestInput(inputs, files) {
    let best = null;
    let bestScore = -1;
    for (const input of inputs) {
      const accept = (input.getAttribute("accept") || "").trim();
      let score = files.filter((f) => fileMatchesAccept(f, accept)).length * 10;
      if (!accept) score += 5;
      if (input.multiple) score += 2;
      if (score > bestScore) {
        bestScore = score;
        best = input;
      }
    }
    return best;
  }

  async function attachFiles(editor, fileObjects) {
    if (!fileObjects.length) return true;
    // Fresh DataTransfer per use — a single one can't be reused across inputs
    // reliably once consumed.
    const buildDT = () => {
      const dt = new DataTransfer();
      for (const file of fileObjects) dt.items.add(file);
      return dt;
    };

    // Primary: the hidden <input type="file">. ChatGPT can have SEVERAL (e.g. an
    // image-only one plus an all-types one) and may only mount it after its
    // attach menu opens. We must set the files on exactly ONE input — the
    // best-matching one — because feeding the same file to two inputs that share
    // an uploader makes ChatGPT reject the second as "you've already uploaded
    // this file". (The earlier "first input wins" bug picked an image-only input
    // and silently dropped PDFs; "every input" double-uploaded. Pick the best.)
    // Gemini's "+" opens a MENU (Upload files / Drive / …) — clicking it just leaves
    // a dropdown open with no usable <input>, since its real file input only mounts
    // after "Upload files" → an OS picker we can't drive. So on Gemini we DON'T click
    // a trigger; we go straight to the drag-drop path (it has a real dropzone).
    const isGemini = /(^|\.)gemini\.google\.com$/i.test(location.hostname);
    let inputs = Array.from(document.querySelectorAll('input[type="file"]'));
    if (!inputs.length && !isGemini) {
      const trigger = document.querySelector(
        '[data-testid="composer-plus-btn"], button[aria-label*="attach" i], ' +
          'button[aria-label*="upload" i], button[aria-label*="add photos" i], ' +
          'button[aria-label*="add files" i]'
      );
      if (trigger) {
        try {
          trigger.click();
        } catch (e) {
          /* ignore */
        }
        await sleep(300);
        inputs = Array.from(document.querySelectorAll('input[type="file"]'));
      }
    }
    const chosen = pickBestInput(inputs, fileObjects);
    if (chosen) {
      try {
        chosen.files = buildDT().files;
        chosen.dispatchEvent(new Event("input", { bubbles: true }));
        chosen.dispatchEvent(new Event("change", { bubbles: true }));
        console.log(
          "[Continuum] attachFiles: set files on 1 of " + inputs.length +
            ' input(s) (accept="' + (chosen.getAttribute("accept") || "") + '")'
        );
        return true;
      } catch (e) {
        /* fall through to drop */
      }
    }

    // Fallback: a full drag-drop sequence. Prefer a real DROP ZONE when the page
    // exposes one (Gemini's <… class="…uploader-dropzone…">) so the page's own drop
    // handler actually fires; otherwise the editor. Dispatched with bubbles:true so
    // it reaches whichever ancestor holds the handler. Some uploaders only register
    // the drop if a dragenter/dragover preceded it.
    const target =
      document.querySelector('[class*="uploader-dropzone"], [class*="drop-zone"], [class*="dropzone"], [class*="file-drop"]') ||
      editor || document.querySelector("main") || document.body;
    try {
      for (const type of ["dragenter", "dragover", "drop"]) {
        target.dispatchEvent(
          new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: buildDT() })
        );
      }
      console.log("[Continuum] attachFiles: dispatched drag-drop on " + (target.tagName || "?") + " (no file input found)");
      return true;
    } catch (e) {
      console.warn("[Continuum] attachFiles: input + drop both failed:", e);
      return false;
    }
  }

  // Gemini's upload is gated behind an OS file picker we can't drive, and synthetic
  // drag-drop doesn't take — so for Gemini we DOWNLOAD the handoff file(s) to the
  // user's Downloads instead, and they attach them via Gemini's "Upload files". Each
  // File is a Blob, so an object-URL + a synthetic <a download> click saves it.
  function downloadFiles(fileObjects) {
    let n = 0;
    for (const f of fileObjects) {
      try {
        const url = URL.createObjectURL(f);
        const a = document.createElement("a");
        a.href = url;
        a.download = f.name || "conversation-history";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 15000);
        n++;
      } catch (e) {
        console.warn("[Continuum] gemini download failed:", f && f.name, e && e.message);
      }
    }
    return n;
  }

  // ── auto-send (opt-in) ─────────────────────────────────────────────────
  // claude.ai keeps the Send button DISABLED while an attachment is uploading,
  // so the safe way to auto-send is: wait for the Send button to become ENABLED
  // (= upload finished), then click it. We give the upload a moment to register
  // first, and time out rather than risk sending without the file attached.
  const SEND_SELECTORS = [
    'button[aria-label="Send message"]',
    'button[aria-label*="send message" i]',
    'button[aria-label*="send" i]',
    '[data-testid="send-button"]',
    'button[type="submit"]',
  ];
  function findSendButton() {
    for (const sel of SEND_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }
  function sendEnabled(el) {
    return !!el && !el.disabled && el.getAttribute("aria-disabled") !== "true";
  }

  // The composer's form (or main form) — scope for upload-spinner detection so we
  // don't mistake an unrelated page spinner for an in-progress upload.
  function composerScope(editor) {
    return (
      (editor && editor.closest && editor.closest("form")) ||
      document.querySelector("main form") ||
      document
    );
  }

  // ChatGPT enables Send as soon as there's text — even while the attachment is
  // still uploading — so "Send is enabled" is NOT a safe "upload finished" signal
  // there (clicking too early sends the message WITHOUT the file). While a file
  // uploads, ChatGPT shows a progress indicator in the composer (a Tailwind
  // `.animate-spin` spinner / `[role=progressbar]`). Wait for that to appear and
  // then clear before allowing a send. (Claude disables Send during upload, so
  // this is a no-op there — no spinner appears and we return immediately.)
  async function waitForUploadsToFinish(editor) {
    const scope = composerScope(editor);
    const spinSel = '[role="progressbar"], .animate-spin, [data-testid*="uploading" i]';
    const uploading = () =>
      Array.from(scope.querySelectorAll(spinSel)).some((el) => el.getClientRects().length > 0);

    // Phase 1: give an upload indicator up to 6s to appear. If none shows, the
    // upload was instant or there's no indicator — nothing to wait on.
    const appearBy = Date.now() + 6000;
    while (Date.now() < appearBy && !uploading()) await sleep(200);
    if (!uploading()) return true;

    // Phase 2: wait for every indicator to clear (large/image-heavy PDFs are slow).
    const clearBy = Date.now() + 120000;
    while (Date.now() < clearBy) {
      if (!uploading()) {
        console.log("[Continuum] resume: upload finished");
        return true;
      }
      await sleep(400);
    }
    console.warn("[Continuum] resume: upload indicator never cleared (120s) — sending anyway");
    return false;
  }

  async function clickSendWhenReady(editor) {
    await sleep(1200); // let the upload register so its spinner can be detected
    await waitForUploadsToFinish(editor); // don't send until the file is fully uploaded
    const deadline = Date.now() + 90000; // then wait for an enabled Send button
    while (Date.now() < deadline) {
      const btn = findSendButton();
      if (sendEnabled(btn)) {
        btn.click();
        console.log("[Continuum] resume: auto-send clicked");
        return true;
      }
      await sleep(500);
    }
    console.warn("[Continuum] resume: auto-send timed out waiting for an enabled Send button");
    return false;
  }

  // ── orchestration ─────────────────────────────────────────────────────
  async function performResume(marker) {
    if (!Continuum.storage || !Continuum.handoff) {
      console.warn("[Continuum] resume: storage/handoff modules not ready");
      return;
    }

    let session;
    try {
      session = await Continuum.storage.getSession(marker.sessionId);
    } catch (e) {
      console.warn("[Continuum] resume: getSession failed:", e);
    }
    if (!session) {
      toast("Couldn't load the saved session — paste from your clipboard instead.", false);
      return;
    }

    // Resume format (panel "Resume as Markdown" toggle): markdown ships ONLY
    // conversation-history.md (no embedded/attached images); PDF embeds images.
    // Each format has its OWN resume message (settings), so pick the matching one.
    const wantMarkdown = marker.format === "markdown";
    const settingsNs = Continuum.settings || {};
    // Read the format-specific preamble + compression settings up front (cheap).
    let preamble =
      (wantMarkdown ? settingsNs.DEFAULT_RESUME_PREAMBLE_MD : settingsNs.DEFAULT_RESUME_PREAMBLE) || "";
    let autoSend = false;
    let provider = "anthropic";
    let apiKey = "";
    let keepCount = 10;
    try {
      if (Continuum.settings) {
        const s = await Continuum.settings.getSettings();
        const saved = s && (wantMarkdown ? s.resumePreambleMd : s.resumePreamble);
        if (typeof saved === "string") preamble = saved;
        if (s) autoSend = !!s.autoSendOnResume;
        if (s && s.compressProvider) provider = s.compressProvider;
        if (s && s.compressApiKeys && typeof s.compressApiKeys[provider] === "string") apiKey = s.compressApiKeys[provider];
        if (s && s.compressKeepCount) keepCount = s.compressKeepCount;
      }
    } catch (e) {
      /* keep defaults */
    }
    if (typeof preamble !== "string") preamble = "";

    // Find the composer FIRST — fail fast before the (potentially slow, on big
    // image-heavy chats) PDF build, so we don't burn 30s building a PDF we can't
    // place. The handoff is on the clipboard either way.
    const prog = progressToast("Opening the chat…");
    const editor = await waitForComposer();
    console.log(
      "[Continuum] resume: composer =",
      editor ? editor.tagName + " ." + (typeof editor.className === "string" ? editor.className.slice(0, 60) : "") : "NOT FOUND"
    );
    if (!editor) {
      prog.done();
      toast("Couldn't find the chat box — your handoff is on the clipboard, just paste it.", false);
      return;
    }

    // LLM compression (opt-in): swap in a session whose middle is summarized,
    // keeping the first/last N messages verbatim. Falls back to the full
    // verbatim session on any problem — compression never blocks the resume.
    let compressionNote = "";
    if (marker.compress) {
      const est = Continuum.compressor && Continuum.compressor.estimateTokens;
      const buildHandoff = Continuum.handoff && Continuum.handoff.buildHandoff;
      const turnCount = (session.turns || []).length;
      console.log(
        "[Continuum] resume: compression requested — provider:", provider, "| apiKey set:", !!apiKey,
        "| keepCount:", keepCount, "| messages:", turnCount
      );
      if (!apiKey) {
        // Compression was requested but there's no key — STOP rather than upload
        // the uncompressed chat (the panel normally blocks this earlier).
        prog.done();
        toast("Resume canceled — add a " + provider + " API key in Settings.", false);
        return;
      }
      // Token estimate INCLUDING the per-format image cost. A PDF EMBEDS each image
      // (the model pays ~vision tokens to actually see it), while Markdown only
      // REFERENCES images (≈0 extra) — so the same chat is genuinely cheaper as
      // Markdown, and the readout should show that instead of an identical number.
      const VISION_TOKENS_PER_IMAGE = 1400; // ~Claude's cost for a downscaled (~1024px) embedded image
      const embeddedImageCount = (sess) => {
        let n = 0;
        for (const turn of (sess && sess.turns) || []) {
          for (const att of turn.attachments || []) if (att.type === "image" && att.mediaId) n++;
        }
        return n;
      };
      const payloadTokens = (sess) => {
        const textTk = est ? est(buildHandoff(sess)) : 0;
        return textTk + (wantMarkdown ? 0 : embeddedImageCount(sess) * VISION_TOKENS_PER_IMAGE);
      };
      if (Continuum.llmCompressor && Continuum.llmCompressor.compressSession && buildHandoff) {
        const beforeTk = payloadTokens(session);
        try {
          const compressed = await Continuum.llmCompressor.compressSession(session, {
            keepCount: keepCount,
            provider: provider,
            apiKey: apiKey,
            onProgress: (m) => prog.update(m),
          });
          if (compressed && compressed !== session) {
            const afterTk = payloadTokens(compressed);
            session = compressed;
            const summaryTurn = (compressed.turns || []).find((t) => t.role === "summary");
            const verbatimKept = (compressed.turns || []).length - (summaryTurn ? 1 : 0);
            console.log(
              "[Continuum] resume: kept " + verbatimKept + " messages verbatim + summarized " +
                (summaryTurn ? summaryTurn.omittedCount : 0) + " middle messages"
            );
            const fmt = (Continuum.compressor && Continuum.compressor.formatTokens) || String;
            const pct = beforeTk ? Math.round((1 - afterTk / beforeTk) * 100) : 0;
            const omitted = summaryTurn ? summaryTurn.omittedCount : 0;
            // Attach the compression stats so buildHandoff renders them in the
            // PDF/transcript header (compact token figures, kept/summarized counts).
            session.compressionStats = {
              compressed: true,
              beforeTokens: fmt(beforeTk),
              afterTokens: fmt(afterTk),
              pct: pct,
              verbatimKept: verbatimKept,
              summarized: omitted,
            };
            compressionNote =
              " · " + fmt(beforeTk) + "→" + fmt(afterTk) + " tokens (−" + pct + "%); kept " +
              verbatimKept + " msgs verbatim, summarized " + omitted;
            console.log("[Continuum] resume: compressed " + beforeTk + " → " + afterTk + " tokens (-" + pct + "%)");
          } else {
            // Returned unchanged → too short (≤ keepCount*2 messages).
            console.log("[Continuum] resume: chat too short to compress (need > " + keepCount * 2 + " messages) — verbatim.");
            compressionNote = " · too short to compress";
            toast("This chat is too short to compress (needs > " + keepCount * 2 + " messages) — sending it in full.", false);
          }
        } catch (e) {
          // Compression was requested but failed (invalid/expired key, wrong
          // model, network, etc.) — STOP rather than upload the uncompressed chat.
          console.error("[Continuum] resume: compression failed — resume canceled:", e);
          const reason =
            Continuum.llmCompressor && Continuum.llmCompressor.friendlyError
              ? Continuum.llmCompressor.friendlyError(e)
              : "couldn't compress";
          prog.done();
          toast("Resume canceled — " + reason + ". Check Settings.", false);
          return;
        }
      }
    }

    // Primary: conversation-history.pdf (full transcript + images embedded
    // inline) PLUS any binary documents (PDF/DOCX/…) as their own attachments —
    // documents are NOT merged into the PDF, the AI sites read multiple files fine.
    // Fallback: if PDF generation isn't available/fails, attach the markdown +
    // a CAPPED set of images so a huge chat doesn't dump ~100 attachments and
    // overwhelm the uploader.
    // wantMarkdown (computed above) skips the PDF build and ships
    // conversation-history.md instead; PDF is the default.
    let fileObjects = [];
    let usedPdf = false;
    let pdfMB = 0;
    if (!wantMarkdown && Continuum.pdfExport && Continuum.pdfExport.buildResumePdf) {
      try {
        prog.update("Building conversation-history.pdf…");
        // Transcript + inline images in one PDF; documents ride alongside.
        // `session` here is already the compressed one when compression ran.
        const pdfBlob = await Continuum.pdfExport.buildResumePdf(session, {
          onProgress: (m) => prog.update(m),
        });
        pdfMB = pdfBlob.size / 1048576;
        // Attach the uploaded documents alongside the PDF unless the user turned
        // "Attach files" off in the panel (marker.includeFiles === false).
        const docs =
          marker.includeFiles !== false && Continuum.pdfExport.collectResumeDocuments
            ? Continuum.pdfExport.collectResumeDocuments(session)
            : [];
        fileObjects = buildFiles(
          [{ name: "conversation-history.pdf", blob: pdfBlob, type: "application/pdf" }].concat(docs)
        );
        usedPdf = fileObjects.length > 0;
        if (docs.length) console.log("[Continuum] resume: attaching " + docs.length + " document(s) separately");
      } catch (e) {
        console.warn("[Continuum] resume: PDF build failed, falling back to separate files:", e);
      }
    }
    if (!usedPdf) {
      const { historyText, files } = Continuum.handoff.collectResumeFiles(session, {
        compress: !!marker.compress,
      });
      // Strip cosmetic Markdown so conversation-history.md reads like the PDF (the
      // resume PDF applies the SAME cleanHandoffMarkdown, so the two formats match).
      const cleanMd =
        Continuum.pdfExport && Continuum.pdfExport.cleanHandoffMarkdown
          ? Continuum.pdfExport.cleanHandoffMarkdown(historyText)
          : historyText;
      const mdFile = {
        name: "conversation-history.md",
        blob: new Blob([cleanMd], { type: "text/markdown" }),
        type: "text/markdown",
      };
      // The .md REFERENCES images (![](images/…)) and files ([file: …]) by name;
      // the two "Attach …" toggles decide whether the referenced bytes also ride
      // along. Markdown gates images + documents independently (each default OFF).
      // The PDF-build fallback (!wantMarkdown) attaches images ALWAYS (the PDF would
      // have embedded them) and documents by the files toggle.
      const isImg = (f) => (f.type || (f.blob && f.blob.type) || "").indexOf("image/") === 0;
      const allImages = files.filter(isImg);
      const allDocs = files.filter((f) => !isImg(f));
      const images = wantMarkdown ? (marker.includeImages === true ? allImages : []) : allImages;
      const docs = (wantMarkdown ? marker.includeFiles === true : marker.includeFiles !== false) ? allDocs : [];
      // No cap — attach everything the user explicitly opted into. The AI site may
      // reject a batch over its own attachment limit (claude.ai caps ~20), but that's the user's call.
      fileObjects = buildFiles([mdFile].concat(docs, images));
    }

    console.log("[Continuum] resume: usedPdf =", usedPdf, "| attachments =", fileObjects.length, "| pdfMB =", pdfMB.toFixed(2));
    prog.update("Filling the message…");
    // Fill + verify-and-retry: a cold ChatGPT composer drops the first insert.
    const textOk = await fillComposerVerified(preamble);
    await sleep(150); // let the editor settle before the uploader grabs focus
    // The PDF build can take seconds, during which ChatGPT may have remounted the
    // composer — attach against whatever node is live now, not the stale one.
    const liveEditor = findComposer() || editor;
    // Gemini can't be auto-attached (menu-gated OS picker; drag-drop ignored), so we
    // DOWNLOAD the file(s) and the user attaches them via "Upload files".
    const isGeminiTarget = /(^|\.)gemini\.google\.com$/i.test(location.hostname);
    let filesOk;
    let downloaded = false;
    if (isGeminiTarget && fileObjects.length) {
      filesOk = downloadFiles(fileObjects) > 0;
      downloaded = filesOk;
    } else {
      filesOk = await attachFiles(liveEditor, fileObjects);
    }
    // Registering the first attachment can wipe text typed beforehand (ChatGPT
    // remounts the composer). If our preamble got cleared, re-assert it.
    if (textOk && preamble.trim()) {
      const probe = preamble.trim().slice(0, 16);
      const live = findComposer();
      if (!live || composerText(live).trim().indexOf(probe) === -1) {
        await fillComposerVerified(preamble);
      }
    }
    console.log("[Continuum] resume: setComposerText ok =", textOk, "| attachFiles ok =", filesOk);

    if (!textOk && !filesOk) {
      prog.done();
      toast("Auto-fill didn't take — your handoff is on the clipboard, just paste it.", false);
      return;
    }

    const what =
      (usedPdf
        ? "conversation-history.pdf" + (fileObjects.length > 1 ? " + " + (fileObjects.length - 1) + " document(s)" : "")
        : "conversation-history.md" + (fileObjects.length > 1 ? " + " + (fileObjects.length - 1) + " attachment(s)" : "")) + compressionNote;

    // Gemini: the file was DOWNLOADED, not attached — tell the user to upload it.
    if (downloaded) {
      prog.done();
      toast(
        "Filled your message + downloaded " + what + " — in Gemini, click “+” → Upload files and pick " +
          (fileObjects.length > 1 ? "those files (in your Downloads)" : "it (in your Downloads)") + ", then Send.",
        true
      );
      return;
    }

    // A too-large PDF won't upload (so auto-send can't fire either) — warn.
    if (usedPdf && pdfMB >= 25) {
      prog.done();
      toast(
        "Attached conversation-history.pdf (~" + pdfMB.toFixed(0) +
          " MB) — that's large; if claude.ai won't accept it, tick “Compress for resume” and resume again.",
        false
      );
      return;
    }

    // Auto-send (opt-in): wait for the upload to finish, then click Send.
    if (autoSend && filesOk) {
      prog.update("Waiting for the upload to finish, then sending…");
      const sent = await clickSendWhenReady(findComposer() || editor);
      prog.done();
      toast(
        sent
          ? "Sent — resumed automatically with " + what + "."
          : "Filled + attached " + what + ", but couldn't auto-send — press Send once the upload finishes.",
        sent
      );
      return;
    }

    prog.done();
    toast("Filled your message + attached " + what + " — review and Send.", true);
  }

  // Called from content-script init() on every supported AI page load.
  async function checkPendingResume() {
    let marker;
    try {
      marker = await readAndClearMarker();
    } catch (e) {
      return;
    }
    if (!marker || !marker.sessionId) return;
    console.log("[Continuum] resume: pending marker found — session", marker.sessionId, "compress =", !!marker.compress);
    if (typeof marker.ts === "number" && Date.now() - marker.ts > MARKER_TTL_MS) {
      console.warn("[Continuum] resume: marker is stale (>2 min) — skipping");
      return; // stale — likely a leftover from an abandoned resume
    }
    try {
      await performResume(marker);
    } catch (e) {
      console.warn("[Continuum] resume failed:", e);
    }
  }

  // Diagnostic: dump composer / file-input candidates so the selectors can be
  // fixed fast when the AI site changes its markup. Run from the content-script
  // context (or via a localStorage flag, like probe()).
  function probeComposer() {
    const composerCounts = {};
    for (const sel of COMPOSER_SELECTORS) {
      try {
        composerCounts[sel] = document.querySelectorAll(sel).length;
      } catch (e) {
        composerCounts[sel] = "ERR";
      }
    }
    const fileInputs = Array.from(document.querySelectorAll('input[type="file"]')).map((i) => ({
      accept: i.getAttribute("accept"),
      multiple: i.multiple,
      cls: (typeof i.className === "string" ? i.className : "").slice(0, 120),
      hidden: i.offsetParent === null,
    }));
    const sendCounts = {};
    for (const sel of SEND_SELECTORS) {
      try {
        sendCounts[sel] = document.querySelectorAll(sel).length;
      } catch (e) {
        sendCounts[sel] = "ERR";
      }
    }
    const sendBtn = findSendButton();
    const report = {
      composerCounts,
      fileInputCount: fileInputs.length,
      fileInputs,
      sendCounts,
      sendButton: sendBtn
        ? {
            tag: sendBtn.tagName,
            ariaLabel: sendBtn.getAttribute("aria-label"),
            disabled: sendBtn.disabled || sendBtn.getAttribute("aria-disabled") === "true",
            cls: (typeof sendBtn.className === "string" ? sendBtn.className : "").slice(0, 120),
          }
        : null,
    };
    console.log("[Continuum] composer probe:\n" + JSON.stringify(report, null, 2));
    return report;
  }

  Continuum.resumeInjector = { checkPendingResume, performResume, probeComposer };
})();
