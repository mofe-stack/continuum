// claude-adapter.js — reads the current claude.ai conversation from the DOM and
// produces a normalized session (see session-model.js).
//
// SELECTOR STRATEGY (verified against live claude.ai, 2026-05):
//   claude.ai is a React SPA whose markup changes without notice. Every selector
//   below carries a comment explaining WHY it was chosen so future maintainers
//   can fix breakage fast. Run `Continuum.claudeAdapter.probe()` in the console
//   to dump what the current selectors match.

(function () {
  "use strict";

  const Continuum = (window.Continuum = window.Continuum || {});
  const model = () => Continuum.model;

  // --- Selectors -----------------------------------------------------------

  // User turns: claude.ai tags the user's message bubble with this testid. The
  // most stable hook across redesigns, so we lead with it.
  const SEL_USER = '[data-testid="user-message"]';

  // Assistant turns: claude.ai now stamps each reply with a `data-is-streaming`
  // attribute (true while generating, false when complete). This is the most
  // reliable live hook — verified May 2026 via probe(): `[data-is-streaming]`
  // matched 106 elements on a 90-message chat (assistant turns + a handful of
  // streaming sub-blocks). The older class/testid hooks are kept as fallbacks
  // in case claude.ai reintroduces them.
  //
  // To narrow to top-level reply containers (and skip nested streaming blocks),
  // we filter in collectTurns() rather than via a more brittle CSS selector.
  const SEL_ASSISTANT = [
    "[data-is-streaming]",
    ".font-claude-message",
    '[data-testid="assistant-message"]',
  ].join(",");

  // Combined query returns elements in DOM (document) order == chronological order.
  const SEL_TURNS = SEL_USER + "," + SEL_ASSISTANT;

  // Conversation images are served from the files API; UI icons/avatars are not.
  const SEL_CONTENT_IMG = 'img[src*="/files/"]';

  // Uploaded/inline images live in a wrapper whose data-testid IS the image
  // filename (including its extension). Generated-file "Download" cards have
  // no filename testid — that's how we tell the two apart.
  const FILE_IMG_NAME_RE = /\.(png|jpe?g|gif|webp|svg|heic|heif|bmp|avif|tiff?)$/i;

  // Artifacts: the inline artifact card carries a testid containing "artifact";
  // opening it renders the body as <pre>/<code> or prose in the side panel.
  // PROVISIONAL selectors — run probe() on a live chat with artifacts to verify.
  const SEL_ARTIFACT_CARD = '[data-testid*="artifact" i]';
  const SEL_ARTIFACT_PANEL =
    '[data-testid*="artifact" i] pre, [data-testid*="artifact" i] code, ' +
    '[class*="artifact" i] pre, [class*="artifact" i] code';

  // Text-like uploads whose contents can be inlined into the handoff transcript.
  const TEXT_FILE_NAME_RE =
    /\.(txt|md|markdown|csv|tsv|json|xml|yaml|yml|log|py|js|ts|tsx|jsx|html?|css|java|c|cpp|h|hpp|go|rb|rs|sh|sql)$/i;
  const MAX_INLINE_TEXT = 100000; // chars; guards the transcript against huge files

  // --- Helpers -------------------------------------------------------------

  // Finds the scrollable conversation container by walking up from a turn to the
  // nearest vertically-scrollable ancestor (the class is minified/opaque).
  function findScrollContainer() {
    const firstTurn = document.querySelector(SEL_TURNS);
    let el = firstTurn ? firstTurn.parentElement : null;
    while (el && el !== document.body) {
      const style = getComputedStyle(el);
      if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 50) return el;
      el = el.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  function detectTitle() {
    const headerCandidates = [
      'button[data-testid="chat-menu-trigger"]',
      "header h1",
      '[data-testid="conversation-title"]',
    ];
    for (const sel of headerCandidates) {
      const node = document.querySelector(sel);
      const text = node && node.textContent && node.textContent.trim();
      if (text) return text;
    }
    let t = (document.title || "").trim().replace(/\s*[-\\|–]\s*Claude.*$/i, "").trim();
    return t || "Untitled conversation";
  }

  // Reads the active organization id. claude.ai stores it in the `lastActiveOrg`
  // cookie; if that's missing we ask the organizations API. Cached after first use.
  let _orgIdCache;
  function getActiveOrgFromCookie() {
    const m = (document.cookie || "").match(/lastActiveOrg=([0-9a-f-]{8,})/i);
    return m ? m[1] : null;
  }
  async function resolveOrgId() {
    if (_orgIdCache !== undefined) return _orgIdCache;
    let org = getActiveOrgFromCookie();
    if (!org) {
      try {
        const res = await fetch("/api/organizations", { credentials: "include" });
        if (res.ok) {
          const orgs = await res.json();
          if (Array.isArray(orgs) && orgs.length) org = orgs[0].uuid;
        }
      } catch (e) {
        /* ignore — fall through to null */
      }
    }
    _orgIdCache = org || null;
    return _orgIdCache;
  }

  // Best-effort detection of when the conversation was originally created.
  // Primary source: Claude's conversation API (`created_at`). Fallback: the
  // earliest <time datetime> on the page. Returns an ISO string or null.
  // A conversation's created_at never changes, so the API result is cached per
  // conversation id — without this the panel re-fetched it on EVERY open/close,
  // adding a visible 1–2s delay before the "Started …" date appeared.
  const _startedAtCache = new Map(); // convId → ISO string
  async function detectStartedAt() {
    const convId = (location.pathname.match(/\/chat\/([0-9a-f-]{8,})/i) || [])[1];
    if (convId && _startedAtCache.has(convId)) return _startedAtCache.get(convId);
    let result = null;
    if (convId) {
      try {
        const org = await resolveOrgId();
        if (org) {
          const res = await fetch(
            "/api/organizations/" + org + "/chat_conversations/" + convId,
            { credentials: "include", headers: { accept: "application/json" } }
          );
          if (res.ok) {
            const data = await res.json();
            const ts = data && (data.created_at || data.createdAt);
            if (ts) result = new Date(ts).toISOString();
          }
        }
      } catch (e) {
        console.warn("[Continuum] startedAt via API failed:", e);
      }
    }
    if (!result) {
      // Fallback: earliest timestamp Claude may render in the DOM.
      const times = Array.from(document.querySelectorAll("time[datetime]"))
        .map((t) => new Date(t.getAttribute("datetime")))
        .filter((d) => !isNaN(d));
      if (times.length) result = new Date(Math.min.apply(null, times.map((d) => +d))).toISOString();
    }
    if (convId && result) _startedAtCache.set(convId, result);
    return result;
  }

  // Converts a turn's rendered DOM into Markdown so code fences, lists, bold,
  // links, and headings survive into transcript.md. Skips UI chrome (buttons,
  // svgs) and screen-reader/aria-hidden labels — the latter is why old captures
  // had "Claude responded:" prefixes and doubled opening sentences.
  function extractText(turnEl) {
    const SKIP_TAGS = new Set(["BUTTON", "SVG", "SCRIPT", "STYLE", "NOSCRIPT"]);
    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent;
      if (node.nodeType !== Node.ELEMENT_NODE) return "";
      const tag = node.tagName;
      if (SKIP_TAGS.has(tag)) return "";
      if (node.getAttribute("aria-hidden") === "true") return "";
      if (node.getAttribute("role") === "button") return "";
      const cls = typeof node.className === "string" ? node.className : "";
      if (/\bsr-only\b/i.test(cls)) return ""; // screen-reader-only labels
      // Extended-thinking body: claude.ai renders it in a collapsible whose wrapper
      // uses a `grid-template-rows` transition. Skip it so the reasoning never lands
      // in the transcript (the API path strips it separately; see stripLeadingThinking).
      if (cls.indexOf("grid-template-rows") !== -1) return "";
      const tid = node.getAttribute("data-testid") || "";
      if (/-button$/i.test(tid)) return "";

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
          // Block-level <code> is wrapped by <pre> below — handle inline only here.
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
          const href = node.getAttribute("href") || "";
          const text = inner();
          return href && !/^javascript:/i.test(href) ? "[" + text + "](" + href + ")" : text;
        }
        case "BLOCKQUOTE":
          return "\n> " + inner().trim().replace(/\n/g, "\n> ") + "\n\n";
        case "TABLE": {
          // Cheap table render — header row, divider, body rows. Good enough for transcripts.
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
    let out = walk(turnEl);
    // Collapse runs of blank lines so the transcript breathes evenly.
    return out.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n").trim();
  }

  // Returns the turn element that a (possibly out-of-turn) node belongs to, by
  // walking up to the smallest ancestor that contains exactly one turn. This is
  // how we attribute attachment thumbnails — which sit OUTSIDE the message-text
  // element — back to the correct message and role.
  function ownerTurn(el, turnSet) {
    let node = el;
    while (node && node !== document.body) {
      const t = node.querySelector ? node.querySelector(SEL_TURNS) : null;
      if (t && turnSet.has(t)) return t;
      node = node.parentElement;
    }
    return null;
  }

  // Collects unique uploaded/inline images across the whole conversation.
  // Returns [{ el, src, name }]. Dedupes by src (claude renders some thumbs twice).
  function collectImages() {
    const seen = new Set();
    const out = [];
    document.querySelectorAll(SEL_CONTENT_IMG).forEach((img) => {
      const wrap = img.closest("[data-testid]");
      const tid = (wrap && wrap.getAttribute("data-testid")) || "";
      if (!FILE_IMG_NAME_RE.test(tid)) return; // skip generated-file card previews
      const src = img.currentSrc || img.src;
      if (!src || seen.has(src)) return;
      seen.add(src);
      out.push({ el: img, src, name: tid });
    });
    return out;
  }

  // Non-image upload extensions. Used to detect USER-uploaded files (inputs),
  // which — like uploaded images — sit in a wrapper whose data-testid is the
  // filename. Claude-GENERATED download cards have no filename testid, so this
  // deliberately excludes them (they're artifacts, deferred this round).
  const UPLOAD_FILE_NAME_RE =
    /\.(pdf|docx?|xlsx?|pptx?|csv|tsv|txt|md|markdown|json|xml|yaml|yml|rtf|log|zip|py|js|ts|tsx|jsx|html?|css|java|c|cpp|go|rb|rs|sh)$/i;

  // Walks a file card and its ancestors looking for a download URL (a files-API
  // link or an [download] anchor). Returns an absolute URL or null. Best-effort.
  function findFileUrl(el) {
    let node = el;
    for (let i = 0; node && i < 6; i++, node = node.parentElement) {
      if (!node.querySelectorAll) continue;
      const anchors = node.querySelectorAll("a[href]");
      for (const a of anchors) {
        const href = a.getAttribute("href") || "";
        if (/\/files?\//i.test(href) || a.hasAttribute("download")) {
          try {
            return new URL(href, location.origin).href;
          } catch (e) {
            /* skip unparseable href */
          }
        }
      }
    }
    return null;
  }

  // Collects user-uploaded files. Returns [{ el, name, mediaType, url, isText }].
  // url (when found) lets capture() fetch the bytes; deduped by filename.
  function collectFiles() {
    const seen = new Set();
    const out = [];
    document.querySelectorAll("[data-testid]").forEach((el) => {
      const tid = el.getAttribute("data-testid") || "";
      if (!UPLOAD_FILE_NAME_RE.test(tid) || seen.has(tid)) return;
      seen.add(tid);
      const extM = tid.match(/\.([a-z0-9]+)$/i);
      out.push({
        el,
        name: tid,
        mediaType: extM ? extM[1].toUpperCase() : "",
        url: findFileUrl(el),
        isText: TEXT_FILE_NAME_RE.test(tid),
      });
    });
    return out;
  }

  // Files Claude GENERATED and offers for download. NAME-ONLY: probe-confirmed
  // (2026-06) that these live only in the DOM — the raw-mode API collapses them to
  // an unsupported-block placeholder we strip — and the card's Download control is
  // a <button> with a JS handler (no href), so the bytes aren't fetchable. Returns
  // [{ el, name }]. Skips anything already captured as an upload (excludeNames).
  const GEN_HAS_EXT_RE = /\.[a-z0-9]{1,8}$/i;
  const GEN_TYPE_RE = /[·•]\s*([a-z0-9]{2,5})\b/i; // the card's "Image · SVG" type badge
  function collectGeneratedFiles(excludeNames) {
    const seen = new Set();
    const out = [];
    const add = (el, name) => {
      if (!name || seen.has(name) || (excludeNames && excludeNames.has(name))) return;
      seen.add(name);
      out.push({ el, name });
    };
    // (a) Legacy / generic: an explicit download anchor with a real filename.
    document.querySelectorAll("a[download]").forEach((a) => {
      let name = (a.getAttribute("download") || "").trim();
      if (!name) {
        const href = a.getAttribute("href") || "";
        name = (href.split(/[?#]/)[0].split("/").pop() || "").trim();
      }
      if (name && GEN_HAS_EXT_RE.test(name)) add(a, name);
    });
    // (b) Current claude.ai: the generated-file card's "Download <filename>"
    // button (probe-confirmed). The filename is the aria-label minus the
    // "Download " prefix; when it carries no extension we append the card's type
    // badge ("… · SVG" → ".svg") by climbing to the small card wrapper.
    document
      .querySelectorAll('button[aria-label^="Download " i], [role="button"][aria-label^="Download " i]')
      .forEach((btn) => {
        let name = (btn.getAttribute("aria-label") || "").replace(/^\s*download\s+/i, "").trim();
        if (!name) return;
        if (!GEN_HAS_EXT_RE.test(name)) {
          let node = btn;
          for (let i = 0; i < 6 && node.parentElement; i++) {
            node = node.parentElement;
            const txt = (node.textContent || "").replace(/\s+/g, " ").trim();
            if (txt.length > 200) break; // climbed into the message prose — stop
            const m = txt.match(GEN_TYPE_RE);
            if (m) { name = name + "." + m[1].toLowerCase(); break; }
          }
        }
        add(btn, name);
      });
    return out;
  }

  // Images Claude GENERATED — NAME ONLY. Probe-confirmed (2026-06): a generated
  // image/visual renders inside a CROSS-ORIGIN iframe (claudemcpcontent.com,
  // sandboxed), so its pixels are unreachable. But the iframe ELEMENT (on our
  // page) is titled "visualize: <name>", so we can recover the name. Returns
  // [{ el, name }]. Keyed on the "visualize:" title pattern so non-image artifacts
  // (react/html/code previews in similar iframes) aren't miscounted as images.
  function collectGeneratedImages() {
    const out = [];
    const seen = new Set();
    document.querySelectorAll("iframe[title]").forEach((f) => {
      const title = (f.getAttribute("title") || "").trim();
      if (!/^visualize\s*:/i.test(title)) return;
      const name = title.replace(/^visualize\s*:\s*/i, "").trim() || "generated image";
      if (seen.has(name)) return;
      seen.add(name);
      out.push({ el: f, name });
    });
    return out;
  }

  // Best-effort artifact capture: reads each inline artifact card's title, then
  // opens it to read the rendered body (<pre>/<code>/prose). Returns
  // [{ el, title, type, content }]. All clicks/reads are guarded. PROVISIONAL.
  async function collectArtifacts() {
    const cards = Array.from(document.querySelectorAll(SEL_ARTIFACT_CARD)).filter(
      // Only message-embedded cards (skip the panel container itself if it matches).
      (el) => el.closest(SEL_ASSISTANT) || el.matches('button, [role="button"]')
    );
    const out = [];
    const seenTitles = new Set();
    for (const card of cards) {
      const title =
        ((card.getAttribute("aria-label") || card.textContent || "").trim().slice(0, 120)) ||
        "Artifact";
      const key = title + "@" + (out.length); // allow dup titles, keep order
      if (seenTitles.has(key)) continue;
      seenTitles.add(key);
      let type = "";
      let content = "";
      try {
        card.click();
        await sleep(240);
        const code = document.querySelector(SEL_ARTIFACT_PANEL);
        if (code) {
          content = (code.innerText || code.textContent || "").trim();
          const cls = code.getAttribute("class") || "";
          const langM = cls.match(/language-([\w-]+)/i);
          if (langM) type = langM[1];
        }
      } catch (e) {
        /* ignore — keep metadata even if the body couldn't be read */
      }
      out.push({ el: card, title, type, content });
    }
    return out;
  }

  // Fetches an image URL into a Blob. Content-script fetch to same-origin
  // claude.ai inherits cookies, so files-API images work. Failures return null
  // so capture still succeeds (attachment metadata is kept either way).
  async function fetchBlob(url) {
    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.blob();
    } catch (err) {
      console.warn("[Continuum] image fetch failed:", url, err);
      return null;
    }
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Runs `fn` over `items` with at most `limit` calls in flight at once.
  // Resolves when all complete. Used to parallelize blob fetches in captureFast
  // without firing dozens of requests at the server simultaneously.
  async function mapLimit(items, limit, fn) {
    const queue = items.slice();
    const runWorker = async () => {
      let next;
      while ((next = queue.shift()) !== undefined) await fn(next);
    };
    const workers = [];
    for (let i = 0; i < Math.min(limit, queue.length); i++) workers.push(runWorker());
    await Promise.all(workers);
  }

  // Forces React to mount lazily-loaded turns by sweeping the container
  // top→bottom. Returns { finalCount, maxSeen, virtualized }:
  //   • finalCount — turns mounted after settling at the bottom (what
  //     collectTurns() will actually see).
  //   • maxSeen    — the most turns mounted at any point during the sweep.
  //   • virtualized — true when finalCount < maxSeen, i.e. turns we mounted
  //     mid-sweep got UNMOUNTED again (destructive virtualization). The single
  //     end-of-sweep snapshot collectTurns() relies on is then incomplete, and
  //     the caller surfaces a warning. Restores the user's scroll position.
  //
  // Why the rewrite (2026-05): the old loop scrolled a near-full-viewport step
  // every 180ms and broke as soon as the count held steady for >2 ticks near
  // the bottom. On a long chat that let it (a) scroll PAST a region before
  // React mounted it — the skipped turns were never counted — and (b) exit
  // early on a transient network pause that briefly froze the count. We now
  // step in OVERLAPPING 60%-viewport increments and, at each stop, wait until
  // the count stops climbing before advancing, so no region is skipped.
  async function ensureFullRender(scrollEl) {
    if (!scrollEl) return { finalCount: 0, maxSeen: 0, virtualized: false };
    const startTop = scrollEl.scrollTop;
    const countTurns = () => document.querySelectorAll(SEL_TURNS).length;

    scrollEl.scrollTop = 0;
    await sleep(250);

    let maxSeen = countTurns();
    const step = Math.max(200, Math.floor(scrollEl.clientHeight * 0.6));
    const MAX_STEPS = 400; // hard cap so a mis-measured scrollHeight can't hang

    let pos = 0;
    for (let steps = 0; steps < MAX_STEPS; steps++) {
      scrollEl.scrollTop = pos;
      // Stabilize at this position: poll until the count holds steady for two
      // consecutive reads (or we run out of polls), so we never advance while a
      // chunk is still mounting in.
      let stable = 0;
      let last = -1;
      for (let p = 0; p < 6; p++) {
        await sleep(160);
        const c = countTurns();
        if (c > maxSeen) maxSeen = c;
        if (c === last) {
          if (++stable >= 2) break;
        } else {
          stable = 0;
        }
        last = c;
      }
      // scrollHeight can grow as earlier content mounts; re-read it each step.
      if (pos >= scrollEl.scrollHeight - scrollEl.clientHeight - 4) break;
      pos = Math.min(pos + step, scrollEl.scrollHeight);
    }

    // Settle at the very bottom and take the authoritative final snapshot.
    scrollEl.scrollTop = scrollEl.scrollHeight;
    await sleep(250);
    const finalCount = countTurns();
    if (finalCount > maxSeen) maxSeen = finalCount;
    scrollEl.scrollTop = startTop; // restore the user's viewport

    return { finalCount, maxSeen, virtualized: finalCount < maxSeen };
  }

  // Returns ordered turns as [{ el, role }] plus the detection `method`.
  // `[data-is-streaming]` (the live assistant hook) matches both top-level
  // reply containers and NESTED streaming sub-blocks inside them, so we keep
  // only the outermost assistant matches — anything whose ancestor is also an
  // assistant match is a sub-block and would otherwise be captured twice.
  function collectTurns() {
    const all = Array.from(document.querySelectorAll(SEL_TURNS));
    const userEls = [];
    const assistCands = [];
    for (const el of all) {
      if (el.matches(SEL_USER)) userEls.push(el);
      else assistCands.push(el);
    }
    const assistSet = new Set(assistCands);
    const assistantEls = assistCands.filter((el) => {
      let p = el.parentElement;
      while (p) {
        if (assistSet.has(p)) return false;
        p = p.parentElement;
      }
      return true;
    });

    if (assistantEls.length > 0) {
      const merged = userEls.concat(assistantEls).sort((a, b) =>
        a === b ? 0 : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
      );
      return {
        method: "selector",
        turns: merged.map((el) => ({ el, role: el.matches(SEL_USER) ? "user" : "assistant" })),
      };
    }
    return {
      method: "selector-noassistant",
      turns: userEls.map((el) => ({ el, role: "user" })),
    };
  }

  // --- Public API ----------------------------------------------------------

  // Cheap stat peek for the panel (no scrolling, no blob fetches). Note: counts
  // only what's currently mounted — a long unscrolled chat may read low until
  // capture() runs its full-render scroll.
  function peekStats() {
    const { turns } = collectTurns();
    const files = collectFiles();
    const generated = collectGeneratedFiles(new Set(files.map((f) => f.name)));
    return {
      messages: turns.length,
      images: collectImages().length + collectGeneratedImages().length,
      files: files.length + generated.length,
    };
  }

  // Ultra-cheap change signal for the panel's live-refresh loop: a string that
  // changes whenever the visible conversation does (a turn was added, or the
  // assistant started/finished streaming). Just two querySelectorAll counts — no
  // mapping, no blob/file scanning — so it's safe to poll every second or two.
  // The panel force-refreshes the (heavier) API stats only when this changes.
  function peekSignal() {
    let turns = 0;
    let streaming = 0;
    try {
      turns = document.querySelectorAll(SEL_TURNS).length;
      streaming = document.querySelector('[data-is-streaming="true"]') ? 1 : 0;
    } catch (e) {
      /* best-effort */
    }
    return turns + ":" + streaming;
  }

  // Full capture → normalized session. Scrolls to mount everything, reads turns,
  // attributes images/files to their owning turn, and fetches image blobs.
  async function capture(onProgress) {
    const progress = typeof onProgress === "function" ? onProgress : () => {};
    const M = model();

    progress("Rendering full conversation…");
    const scrollEl = findScrollContainer();
    const render = await ensureFullRender(scrollEl);

    progress("Reading messages…");
    const startedAt = await detectStartedAt();
    const session = M.createSession({ title: detectTitle(), startedAt });
    const { turns: turnList, method: turnMethod } = collectTurns();
    session.captureMethod = turnMethod; // surfaced so the panel can warn on a bad capture
    // Destructive virtualization unmounted turns we mounted mid-sweep, so this
    // DOM snapshot is missing some. Tag the method so the panel can steer the
    // user to Fast capture, which reads the full tree from the API instead.
    if (render.virtualized) {
      session.captureMethod = turnMethod + "-virtualized";
      console.warn(
        "[Continuum] capture: list virtualization dropped turns — saw " +
          render.maxSeen +
          " mid-scroll but only " +
          render.finalCount +
          " stayed mounted. Some turns may be missing; use Fast capture for completeness."
      );
    }
    const turnEls = turnList.map((t) => t.el);
    const turnSet = new Set(turnEls);

    const turnRecords = turnList.map(({ el, role }) => ({
      el,
      record: {
        role,
        content: [{ type: "text", text: extractText(el) }],
        attachments: [],
        artifacts: [], // deferred this round by design
      },
    }));
    const elToRecord = new Map(turnRecords.map((tr) => [tr.el, tr.record]));

    function recordFor(el) {
      const owner = ownerTurn(el, turnSet);
      if (owner && elToRecord.has(owner)) return elToRecord.get(owner);
      return turnRecords.length ? turnRecords[turnRecords.length - 1].record : null;
    }

    // Uploaded files — fetch bytes when a URL is available; inline text-like ones.
    const files = collectFiles();
    const fileNames = new Set(files.map((f) => f.name));
    let fi = 0;
    for (const f of files) {
      fi++;
      progress("Reading files… (" + fi + "/" + files.length + ")");
      const rec = recordFor(f.el);
      if (!rec) continue;
      const att = { type: "file", mediaId: null, name: f.name, mediaType: f.mediaType };
      const blob = f.url ? await fetchBlob(f.url) : null;
      if (blob) {
        att.mediaId = M.addMedia(session, blob, blob.type, f.name);
        if (f.isText) {
          try {
            const text = await blob.text();
            att.text =
              text.length > MAX_INLINE_TEXT
                ? text.slice(0, MAX_INLINE_TEXT) + "\n…[truncated]"
                : text;
          } catch (e) {
            /* keep the bytes even if the text read fails */
          }
        }
      }
      rec.attachments.push(att);
    }

    // Generated download cards — names only.
    for (const g of collectGeneratedFiles(fileNames)) {
      const rec = recordFor(g.el);
      if (rec) rec.attachments.push({ type: "file", mediaId: null, name: g.name, generated: true });
    }

    // Generated images (cross-origin iframe previews) — names only.
    for (const g of collectGeneratedImages()) {
      const rec = recordFor(g.el);
      if (rec) rec.attachments.push({ type: "image", mediaId: null, name: g.name, generated: true });
    }

    // Images — fetch each unique blob and attach to its owning turn.
    const imgs = collectImages();
    let i = 0;
    for (const im of imgs) {
      i++;
      progress("Reading images… (" + i + "/" + imgs.length + ")");
      const blob = await fetchBlob(im.src);
      const rec = recordFor(im.el);
      if (!rec) continue;
      if (blob) {
        const mediaId = M.addMedia(session, blob, blob.type, im.name);
        rec.attachments.push({ type: "image", mediaId, name: im.name });
      } else {
        rec.attachments.push({ type: "image", mediaId: null, name: im.name, src: im.src });
      }
    }

    // Artifacts — opens each to read its body; attribute to the owning turn.
    progress("Reading artifacts…");
    for (const art of await collectArtifacts()) {
      const rec = recordFor(art.el);
      if (rec) rec.artifacts.push({ title: art.title, type: art.type, content: art.content });
    }

    session.turns = turnRecords.map((tr) => tr.record);
    M.recomputeStats(session);
    progress("Saving…");
    return session;
  }

  // --- Fast capture (API path) --------------------------------------------
  // Pulls the conversation in one shot from claude.ai's REST endpoint instead
  // of scrolling and scraping the DOM. The same cookie-authed origin call that
  // detectStartedAt() already uses returns the full chat_messages tree.
  //
  // Design note: claude.ai's exact response shape is undocumented and may
  // change. We accept either a string `content` (treat as already-Markdown) or
  // an array of content blocks (concatenate the `text` of any block whose
  // type starts with "text"). Anything we can't map cleanly causes a fall
  // back to the DOM capture() — so a partial API change degrades gracefully
  // rather than producing a corrupt session.
  // Reconstructs the ACTIVE conversation path from a `?tree=True` response.
  //
  // claude.ai's tree response returns EVERY message node — including the
  // off-path branches left behind whenever you edit a prompt or regenerate a
  // reply. The conversation you actually see is the single path from the root
  // to the current leaf (`current_leaf_message_uuid`); the abandoned branches
  // are not part of it. Flattening `chat_messages` wholesale therefore pulls in
  // dead drafts (often short, partial ones) that were never in the live chat —
  // inflating the message count and polluting the handoff.
  //
  // We walk parent pointers from the leaf back to the root, then reverse to get
  // chronological order. Returns the on-path message array, or null when the
  // pointers needed to reconstruct it aren't present (caller falls back to the
  // flat list — a linear chat with no edits is already a single path anyway).
  function resolveActivePath(data, rawMessages) {
    const leafId =
      (data &&
        (data.current_leaf_message_uuid ||
          data.currentLeafMessageUuid ||
          data.current_leaf_message_id)) ||
      null;
    const idOf = (m) => m.uuid || m.id || m.message_id || null;
    const parentOf = (m) =>
      m.parent_message_uuid ||
      m.parentMessageUuid ||
      m.parent_uuid ||
      m.parent_message_id ||
      null;

    const byId = new Map();
    for (const m of rawMessages) {
      const id = idOf(m);
      if (id) byId.set(id, m);
    }
    // Need a leaf to start from and ids to follow — else we can't reconstruct.
    if (!leafId || byId.size === 0) return null;

    const path = [];
    const guard = new Set(); // cycle protection against malformed parent links
    let cur = byId.get(leafId);
    while (cur && !guard.has(idOf(cur))) {
      guard.add(idOf(cur));
      path.push(cur);
      const pid = parentOf(cur);
      if (!pid) break;
      cur = byId.get(pid);
    }
    // A 1-node walk on a multi-node tree means parent pointers were absent or
    // didn't resolve — treat as unusable so the caller keeps the flat list.
    if (path.length <= 1 && rawMessages.length > 1) return null;
    path.reverse();
    return path;
  }

  // Pulls a message's text out of an API message object, preferring the
  // structured `content` blocks (falling back to a plain `msg.text`). EVERY
  // block type is represented so nothing silently vanishes from the transcript:
  //   • text             → the answer, verbatim
  //   • thinking         → DROPPED (see below)
  //   • tool use (search/code/…) → "_[Web search]_ <query>" / "_[Code: …]_" / "_[Tool: …]_"
  //   • tool/search result → "_[Search results (N)]_" + the result titles/links
  //   • anything else    → "_[<type>]_" so its presence is recorded
  // All non-answer parts are emitted as labeled prose, so the compressor keeps
  // them in the recent tail and trims them on older turns.
  // claude.ai's raw-rendering-mode fallback string for media blocks it can't
  // render as text in raw mode (generated images, search visuals, artifacts).
  // We don't capture that media, and this placeholder is just noise — strip it
  // so it never leaks into the transcript.
  const UNSUPPORTED_BLOCK_RE = /this block is not supported on your current device(?: yet)?\.?/i;

  // Removes the "not supported" placeholder lines (and an empty ``` … ``` fence
  // wrapping just a placeholder) from a block of text, line by line so a real
  // adjacent code block is never touched. Returns the text unchanged when no
  // placeholder is present (the common case → zero cost / no mutation).
  function cleanAssistantText(text) {
    if (typeof text !== "string") return "";
    if (!UNSUPPORTED_BLOCK_RE.test(text)) return text;
    const lines = text.split("\n");
    const kept = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isPlaceholderOnly =
        UNSUPPORTED_BLOCK_RE.test(line) && line.replace(UNSUPPORTED_BLOCK_RE, "").trim() === "";
      if (isPlaceholderOnly) {
        // Drop an opening fence immediately above and a closing fence below, so
        // the whole empty ```\n<placeholder>\n``` unit disappears cleanly.
        if (kept.length && kept[kept.length - 1].trim().startsWith("```")) kept.pop();
        if (i + 1 < lines.length && lines[i + 1].trim().startsWith("```")) i++;
        continue;
      }
      kept.push(line);
    }
    return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function extractMessageText(msg) {
    const str = (v) => (typeof v === "string" ? v : "");
    if (Array.isArray(msg.content) && msg.content.length) {
      const parts = [];
      for (const block of msg.content) {
        if (!block || typeof block !== "object") continue;
        const t = (block.type || "").toLowerCase();

        // Final answer text. A block that's only the raw-mode "not supported"
        // placeholder (claude.ai's stand-in for media it can't render as text)
        // cleans to "" → we say nothing and just continue.
        if (typeof block.text === "string" && /^text/.test(t)) {
          const cleaned = cleanAssistantText(block.text);
          if (cleaned) parts.push(cleaned);
          continue;
        }
        // Extended thinking — skipped entirely. A handoff needs Claude's final
        // answers/code/decisions, not its internal reasoning; thinking is also
        // long (bloats the resume PDF) and its sub-shapes (thinking/summary/
        // redacted) are fragile. Dropping the whole class is cleaner than
        // chasing partial thinking-block fields. An assistant turn that is ONLY
        // thinking becomes empty and is filtered as a placeholder node.
        if (/think/.test(t)) continue;
        // Tool invocation — web search, code execution, etc.
        if (/tool_use|tool_call/.test(t) || (block.name && block.input)) {
          const name = str(block.name) || "tool";
          const input = block.input && typeof block.input === "object" ? block.input : {};
          const query = str(input.query) || str(input.q) || str(input.search_query) || str(block.query);
          if (/search/i.test(name)) {
            parts.push("_[Web search]_ " + (query || name));
          } else if (/code|bash|python|repl|exec/i.test(name)) {
            const code = str(input.code) || str(input.command);
            parts.push("_[Code: " + name + "]_" + (code ? "\n```\n" + code + "\n```" : ""));
          } else {
            parts.push("_[Tool: " + name + (query ? " — " + query : "") + "]_");
          }
          continue;
        }
        // Tool / search results — capture the result titles + links.
        if (/tool_result|search_result|web_search/.test(t)) {
          const items = Array.isArray(block.content)
            ? block.content
            : Array.isArray(block.results)
            ? block.results
            : Array.isArray(block.search_results)
            ? block.search_results
            : [];
          const lines = [];
          for (const it of items) {
            if (!it || typeof it !== "object") continue;
            const title = str(it.title) || str(it.name);
            const url = str(it.url) || (it.source && str(it.source.url)) || str(it.source);
            if (title || url) lines.push("- " + (title || url) + (title && url ? " (" + url + ")" : ""));
          }
          parts.push(
            "_[Search results" + (lines.length ? " (" + lines.length + ")" : "") + "]_" +
              (lines.length ? "\n" + lines.join("\n") : "")
          );
          continue;
        }
        // Anything else — record the block type so it's never silently dropped.
        parts.push("_[" + (block.type || "block") + "]_");
      }
      if (parts.length) return parts.join("\n\n");
    }
    if (typeof msg.text === "string" && msg.text) return cleanAssistantText(msg.text);
    if (typeof msg.content === "string") return cleanAssistantText(msg.content); // defensive
    return "";
  }

  function mapSender(s) {
    const v = String(s || "").toLowerCase();
    if (v === "human" || v === "user") return "user";
    if (v === "assistant" || v === "ai" || v === "claude") return "assistant";
    return "assistant"; // unknown → assistant (safer than dropping)
  }

  // Classifies one API attachment descriptor — NO bytes fetched. Shared by the
  // capture and the stats preview so their image/file counts can't diverge.
  function classifyApiAttachment(f) {
    const fileType = String(f.file_type || "").replace(/^\./, ""); // "txt", "pdf", …
    // Downloadable bytes live either in a top-level *_url, OR (newer claude.ai
    // shape) nested under document_asset / preview_asset / thumbnail_asset as
    // `{ url, … }`. A user-uploaded PDF is file_kind:"document" with the bytes at
    // document_asset.url — without this the file was never fetched (name-only).
    const assetUrl = (a) => (a && typeof a === "object" && typeof a.url === "string" ? a.url : null);
    // Resolve downloadable bytes. Known shapes first (top-level *_url, then the
    // nested *_asset.url claude.ai uses for documents/images), then a GENERIC
    // fallback so NEW/unknown file kinds (zip, json exports, arbitrary binaries)
    // still resolve: any property ending in `_url`, or any asset-ish object with a
    // `.url`. Without the fallback only the hardcoded shapes (effectively PDFs and
    // images) were ever fetched — everything else was captured name-only.
    let url =
      f.preview_url ||
      f.url ||
      f.download_url ||
      f.file_url ||
      assetUrl(f.document_asset) ||
      assetUrl(f.preview_asset) ||
      assetUrl(f.thumbnail_asset) ||
      assetUrl(f.file_asset) ||
      null;
    if (!url) {
      for (const k of Object.keys(f)) {
        const v = f[k];
        if (typeof v === "string" && v && /_url$/i.test(k)) { url = v; break; }
        if (
          v && typeof v === "object" && typeof v.url === "string" && v.url &&
          /(asset|file|preview|thumbnail|document|attachment)/i.test(k)
        ) { url = v.url; break; }
      }
    }
    const mime = f.mime_type || f.mediaType || "";
    const mediaType = f.file_kind || f.mediaType || fileType || "";
    // Uploaded text documents arrive with their text already extracted inline
    // (extracted_content) — no fetch needed. Binary docs (pdf/docx) have no
    // extracted_content; we fetch their bytes via the url above instead.
    const text =
      typeof f.extracted_content === "string" && f.extracted_content ? f.extracted_content : null;
    // Normal naming: use the real filename when present, plain "attachment"
    // otherwise. (Filenames can carry stray newlines/tabs — this PDF's did — so
    // we still clean those, but we don't synthesize id-based names.)
    const name = (f.file_name || f.name || f.filename || "attachment").replace(/[\r\n\t]+/g, " ").trim();
    // Pasted content (text pasted straight into the chat) comes back with an EMPTY
    // file_name and a bare file_type like "txt" — vs a real upload, which has a
    // filename ("notes.md") and a MIME type ("text/markdown"). It rides in the
    // transcript as text, so it isn't a "file" for counting (and never attaches).
    const isPasted = !String(f.file_name || f.name || f.filename || "").trim();
    const isImg =
      f.file_kind === "image" ||
      /^image\//i.test(mime) ||
      /\.(png|jpe?g|gif|webp|svg|heic|heif|bmp|avif|tiff?)$/i.test(name);
    const isText =
      !isImg &&
      (text != null ||
        /^text\//i.test(mime) ||
        TEXT_FILE_NAME_RE.test(name) ||
        /^(txt|md|markdown|csv|tsv|json|log|js|ts|tsx|jsx|html?|css|py|rb|go|rs|sh|sql|xml|ya?ml)$/i.test(fileType));
    // Dimensions / page count (when the API provides them) so the panel can
    // estimate the vision/document token cost of the resume payload.
    const dims = f.preview_asset || f.thumbnail_asset || {};
    const width = Number(dims.image_width) || null;
    const height = Number(dims.image_height) || null;
    const pageCount = (f.document_asset && Number(f.document_asset.page_count)) || null;
    return { name, url, mediaType, isImg, isText, text, width, height, pageCount, isPasted };
  }

  // Attachments are the user's UPLOADS only — read from the message's files /
  // attachments / files_v2 arrays. (Capturing media Claude itself generates was
  // tried and removed; if it's ever wanted again it lived in the content blocks.)
  function apiMessageAttachments(msg) {
    const out = [];
    const seen = new Set();
    const lists = [msg.files, msg.attachments, msg.files_v2].filter(Array.isArray);
    for (const list of lists) {
      for (const f of list) {
        if (!f || typeof f !== "object") continue;
        const a = classifyApiAttachment(f);
        // (Previously .zip uploads were hard-skipped as "unservable code-sandbox
        // blobs"; that also dropped ordinary user-uploaded zips. We now keep them —
        // if a URL resolves, the bytes are fetched; if not, it degrades to a
        // name-only reference like any other un-fetchable file.)
        // De-dupe across the three arrays: the SAME upload commonly appears in
        // more than one of files / attachments / files_v2 (claude.ai keeps both
        // the legacy and newer shapes). Without this an uploaded image was
        // embedded twice in the resume PDF and double-counted in the stats. Key
        // on the asset's stable id first, then its resolved URL, then its name —
        // name is last (and tagged by kind) so two genuinely distinct same-named
        // files aren't merged when a stronger id/URL key is available.
        const key =
          f.file_uuid || f.uuid || f.id || f.file_id ||
          a.url || (a.isImg ? "img:" : a.isText ? "txt:" : "file:") + a.name;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(a);
      }
    }
    return out;
  }

  // Fetches the raw conversation tree from claude.ai's REST endpoint. Returns
  // parsed JSON, or null when we can't even try (no conversation id in the URL,
  // or no resolvable org). Throws on HTTP error so callers can decide.
  async function fetchConversationData() {
    const convId = (location.pathname.match(/\/chat\/([0-9a-f-]{8,})/i) || [])[1];
    if (!convId) return null;
    const org = await resolveOrgId();
    if (!org) return null;
    const res = await fetch(
      // The `_` cache-buster makes every request URL unique. claude.ai serves
      // this endpoint through a service worker, and a SW's own cache is keyed by
      // URL and is NOT bypassed by `cache:"no-store"` — so without a unique URL a
      // forced refresh could still get a stale conversation snapshot, which is why
      // the counts used to update only after a full page reload. `cache:"no-store"`
      // additionally bars the HTTP cache. Together they guarantee a live read.
      "/api/organizations/" + org + "/chat_conversations/" + convId +
        "?tree=True&rendering_mode=raw&_=" + Date.now(),
      { credentials: "include", headers: { accept: "application/json" }, cache: "no-store" }
    );
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  // Turns a raw API response into the ACTIVE, empty-filtered records that BOTH
  // the capture and the stats preview build on — so the two can never disagree.
  // `atts` are classified-only (no bytes): { name, url, mediaType, isImg, isText }.
  // Returns { records, branchTotal, activeTotal } or null if no usable messages.
  function activeRecordsFromData(data) {
    const rawMessages = (data && (data.chat_messages || data.chatMessages)) || null;
    if (!Array.isArray(rawMessages) || rawMessages.length === 0) return null;
    const activePath = resolveActivePath(data, rawMessages) || rawMessages;

    const records = [];
    for (const m of activePath) {
      const text = extractMessageText(m);
      const atts = apiMessageAttachments(m);
      // Drop empty placeholder/system nodes (no text AND no attachments).
      if (text.trim() === "" && atts.length === 0) continue;
      records.push({ role: mapSender(m.sender || m.role), text, atts });
    }
    return { records, branchTotal: rawMessages.length, activeTotal: activePath.length };
  }

  // --- Extended-thinking stripping ----------------------------------------
  // claude.ai's API mashes Claude's extended thinking onto the FRONT of msg.text
  // with NO delimiter (verified 2026-06 via probe: reasoning and answer are
  // concatenated, e.g. "…matter most.Kind of, but…"), so the text alone can't be
  // split. The fix uses the DOM: every assistant turn carries a screen-reader-only
  // <h2 class="sr-only">"Claude responded: <the full answer>"</h2> — the ANSWER with
  // NO thinking, present even when the thinking block is collapsed (so no scroll or
  // expand is needed). We take the START of that answer as an ANCHOR, find where it
  // begins inside the API blob, and cut the thinking off the front.

  // Normalize for fuzzy matching: keep only [a-z0-9] so the DOM answer (Markdown)
  // matches the whitespace/markdown-laden API text regardless of formatting.
  function normForMatch(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  // Extract one assistant turn's CLEAN answer (Markdown) from the DOM, with the
  // thinking blocks removed. claude.ai lays each turn out (in .font-claude-response)
  // as a sequence of [thinking, answer] pairs; the thinking is the `row-start-1`
  // wrapper holding the `grid-template-rows` collapsible (verified 2026-06 via probe).
  // We CLONE the response (never touch the live page), drop those thinking wrappers,
  // and run the normal Markdown extractor on what's left — so every answer segment +
  // its formatting survives, every thinking block (summary, body, "Done") is gone, and
  // no scroll/expand is needed (the answer prose is always in the DOM).
  function domAnswerText(turnEl) {
    const resp = turnEl.querySelector(".font-claude-response") || turnEl;
    let clone;
    try {
      clone = resp.cloneNode(true);
    } catch (e) {
      return "";
    }
    clone.querySelectorAll('[class*="grid-template-rows"]').forEach((g) => {
      // Remove the whole thinking block (summary + collapsible + "Done"), keeping its
      // sibling answer row. Fallback to just the collapsible body if the wrapper class
      // ever changes — that can only UNDER-strip (leak a summary line), never drop an
      // answer.
      const block = g.closest('[class*="row-start-1"]') || g;
      if (block && block.parentElement) block.remove();
    });
    return extractText(clone);
  }

  // Collect every (top-level) assistant turn's clean DOM answer. Returns
  // [{ anchor, text }]: `anchor` = normalized first 60 chars (to match the right API
  // message — the answer's start appears in the API blob after the thinking), `text` =
  // the Markdown answer. Deduped. No scroll/expand.
  function collectDomAnswers() {
    const out = [];
    const seen = new Set();
    document.querySelectorAll("[data-is-streaming]").forEach((turn) => {
      // Top-level reply containers only (skip nested streaming sub-blocks).
      let p = turn.parentElement;
      while (p) {
        if (p.matches && p.matches("[data-is-streaming]")) return;
        p = p.parentElement;
      }
      const text = domAnswerText(turn);
      if (!text || text.length < 8) return;
      const anchor = normForMatch(text).slice(0, 60);
      if (anchor.length >= 16 && !seen.has(anchor)) {
        seen.add(anchor);
        out.push({ anchor: anchor, text: text });
      }
    });
    return out;
  }

  // Replace an assistant answer's thinking-laden API text with the clean DOM answer.
  // Matches by anchor (the DOM answer's start appears in the API blob after the
  // thinking). Returns the DOM answer when matched, else the original API text — so a
  // markup change or an unmounted turn degrades to "thinking not stripped", never to a
  // corrupted/empty answer.
  function stripThinking(apiText, domAnswers) {
    const text = String(apiText == null ? "" : apiText);
    if (!domAnswers.length) return text;
    const apiNorm = normForMatch(text);
    for (const d of domAnswers) {
      if (apiNorm.indexOf(d.anchor) !== -1) return d.text;
    }
    return text;
  }

  async function captureFast(onProgress) {
    const progress = typeof onProgress === "function" ? onProgress : () => {};
    const M = model();

    progress("Fetching from Claude API…");
    let data;
    try {
      data = await fetchConversationData();
    } catch (err) {
      console.warn("[Continuum] captureFast: API fetch failed, falling back to DOM:", err);
      return capture(onProgress);
    }
    if (!data) {
      console.warn("[Continuum] captureFast: no conversation id / org — falling back to DOM");
      return capture(onProgress);
    }

    const parsed = activeRecordsFromData(data);
    if (!parsed) {
      console.warn("[Continuum] captureFast: response missing chat_messages, falling back to DOM");
      return capture(onProgress);
    }

    if (parsed.activeTotal < parsed.branchTotal) {
      console.info(
        "[Continuum] captureFast: tree had " + parsed.branchTotal +
          " nodes; kept " + parsed.activeTotal +
          " on the active path (dropped " + (parsed.branchTotal - parsed.activeTotal) +
          " off-path branch messages from edits/regenerations)."
      );
    }

    progress("Parsing messages…");
    const title = (data.name || data.title) || detectTitle();
    const startedAt = data.created_at || data.createdAt
      ? new Date(data.created_at || data.createdAt).toISOString()
      : null;
    const session = M.createSession({ title, startedAt });
    session.captureMethod = "api";

    // Extended-thinking removal: read each turn's clean answer from the DOM with the
    // thinking blocks stripped (no scroll/expand) so we can swap it in for the API's
    // thinking-laden text below.
    const domAnswers = collectDomAnswers();

    // Build turn records + attachment placeholders (order preserved), and queue
    // the blobs to fetch. Classification comes from the shared parser, so the
    // saved session's counts match the stats preview exactly.
    progress("Reading attachments…");
    const fetchTasks = [];
    const turns = parsed.records.map((r) => {
      const attachments = [];
      for (const a of r.atts) {
        const att = { type: a.isImg ? "image" : "file", mediaId: null, name: a.name, mediaType: a.mediaType };
        if (a.isPasted) att.isPasted = true; // pasted text → not a "file", just transcript content
        if (a.isImg && a.width && a.height) {
          att.width = a.width;
          att.height = a.height;
        }
        if (!a.isImg && a.pageCount) att.pageCount = a.pageCount;
        attachments.push(att); // push now → transcript order is stable
        if (a.text != null) {
          // Content is already inline from the API (uploaded document). Inline it
          // into the transcript AND store a text blob so the ZIP includes the file.
          att.text =
            a.text.length > MAX_INLINE_TEXT
              ? a.text.slice(0, MAX_INLINE_TEXT) + "\n…[truncated]"
              : a.text;
          try {
            const blob = new Blob([a.text], { type: "text/plain" });
            att.mediaId = M.addMedia(session, blob, "text/plain", a.name);
          } catch (e) {
            /* transcript still has the inline text even if blob synth fails */
          }
        } else if (a.url) {
          fetchTasks.push({ att, url: a.url, name: a.name, isImg: a.isImg, isText: a.isText });
        }
        // Files with no URL and no inline text (e.g. code-sandbox blob uploads
        // like .zip) aren't fetchable from claude.ai, so they stay as name-only
        // references in the transcript — no bytes are captured for them.
      }
      const text =
        r.role === "assistant" && domAnswers.length ? stripThinking(r.text, domAnswers) : r.text;
      return { role: r.role, content: [{ type: "text", text }], attachments, artifacts: [] };
    });

    // Fetch all blobs concurrently (capped) and fill the records in place. Bytes
    // are stored via addMedia so the ZIP export includes them; text files are
    // additionally read and inlined.
    const total = fetchTasks.length;
    let done = 0;
    if (total) progress("Reading attachments… (0/" + total + ")");
    await mapLimit(fetchTasks, 6, async (t) => {
      const blob = t.url ? await fetchBlob(t.url) : null;
      done++;
      progress("Reading attachments… (" + done + "/" + total + ")");
      if (blob) {
        t.att.mediaId = M.addMedia(session, blob, blob.type, t.name);
        if (t.isText) {
          try {
            const text = await blob.text();
            t.att.text =
              text.length > MAX_INLINE_TEXT
                ? text.slice(0, MAX_INLINE_TEXT) + "\n…[truncated]"
                : text;
          } catch (e) {
            /* keep the bytes even if the text read fails */
          }
        }
      } else if (t.isImg) {
        t.att.src = t.url; // fetch failed — keep the URL so it's not silently lost
      }
    });

    // Content Claude GENERATED — name-only references that live only in the DOM
    // (the raw-mode API collapses them to a stripped placeholder, see probeMessages):
    //   • download cards → file refs (the Download control is a JS-handler button,
    //     no link, so the bytes aren't fetchable)
    //   • images/visuals → image refs (rendered in a cross-origin claudemcpcontent
    //     iframe whose pixels we can't read; name comes from the iframe title)
    // Fold each into the matching assistant turn by order. Best-effort: a long,
    // unscrolled chat may have generated content not yet mounted.
    try {
      const uploadNames = new Set();
      for (const t of turns) for (const a of t.attachments) if (a.name) uploadNames.add(a.name);
      const extras = collectGeneratedFiles(uploadNames)
        .map((g) => ({ el: g.el, type: "file", name: g.name }))
        .concat(collectGeneratedImages().map((g) => ({ el: g.el, type: "image", name: g.name })));
      if (extras.length) {
        const domTurns = collectTurns().turns;
        const turnSet = new Set(domTurns.map((t) => t.el));
        const domAssistantEls = domTurns.filter((t) => t.role === "assistant").map((t) => t.el);
        const apiAssistants = turns.filter((t) => t.role === "assistant");
        for (const g of extras) {
          // Map the DOM assistant turn to the same-indexed API assistant record
          // (both follow the active path in order); fall back to the last.
          const owner = ownerTurn(g.el, turnSet);
          const idx = owner ? domAssistantEls.indexOf(owner) : -1;
          const rec =
            idx >= 0 && idx < apiAssistants.length
              ? apiAssistants[idx]
              : apiAssistants[apiAssistants.length - 1];
          if (rec) rec.attachments.push({ type: g.type, mediaId: null, name: g.name, generated: true });
        }
      }
    } catch (e) {
      console.warn("[Continuum] captureFast: generated-content scan failed:", e);
    }

    session.turns = turns;
    M.recomputeStats(session);

    progress("Saving…");
    return session;
  }

  // API-based stat preview so the panel's "current chat" counts match what a
  // capture actually produces. The DOM peekStats under-counts turns (lazy
  // loading) and misses file uploads; this reads the same source captureFast
  // uses, via the shared parser. Returns { messages, images, files } or null on
  // any failure (the panel then falls back to the DOM peek).
  // Cached per conversation for a short window: this fetches the whole tree, so
  // without the cache it re-ran on every panel open/close. A conversation can
  // grow, so it's a TTL (not permanent) — rapid reopen is instant, but it still
  // refreshes if the panel is reopened after a while.
  let _peekStatsCache = null; // { convId, ts, value }
  const PEEK_STATS_TTL_MS = 60000;
  async function peekStatsFast(force) {
    const convId = (location.pathname.match(/\/chat\/([0-9a-f-]{8,})/i) || [])[1] || "";
    if (
      !force &&
      _peekStatsCache &&
      _peekStatsCache.convId === convId &&
      Date.now() - _peekStatsCache.ts < PEEK_STATS_TTL_MS
    ) {
      return _peekStatsCache.value;
    }
    try {
      const data = await fetchConversationData();
      if (!data) return null;
      const parsed = activeRecordsFromData(data);
      if (!parsed) return null;
      let images = 0;
      let files = 0;
      for (const r of parsed.records) {
        const fromUser = r.role === "user";
        for (const a of r.atts) {
          if (a.isImg) images++;
          // A file YOU uploaded counts (shown even if unfetchable, e.g. a sandbox
          // .zip blob); AI files count only when attachable (url/inline text). The
          // attach toggle keys on captured bytes, so unfetchable uploads can't be
          // attached. Pasted content is transcript text, NOT a file — don't count
          // it. Matches recomputeStats so preview == saved.
          else if (!a.isPasted && (fromUser || a.url || a.text != null)) files++;
        }
      }
      // Generated download cards + images are DOM-only (the raw-mode API can't see
      // them — see captureFast); count those not already counted as uploads so the
      // panel reflects them and matches the saved session's recomputeStats.
      try {
        const uploadNames = new Set();
        for (const r of parsed.records) for (const a of r.atts) if (a.name) uploadNames.add(a.name);
        files += collectGeneratedFiles(uploadNames).length;
        images += collectGeneratedImages().length;
      } catch (e) {
        /* best-effort — DOM scan failure shouldn't break the preview */
      }
      const value = { messages: parsed.records.length, images, files };
      _peekStatsCache = { convId, ts: Date.now(), value };
      return value;
    } catch (e) {
      return null;
    }
  }

  // Dumps the RAW shape of the API's file/image attachment objects so we can
  // map the correct field names. Symptom that prompts this: file uploads show
  // as "[file: attachment]" with no bytes in the ZIP — meaning the name/url/
  // content fields on the attachment objects don't match what classifyApiAttachment
  // reads. Run in the console:  await Continuum.claudeAdapter.probeApiAttachments()
  // Builds a shape report from an already-fetched API response (no network).
  function buildAttachmentReport(data) {
    const prevStr = (s) => (s.length > 200 ? s.slice(0, 200) + "…(" + s.length + " chars)" : s);
    // Deep preview (DOWN TO `depth` levels) so nested byte-URL fields are VISIBLE —
    // the old version only printed nested objects' key names, which hid exactly the
    // `document_asset.url`-style field we need to map. Strings truncated, arrays capped.
    const deep = (v, depth) => {
      if (typeof v === "string") return prevStr(v);
      if (Array.isArray(v)) return depth <= 0 ? "[array len " + v.length + "]" : v.slice(0, 4).map((x) => deep(x, depth - 1));
      if (v && typeof v === "object") {
        if (depth <= 0) return "{keys: " + Object.keys(v).join(",") + "}";
        const o = {};
        for (const k of Object.keys(v)) o[k] = deep(v[k], depth - 1);
        return o;
      }
      return v;
    };
    const rawMessages = (data && (data.chat_messages || data.chatMessages)) || [];
    const known = ["files", "attachments", "files_v2"];
    // Does an object look like an upload descriptor? (Used to find attachments
    // stored under message keys we don't currently read.)
    const looksLikeFile = (o) =>
      !!o && typeof o === "object" &&
      ["file_name", "filename", "name", "file_type", "mime_type", "file_kind", "file_uuid", "document_asset", "url", "preview_url"]
        .some((k) => k in o);
    const counts = { files: 0, attachments: 0, files_v2: 0 };
    const samples = [];
    const candidates = []; // file-like objects OUTSIDE the three known arrays
    const msgKeyUnion = new Set();
    for (const m of rawMessages) {
      if (!m || typeof m !== "object") continue;
      for (const k of Object.keys(m)) msgKeyUnion.add(k);
      for (const key of known) {
        const list = m[key];
        if (!Array.isArray(list) || !list.length) continue;
        counts[key] += list.length;
        for (const f of list) {
          if (samples.length >= 10 || !f || typeof f !== "object") continue;
          samples.push({ list: key, keys: Object.keys(f), value: deep(f, 3) });
        }
      }
      // Scan the OTHER message keys for file-like arrays/objects we miss today.
      for (const k of Object.keys(m)) {
        if (known.indexOf(k) !== -1) continue;
        const v = m[k];
        const hit = Array.isArray(v) ? v.find(looksLikeFile) : looksLikeFile(v) ? v : null;
        if (hit && candidates.length < 10) candidates.push({ key: k, isArray: Array.isArray(v), sample: deep(hit, 3) });
      }
    }
    return {
      topLevelKeys: data ? Object.keys(data) : [],
      messageCount: rawMessages.length,
      messageKeyUnion: [...msgKeyUnion],
      attachmentCounts: counts,
      attachmentSamples: samples,
      otherFileLikeLocations: candidates, // ← if your zip/json shows up HERE, it's stored under a key we don't read
    };
  }

  async function probeApiAttachments() {
    let data;
    try {
      data = await fetchConversationData();
    } catch (e) {
      console.warn("[Continuum] probeApiAttachments: fetch failed:", e);
      return null;
    }
    if (!data) {
      console.warn("[Continuum] probeApiAttachments: no conversation id / org");
      return null;
    }
    const report = buildAttachmentReport(data);
    try {
      console.log("[Continuum] API attachment probe:\n" + JSON.stringify(report, null, 2));
    } catch (e) {
      console.log("[Continuum] API attachment probe:", report);
    }
    return report;
  }

  // Probe: blob-kind uploads (zip/json/etc.) expose NO download URL — only a
  // file_uuid (bytes land in the code sandbox at /mnt/user-data/uploads/…). Images
  // download from /api/{org}/files/{uuid}/preview and PDFs from …/document, so the
  // blob download is almost certainly …/<some-variant>. This tries the likely
  // endpoints for the FIRST url-less file and reports which returns real bytes, so
  // we can wire the right one. Run via localStorage flag continuum_probe_dl.
  async function probeFileDownload() {
    let data;
    try {
      data = await fetchConversationData();
    } catch (e) {
      console.warn("[Continuum] probeFileDownload: fetch failed:", e);
      return null;
    }
    if (!data) {
      console.warn("[Continuum] probeFileDownload: no conversation id / org");
      return null;
    }
    const org = await resolveOrgId();
    const convId = (location.pathname.match(/\/chat\/([0-9a-f-]{8,})/i) || [])[1] || "";
    const msgs = (data.chat_messages || data.chatMessages) || [];
    let target = null;
    for (const m of msgs) {
      for (const f of (m && m.files) || []) {
        if (!f || typeof f !== "object") continue;
        const a = classifyApiAttachment(f);
        if (!a.url && (f.file_uuid || f.uuid)) { target = f; break; }
      }
      if (target) break;
    }
    if (!target) {
      console.log("[Continuum] probeFileDownload: no URL-less file found — every file already resolves a URL.");
      return null;
    }
    const uuid = target.file_uuid || target.uuid;
    const fbase = "/api/" + org + "/files/" + uuid;
    const obase = "/api/organizations/" + org + "/files/" + uuid;
    const cbase = "/api/" + org + "/chat_conversations/" + convId + "/files/" + uuid;
    const ocbase = "/api/organizations/" + org + "/chat_conversations/" + convId + "/files/" + uuid;
    const candidates = [
      fbase + "/contents", fbase, // re-test the basics, but now capture the error body
      obase + "/contents", obase,
      cbase + "/contents", cbase, cbase + "/download",
      ocbase + "/contents", ocbase, ocbase + "/download",
      // Some claude.ai blobs are addressed by their sandbox path under the conversation.
      "/api/" + org + "/files/" + uuid + "/raw_content",
    ];
    const results = [];
    for (const url of candidates) {
      try {
        const res = await fetch(url, { credentials: "include", cache: "no-store" });
        const entry = {
          url, status: res.status, ok: res.ok,
          contentType: res.headers.get("content-type"),
          contentLength: res.headers.get("content-length"),
        };
        // For NON-ok (or JSON) responses, read the body — the error often names the
        // correct route. Don't read an ok binary (could be the whole 11 MB zip).
        const ct = entry.contentType || "";
        if (!res.ok || /json|text/i.test(ct)) {
          try { entry.body = (await res.text()).slice(0, 300); } catch (e) { /* ignore */ }
        }
        results.push(entry);
      } catch (e) {
        results.push({ url, error: String((e && e.message) || e) });
      }
    }
    const report = { file_name: target.file_name, file_kind: target.file_kind, uuid: uuid, org: org, convId: convId, results: results };
    try {
      console.log("[Continuum] file-download probe:\n" + JSON.stringify(report, null, 2));
    } catch (e) {
      console.log("[Continuum] file-download probe:", report);
    }
    return report;
  }

  // Dumps the content-block structure of ASSISTANT messages so we can see how
  // claude.ai exposes (a) extended thinking and (b) IMAGES/FILES Claude itself
  // generates — these don't land in msg.files (that's user uploads); they ride
  // inside the content blocks, and we need the exact nested field that holds the
  // image URL / file id to fetch the bytes. The preview recurses two levels into
  // each block so nested shapes (source.url, file_uuid, content[].*) are visible.
  // Sampling PREFERS messages that carry a non-text/thinking block (or a files
  // array), so the interesting block actually shows up instead of the first few
  // text-only turns. Run on a chat where Claude sent an image AND a file.
  async function probeMessages() {
    let data;
    try {
      data = await fetchConversationData();
    } catch (e) {
      console.warn("[Continuum] probeMessages: fetch failed:", e);
      return null;
    }
    if (!data) {
      console.warn("[Continuum] probeMessages: no conversation id / org");
      return null;
    }
    const prev = (v) =>
      typeof v === "string" ? (v.length > 160 ? v.slice(0, 160) + "…(" + v.length + " chars)" : v) : v;
    // Recursive preview up to `depth` levels into objects/arrays so a block's
    // nested image/file fields are revealed (the old string-only preview hid
    // them). Strings are truncated; arrays are capped at 4 items.
    const deep = (v, depth) => {
      if (typeof v === "string") return prev(v);
      if (Array.isArray(v))
        return depth <= 0 ? "[array len " + v.length + "]" : v.slice(0, 4).map((x) => deep(x, depth - 1));
      if (v && typeof v === "object") {
        if (depth <= 0) return "{keys: " + Object.keys(v).join(",") + "}";
        const o = {};
        for (const k of Object.keys(v)) o[k] = deep(v[k], depth - 1);
        return o;
      }
      return v;
    };
    const raw = (data.chat_messages || data.chatMessages) || [];
    // An assistant message is "interesting" for this probe if it has a content
    // block that isn't plain text/thinking, or any attachment array — i.e. it
    // might carry a Claude-generated image/file we currently drop.
    const interesting = (m) => {
      if (["files", "attachments", "files_v2"].some((k) => Array.isArray(m[k]) && m[k].length)) return true;
      return (
        Array.isArray(m.content) &&
        m.content.some((b) => b && typeof b === "object" && !/^(text|thinking)/i.test(b.type || ""))
      );
    };
    const toSample = (m) => ({
      sender: String(m.sender || m.role || "").toLowerCase(),
      msgKeys: Object.keys(m),
      msgText: typeof m.text === "string" ? prev(m.text) : false,
      contentIsArray: Array.isArray(m.content),
      fileArrays: ["files", "attachments", "files_v2"].reduce((acc, k) => {
        if (Array.isArray(m[k]) && m[k].length) acc[k] = m[k].map((f) => deep(f, 2));
        return acc;
      }, {}),
      blocks: Array.isArray(m.content) ? m.content.map((b) => deep(b, 2)) : null,
    });
    const assistants = raw.filter((m) => /assist|^ai$|claude/.test(String(m.sender || m.role || "").toLowerCase()));
    // Interesting messages first, then fill from the front, deduped, cap 6.
    const ordered = [...assistants.filter(interesting), ...assistants];
    const seen = new Set();
    const samples = [];
    for (const m of ordered) {
      if (seen.has(m)) continue;
      seen.add(m);
      samples.push(toSample(m));
      if (samples.length >= 6) break;
    }
    const report = { topLevelKeys: Object.keys(data), assistantSamples: samples };
    try {
      console.log("[Continuum] message-shape probe:\n" + JSON.stringify(report, null, 2));
    } catch (e) {
      console.log("[Continuum] message-shape probe:", report);
    }
    return report;
  }

  // When assistant turns read as zero, claude.ai has likely renamed the reply
  // class. This counts a spread of plausible assistant hooks so we can see which
  // one currently matches, and dumps the ancestry of a real reply (found relative
  // to a user message) so the correct selector can be read straight off the DOM.
  function diagnoseAssistant() {
    const candidates = {
      ".font-claude-message": ".font-claude-message",
      '[data-testid="assistant-message"]': '[data-testid="assistant-message"]',
      "[data-is-streaming]": "[data-is-streaming]",
      ".prose": ".prose",
      '[class*="claude" i]': '[class*="claude" i]',
      'div[class*="message" i]': 'div[class*="message" i]',
      '[data-testid*="message" i]': '[data-testid*="message" i]',
      '[data-testid*="turn" i]': '[data-testid*="turn" i]',
    };
    const candidateCounts = {};
    for (const [label, sel] of Object.entries(candidates)) {
      try {
        candidateCounts[label] = document.querySelectorAll(sel).length;
      } catch (e) {
        candidateCounts[label] = "ERR";
      }
    }

    // Walk up from the first user message; sibling wrappers that DON'T contain a
    // user message are almost certainly the assistant replies. Dump their tags,
    // classes and testids so the real selector is obvious from the output.
    const firstUser = document.querySelector(SEL_USER);
    const replySamples = [];
    if (firstUser) {
      let wrap = firstUser;
      for (let i = 0; i < 10 && wrap.parentElement; i++) {
        const sibs = Array.from(wrap.parentElement.children);
        const replies = sibs.filter((s) => s !== wrap && !s.querySelector(SEL_USER) && (s.innerText || "").trim());
        if (replies.length) {
          replies.slice(0, 3).forEach((r) =>
            replySamples.push({
              tag: r.tagName,
              className: typeof r.className === "string" ? r.className.slice(0, 160) : "",
              testid: r.getAttribute && r.getAttribute("data-testid"),
              textPreview: (r.innerText || "").trim().slice(0, 100),
            })
          );
          break;
        }
        wrap = wrap.parentElement;
      }
    }

    // Full ancestry from a user message up to the scroll container — lets us
    // see at WHICH depth user/assistant turns become siblings, without the
    // 6-level cap above. Future selector breakage usually means this ancestry
    // changed shape; comparing it to the working layout makes the new hook obvious.
    const scrollEl = findScrollContainer();
    const userAncestry = [];
    if (firstUser) {
      let n = firstUser;
      for (let i = 0; n && n !== scrollEl && i < 20; i++, n = n.parentElement) {
        userAncestry.push({
          depth: i,
          tag: n.tagName,
          testid: n.getAttribute && n.getAttribute("data-testid"),
          cls: (typeof n.className === "string" ? n.className : "").slice(0, 120),
          kids: n.children.length,
          isStreaming: n.hasAttribute && n.hasAttribute("data-is-streaming"),
        });
      }
    }

    // What `[data-is-streaming]` actually contains — useful to confirm the hook
    // is on reply containers and not just sub-blocks.
    const streamSamples = Array.from(document.querySelectorAll("[data-is-streaming]"))
      .slice(0, 3)
      .map((el) => ({
        tag: el.tagName,
        cls: (typeof el.className === "string" ? el.className : "").slice(0, 140),
        testid: el.getAttribute("data-testid"),
        streaming: el.getAttribute("data-is-streaming"),
        textPreview: (el.innerText || "").trim().slice(0, 120),
      }));

    return { candidateCounts, replySamples, userAncestry, streamSamples };
  }

  // Diagnostic dump for selector verification. Read-only except for the scroll.
  async function probe() {
    const beforeCount = document.querySelectorAll(SEL_TURNS).length;
    const scrollEl = findScrollContainer();
    const render = await ensureFullRender(scrollEl);
    const afterCount = render.finalCount;

    const { turns: turnList, method: turnMethod } = collectTurns();
    const turns = turnList.map((t) => t.el);
    const users = turnList.filter((t) => t.role === "user").length;
    const imgs = collectImages();
    const files = collectFiles();
    const generated = collectGeneratedFiles(new Set(files.map((f) => f.name)));
    const artifactCards = Array.from(document.querySelectorAll(SEL_ARTIFACT_CARD));

    const report = {
      title: detectTitle(),
      startedAt: await detectStartedAt(),
      scrollContainer: scrollEl === document.scrollingElement ? "document" : scrollEl.className || scrollEl.tagName,
      turnsBeforeScroll: beforeCount,
      turnsAfterScroll: afterCount,
      maxTurnsDuringScroll: render.maxSeen,
      // afterCount !== beforeCount only means lazy-loading mounted more turns
      // (benign). virtualized (finalCount < maxSeen) means turns were UNMOUNTED
      // and the capture snapshot is genuinely incomplete — the bad case.
      lazyLoadDetected: afterCount !== beforeCount,
      virtualized: render.virtualized,
      userTurns: users,
      assistantTurns: turns.length - users,
      // "selector" = reply class still works; "structural" = class is stale and
      // we fell back to DOM position; "selector-noassistant" = neither found a
      // reply (broken capture). If not "selector", update SEL_ASSISTANT using
      // candidateCounts / assistantDiag.replySamples below.
      captureMethod: turnMethod,
      assistantDiag: diagnoseAssistant(),
      imageCount: imgs.length,
      imageNames: imgs.map((i) => i.name),
      fileCount: files.length,
      fileNames: files.map((f) => f.name + " [" + f.mediaType + "]"),
      // Discovery aids for the new capture paths (verify these before relying on them):
      fileUrls: files.map((f) => f.name + " -> " + (f.url || "NO URL FOUND")),
      generatedFileNames: generated.map((g) => g.name),
      generatedImageNames: collectGeneratedImages().map((g) => g.name),
      artifactCardCount: artifactCards.length,
      artifactSamples: artifactCards.slice(0, 3).map((el) => ({
        testid: el.getAttribute("data-testid"),
        ariaLabel: el.getAttribute("aria-label"),
        tag: el.tagName,
        htmlHead: (el.outerHTML || "").slice(0, 220),
      })),
      sampleTurns: turnList.slice(0, 3).map((t) => ({
        role: t.role,
        textPreview: extractText(t.el).slice(0, 120),
      })),
    };
    console.log("[Continuum] probe:", report);
    // Also print a copy-pasteable JSON block (easier to share than nested objects).
    try {
      console.log("[Continuum] probe JSON:\n" + JSON.stringify(report, null, 2));
    } catch (e) {
      /* ignore stringify issues */
    }
    return report;
  }

  // Diagnostic: how many thinking blocks the DOM exposes, and which assistant
  // answers they'd be stripped from (before/after preview + chars removed). Run via
  // the continuum_probe_think localStorage flag. Confirms the strip is matching.
  async function probeThinking() {
    const domAnswers = collectDomAnswers();
    const report = {
      domAnswers: domAnswers.length,
      samples: domAnswers.slice(0, 3).map((a) => a.text.slice(0, 60) + "…"),
      assistantTurnsStripped: 0,
      matched: [],
    };
    let data = null;
    try {
      data = await fetchConversationData();
    } catch (e) {
      /* report DOM-only if the API read fails */
    }
    const parsed = data ? activeRecordsFromData(data) : null;
    if (parsed) {
      for (const r of parsed.records) {
        if (r.role !== "assistant") continue;
        const stripped = stripThinking(r.text, domAnswers);
        if (stripped !== r.text) {
          report.matched.push({
            apiChars: r.text.length,
            domAnswerChars: stripped.length,
            wasThinking: r.text.slice(0, 70),
            nowStartsWith: stripped.slice(0, 70),
          });
        }
      }
      report.assistantTurnsStripped = report.matched.length;
    }
    try {
      console.log("[Continuum] thinking probe:\n" + JSON.stringify(report, null, 2));
    } catch (e) {
      console.log("[Continuum] thinking probe:", report);
    }
    return report;
  }

  Continuum.claudeAdapter = {
    capture,
    captureFast,
    probe,
    probeApiAttachments,
    probeFileDownload,
    probeMessages,
    probeThinking,
    peekStats,
    peekStatsFast,
    peekSignal,
    detectTitle,
    detectStartedAt,
    _resolveActivePath: resolveActivePath, // exposed for unit tests (tests/adapter-tree.test.js)
    _classifyApiAttachment: classifyApiAttachment, // exposed for unit tests
    _extractMessageText: extractMessageText, // exposed for unit tests
  };
})();
