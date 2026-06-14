// upload-vault.js — isolated-world store for upload bytes grabbed at upload time.
//
// Pairs with inject/gemini-upload-interceptor.js (main world). That hook reads an
// uploaded image's bytes the instant Gemini creates its blob: URL and posts them
// here via window.postMessage; we persist them in chrome.storage.local keyed by
// conversation so a LATER re-capture (when the upload is only a locked remote URL)
// can recover the real bytes instead of degrading to name-only.
//
// MATCHING: Gemini's revisited upload <img> exposes no filename (probe-confirmed —
// alt is just "Uploaded image preview"), so the adapter can't match by name. It
// matches by ORDER: the Nth uploaded image in a conversation ↔ the Nth vault
// entry for that conversation. We therefore preserve upload order (entries sorted
// by ts) and scope strictly per conversation id.
//
// NEW CHATS: when you upload into a brand-new chat the URL has no id yet (/app),
// so the entry is stored with convId=null. A light watcher pins those pending
// entries to the real id the moment the URL becomes /app/<id> (same SPA page
// load), before you can navigate elsewhere.

(function () {
  "use strict";
  const Continuum = (window.Continuum = window.Continuum || {});
  if (Continuum.uploadVault) return;

  const VAULT_KEY = "continuum.uploads";
  const MAX_ENTRIES = 60; // hard cap on vaulted uploads (oldest pruned first)
  const MAX_TOTAL_B64 = 180 * 1024 * 1024; // ~135 MB of bytes across the vault
  const ENTRY_TTL_MS = 30 * 24 * 60 * 60 * 1000; // forget uploads after 30 days

  // A per-page-load nonce: ties pending (convId-less) uploads to THIS load so the
  // watcher only ever pins them to a conversation this same page navigated into.
  const pageNonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
  let _pendingCount = 0; // in-memory guard so the watcher idles when nothing's pending

  function sget(keys) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(keys, (items) => resolve(items || {}));
      } catch (e) {
        resolve({});
      }
    });
  }
  function sset(obj) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set(obj, () => resolve());
      } catch (e) {
        resolve();
      }
    });
  }

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // Gemini conversation id from the URL, or null on a not-yet-saved new chat.
  function convIdFromPath(path) {
    const m = String(path || "").match(/\/app\/([a-z0-9-]+)/i);
    return m ? m[1] : null;
  }
  const currentConvId = () => convIdFromPath(location.pathname);

  async function readEntries() {
    const items = await sget([VAULT_KEY]);
    const v = items[VAULT_KEY];
    return Array.isArray(v && v.entries) ? v.entries : [];
  }

  // Prune: drop expired entries, then enforce the count and total-size caps by
  // dropping the OLDEST first (keeps the most recent uploads, the likely targets).
  function prune(entries) {
    const now = Date.now();
    let kept = entries.filter((e) => e && e.b64 && now - (e.ts || 0) < ENTRY_TTL_MS);
    kept.sort((a, b) => (a.ts || 0) - (b.ts || 0)); // oldest → newest
    while (kept.length > MAX_ENTRIES) kept.shift();
    let total = kept.reduce((n, e) => n + (e.b64 ? e.b64.length : 0), 0);
    while (kept.length && total > MAX_TOTAL_B64) total -= (kept.shift().b64 || "").length;
    return kept;
  }

  async function addEntry(msg) {
    const convId = convIdFromPath(msg.path);
    const entry = {
      id: Math.random().toString(36).slice(2),
      convId: convId,
      pageNonce: pageNonce,
      kind: "image",
      name: msg.name || "",
      size: msg.size || 0,
      type: msg.type || "image/png",
      b64: msg.b64,
      ts: Date.now(),
    };
    const entries = await readEntries();
    // Dedupe: the same upload can fire createObjectURL more than once. Skip if the
    // last entry has the same size+type within a short window (order-preserving).
    const last = entries[entries.length - 1];
    if (last && last.size === entry.size && last.type === entry.type && entry.ts - (last.ts || 0) < 4000) {
      return;
    }
    entries.push(entry);
    if (convId == null) _pendingCount++;
    await sset({ [VAULT_KEY]: { entries: prune(entries) } });
  }

  // Pin pending (convId-less) entries from THIS page load to the conversation id
  // the URL just acquired — called when a new chat first gets its /app/<id>.
  async function reconcile(convId) {
    if (!convId) return;
    const entries = await readEntries();
    let changed = false;
    for (const e of entries) {
      if (e && e.convId == null && e.pageNonce === pageNonce) {
        e.convId = convId;
        changed = true;
      }
    }
    if (changed) await sset({ [VAULT_KEY]: { entries: prune(entries) } });
    _pendingCount = 0;
  }

  // Image uploads for a conversation, OLDEST→NEWEST (upload order), so the adapter
  // can match them positionally to the rendered upload <img>s. Reconciles any
  // pending uploads first (covers capturing the new chat we just uploaded into).
  async function getImagesForConversation(convId) {
    if (convId) await reconcile(convId);
    const entries = await readEntries();
    return entries
      .filter((e) => e && e.kind === "image" && e.convId === convId && e.b64)
      .sort((a, b) => (a.ts || 0) - (b.ts || 0));
  }

  // Light watcher: when this load's URL gains a conversation id and we have
  // pending uploads, pin them. Idles (no storage reads) whenever nothing pends.
  let _lastConvId = currentConvId();
  function watch() {
    setInterval(() => {
      const cid = currentConvId();
      if (cid && cid !== _lastConvId && _pendingCount > 0) reconcile(cid);
      _lastConvId = cid;
    }, 800);
  }

  function init() {
    window.addEventListener("message", (e) => {
      if (e.source !== window || e.origin !== location.origin) return;
      const d = e.data;
      if (!d || d.__continuumUpload !== true || typeof d.b64 !== "string") return;
      addEntry(d);
    });
    watch();
  }

  Continuum.uploadVault = { init, getImagesForConversation, b64ToBytes };
  init();
})();
