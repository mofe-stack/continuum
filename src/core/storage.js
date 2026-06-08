// storage.js — saved-session persistence.
//
// Sessions live in chrome.storage.local (the EXTENSION's own storage), NOT in
// page-origin IndexedDB. This matters because IndexedDB is partitioned per
// origin: claude.ai and chatgpt.com would each get a separate database, so a
// session captured on one site would be invisible on the other (and a resume
// from Claude into ChatGPT couldn't load its own session). chrome.storage.local
// is shared across every site the extension runs on, so there is ONE unified
// library. Media blobs aren't JSON-serializable, so they're stored base64 and
// rehydrated to Blobs on read.
//
// Layout:
//   continuum.index            -> [ {id,title,sourceProvider,capturedAt,startedAt,stats}, … ]
//   continuum.session.<id>     -> full session (media as { id: {b64,mimeType,name} })
//
// The legacy per-origin IndexedDB store has been retired. The library is now
// chrome.storage.local only; on startup we DELETE the old `continuum` IndexedDB
// (best-effort, idempotent) so its stale records can't leak back in. This also
// fixes reinstalls resurrecting old sessions: chrome.storage.local (and the old
// migration's "done" flag) are wiped on uninstall, but the page-origin IndexedDB
// is not — so the previous IDB→storage migration re-imported the same stale
// records on every reinstall. Deleting the source DB ends that for good.

(function () {
  "use strict";

  const Continuum = (window.Continuum = window.Continuum || {});

  const INDEX_KEY = "continuum.index";
  const sessionKey = (id) => "continuum.session." + id;
  const LEGACY_IDB_NAME = "continuum"; // the retired per-origin session store

  // ---- chrome.storage.local promise wrappers -------------------------------
  function sget(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (items) => {
        const err = chrome.runtime.lastError;
        if (err) reject(new Error(err.message));
        else resolve(items || {});
      });
    });
  }
  function sset(obj) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(obj, () => {
        const err = chrome.runtime.lastError;
        if (err) reject(new Error(err.message));
        else resolve();
      });
    });
  }
  function sremove(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove(keys, () => {
        const err = chrome.runtime.lastError;
        if (err) reject(new Error(err.message));
        else resolve();
      });
    });
  }

  // ---- base64 <-> bytes (chunked, large-blob safe) -------------------------
  function bytesToB64(bytes) {
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }
  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // ---- session <-> stored form (blob <-> base64) ---------------------------
  async function toStored(session) {
    const media = session.media || {};
    const outMedia = {};
    for (const id of Object.keys(media)) {
      const m = media[id];
      if (m && m.blob) {
        try {
          const buf = await m.blob.arrayBuffer();
          outMedia[id] = {
            b64: bytesToB64(new Uint8Array(buf)),
            mimeType: m.mimeType || m.blob.type || "",
            name: m.name || "",
          };
        } catch (e) {
          /* unreadable blob — skip it rather than fail the whole save */
        }
      } else if (m && typeof m.b64 === "string") {
        outMedia[id] = m; // already in stored form (e.g. during migration)
      }
    }
    return Object.assign({}, session, { media: outMedia });
  }

  function fromStored(stored) {
    if (!stored) return stored;
    const media = stored.media || {};
    const outMedia = {};
    for (const id of Object.keys(media)) {
      const m = media[id];
      if (m && typeof m.b64 === "string") {
        outMedia[id] = {
          blob: new Blob([b64ToBytes(m.b64)], { type: m.mimeType || "" }),
          mimeType: m.mimeType || "",
          name: m.name || "",
        };
      } else if (m && m.blob) {
        outMedia[id] = m;
      }
    }
    return Object.assign({}, stored, { media: outMedia });
  }

  function meta(session) {
    return {
      id: session.id,
      title: session.title,
      sourceProvider: session.sourceProvider,
      capturedAt: session.capturedAt,
      startedAt: session.startedAt,
      stats: session.stats,
    };
  }

  // ---- one-time cleanup of the retired legacy IndexedDB --------------------
  // Deletes the old per-origin `continuum` IDB so its stale records can never be
  // re-imported (they used to come back on every reinstall). Best-effort and
  // idempotent: deleting an absent DB is a no-op, so it's safe to run each load.
  // Never blocks storage use — a hung delete (e.g. an open connection elsewhere)
  // resolves on its own and the rest of storage works regardless.
  let _cleanupPromise = null;
  function ensureLegacyCleanup() {
    if (_cleanupPromise) return _cleanupPromise;
    _cleanupPromise = new Promise((resolve) => {
      try {
        if (typeof indexedDB === "undefined" || !indexedDB.deleteDatabase) {
          resolve();
          return;
        }
        const req = indexedDB.deleteDatabase(LEGACY_IDB_NAME);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve(); // another tab holds it open — don't wait
      } catch (e) {
        resolve();
      }
    });
    return _cleanupPromise;
  }

  // ---- public API (unchanged signatures) -----------------------------------

  // Persists a full normalized session (including its media blobs).
  async function saveSession(session) {
    await ensureLegacyCleanup();
    const stored = await toStored(session);
    const idxItems = await sget([INDEX_KEY]);
    const index = Array.isArray(idxItems[INDEX_KEY]) ? idxItems[INDEX_KEY] : [];
    const next = index.filter((m) => m.id !== session.id);
    next.push(meta(session));
    await sset({ [sessionKey(session.id)]: stored, [INDEX_KEY]: next });
    return session;
  }

  // Returns lightweight metadata only (no blobs/turns) so the panel list is cheap.
  // Sorted newest-first by capturedAt.
  async function listSessions() {
    await ensureLegacyCleanup();
    const idxItems = await sget([INDEX_KEY]);
    const index = Array.isArray(idxItems[INDEX_KEY]) ? idxItems[INDEX_KEY] : [];
    return index.slice().sort((a, b) => {
      const av = a.capturedAt || "";
      const bv = b.capturedAt || "";
      return av < bv ? 1 : av > bv ? -1 : 0;
    });
  }

  // Returns the full record including rehydrated media blobs.
  async function getSession(id) {
    await ensureLegacyCleanup();
    const key = sessionKey(id);
    const items = await sget([key]);
    return fromStored(items[key]);
  }

  // Permanently removes a session (and its media) by id.
  async function deleteSession(id) {
    await ensureLegacyCleanup();
    const idxItems = await sget([INDEX_KEY]);
    const index = Array.isArray(idxItems[INDEX_KEY]) ? idxItems[INDEX_KEY] : [];
    await sremove(sessionKey(id));
    await sset({ [INDEX_KEY]: index.filter((m) => m.id !== id) });
  }

  Continuum.storage = { saveSession, listSessions, getSession, deleteSession };
})();
