// gemini-adapter.js — captures a Gemini (gemini.google.com) conversation into the
// normalized session model. Mirrors the claude/chatgpt adapter surface so the
// panel + router treat all three the same:
//   captureFast, capture (the real path here), detectTitle, detectStartedAt,
//   peekStats, peekStatsFast, peekSignal, probe.
//
// WHY DOM, not API: Gemini has no clean REST conversation endpoint — the web app
// talks to the backend over an obfuscated `batchexecute` RPC that's impractical
// to replay. So capture SCRAPES the rendered conversation DOM. captureFast just
// defers to the DOM capture (kept for router parity).
//
// Selectors are GUESSES until verified on the live DOM — Gemini ships Angular
// custom elements (<user-query>, <model-response>, <message-content>) whose class
// names change. Run `Continuum.geminiAdapter.probe()` (or the continuum_probe
// localStorage flag) on a real chat and tune SEL from the report.

(function () {
  "use strict";
  const Continuum = (window.Continuum = window.Continuum || {});
  const model = () => Continuum.model;
  const MAX_INLINE_TEXT = 200000;

  // Candidate selectors (comma lists = try each). Tune from probe() output.
  const SEL = {
    // A conversation turn pair (user query + model response live inside it).
    turn: ".conversation-container, div.conversation-container, [data-test-id='conversation-turn']",
    userQuery: "user-query, [data-test-id='user-query'], .user-query-container",
    userText: ".query-text, .query-content, .user-query-bubble-container .query-text-line",
    modelResponse: "model-response, [data-test-id='model-response'], .model-response-container",
    modelText: "message-content .markdown, .markdown.markdown-main-panel, message-content, .model-response-text",
    // Attachment hints inside a turn (uploads from the user, files/images from Gemini).
    // Real Gemini elements (probe-confirmed): generated-file = the "Your PDF is
    // ready" cards; user-query-file-preview = a file YOU uploaded. Plus broad
    // fallbacks for older/other shapes.
    fileChip:
      "generated-file, user-query-file-preview, " +
      "[data-test-id='file-preview'], .file-preview, uploaded-file, .attachment-container, .file-chip, " +
      "code-immersive-panel, [data-test-id*='file'], [class*='file-card'], [class*='attachment']",
  };

  // A card's action button ("Open"/"Download"/"Preview") and the file-type labels
  // Gemini shows as a separate badge ("PDF", "JSON", …) — used to detect generated
  // file cards (which don't match the chip selectors) and rebuild their filename.
  const OPEN_RE = /^\s*(open|download|preview|view)\s*$/i;
  const TYPE_RE = /^(pdf|json|csv|tsv|txt|md|markdown|zip|docx?|xlsx?|pptx?|html?|xml|ya?ml|js|ts|py|rb|go|rs|c|cpp|java|sql|log)$/i;
  const HAS_EXT_RE = /\.[a-z0-9]{2,5}$/i;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Count by the PRECISE turn tags (one per message). The broad SEL selectors
  // overlap (.user-query-container matches user-query-content too, .conversation-
  // container wraps each pair), which triple-counted and showed "84" in the loading
  // progress for a 28-message chat. Fall back to containers only if the tags are gone.
  const turnCount = () => {
    const n = document.querySelectorAll("user-query, model-response").length;
    return n || document.querySelectorAll(SEL.turn).length;
  };

  // Gemini renders the app shell first and fetches the conversation a beat later, so
  // capture/probe must WAIT or they read an empty DOM. We wait until the turn count
  // is non-zero and STABLE (unchanged across two polls = finished rendering) — NOT
  // for the loading spinner, since Gemini keeps a <chat-loading-animation> element
  // in the DOM permanently (that's why capture hung). Returns true once stable.
  async function waitForConversation(maxMs) {
    const deadline = Date.now() + (maxMs || 15000);
    let last = -1;
    let stable = 0;
    while (Date.now() < deadline) {
      const n = turnCount();
      if (n > 0 && n === last) {
        if (++stable >= 2) return true;
      } else {
        stable = 0;
      }
      last = n;
      await sleep(400);
    }
    return turnCount() > 0;
  }

  // The actually-scrollable chat element (the one whose content overflows). Gemini
  // virtualizes history, so only mounted turns are in the DOM until we scroll.
  function findScroller() {
    const cands = document.querySelectorAll(
      "chat-window-content infinite-scroller, chat-window infinite-scroller, infinite-scroller, chat-window-content, main"
    );
    for (const el of cands) if (el.scrollHeight > el.clientHeight + 40) return el;
    return cands[0] || null;
  }

  // Scroll the history to the TOP repeatedly so every lazily-rendered turn mounts
  // (Gemini keeps them mounted once loaded — confirmed: scrolling up grows the
  // count and doesn't drop the bottom).
  //
  // Why this isn't just "stop when the turn count stops growing": on a long chat,
  // older turns mount a beat slower, so a count that watched only the turn tags
  // went steady for a few polls mid-load and bailed early — capturing e.g. 20 of
  // 26 messages. We now treat the history as "still loading" if ANY of three
  // signals move: the turn count, the scroll height, or the scroll position
  // (Gemini prepends older turns ABOVE, which shoves scrollTop back off 0). Only
  // when all three hold steady across several polls do we conclude we've reached
  // the top. Each step nudges to the top twice with a settle between, since a lazy
  // batch often lands just after the first scroll.
  async function loadAllTurns(onProgress, maxMs) {
    const scroller = findScroller();
    if (!scroller) return;
    const deadline = Date.now() + (maxMs || 45000);
    let lastCount = -1;
    let lastHeight = -1;
    let stable = 0;
    while (Date.now() < deadline) {
      scroller.scrollTop = 0; // request older turns above
      await sleep(500);
      scroller.scrollTop = 0; // re-pull: a batch that mounted above pushed us down
      await sleep(500);
      const n = turnCount();
      const h = scroller.scrollHeight;
      if (typeof onProgress === "function") onProgress("Loading full history… (" + n + " messages)");
      // >32px height delta ignores minor image/reflow jitter; a prepended turn is
      // hundreds of px. scrollTop>4 means content was still mounting above us.
      const growing = n !== lastCount || Math.abs(h - lastHeight) > 32 || scroller.scrollTop > 4;
      if (growing) {
        stable = 0;
      } else if (++stable >= 4) {
        break; // count, height, AND scroll position all steady → top reached
      }
      lastCount = n;
      lastHeight = h;
    }
    await sleep(300); // let the final batch settle
  }

  async function mapLimit(items, limit, fn) {
    const queue = items.slice();
    const worker = async () => {
      let next;
      while ((next = queue.shift()) !== undefined) await fn(next);
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  }

  function firstMatch(root, selectorList) {
    for (const sel of selectorList.split(",")) {
      const el = root.querySelector(sel.trim());
      if (el) return el;
    }
    return null;
  }

  // Fetch via the BACKGROUND worker — Gemini's images live on lh3.googleusercontent.com,
  // which a content-script fetch can't read (CORS: no Access-Control-Allow-Origin).
  // The worker's fetch uses host_permissions and isn't subject to CORS; it returns
  // base64 we rebuild into a Blob.
  function fetchBlobViaWorker(url) {
    return new Promise((resolve) => {
      let settled = false;
      try {
        chrome.runtime.sendMessage({ type: "continuum-fetch", url: url }, (resp) => {
          if (settled) return;
          settled = true;
          if (chrome.runtime.lastError || !resp || !resp.ok || !resp.base64) return resolve(null);
          try {
            const bin = atob(resp.base64);
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            resolve(new Blob([arr], { type: resp.mime || "application/octet-stream" }));
          } catch (e) {
            resolve(null);
          }
        });
      } catch (e) {
        if (!settled) resolve(null);
      }
    });
  }

  async function fetchBlob(url) {
    const b = await fetchBlobInner(url);
    // Firefox: any page-realm content-script blob dies before save — convert every
    // fetched blob to a clean content-script blob now (idempotent for clean ones).
    return b && Continuum.media && Continuum.media.isGecko && Continuum.media.toCleanBlob
      ? await Continuum.media.toCleanBlob(b)
      : b;
  }
  async function fetchBlobInner(url) {
    if (!url) return null;
    // blob:/data: URLs are page-local — only the CONTENT SCRIPT can read them (the
    // worker can't), and they don't take a credentials option. Try them in-page.
    const isLocal = /^(blob:|data:)/i.test(url);
    // Firefox: a content-script fetch().blob() returns a PAGE-REALM blob we can't
    // read (and it "succeeds", shadowing the fallbacks below). Get clean bytes
    // another way: page-local blob:/data: URLs are read in the page realm (only it
    // owns them); http(s) URLs go through the background worker, then a page-realm
    // read as same-origin fallback.
    if (Continuum.media && Continuum.media.isGecko) {
      if (isLocal) {
        const viaPage = await Continuum.media.fetchViaPage(url);
        if (viaPage) return viaPage;
      } else {
        const viaWorkerFF = await Continuum.media.fetchViaWorker(url);
        if (viaWorkerFF) return viaWorkerFF;
        const viaPageFF = await Continuum.media.fetchViaPage(url);
        if (viaPageFF) return viaPageFF;
      }
    }
    try {
      const res = await fetch(url, isLocal ? {} : { credentials: "include" });
      if (res.ok) return await res.blob();
    } catch (e) {
      /* fall through */
    }
    if (isLocal) {
      console.warn("[Continuum] gemini IMG FETCH FAILED (page-local) — full url:", url);
      return null; // worker can't fetch a page blob:/data: URL
    }
    // Cross-origin (googleusercontent): the worker bypasses CORS via host_permissions.
    const viaWorker = await fetchBlobViaWorker(url);
    if (viaWorker) return viaWorker;
    // Last resort: direct again without credentials (some signed URLs 403 WITH cookies).
    try {
      const res = await fetch(url, { credentials: "omit" });
      if (res.ok) return await res.blob();
    } catch (e) {
      /* give up */
    }
    console.warn("[Continuum] gemini IMG FETCH FAILED (direct+worker+nocreds) — full url:", url);
    return null;
  }

  function detectTitle() {
    // Active chat title lives in the conversation list (selected item) or the tab.
    const sel = document.querySelector(
      "[data-test-id='conversation'].selected .conversation-title, .conversation.selected .title, .chat-title"
    );
    const strip = (s) => String(s || "").replace(/\s*[-|–]\s*(Google\s+)?Gemini\s*$/i, "").trim();
    const fromList = sel && strip(sel.textContent);
    if (fromList) return fromList;
    const t = strip(document.title);
    return t || "Gemini conversation";
  }

  // Gemini's chat UI rarely surfaces a per-conversation start time. Best effort: if a
  // semantic <time datetime="…"> / [datetime] element exists in the history, use the
  // EARLIEST one (= when the chat began); otherwise it's genuinely unknown (null).
  // Scoped to the history container so we don't pick up unrelated dates elsewhere.
  async function detectStartedAt() {
    let earliest = null;
    try {
      const root = findHistoryContainer() || document.body;
      for (const el of root.querySelectorAll("time[datetime], [datetime]")) {
        const t = Date.parse(el.getAttribute("datetime") || "");
        if (!isNaN(t) && (earliest == null || t < earliest)) earliest = t;
      }
    } catch (e) {
      /* unknown */
    }
    return earliest ? new Date(earliest).toISOString() : null;
  }

  // An <img> worth capturing (a content image, not a UI icon/avatar). Filters out
  // tiny glyphs, inline SVG data-URIs, and obvious avatar/sprite sources.
  function isContentImage(img) {
    const src = img.currentSrc || img.src || "";
    if (!src || /^data:image\/svg/i.test(src)) return false;
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    if (w && h && (w < 48 || h < 48)) return false; // icon-sized → skip
    if (/avatar|sprite|icon|logo|profile/i.test(src)) return false;
    return true;
  }

  // Find file-card elements in a turn: explicit chip selectors PLUS a heuristic —
  // Gemini's generated-file cards ("Your PDF file is ready" → filename + type badge
  // + Open button) match no stable selector, so we locate each via its Open/Download
  // control and climb to the smallest card-sized wrapper around it.
  function findFileCards(el) {
    const cards = new Set();
    for (const node of el.querySelectorAll(SEL.fileChip)) cards.add(node);
    for (const btn of el.querySelectorAll("button, a, [role='button']")) {
      const label = (btn.getAttribute("aria-label") || btn.textContent || "").trim();
      if (!OPEN_RE.test(label)) continue;
      // Climb while the ancestor is still "card-sized" (short text); the last such
      // ancestor is the whole card (filename + type + button) without spilling into
      // the surrounding message prose.
      let best = null;
      let node = btn.parentElement;
      for (let i = 0; i < 6 && node && node !== el; i++) {
        const len = ((node.innerText || node.textContent || "").trim()).length;
        if (len > 0 && len <= 160) best = node;
        else break;
        node = node.parentElement;
      }
      if (best) cards.add(best);
    }
    // One uploaded file matches as NESTED elements (user-query-file-preview →
    // [data-test-id=uploaded-file] → [data-test-id=filename-label]); the innermost
    // yields the name without its extension, so it escaped the name-dedupe and
    // double-counted the file. Keep only the OUTERMOST card (drop any node that's
    // contained by another matched card) so one file = one attachment.
    const arr = Array.from(cards);
    return arr.filter((c) => !arr.some((o) => o !== c && o.contains(c)));
  }

  // Rebuild a filename from a card whose name + type are shown separately, e.g.
  // ["lebron_james_gallery", "PDF", "Open"] → "lebron_james_gallery.pdf".
  function pickFileName(card) {
    const aria = (card.getAttribute("aria-label") || card.getAttribute("title") || "").trim();
    if (aria && HAS_EXT_RE.test(aria)) return aria.replace(/\s+/g, " ").slice(0, 200);
    const lines = (card.innerText || card.textContent || "").split(/\n+/).map((s) => s.trim()).filter(Boolean);
    let type = "";
    let base = "";
    for (const ln of lines) {
      if (OPEN_RE.test(ln)) continue;
      if (TYPE_RE.test(ln)) { type = ln.toLowerCase(); continue; }
      if (ln.length > base.length) base = ln; // longest non-type/non-button line = the name
    }
    if (!base) return null;
    if (HAS_EXT_RE.test(base)) return base.slice(0, 200);
    return (type ? base + "." + type : base).slice(0, 200);
  }

  // Pull attachments (images + file cards) from one turn element. Returns
  // [{ kind:"image"|"file", name, url }]. URLs are fetched later (capture()).
  function scrapeAttachments(el) {
    const out = [];
    const seenImg = new Set();
    const seenFile = new Set();
    // Skip web-CITATION thumbnails/favicons (Gemini shows these in source carousels
    // under responses) — they're not conversation content and pollute the image
    // count. Only real content images (uploads, generated images) are kept.
    const SOURCE_ANCESTORS =
      "sources-carousel-inline, source-inline-chip, source-footnote, sources-list, message-actions, mat-icon, gem-icon";
    for (const img of el.querySelectorAll("img")) {
      if (img.closest(SOURCE_ANCESTORS)) continue;
      if (/(^|\.)gstatic\.com$/i.test((() => { try { return new URL(img.src, location.href).hostname; } catch (e) { return ""; } })())) continue;
      if (!isContentImage(img)) continue;
      const url = img.currentSrc || img.src;
      if (seenImg.has(url)) continue;
      seenImg.add(url);
      const alt = (img.getAttribute("alt") || "").trim();
      // Mark images YOU uploaded (probe-confirmed marker: data-test-id=uploaded-img,
      // inside user-query-file-preview). On revisit their src is a locked
      // googleusercontent URL we can't fetch — capture() recovers those from the
      // upload vault by matching upload order, so flag them here.
      const isUpload =
        img.getAttribute("data-test-id") === "uploaded-img" ||
        !!img.closest("user-query-file-preview, user-query-file-carousel");
      out.push({ kind: "image", name: alt || "image.png", url: url, isUpload: isUpload });
    }
    for (const card of findFileCards(el)) {
      // If the card is really an IMAGE artifact (it holds a content <img> — e.g. a
      // Gemini-GENERATED image, which Gemini renders inside a card with download/
      // action buttons), capture it as an IMAGE, not a file: it should embed and be
      // counted as an image, not named as a file. Dedupe against the <img> loop above
      // by src so we don't capture the same picture twice.
      const cardImg = Array.from(card.querySelectorAll("img")).find(
        (im) => isContentImage(im) && !im.closest(SOURCE_ANCESTORS)
      );
      if (cardImg) {
        const iurl = cardImg.currentSrc || cardImg.src;
        if (seenImg.has(iurl)) continue; // already captured as an image above
        seenImg.add(iurl);
        const cap = pickFileName(card) || (cardImg.getAttribute("alt") || "").trim();
        out.push({ kind: "image", name: cap || "image.png", url: iurl, isUpload: false });
        continue;
      }
      const name = pickFileName(card);
      if (!name || seenFile.has(name.toLowerCase())) continue;
      seenFile.add(name.toLowerCase());
      // If the card exposes a real download link, keep it so capture() can fetch the
      // bytes; otherwise it's a name-only reference (Gemini files often aren't
      // directly downloadable from the DOM — the "Open" is a JS handler).
      const link = card.querySelector("a[href]");
      const href = link && link.getAttribute("href");
      const url = href && !/^(javascript:|#|about:)/i.test(href) ? href : null;
      out.push({ kind: "file", name: name, url: url });
    }
    return out;
  }

  // Subtrees that are NOT conversation prose and must be stripped before reading a
  // turn's text. Two real bugs this fixes (probe-confirmed 2026-06):
  //  • file-preview cards — a file-only user turn has no .query-content, so capture
  //    fell back to the whole <user-query> and pulled the card's "PDF\n<filename>"
  //    label into the message body.
  //  • inline source chips — Gemini stamps a <source-inline-chip>/<source-footnote>
  //    "PDF" grounding pill after each fact drawn from an uploaded file; innerText
  //    swept them in, littering the transcript with stray "PDF" lines.
  const NON_TEXT_SUBTREES =
    "user-query-file-carousel, user-query-file-preview, .file-preview-container, " +
    "[data-test-id='uploaded-file'], generated-file, " +
    "source-inline-chip, source-footnote, sources-carousel-inline, sources-list, " +
    "message-actions, thumb-up-button, thumb-down-button, copy-button, regenerate-button";

  // Read a turn's text with the non-prose subtrees removed. innerText is layout-
  // dependent (it needs the node rendered to get newlines right and to drop hidden
  // nodes), and a DETACHED clone reports textContent-style output (paragraphs mashed
  // together). So we clone, strip the unwanted subtrees, mount the clone OFF-SCREEN
  // to get correct innerText, then remove it. Falls back to the live read on error.
  // Gemini renders code in <code-block> / <pre> elements with a language badge
  // header ("JSON", "python", …) above the code. Plain innerText flattens all that
  // into ordinary lines — the language badge becomes a stray text line and the code
  // loses its fencing, so the export shows raw lines instead of a code block (unlike
  // the other providers, whose code already arrives fenced). Rewrite each code block
  // in the offscreen clone to a Markdown fence (```lang … ```) so the shared handoff/
  // PDF renderer formats it as code, matching the other adapters.
  function fenceCodeBlocks(root) {
    root.querySelectorAll("code-block, pre").forEach((blk) => {
      if (!blk.isConnected) return; // a <pre> already swallowed by its <code-block>
      if (blk.tagName.toLowerCase() === "pre" && blk.closest("code-block")) return;
      const codeEl =
        blk.querySelector("code") ||
        (blk.tagName.toLowerCase() === "pre" ? blk : blk.querySelector("pre")) ||
        blk;
      const codeText = (codeEl.innerText || codeEl.textContent || "").replace(/\s+$/g, "");
      if (!codeText) return;
      let lang = "";
      const codeClass = (blk.querySelector("code") || {}).className || "";
      const lm = codeClass.match(/language-([a-z0-9+#-]+)/i);
      if (lm) lang = lm[1].toLowerCase();
      if (!lang) {
        // The visible language badge in the block's header decoration.
        const cand = blk.querySelector("[class*='decoration'], [class*='header'], [class*='lang'], [class*='title']");
        const ht = cand ? (cand.textContent || "").trim().split(/\s+/)[0] : "";
        if (TYPE_RE.test(ht)) lang = ht.toLowerCase();
      }
      const pre = document.createElement("pre");
      pre.textContent = "\n```" + lang + "\n" + codeText + "\n```\n";
      blk.replaceWith(pre);
    });
  }

  function extractText(el) {
    if (!el) return "";
    let clone = null;
    try {
      clone = el.cloneNode(true);
      clone.querySelectorAll(NON_TEXT_SUBTREES).forEach((n) => n.remove());
      clone.setAttribute("aria-hidden", "true");
      clone.style.position = "absolute";
      clone.style.left = "-99999px";
      clone.style.top = "0";
      clone.style.width = "800px";
      document.body.appendChild(clone);
      fenceCodeBlocks(clone); // turn Gemini code blocks into ``` fences (needs layout)
      return cleanText(clone);
    } catch (e) {
      return cleanText(el);
    } finally {
      if (clone && clone.parentNode) clone.parentNode.removeChild(clone);
    }
  }

  function cleanText(el) {
    return (el.innerText || el.textContent || "").replace(/ /g, " ").trim();
  }

  // Collect the ordered turns from the rendered DOM. Prefers the per-turn
  // container (which holds a user query + a model response); falls back to
  // scanning the query/response elements directly in document order.
  function collectTurnEls() {
    // Collect by the precise turn TAGS (<user-query>/<model-response> — exactly one
    // per message, document order) rather than the broader .conversation-container
    // (which can nest / over-match). Fall back to containers only if the tags aren't
    // present (older/other markup).
    let raw = Array.from(document.querySelectorAll("user-query, model-response")).map((el) => ({
      role: el.tagName.toLowerCase() === "user-query" ? "user" : "assistant",
      el: el,
    }));
    if (!raw.length) {
      for (const c of document.querySelectorAll(SEL.turn)) {
        const uq = firstMatch(c, SEL.userQuery);
        if (uq) raw.push({ role: "user", el: uq });
        const mr = firstMatch(c, SEL.modelResponse);
        if (mr) raw.push({ role: "assistant", el: mr });
      }
    }
    // The message count was ~3× because Gemini renders duplicate turn elements:
    // (1) hidden alternate-LAYOUT copies (display:none → no client rects), and
    // (2) stale copies left by the virtualized scroll. Defenses, in order:
    //   • skip elements with NO layout box (display:none copies), and
    //   • dedupe by role + NORMALIZED text (whitespace-collapsed, lowercased) so
    //     copies that differ only in spacing/case still collapse to one.
    const seen = new Set();
    const out = [];
    for (const t of raw) {
      if (!t.el.getClientRects().length) continue; // display:none duplicate layout
      // Turns that carry an UPLOAD are kept verbatim (no text-dedupe): re-uploading
      // the same file makes two real turns with identical prose (usually empty) and
      // the same filename, which the dedupe below would wrongly merge — dropping the
      // 2nd file. The display:none filter above already removes the hidden copies.
      if (t.el.querySelector("user-query-file-preview, generated-file, [data-test-id='uploaded-file']")) {
        out.push(t);
        continue;
      }
      const textEl = t.role === "user" ? firstMatch(t.el, SEL.userText) : firstMatch(t.el, SEL.modelText);
      const norm = cleanText(textEl || t.el).replace(/\s+/g, " ").trim().toLowerCase();
      const key = t.role + "::" + norm;
      if (norm && seen.has(key)) continue; // exact duplicate turn → drop
      if (norm) seen.add(key);
      out.push(t);
    }
    return out;
  }

  // DOM capture — the real path for Gemini.
  async function capture(onProgress) {
    const progress = typeof onProgress === "function" ? onProgress : function () {};
    const M = model();
    progress("Waiting for the conversation to load…");
    await waitForConversation(20000); // Gemini fetches turns after the shell — wait.
    // Gemini virtualizes: only on-screen turns are mounted. Scroll through the whole
    // history first so EVERY turn (and its images/files) is captured, not just the
    // part that happened to be visible.
    progress("Loading full history…");
    await loadAllTurns(progress, 45000);
    progress("Reading the page…");
    const session = M.createSession({ title: detectTitle(), startedAt: await detectStartedAt(), sourceProvider: "gemini" });
    session.captureMethod = "dom";

    const turnEls = collectTurnEls();
    const fetchTasks = [];
    const uploadImgAtts = []; // your uploaded images, in upload order (vault matching)
    const turns = [];
    for (const t of turnEls) {
      const textEl = t.role === "user" ? firstMatch(t.el, SEL.userText) : firstMatch(t.el, SEL.modelText);
      // Gemini prefixes each turn with an a11y label ("You said" / "Gemini said") —
      // strip it so the transcript reads cleanly.
      const text = extractText(textEl || t.el).replace(/^\s*(you said|gemini said)\b[\s:]*/i, "").trim();
      const rawAtts = scrapeAttachments(t.el);
      const attachments = [];
      for (const a of rawAtts) {
        const att = { type: a.kind === "image" ? "image" : "file", mediaId: null, name: a.name, mediaType: "" };
        attachments.push(att);
        if (a.kind === "image" && a.isUpload) uploadImgAtts.push(att);
        if (a.url) fetchTasks.push({ att: att, url: a.url, name: a.name, isImg: a.kind === "image" });
      }
      if (!text && !attachments.length) continue; // skip empty/placeholder turns
      turns.push({ role: t.role, content: [{ type: "text", text: text }], attachments: attachments, artifacts: [] });
    }

    // Fetch image bytes (so they embed in the resume PDF / land in the ZIP).
    const total = fetchTasks.length;
    let done = 0;
    if (total) progress("Reading attachments… (0/" + total + ")");
    await mapLimit(fetchTasks, 6, async (task) => {
      const blob = await fetchBlob(task.url);
      done++;
      progress("Reading attachments… (" + done + "/" + total + ")");
      if (blob) {
        task.att.mediaId = M.addMedia(session, blob, blob.type, task.name);
      } else if (task.isImg) {
        task.att.src = task.url; // keep the URL so a failed fetch isn't silently lost
      }
    });

    // Recover uploaded images we couldn't fetch (revisit → locked googleusercontent
    // URL) from the upload vault: bytes grabbed at upload time by the main-world
    // interceptor. Matched by ORDER — the Nth uploaded image in this conversation ↔
    // the Nth vault entry (Gemini's revisited upload <img> exposes no filename).
    try {
      if (uploadImgAtts.some((att) => !att.mediaId) && Continuum.uploadVault) {
        const convId = (location.pathname.match(/\/app\/([a-z0-9-]+)/i) || [])[1] || null;
        const vault = await Continuum.uploadVault.getImagesForConversation(convId);
        uploadImgAtts.forEach((att, i) => {
          const v = vault[i];
          if (att.mediaId || !v) return;
          try {
            const blob = new Blob([Continuum.uploadVault.b64ToBytes(v.b64)], { type: v.type || "image/png" });
            att.mediaId = M.addMedia(session, blob, blob.type, v.name || att.name);
            delete att.src; // bytes recovered — drop the dead URL
          } catch (e) {
            /* leave it name-only */
          }
        });
      }
    } catch (e) {
      console.warn("[Continuum] gemini upload-vault recovery failed:", e);
    }

    session.turns = turns;
    M.recomputeStats(session);
    progress("Saving…");
    return session;
  }

  // No API path — defer to the DOM capture (kept for router parity).
  async function captureFast(onProgress) {
    return capture(onProgress);
  }

  // Cheap DOM counts for the panel's "current chat" preview.
  function peekStats() {
    let images = 0;
    let files = 0;
    const turns = collectTurnEls();
    for (const t of turns) {
      for (const a of scrapeAttachments(t.el)) {
        if (a.kind === "image") images++;
        // Files YOU uploaded always count; AI-generated file cards count only when
        // they have a real download link (matches recomputeStats / the other sites).
        else if (t.role === "user" || a.url) files++;
      }
    }
    return { messages: turns.length, images: images, files: files };
  }
  async function peekStatsFast() {
    return peekStats();
  }
  // Change signal for the live-refresh loop: turn count + a streaming flag.
  function peekSignal() {
    let n = 0;
    let streaming = 0;
    try {
      n = collectTurnEls().length;
      streaming = document.querySelector("[data-test-id='stop-button'], .stop-icon, [aria-label*='Stop' i]") ? 1 : 0;
    } catch (e) {
      /* best-effort */
    }
    return n + ":" + streaming;
  }

  // Discovery: when SEL matches nothing, scan the live DOM for the real structure
  // — custom-element tag names (Angular apps like Gemini use them for turns) and
  // any element whose tag/class/id/test-id contains a conversation-ish keyword,
  // with a sample of each. This is what lets us set SEL correctly.
  function discover() {
    const tagCounts = {};
    const KEYWORDS = [
      "conversation", "query", "response", "message", "turn", "chat", "bubble",
      "markdown", "prompt", "answer", "response-content", "request",
    ];
    const kwFirst = {};
    const kwCount = {};
    const all = document.querySelectorAll("body *");
    for (const el of all) {
      const tag = el.tagName.toLowerCase();
      if (tag.indexOf("-") !== -1) tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      const cls = typeof el.className === "string" ? el.className.toLowerCase() : "";
      const id = (el.id || "").toLowerCase();
      const tid = (el.getAttribute("data-test-id") || "").toLowerCase();
      const hay = tag + " " + cls + " " + id + " " + tid;
      for (const kw of KEYWORDS) {
        if (hay.indexOf(kw) === -1) continue;
        kwCount[kw] = (kwCount[kw] || 0) + 1;
        if (!kwFirst[kw]) {
          kwFirst[kw] = {
            tag: tag,
            cls: (typeof el.className === "string" ? el.className : "").slice(0, 100),
            testId: el.getAttribute("data-test-id") || null,
            htmlHead: (el.outerHTML || "").slice(0, 200),
          };
        }
      }
    }
    const customElements = Object.keys(tagCounts)
      .sort((a, b) => tagCounts[b] - tagCounts[a])
      .slice(0, 40)
      .map((t) => t + " ×" + tagCounts[t]);
    const keywordMatches = {};
    for (const kw of KEYWORDS) if (kwCount[kw]) keywordMatches[kw] = Object.assign({ count: kwCount[kw] }, kwFirst[kw]);
    return { customElements: customElements, keywordMatches: keywordMatches };
  }

  // The scrolling history container that holds the rendered turns (the chat area,
  // NOT <main> which is the whole app shell).
  function findHistoryContainer() {
    return document.querySelector(
      "chat-window-content infinite-scroller, chat-window infinite-scroller, chat-window-content, chat-window"
    );
  }

  // ── probe: dumps what the selectors find so SEL can be tuned ───────────────
  // ASYNC: Gemini renders the app shell first and fetches the conversation turns a
  // beat later, so we POLL (nudging the scroller to mount lazy history) until turn-
  // like elements appear, then dump the history container's INTERNALS — that reveals
  // the real turn element tags/classes no matter what they're named.
  async function probe() {
    const head = (el) => (el && el.outerHTML ? el.outerHTML.slice(0, 220) : null);
    const TURN_HINT = /query|response|message|conversation|turn|prompt|markdown/i;
    await waitForConversation(20000); // don't read until the turns have rendered
    await loadAllTurns(null, 25000); // mount the whole history so diagnostics are complete
    const turnish = Array.from(document.querySelectorAll("*")).filter((el) => {
      const t = el.tagName.toLowerCase();
      return t.indexOf("-") !== -1 && TURN_HINT.test(t);
    });
    // Tag census of custom elements INSIDE the history container (isolates the
    // conversation area from the app chrome) + a sample of its first children.
    const container = findHistoryContainer();
    const inContainer = {};
    let containerChildren = [];
    if (container) {
      for (const el of container.querySelectorAll("*")) {
        const t = el.tagName.toLowerCase();
        if (t.indexOf("-") !== -1) inContainer[t] = (inContainer[t] || 0) + 1;
      }
      containerChildren = Array.from(container.children).slice(0, 6).map((el) => ({
        tag: el.tagName.toLowerCase(),
        cls: (typeof el.className === "string" ? el.className : "").slice(0, 100),
        htmlHead: head(el),
      }));
    }
    const turnishReport = turnish.slice(0, 6).map((el) => ({
      tag: el.tagName.toLowerCase(),
      cls: (typeof el.className === "string" ? el.className : "").slice(0, 100),
      textPreview: (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 100),
      htmlHead: head(el),
    }));
    const turnEls = collectTurnEls();
    const sample = turnEls.slice(0, 4).map((t) => {
      const textEl = t.role === "user" ? firstMatch(t.el, SEL.userText) : firstMatch(t.el, SEL.modelText);
      return {
        role: t.role,
        tag: t.el.tagName.toLowerCase(),
        textPreview: cleanText(textEl || t.el).slice(0, 120),
        foundTextEl: !!textEl,
        imgs: t.el.querySelectorAll("img").length,
        contentImgs: Array.from(t.el.querySelectorAll("img")).filter(isContentImage).length,
        fileChips: t.el.querySelectorAll(SEL.fileChip).length,
        // Detected file cards + how each one's HTML looks, so a missed/garbled name
        // can be diagnosed against the real markup.
        fileCards: findFileCards(t.el).map((c) => ({
          name: pickFileName(c),
          tag: c.tagName.toLowerCase(),
          cls: (typeof c.className === "string" ? c.className : "").slice(0, 80),
          htmlHead: (c.outerHTML || "").slice(0, 260),
        })),
        attachments: scrapeAttachments(t.el),
      };
    });
    // Image diagnostics — WHY uploaded images aren't captured. Dump each content
    // <img>'s src/dims, then test-fetch the first one BOTH ways (content-script
    // direct + background worker) so we can see which path can actually get bytes.
    const allImgs = [];
    for (const t of turnEls) {
      for (const img of t.el.querySelectorAll("img")) if (isContentImage(img)) allImgs.push(img);
    }
    const imageSamples = allImgs.slice(0, 8).map((img) => ({
      src: (img.currentSrc || img.src || "").slice(0, 160),
      alt: (img.getAttribute("alt") || "").slice(0, 60),
      w: img.naturalWidth || img.width || 0,
      h: img.naturalHeight || img.height || 0,
    }));
    let imageFetchTest = null;
    if (allImgs.length) {
      const url = allImgs[0].currentSrc || allImgs[0].src;
      const direct = await (async () => {
        try { const r = await fetch(url); return { ok: r.ok, status: r.status, type: r.headers.get("content-type") }; }
        catch (e) { return { error: String((e && e.message) || e) }; }
      })();
      const viaWorker = await new Promise((res) => {
        try {
          chrome.runtime.sendMessage({ type: "continuum-fetch", url: url }, (r) => {
            if (chrome.runtime.lastError) return res({ error: chrome.runtime.lastError.message });
            if (!r) return res({ error: "no response" });
            res(r.ok ? { ok: true, bytesB64: (r.base64 || "").length, mime: r.mime } : r);
          });
        } catch (e) { res({ error: String(e) }); }
      });
      imageFetchTest = { url: (url || "").slice(0, 160), scheme: (url || "").split(":")[0], direct: direct, viaWorker: viaWorker };
    }
    // Raw HTML of the first few USER turns — this is where uploaded images/files
    // live, and it's the only way to see the markup we're failing to scrape.
    const userTurnSamples = turnEls
      .filter((t) => t.role === "user")
      .slice(0, 3)
      .map((t) => ({
        textPreview: cleanText(firstMatch(t.el, SEL.userText) || t.el).slice(0, 80),
        imgCount: t.el.querySelectorAll("img").length,
        fileCardCount: findFileCards(t.el).length,
        scrapedAttachments: scrapeAttachments(t.el),
        htmlHead: (t.el.outerHTML || "").slice(0, 700),
      }));
    const report = {
      url: location.href,
      title: detectTitle(),
      counts: {
        containers: document.querySelectorAll(SEL.turn).length,
        userQueries: document.querySelectorAll(SEL.userQuery).length,
        modelResponses: document.querySelectorAll(SEL.modelResponse).length,
        collectedTurns: turnEls.length,
      },
      sample: sample,
      imageCount: allImgs.length,
      imageSamples: imageSamples,
      imageFetchTest: imageFetchTest,
      userTurnSamples: userTurnSamples,
      // The real conversation structure, captured AFTER waiting for turns to load:
      stillLoading: !!document.querySelector("chat-loading-animation"),
      historyContainerTag: container ? container.tagName.toLowerCase() : null,
      customElementsInContainer: Object.keys(inContainer).sort((a, b) => inContainer[b] - inContainer[a]).map((t) => t + " ×" + inContainer[t]),
      containerChildren: containerChildren,
      turnHintElements: turnishReport,
      discovery: turnEls.length === 0 ? discover() : "(selectors matched — discovery skipped)",
    };
    try {
      console.log("[Continuum] gemini DOM probe:\n" + JSON.stringify(report, null, 2));
    } catch (e) {
      console.log("[Continuum] gemini DOM probe:", report);
    }
    return report;
  }

  Continuum.geminiAdapter = {
    captureFast,
    capture,
    detectTitle,
    detectStartedAt,
    peekStats,
    peekStatsFast,
    peekSignal,
    probe,
  };
})();
