// chatgpt-adapter.js — captures a ChatGPT (chatgpt.com) conversation into the
// normalized session model. Mirrors claude-adapter's public surface so the panel
// and the adapter router treat both the same:
//   captureFast, capture (DOM fallback), detectTitle, detectStartedAt,
//   peekStats, peekStatsFast, + probe helpers.
//
// API path: ChatGPT's backend needs a bearer token from /api/auth/session, then
// GET /backend-api/conversation/<id> returns a message `mapping` we walk from
// `current_node` to the root (the active path, dropping abandoned regen branches).
// Exact field names mirror the documented ChatGPT shapes; anything uncertain is
// verified with the probe helpers (run via the continuum_probe_* localStorage
// flags) — the same probe-driven approach used to nail the Claude adapter.

(function () {
  "use strict";
  const Continuum = (window.Continuum = window.Continuum || {});
  const model = () => Continuum.model;
  const MAX_INLINE_TEXT = 200000;

  function convIdFromUrl() {
    const m = location.pathname.match(/\/c\/([0-9a-f-]{8,})/i);
    return m ? m[1] : null;
  }

  // ChatGPT's backend-api is bearer-authenticated; the token comes from the
  // same-origin session endpoint. Cached after first use.
  let _tokenCache;
  async function getAccessToken() {
    if (_tokenCache !== undefined) return _tokenCache;
    try {
      const res = await fetch("/api/auth/session", { credentials: "include", headers: { accept: "application/json" } });
      const data = res.ok ? await res.json() : null;
      _tokenCache = (data && data.accessToken) || null;
    } catch (e) {
      _tokenCache = null;
    }
    return _tokenCache;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function api(path, _retried) {
    const token = await getAccessToken();
    const headers = { accept: "application/json" };
    if (token) headers.authorization = "Bearer " + token;
    // no-store: the live stats refresh must see new turns immediately rather
    // than a cached conversation snapshot.
    const res = await fetch(path, { credentials: "include", headers, cache: "no-store" });
    // 429 = rate-limited. Wait the server's Retry-After (capped) and try ONCE more
    // before giving up, so a brief throttle doesn't fail the whole capture.
    if (res.status === 429 && !_retried) {
      const ra = parseInt(res.headers.get("retry-after") || "", 10);
      await sleep(Math.min(8000, (ra > 0 ? ra : 2) * 1000));
      return api(path, true);
    }
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  async function fetchBlob(url, _retried) {
    try {
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 429 && !_retried) {
        const ra = parseInt(res.headers.get("retry-after") || "", 10);
        await sleep(Math.min(8000, (ra > 0 ? ra : 2) * 1000));
        return fetchBlob(url, true);
      }
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.blob();
    } catch (e) {
      console.warn("[Continuum] chatgpt blob fetch failed:", url, e && e.message);
      return null;
    }
  }

  async function mapLimit(items, limit, fn) {
    const queue = items.slice();
    const worker = async () => {
      let next;
      while ((next = queue.shift()) !== undefined) await fn(next);
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  }

  function detectTitle() {
    const t = (document.title || "").replace(/\s*[-|–]\s*ChatGPT.*$/i, "").trim();
    return t || "ChatGPT conversation";
  }

  // Shared, THROTTLED conversation fetch — the single choke point so the live panel
  // (peekStatsFast + detectStartedAt, every few seconds) and rapid CHAT-SWITCHING
  // don't burst ChatGPT's rate-limited /backend-api (the 429s). Two guards:
  //   • per-id cache (CONV_TTL): reuse a snapshot for a few seconds, and
  //   • global min-gap (CONV_MIN_GAP): never hit the API more than ~once/2.5s, even
  //     across different chats — switching fast serves the cache (or null) instead.
  // `force` bypasses both (capture must read fresh + complete).
  let _convCache = null; // { id, ts, data }
  let _lastConvFetch = 0;
  let _rateLimitedUntil = 0; // after a 429, pause auto-polling so we don't prolong it
  const CONV_TTL_MS = 10000;
  const CONV_MIN_GAP_MS = 2500;
  const RATE_LIMIT_BACKOFF_MS = 60000;
  async function fetchConversation(force) {
    const id = convIdFromUrl();
    if (!id) return null;
    if (!force && _convCache && _convCache.id === id && Date.now() - _convCache.ts < CONV_TTL_MS) {
      return _convCache.data;
    }
    if (!force && Date.now() - _lastConvFetch < CONV_MIN_GAP_MS) {
      return _convCache && _convCache.id === id ? _convCache.data : null; // rate guard
    }
    // Cooling down after a 429: serve cache (or null) and DON'T hit the API — the
    // live panel polling would otherwise keep the rate limit tripped. `force`
    // (explicit capture/probe) still goes through.
    if (!force && Date.now() < _rateLimitedUntil) {
      return _convCache && _convCache.id === id ? _convCache.data : null;
    }
    _lastConvFetch = Date.now();
    try {
      const data = await api("/backend-api/conversation/" + id);
      _convCache = { id: id, ts: Date.now(), data: data };
      return data;
    } catch (e) {
      if (/\b429\b/.test((e && e.message) || "")) _rateLimitedUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
      throw e;
    }
  }

  // Walk mapping from current_node up to the root via `parent`, then reverse to
  // chronological order (this is the live path; off-path regen branches drop).
  function activeNodes(data) {
    const mapping = data && data.mapping;
    if (!mapping) return [];
    const chain = [];
    const guard = new Set();
    let id = data.current_node;
    while (id && mapping[id] && !guard.has(id)) {
      guard.add(id);
      chain.push(mapping[id]);
      id = mapping[id].parent;
    }
    chain.reverse();
    return chain;
  }

  // ChatGPT embeds "content-reference" tokens in assistant text, wrapped in invisible
  // private-use chars (U+E200–U+E2FF): web-search citations (turn0search0), an image
  // carousel (image_group{…}), entity chips (entity["type","Name",…]), nav lists, a
  // leaked "url" prefix on link text, etc. Left in, they're garbage in the transcript.
  const PUA_REF_RE = /[-]/g;
  const REF_TOKEN = "turn\\d+(?:search|image|news|view|forecast|finance|sports|product|ref|video|map)\\d+";

  // Strip ChatGPT's "content-reference" tokens — invisible private-use chars (U+E200–
  // U+E2FF) wrapping web-search citations (turn0search0), the image carousel marker
  // (image_group{…}), entity chips, nav lists, and a leaked "url" prefix on links.
  // Left in, they're garbage in the transcript. (Web-search IMAGES are NOT captured.)
  function cleanChatGptText(text) {
    let s = String(text == null ? "" : text).replace(PUA_REF_RE, "");
    s = s.replace(/image_group\s*\{[\s\S]*?\}/g, ""); // carousel marker → drop
    s = s.replace(/entity\["[^"]*","([^"]*)"[^\]]*\]/g, "$1"); // entity chip → its display name
    s = s.replace(new RegExp("cite(?:" + REF_TOKEN + ")+", "g"), ""); // citation clusters
    s = s.replace(new RegExp(REF_TOKEN, "g"), ""); // stray refs (e.g. trailing on a link)
    s = s.replace(/\bnavlist\b/g, "");
    s = s.replace(/(^|[\s(\-])url(?=[A-Za-z0-9])/g, "$1"); // leaked "url" prefix on link text
    return s.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  }

  // Concatenate a message's text parts. Non-text parts become a labeled stub so
  // nothing vanishes silently (mirrors claude-adapter.extractMessageText).
  function extractText(msg) {
    const c = msg && msg.content;
    if (!c) return "";
    const parts = Array.isArray(c.parts) ? c.parts : [];
    const out = [];
    for (const p of parts) {
      if (typeof p === "string") {
        if (p) out.push(p);
      } else if (p && typeof p === "object") {
        const ct = String(p.content_type || "").toLowerCase();
        // image_asset_pointer parts are captured as real image attachments
        // (extractAttachments), so don't emit a redundant text stub next to the
        // embedded image — just skip it here.
        if (/image_asset_pointer/.test(ct)) continue;
        else if (typeof p.text === "string") out.push(p.text);
        else out.push("_[" + (p.content_type || "part") + "]_");
      }
    }
    const raw = out.length ? out.join("\n\n") : typeof c.text === "string" ? c.text : "";
    return cleanChatGptText(raw);
  }

  // User uploads (metadata.attachments) + inline image pointers in the parts.
  function extractAttachments(msg) {
    const out = [];
    const seen = new Set();
    // De-dupe: an uploaded image shows up BOTH in metadata.attachments AND as an
    // inline image_asset_pointer in the content parts — same underlying file id
    // (the pointer's `file-service://file-abc` strips to the attachment's `file-abc`).
    // Without this it was embedded twice in the resume PDF and double-counted.
    // metadata is read first, so its real filename wins over the pointer's id-name.
    const push = (att) => {
      const key = att.id || (att.isImg ? "img:" : "file:") + att.name;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(att);
    };
    const meta = (msg && msg.metadata) || {};
    if (Array.isArray(meta.attachments)) {
      for (const a of meta.attachments) {
        if (!a || typeof a !== "object") continue;
        const name = String(a.name || a.file_name || "attachment").replace(/[\r\n\t]+/g, " ").trim();
        // (ChatGPT uploads — including .zip and any other type — DO download back via
        // /backend-api/files/<id>/download, unlike Claude's sandbox blobs, so we keep
        // every upload here and let captureFast fetch its bytes by file id.)
        const mime = a.mime_type || a.mimeType || "";
        const isImg = /^image\//i.test(mime) || /\.(png|jpe?g|gif|webp|svg|heic|heif|bmp|avif|tiff?)$/i.test(name);
        // ChatGPT flags a pasted-in block (vs a real upload) with is_big_paste.
        // It rides in the transcript as text, so it isn't a "file" for counting
        // (and is never attachable).
        push({ id: a.id || a.file_id || null, name: name, mime: mime, isImg: isImg, isPasted: !!a.is_big_paste });
      }
    }
    const parts = (msg && msg.content && Array.isArray(msg.content.parts)) ? msg.content.parts : [];
    for (const p of parts) {
      if (p && typeof p === "object" && /image_asset_pointer/i.test(p.content_type || "")) {
        const id = String(p.asset_pointer || "").replace(/^(file-service|sediment):\/\//, "");
        if (id) push({ id: id, name: id + ".png", mime: "image/png", isImg: true });
      }
    }
    // Generated FILES that ChatGPT (code interpreter) offers as download links:
    //   [Download the PDF](sandbox:/mnt/data/Real_Madrid_Fan_Images.pdf)
    // The bytes resolve via the interpreter download endpoint (see fetchSandboxFile),
    // keyed by this message's id + the sandbox path. We carry `sandbox` (the raw
    // /mnt/data/... path) and `msgId` so captureFast can fetch them. Scans both
    // string parts and any part.text. (file_path-content_type parts carry the same
    // path under p.text on some shapes — covered by the text scan.)
    const SANDBOX_RE = /sandbox:(\/mnt\/data\/[^\s)"'\\]+)/gi;
    const msgId = (msg && msg.id) || null;
    for (const p of parts) {
      const body = typeof p === "string" ? p : (p && typeof p.text === "string" ? p.text : "");
      if (!body) continue;
      let mm;
      while ((mm = SANDBOX_RE.exec(body)) !== null) {
        let sandboxPath = "";
        try { sandboxPath = decodeURIComponent(mm[1]); } catch (e) { sandboxPath = mm[1]; }
        sandboxPath = sandboxPath.replace(/[\r\n\t]+/g, "").trim();
        if (!sandboxPath) continue;
        const name = sandboxPath.split("/").pop();
        const isImg = /\.(png|jpe?g|gif|webp|svg|heic|heif|bmp|avif|tiff?)$/i.test(name);
        // sandbox + msgId set ⇒ captureFast resolves & fetches the bytes.
        push({ id: null, name: name, mime: "", isImg: isImg, sandbox: sandboxPath, msgId: msgId });
      }
    }
    return out;
  }

  // True if a message carries an AI-generated image. ChatGPT delivers DALL·E /
  // image-gen output as a `tool` message (recipient "all", content_type
  // "multimodal_text") whose parts include an `image_asset_pointer`
  // (asset_pointer "sediment://file_…"). Verified via probeGeneratedImages on a
  // real generated-image chat. We surface these even though they're `tool` role.
  function hasGeneratedImage(msg) {
    const parts = (msg && msg.content && Array.isArray(msg.content.parts)) ? msg.content.parts : [];
    return parts.some((p) => p && typeof p === "object" && /image_asset_pointer/i.test(p.content_type || ""));
  }

  // Active record from a node, or null if it should be skipped. Verified against a
  // real DALL·E + code-interpreter chat (the active-path message table), the parts
  // that must be DROPPED are the tool PLUMBING, not the answers:
  //   • assistant messages addressed to a TOOL (recipient !== "all") — these are
  //     the python/DALL·E CALLS, carrying raw code ("from zipfile import …") and
  //     tool params ('{"size":"1024x1024","n":4}'). Real answers go to recipient
  //     "all".
  //   • content_type "model_editable_context" — empty system-context noise.
  //   • content_type "code" — tool input source (belt-and-suspenders; these also
  //     have a non-"all" recipient).
  // KEEP: user/assistant text (recipient "all"), and `tool` messages that carry a
  // generated image (attributed to the assistant).
  function nodeToRecord(node) {
    const msg = node && node.message;
    if (!msg || !msg.author) return null;
    const rawRole = String(msg.author.role || "").toLowerCase();
    const recipient = String(msg.recipient || "all").toLowerCase();
    const ct = String((msg.content && msg.content.content_type) || "").toLowerCase();
    const isGenImageTool = rawRole === "tool" && hasGeneratedImage(msg);

    if (rawRole !== "user" && rawRole !== "assistant" && !isGenImageTool) return null;
    if (msg.metadata && msg.metadata.is_visually_hidden_from_conversation) return null;
    // Drop tool plumbing (code/params sent TO a tool, and editable-context noise).
    // The generated-image tool message is exempt (its recipient is "all" anyway).
    if (!isGenImageTool) {
      if (rawRole === "assistant" && recipient !== "all") return null; // tool CALL
      if (ct === "model_editable_context" || ct === "code") return null;
    }
    const role = rawRole === "user" ? "user" : "assistant"; // gen-image tool → assistant
    const text = extractText(msg);
    const atts = extractAttachments(msg);
    if (text.trim() === "" && atts.length === 0) return null;
    return { role: role, text: text, atts: atts };
  }

  // Resolve a file's bytes via the files API (download_url), then fetch them.
  async function fetchFileBytes(fileId) {
    if (!fileId) return null;
    try {
      const meta = await api("/backend-api/files/" + encodeURIComponent(fileId) + "/download");
      const url = meta && (meta.download_url || meta.url);
      if (url) return await fetchBlob(url);
    } catch (e) {
      console.warn("[Continuum] chatgpt file download failed:", fileId, e && e.message);
    }
    return null;
  }

  // Resolve a code-interpreter SANDBOX file (the [Download …](sandbox:/mnt/data/…)
  // links) to its bytes. Endpoint verified live from the network panel:
  //   GET /backend-api/conversation/<convId>/interpreter/download
  //        ?message_id=<msgId>&sandbox_path=<URL-encoded /mnt/data/…>
  //   → { status:"success", download_url:"…/estuary/content?id=…&sig=…" }
  // then GET download_url for the bytes. Works for ANY generated file type (the
  // path is type-agnostic). Returns a Blob or null.
  async function fetchSandboxFile(convId, msgId, sandboxPath) {
    if (!convId || !msgId || !sandboxPath) return null;
    try {
      const meta = await api(
        "/backend-api/conversation/" + encodeURIComponent(convId) +
          "/interpreter/download?message_id=" + encodeURIComponent(msgId) +
          "&sandbox_path=" + encodeURIComponent(sandboxPath)
      );
      const url = meta && (meta.download_url || meta.url);
      if (url) return await fetchBlob(url);
    } catch (e) {
      console.warn("[Continuum] chatgpt sandbox download failed:", sandboxPath, e && e.message);
    }
    return null;
  }

  async function captureFast(onProgress) {
    const progress = typeof onProgress === "function" ? onProgress : function () {};
    const M = model();
    progress("Fetching from ChatGPT…");
    let data;
    try {
      data = await fetchConversation(true); // capture must read fresh + complete
    } catch (e) {
      console.warn("[Continuum] chatgpt captureFast: API failed, DOM fallback:", e && e.message);
      return capture(onProgress);
    }
    if (!data || !data.mapping) {
      console.warn("[Continuum] chatgpt captureFast: no mapping — DOM fallback");
      return capture(onProgress);
    }

    progress("Parsing messages…");
    const records = [];
    for (const n of activeNodes(data)) {
      const r = nodeToRecord(n);
      if (r) records.push(r);
    }
    if (!records.length) return capture(onProgress);

    const title = data.title || detectTitle();
    const startedAt = conversationStartedAt(data);
    const session = M.createSession({ title: title, startedAt: startedAt, sourceProvider: "chatgpt" });
    session.captureMethod = "api";
    const convId = convIdFromUrl();

    const fetchTasks = [];
    const turns = records.map((r) => {
      const attachments = [];
      for (const a of r.atts) {
        const att = { type: a.isImg ? "image" : "file", mediaId: null, name: a.name, mediaType: a.mime };
        if (a.isPasted) att.isPasted = true; // big-paste → transcript text, not a "file"
        attachments.push(att);
        if (a.id) {
          fetchTasks.push({ att: att, fileId: a.id, name: a.name, isImg: a.isImg });
        } else if (a.sandbox && a.msgId && convId) {
          // Code-interpreter generated file — resolve via the sandbox endpoint.
          fetchTasks.push({ att: att, sandbox: a.sandbox, msgId: a.msgId, convId: convId, name: a.name, isImg: a.isImg });
        }
      }
      return { role: r.role, content: [{ type: "text", text: r.text }], attachments: attachments, artifacts: [] };
    });

    const total = fetchTasks.length;
    let done = 0;
    if (total) progress("Reading attachments… (0/" + total + ")");
    await mapLimit(fetchTasks, 6, async (t) => {
      const blob = t.sandbox
        ? await fetchSandboxFile(t.convId, t.msgId, t.sandbox)
        : await fetchFileBytes(t.fileId);
      done++;
      progress("Reading attachments… (" + done + "/" + total + ")");
      // No bytes (e.g. an expired sandbox file) → leave it as a name-only
      // attachment; it's still listed + counted, just not embedded.
      if (!blob) return;
      t.att.mediaId = M.addMedia(session, blob, blob.type, t.name);
      if (!t.isImg && /^(text\/|application\/json)/i.test(blob.type || "")) {
        try {
          const text = await blob.text();
          t.att.text = text.length > MAX_INLINE_TEXT ? text.slice(0, MAX_INLINE_TEXT) + "\n…[truncated]" : text;
        } catch (e) {
          /* keep the bytes even if the text read fails */
        }
      }
    });

    session.turns = turns;
    M.recomputeStats(session);
    progress("Saving…");
    return session;
  }

  // DOM fallback — scrape rendered message turns when the API path is unavailable.
  async function capture(onProgress) {
    const progress = typeof onProgress === "function" ? onProgress : function () {};
    const M = model();
    progress("Reading the page…");
    const session = M.createSession({ title: detectTitle(), startedAt: null, sourceProvider: "chatgpt" });
    session.captureMethod = "dom";
    const turns = [];
    for (const el of document.querySelectorAll("[data-message-author-role]")) {
      const role = el.getAttribute("data-message-author-role") === "user" ? "user" : "assistant";
      const text = (el.innerText || el.textContent || "").trim();
      if (!text) continue;
      turns.push({ role: role, content: [{ type: "text", text: text }], attachments: [], artifacts: [] });
    }
    session.turns = turns;
    M.recomputeStats(session);
    return session;
  }

  // Synchronous on purpose: the panel reads peekStats() without awaiting (the
  // instant DOM count), then refines with the async peekStatsFast(). Returning a
  // Promise here would make statLine read undefined off it ("undefined messages").
  function peekStats() {
    return { messages: document.querySelectorAll("[data-message-author-role]").length, images: 0, files: 0 };
  }

  // Ultra-cheap change signal for the panel's live-refresh loop: changes whenever
  // a message turn is added (or generation completes, flipping the stop button
  // back to send). One querySelectorAll count — safe to poll every second or two;
  // the panel force-refreshes the heavier API stats only when this changes.
  function peekSignal() {
    let msgs = 0;
    let streaming = 0;
    try {
      msgs = document.querySelectorAll("[data-message-author-role]").length;
      streaming = document.querySelector('button[data-testid="stop-button"], [data-testid="stop-button"]') ? 1 : 0;
    } catch (e) {
      /* best-effort */
    }
    return msgs + ":" + streaming;
  }

  // Throttled stats poll. ChatGPT's /backend-api RATE-LIMITS (429), and the panel's
  // live loop calls this every few seconds — so we cache per-conversation and serve
  // the cached value within the TTL even when `force` is set (a hard cap on how often
  // we hit the API). On any error (incl. 429) we keep the last value rather than
  // blanking the panel, and stamp the cache so we don't immediately retry.
  let _peekCache = null; // { convId, ts, value }
  const PEEK_TTL_MS = 12000;
  async function peekStatsFast(force) {
    const convId = convIdFromUrl();
    if (_peekCache && _peekCache.convId === convId && Date.now() - _peekCache.ts < PEEK_TTL_MS) {
      return _peekCache.value;
    }
    try {
      const data = await fetchConversation();
      if (!data || !data.mapping) return _peekCache && _peekCache.convId === convId ? _peekCache.value : null;
      let messages = 0, images = 0, files = 0;
      for (const n of activeNodes(data)) {
        const r = nodeToRecord(n);
        if (!r) continue;
        messages++;
        for (const a of r.atts) {
          if (a.isImg) images++;
          // Only count ATTACHABLE files (have a file id, or a sandbox path we can
          // resolve) so the preview matches the saved stat after capture. A big
          // paste is transcript text, not a file — don't count it.
          else if (!a.isPasted && (a.id || a.sandbox)) files++;
        }
      }
      const value = { messages: messages, images: images, files: files };
      _peekCache = { convId: convId, ts: Date.now(), value: value };
      return value;
    } catch (e) {
      if (_peekCache && _peekCache.convId === convId) { _peekCache.ts = Date.now(); return _peekCache.value; }
      return null;
    }
  }

  // When the chat began. Prefer the conversation's create_time; fall back to the
  // EARLIEST message's create_time (robust when the top-level field is absent).
  function conversationStartedAt(data) {
    if (data && typeof data.create_time === "number") return new Date(data.create_time * 1000).toISOString();
    let earliest = null;
    const mapping = data && data.mapping;
    if (mapping) {
      for (const k of Object.keys(mapping)) {
        const node = mapping[k];
        const ct = node && node.message && node.message.create_time;
        if (typeof ct === "number" && (earliest == null || ct < earliest)) earliest = ct;
      }
    }
    return earliest ? new Date(earliest * 1000).toISOString() : null;
  }

  async function detectStartedAt() {
    try {
      return conversationStartedAt(await fetchConversation());
    } catch (e) {
      return null;
    }
  }

  // ── probes (selector/endpoint verification) ──────────────────────────────
  function probe() {
    console.log(
      "[Continuum] chatgpt DOM probe: " + document.querySelectorAll("[data-message-author-role]").length +
        " message elements; convId=" + convIdFromUrl()
    );
  }

  async function probeMessages() {
    try {
      const data = await fetchConversation();
      if (!data) {
        console.warn("[Continuum] chatgpt probeMessages: no data (token/convId?)");
        return null;
      }
      const prev = (v) => (typeof v === "string" ? (v.length > 160 ? v.slice(0, 160) + "…(" + v.length + ")" : v) : v);
      const samples = activeNodes(data).slice(0, 6).map((n) => {
        const m = n.message || {};
        return {
          role: m.author && m.author.role,
          content_type: m.content && m.content.content_type,
          msgKeys: Object.keys(m),
          metaKeys: m.metadata ? Object.keys(m.metadata) : [],
          parts: (m.content && m.content.parts ? m.content.parts : []).map((p) =>
            typeof p === "string" ? prev(p) : { ct: p && p.content_type, keys: p && typeof p === "object" ? Object.keys(p) : [] }
          ),
        };
      });
      console.log("[Continuum] chatgpt message-shape probe:\n" + JSON.stringify({ topLevelKeys: Object.keys(data), samples: samples }, null, 2));
      return samples;
    } catch (e) {
      console.warn("[Continuum] chatgpt probeMessages failed:", e);
      return null;
    }
  }

  async function probeApiAttachments() {
    try {
      const data = await fetchConversation();
      if (!data) return null;
      const trunc = (k, v) => (typeof v === "string" && v.length > 200 ? v.slice(0, 200) + "…" : v);
      const hits = [];
      for (const n of activeNodes(data)) {
        const m = n.message;
        const atts = m && m.metadata && m.metadata.attachments;
        if (Array.isArray(atts)) {
          for (const a of atts) if (hits.length < 8) hits.push({ keys: Object.keys(a), value: a });
        }
      }
      console.log("[Continuum] chatgpt attachment probe:\n" + JSON.stringify(hits, trunc, 2));
      return hits;
    } catch (e) {
      console.warn("[Continuum] chatgpt probeApiAttachments failed:", e);
      return null;
    }
  }

  Continuum.chatgptAdapter = {
    captureFast,
    capture,
    detectTitle,
    detectStartedAt,
    peekStats,
    peekStatsFast,
    peekSignal,
    probe,
    probeApiAttachments,
    probeMessages,
  };
})();
