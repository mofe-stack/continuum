// perplexity-adapter.js — captures a Perplexity (perplexity.ai) thread into the
// normalized session model. Mirrors the claude/chatgpt/gemini adapter surface:
//   captureFast, capture (the real path), detectTitle, detectStartedAt,
//   peekStats, peekStatsFast, peekSignal, probe.
//
// WHY DOM, not API (probe-confirmed 2026-06): the live network report showed NO
// replayable REST conversation endpoint — thread content arrives via Next.js
// server-side rendering, and the only thread-related call is a mark_viewed
// beacon. So capture scrapes the rendered DOM, like Gemini.
//
// SELECTORS (probe-confirmed 2026-06 on a live thread):
//   • user query   → <h1>/<div> with class `group/query` (whitespace-pre-line).
//   • answer       → <div id="markdown-content-N"> holding `.prose` blocks.
//     The Sources/Images tab panels (radix tabs) live OUTSIDE markdown-content,
//     so scoping the answer text to it excludes sources/related noise for free.
//   • citations    → `span.citation-nbsp` spacers + inline number chips
//     (`rounded-badge … tabular-nums` spans) — stripped from transcripts.
//   • inline images→ wrapped in `[data-inline-type="image"]` (answer prose).
//   • uploads      → NAME CHIPS next to the query (`div.mt-xs` → <button> with
//     the filename; no href) — captured as NAME-ONLY references, like Gemini's
//     images. (Byte capture via the signed S3 URLs + the /rest/file-repository
//     re-sign endpoint was built, proved unreliable in practice, and was
//     removed by request — see git history if it's ever wanted again.)

(function () {
  "use strict";
  const Continuum = (window.Continuum = window.Continuum || {});
  const model = () => Continuum.model;

  // --- Selectors (see header for provenance) --------------------------------
  // `group/query` is a Tailwind group name — `[class~=…]` matches it as a
  // whitespace-separated word without CSS-escaping the slash.
  const SEL_QUERY = '[class~="group/query"]';
  const SEL_ANSWER = '[id^="markdown-content-"]';
  const HAS_EXT_RE = /\.[a-z0-9]{2,5}$/i;
  const IMG_EXT_RE = /\.(png|jpe?g|gif|webp|heic|heif|bmp|avif|tiff?)$/i;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Filename → comparable key. Perplexity renders one upload under multiple
  // spellings ("A B (1).json" vs "A-B-1.json"), so compare alphanumerics only.
  const normKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

  function turnCount() {
    return document.querySelectorAll(SEL_QUERY).length + document.querySelectorAll(SEL_ANSWER).length;
  }

  // Wait until the thread has rendered (SSR is fast, but SPA navigation between
  // threads re-renders) — count must be non-zero and stable across two polls.
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
      await sleep(350);
    }
    return turnCount() > 0;
  }

  // The scrollable thread area (probe: a div under <main> overflows).
  function findScroller() {
    for (const el of document.querySelectorAll("main, main *")) {
      if (el.scrollHeight > el.clientHeight + 200) return el;
    }
    return document.scrollingElement || document.documentElement;
  }

  // Long threads may lazy-render older entries — scroll to the top to mount them.
  // Don't bail on turn-count alone: older entries can mount a beat slower than the
  // poll window, so we also watch scrollHeight and the scroll position (new content
  // prepended above pushes scrollTop off 0), require several steady reads, and nudge
  // to the top twice per step. Harmless no-op when everything is already mounted.
  async function loadAllTurns(onProgress, maxMs) {
    const scroller = findScroller();
    if (!scroller) return;
    const startTop = scroller.scrollTop;
    const deadline = Date.now() + (maxMs || 30000);
    let lastCount = -1;
    let lastHeight = -1;
    let stable = 0;
    while (Date.now() < deadline) {
      scroller.scrollTop = 0;
      await sleep(500);
      scroller.scrollTop = 0; // re-pull: a batch that mounted above pushed us down
      await sleep(500);
      const n = turnCount();
      const h = scroller.scrollHeight;
      if (typeof onProgress === "function") onProgress("Loading full history… (" + n + " messages)");
      // >32px ignores minor reflow jitter; a prepended entry is hundreds of px.
      const growing = n !== lastCount || Math.abs(h - lastHeight) > 32 || scroller.scrollTop > 4;
      if (growing) {
        stable = 0;
      } else if (++stable >= 4) {
        break;
      }
      lastCount = n;
      lastHeight = h;
    }
    scroller.scrollTop = startTop;
    await sleep(200);
  }

  async function mapLimit(items, limit, fn) {
    const queue = items.slice();
    const worker = async () => {
      let next;
      while ((next = queue.shift()) !== undefined) await fn(next);
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  }

  // Cross-origin media → try the content script first, then the background
  // worker (host_permissions bypass CORS there). Used for answer-inline images.
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
    if (!url) return null;
    const isLocal = /^(blob:|data:)/i.test(url);
    try {
      const res = await fetch(url, isLocal ? {} : { credentials: "include" });
      if (res.ok) return await res.blob();
    } catch (e) {
      /* fall through */
    }
    if (isLocal) return null; // page-local URL the worker can't see
    const viaWorker = await fetchBlobViaWorker(url);
    if (viaWorker) return viaWorker;
    try {
      const res = await fetch(url, { credentials: "omit" });
      if (res.ok) return await res.blob();
    } catch (e) {
      /* give up */
    }
    console.warn("[Continuum] perplexity media fetch failed — url:", url);
    return null;
  }

  // --- Turn collection -------------------------------------------------------

  // Ordered [{ role, el }] from the rendered DOM. Outermost match per role only
  // (the `group/query` class could sit on nested wrappers), visible only, merged
  // in document order.
  function collectTurnEls() {
    const pick = (sel, role) =>
      Array.from(document.querySelectorAll(sel))
        .filter((el) => el.getClientRects().length) // skip display:none copies
        .map((el) => ({ role, el }));
    const raw = pick(SEL_QUERY, "user").concat(pick(SEL_ANSWER, "assistant"));
    const els = raw.map((t) => t.el);
    const outermost = raw.filter((t) => !els.some((o) => o !== t.el && o.contains(t.el)));
    return outermost.sort((a, b) =>
      a.el === b.el ? 0 : a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
    );
  }

  // --- Text extraction (DOM → Markdown) --------------------------------------
  // Answers are real markdown DOM (.prose: headings, lists, pre/code, tables) —
  // converting preserves code fences etc. in transcript.md. Citation chips are
  // stripped: `.citation-nbsp` spacers, any `citation`-classed element, and the
  // inline number badges (`rounded-badge … tabular-nums` spans, probe-confirmed).
  function isCitationEl(node) {
    const cls = typeof node.className === "string" ? node.className : "";
    if (/\bcitation/i.test(cls)) return true;
    if (node.tagName === "SPAN" && /rounded-badge/.test(cls) && /tabular-nums/.test(cls)) return true;
    return false;
  }

  function extractText(rootEl) {
    const SKIP_TAGS = new Set(["BUTTON", "SVG", "SCRIPT", "STYLE", "NOSCRIPT", "IMG"]);
    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent;
      if (node.nodeType !== Node.ELEMENT_NODE) return "";
      const tag = node.tagName;
      if (SKIP_TAGS.has(tag)) return "";
      if (node.getAttribute("aria-hidden") === "true") return "";
      if (node.getAttribute("role") === "button") return "";
      if (isCitationEl(node)) return "";
      const cls = typeof node.className === "string" ? node.className : "";
      if (/\bsr-only\b/i.test(cls)) return "";

      const inner = () => Array.from(node.childNodes).map(walk).join("");

      switch (tag) {
        case "BR": return "\n";
        case "HR": return "\n\n---\n\n";
        case "P": case "DIV": case "SECTION": case "ARTICLE": return inner() + "\n\n";
        case "H1": return "\n# " + inner().trim() + "\n\n";
        case "H2": return "\n## " + inner().trim() + "\n\n";
        case "H3": return "\n### " + inner().trim() + "\n\n";
        case "H4": return "\n#### " + inner().trim() + "\n\n";
        case "H5": return "\n##### " + inner().trim() + "\n\n";
        case "H6": return "\n###### " + inner().trim() + "\n\n";
        case "STRONG": case "B": return "**" + inner() + "**";
        case "EM": case "I": return "*" + inner() + "*";
        case "DEL": case "S": return "~~" + inner() + "~~";
        case "CODE": {
          if (node.parentElement && node.parentElement.tagName === "PRE") return node.textContent;
          return "`" + (node.textContent || "") + "`";
        }
        case "PRE": {
          const code = node.querySelector("code");
          const text = code ? code.textContent : node.textContent;
          let lang = "";
          if (code) {
            const m = (code.getAttribute("class") || "").match(/language-([\w-]+)/i);
            if (m) lang = m[1];
          }
          return "\n```" + lang + "\n" + (text || "").replace(/\n+$/, "") + "\n```\n\n";
        }
        case "UL":
          return "\n" + Array.from(node.children)
            .filter((c) => c.tagName === "LI")
            .map((li) => "- " + walk(li).trim().replace(/\n/g, "\n  "))
            .join("\n") + "\n\n";
        case "OL":
          return "\n" + Array.from(node.children)
            .filter((c) => c.tagName === "LI")
            .map((li, i) => i + 1 + ". " + walk(li).trim().replace(/\n/g, "\n   "))
            .join("\n") + "\n\n";
        case "LI": return inner();
        case "A": {
          // Citation anchors were filtered above; keep real content links.
          const href = node.getAttribute("href") || "";
          const text = inner().trim();
          if (!text) return "";
          return href && !/^javascript:/i.test(href) ? "[" + text + "](" + href + ")" : text;
        }
        case "BLOCKQUOTE":
          return "\n> " + inner().trim().replace(/\n/g, "\n> ") + "\n\n";
        case "TABLE": {
          const rows = Array.from(node.querySelectorAll("tr"));
          if (!rows.length) return inner();
          const cells = (tr) => Array.from(tr.children).map((c) => walk(c).trim().replace(/\n+/g, " "));
          const header = cells(rows[0]);
          const out = ["| " + header.join(" | ") + " |", "| " + header.map(() => "---").join(" | ") + " |"];
          for (let i = 1; i < rows.length; i++) out.push("| " + cells(rows[i]).join(" | ") + " |");
          return "\n" + out.join("\n") + "\n\n";
        }
        default: return inner();
      }
    }
    const out = walk(rootEl);
    return out.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n").trim();
  }

  // --- Attachments (NAME-ONLY for uploads — see header) ----------------------

  function isContentImage(img) {
    const src = img.currentSrc || img.src || "";
    if (!src || /^data:image\/svg/i.test(src)) return false;
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    if (w && h && (w < 48 || h < 48)) return false; // favicon/icon-sized
    if (/avatar|sprite|icon|logo|favicon|profile/i.test(src)) return false;
    return true;
  }

  // The per-entry scope around a USER query: upload chips render NEXT TO the
  // query, not inside it — probe-confirmed: the chip row (`div.mt-xs` →
  // `button`) sits ~5 levels above the query h1, under the entry's `bg-base`
  // wrapper. Climb up to 6 levels, stopping before a wrapper that contains
  // another query or any answer (= the whole thread).
  function queryScope(queryEl) {
    let scope = queryEl;
    for (let i = 0; i < 6 && scope.parentElement; i++) {
      const p = scope.parentElement;
      const queries = p.querySelectorAll(SEL_QUERY).length;
      const answers = p.querySelectorAll(SEL_ANSWER).length;
      if (queries > 1 || answers > 0) break;
      scope = p;
    }
    return scope;
  }

  // Pull attachments from one turn. Answers: only images INSIDE markdown-content
  // (probe: inline images are wrapped in [data-inline-type="image"]) — the
  // Images/Sources tab media lives outside it and is web content, not the chat.
  // User turns: name chips in the query's entry scope (NAME-ONLY references —
  // an image-extension chip is classified as an image; a chip exposing a real
  // anchor href, never observed so far, would be fetched).
  function scrapeAttachments(t) {
    const out = [];
    const seen = new Set();
    const root = t.role === "user" ? queryScope(t.el) : t.el;
    for (const img of root.querySelectorAll("img")) {
      if (t.role === "user" && img.closest(SEL_ANSWER)) continue; // not this turn's
      if (!isContentImage(img)) continue;
      const url = img.currentSrc || img.src;
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const alt = (img.getAttribute("alt") || "").trim();
      out.push({ kind: "image", name: alt || "image.png", url: url });
    }
    if (t.role === "user") {
      for (const el of root.querySelectorAll("*")) {
        if (el.children.length > 2) continue; // chips are leaf-ish
        if (el.closest(SEL_ANSWER)) continue; // answer prose has inline file refs — not uploads
        if (el.closest(SEL_QUERY)) continue; // the question text itself may end in a filename
        const text = (el.textContent || "").trim();
        if (!text || text.length > 120 || text.indexOf("\n") !== -1) continue;
        if (!HAS_EXT_RE.test(text) || /^https?:|\//.test(text)) continue;
        // Label+tooltip concatenation renders "name.jpgname.jpg" — skip doubles
        // (the single-name element is found separately).
        if (text.length % 2 === 0 && text.slice(0, text.length / 2) === text.slice(text.length / 2)) continue;
        // One upload renders under TWO spellings (display name "A B (1).json" vs
        // sanitized chip "A-B-1.json") — dedupe on alphanumerics only.
        const key = "file:" + normKey(text);
        if (seen.has(key)) continue;
        seen.add(key);
        const link = el.closest("a[href]") || el.querySelector("a[href]");
        const href = link && link.getAttribute("href");
        out.push({
          kind: IMG_EXT_RE.test(text) ? "image" : "file",
          name: text.slice(0, 200),
          url: href && !/^(javascript:|#|about:)/i.test(href) ? href : null,
        });
      }
    }
    return out;
  }

  // --- Adapter surface -------------------------------------------------------

  function detectTitle() {
    // The first query doubles as the thread title (h1.group/query).
    const turns = collectTurnEls();
    const firstQuery = turns.find((t) => t.role === "user");
    if (firstQuery) {
      const text = (firstQuery.el.innerText || firstQuery.el.textContent || "").trim().replace(/\s+/g, " ");
      if (text) return text.slice(0, 120);
    }
    const t = (document.title || "").replace(/\s*[-|–]\s*Perplexity.*$/i, "").trim();
    return t || "Perplexity conversation";
  }

  // No timestamp surfaced in the probed DOM — genuinely unknown.
  async function detectStartedAt() {
    let earliest = null;
    try {
      for (const el of document.querySelectorAll("main time[datetime], main [datetime]")) {
        const t = Date.parse(el.getAttribute("datetime") || "");
        if (!isNaN(t) && (earliest == null || t < earliest)) earliest = t;
      }
    } catch (e) {
      /* unknown */
    }
    return earliest ? new Date(earliest).toISOString() : null;
  }

  // DOM capture — the real path (no replayable REST endpoint, probe-confirmed).
  async function capture(onProgress) {
    const progress = typeof onProgress === "function" ? onProgress : function () {};
    const M = model();
    progress("Waiting for the thread to load…");
    await waitForConversation(15000);
    progress("Loading full history…");
    await loadAllTurns(progress, 30000);
    progress("Reading the page…");
    const session = M.createSession({
      title: detectTitle(),
      startedAt: await detectStartedAt(),
      sourceProvider: "perplexity",
    });
    session.captureMethod = "dom";

    const turnEls = collectTurnEls();
    const fetchTasks = [];
    const turns = [];
    for (const t of turnEls) {
      const text = extractText(t.el);
      const rawAtts = scrapeAttachments(t);
      const attachments = [];
      for (const a of rawAtts) {
        const att = { type: a.kind === "image" ? "image" : "file", mediaId: null, name: a.name, mediaType: "" };
        attachments.push(att);
        if (a.url) fetchTasks.push({ att: att, url: a.url, name: a.name, isImg: a.kind === "image" });
      }
      if (!text && !attachments.length) continue;
      turns.push({ role: t.role, content: [{ type: "text", text: text }], attachments: attachments, artifacts: [] });
    }

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

    session.turns = turns;
    M.recomputeStats(session);
    progress("Saving…");
    return session;
  }

  // No API path — defer to the DOM capture (router parity).
  async function captureFast(onProgress) {
    return capture(onProgress);
  }

  function peekStats() {
    let images = 0;
    let files = 0;
    const turns = collectTurnEls();
    for (const t of turns) {
      for (const a of scrapeAttachments(t)) {
        if (a.kind === "image") images++;
        // Files YOU uploaded always count; AI file refs only with a real link
        // (matches the Gemini rule / recomputeStats).
        else if (t.role === "user" || a.url) files++;
      }
    }
    return { messages: turns.length, images: images, files: files };
  }
  async function peekStatsFast() {
    return peekStats();
  }

  // Live-refresh signal: turn count + the last answer's text length (it grows
  // while Perplexity streams — no stop-button selector was evidenced, and the
  // length needs no extra selector at all).
  function peekSignal() {
    let n = 0;
    let lastLen = 0;
    try {
      const answers = document.querySelectorAll(SEL_ANSWER);
      n = turnCount();
      if (answers.length) {
        const last = answers[answers.length - 1];
        lastLen = (last.textContent || "").length;
      }
    } catch (e) {
      /* best-effort */
    }
    return n + ":" + lastLen;
  }

  // --- Probe (kept for selector upkeep) --------------------------------------
  // Dumps collected-turn samples + scraped attachments so a run on any thread
  // shows exactly what capture would produce, plus the page's real network
  // calls and the user-turn entry-scope HTML for selector tuning.

  function networkReport() {
    let entries = [];
    try {
      entries = performance.getEntriesByType("resource");
    } catch (e) {
      return { error: "resource timing unavailable: " + String(e && e.message) };
    }
    const sameOrigin = new Map();
    const otherHosts = new Map();
    for (const en of entries) {
      const it = en.initiatorType || "";
      let u;
      try {
        u = new URL(en.name);
      } catch (e) {
        continue;
      }
      if (u.origin === location.origin) {
        if (it === "fetch" || it === "xmlhttprequest") sameOrigin.set(u.pathname, (sameOrigin.get(u.pathname) || 0) + 1);
      } else if (it === "img" || it === "fetch" || it === "xmlhttprequest") {
        const key = u.hostname + " (" + it + ")";
        otherHosts.set(key, (otherHosts.get(key) || 0) + 1);
      }
    }
    const fmt = (m) =>
      Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, n]) => k + " ×" + n);
    return { bufferedEntries: entries.length, sameOriginApiPaths: fmt(sameOrigin), thirdPartyHosts: fmt(otherHosts) };
  }

  async function probe() {
    await waitForConversation(15000);
    const turnEls = collectTurnEls();
    const sample = turnEls.slice(0, 6).map((t) => ({
      role: t.role,
      tag: t.el.tagName.toLowerCase(),
      id: t.el.id || null,
      textPreview: extractText(t.el).replace(/\s+/g, " ").slice(0, 120),
      imgs: t.el.querySelectorAll("img").length,
      scrapedAttachments: scrapeAttachments(t),
    }));
    // User-turn entry-scope HTML — where upload chips live; this is the
    // section to read when tuning attachment capture.
    const userScopes = turnEls
      .filter((t) => t.role === "user")
      .slice(0, 3)
      .map((t) => {
        const scope = queryScope(t.el);
        return {
          queryPreview: (t.el.innerText || "").replace(/\s+/g, " ").slice(0, 80),
          scopeTag: scope.tagName.toLowerCase(),
          scopeImgs: Array.from(scope.querySelectorAll("img"))
            .filter(isContentImage)
            .slice(0, 6)
            .map((img) => ({
              srcHead: (img.currentSrc || img.src || "").slice(0, 140),
              alt: (img.getAttribute("alt") || "").slice(0, 60),
              w: img.naturalWidth || img.width || 0,
              h: img.naturalHeight || img.height || 0,
            })),
          scopeHtmlHead: (scope.outerHTML || "").slice(0, 700),
        };
      });
    const report = {
      url: location.href,
      title: detectTitle(),
      counts: {
        queries: document.querySelectorAll(SEL_QUERY).length,
        answers: document.querySelectorAll(SEL_ANSWER).length,
        collectedTurns: turnEls.length,
      },
      peekStats: peekStats(),
      sample: sample,
      userScopes: userScopes,
      network: networkReport(),
    };
    try {
      console.log("[Continuum] perplexity probe:\n" + JSON.stringify(report, null, 2));
    } catch (e) {
      console.log("[Continuum] perplexity probe:", report);
    }
    return report;
  }

  Continuum.perplexityAdapter = {
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
