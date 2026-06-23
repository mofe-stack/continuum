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

  // Firefox detection (also exposed on Continuum.media below). Defined here because the
  // realm-safe blob readers need it.
  const isGecko =
    typeof navigator !== "undefined" && /\bGecko\//.test(navigator.userAgent || "") && /Firefox/i.test(navigator.userAgent || "");

  // ---- base64 <-> bytes (chunked, large-blob safe) -------------------------
  // NOTE: read elements by INDEX, never via bytes.subarray(). On Firefox a Uint8Array
  // backed by a PAGE-REALM ArrayBuffer throws "permission denied to access property
  // constructor" when you call .subarray() (it reads the array's species/constructor).
  // Indexed reads don't touch the constructor, so this is realm-safe for any byte array.
  function bytesToB64(bytes) {
    let bin = "";
    const chunk = 0x8000;
    const len = bytes.length;
    for (let i = 0; i < len; i += chunk) {
      const end = i + chunk < len ? i + chunk : len;
      const part = new Array(end - i);
      for (let j = i; j < end; j++) part[j - i] = bytes[j];
      bin += String.fromCharCode.apply(null, part);
    }
    return btoa(bin);
  }
  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // FileReader.readAsDataURL → base64 string (no "data:…," prefix), or null. This is the
  // realm-safe read on Firefox: the result is a plain STRING, so we never touch a
  // page-realm-backed ArrayBuffer/typed array (whose .subarray()/constructor access is
  // denied by the Xray wrapper). Never rejects.
  function blobToDataB64(blob) {
    return new Promise((resolve) => {
      try {
        const r = new FileReader();
        r.onload = () => {
          const s = String(r.result || "");
          const comma = s.indexOf(",");
          resolve(comma >= 0 ? s.slice(comma + 1) : "");
        };
        r.onerror = () => resolve(null);
        r.readAsDataURL(blob);
      } catch (e) {
        resolve(null);
      }
    });
  }

  // Realm-safe blob → bytes. On Firefox, read via the base64-string path (no page-realm
  // typed array) then decode into a FRESH content-script Uint8Array. Chrome uses the
  // fast direct path. Returns { bytes, via } or null. EVERY blob-read site (save, ZIP,
  // PDF) must use this, not a bare blob.arrayBuffer(), or it drops blobs on Firefox.
  async function readBlobBytes(blob) {
    if (!blob) return null;
    if (isGecko) {
      const b64 = await blobToDataB64(blob);
      if (b64 != null) return { bytes: b64ToBytes(b64), via: "filereader" };
    }
    try {
      return { bytes: new Uint8Array(await blob.arrayBuffer()), via: "direct" };
    } catch (e1) {
      const b64 = await blobToDataB64(blob); // last resort (also covers Chrome edge cases)
      if (b64 != null) return { bytes: b64ToBytes(b64), via: "filereader" };
      console.warn("[Continuum] readBlobBytes: all strategies failed | direct=" + (e1 && e1.message));
      return null;
    }
  }

  // Realm-safe blob → base64. On Firefox the FileReader string path is primary (avoids
  // the typed-array realm trap entirely).
  async function readBlobB64(blob) {
    if (!blob) return null;
    if (isGecko) {
      const b64 = await blobToDataB64(blob);
      if (b64 != null) return { b64: b64, via: "filereader" };
    }
    const r = await readBlobBytes(blob);
    return r ? { b64: bytesToB64(r.bytes), via: r.via } : null;
  }

  // ---- session <-> stored form (blob <-> base64) ---------------------------
  async function toStored(session) {
    const media = session.media || {};
    const outMedia = {};
    for (const id of Object.keys(media)) {
      const m = media[id];
      // Per-item guard so ONE bad blob can never throw and abort the whole save.
      // CRUCIAL: never touch m.blob.type here — on Firefox a page-realm blob's .type
      // getter can throw the "constructor" Xray error (this aborted capture entirely).
      // The mime was already captured as the plain string m.mimeType at addMedia time.
      try {
        if (m && m.blob) {
          // Realm-safe read (Firefox page-realm blobs need the FileReader base64 path,
          // not a bare new Uint8Array(arrayBuffer) — see readBlobB64).
          const read = await readBlobB64(m.blob);
          if (read && read.b64) {
            outMedia[id] = { b64: read.b64, mimeType: m.mimeType || "", name: m.name || "" };
          } else {
            console.warn("[Continuum] save: unreadable media blob dropped:", id, m.mimeType || "");
          }
        } else if (m && typeof m.b64 === "string") {
          outMedia[id] = m; // already in stored form (e.g. during migration)
        }
      } catch (e) {
        console.warn("[Continuum] save: media item threw, skipped:", id, e && e.message);
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
    // Provider-agnostic: drop images/files the AI echoed back from the user's upload
    // (captured on both turns) before persisting, then re-stat so the saved counts and
    // the index metadata match what's actually kept. Idempotent on re-save.
    if (Continuum.model && Continuum.model.dedupeAttachments) {
      Continuum.model.dedupeAttachments(session);
      Continuum.model.recomputeStats(session);
    }
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

  // ---- realm-safe media fetch (Firefox page-realm blob fix) ----------------
  // On Firefox a content-script `fetch(url).blob()` (and XHR) hands back a
  // PAGE-REALM Blob the content script CANNOT read — arrayBuffer(), FileReader and
  // URL.createObjectURL all throw the Xray error "permission denied to access
  // property constructor". That silently dropped EVERY captured image/file (saved
  // sessions had media: 0 blobs → "can't capture images or files"). The escape
  // hatch: fetch remote media in the BACKGROUND worker — its own realm, uses
  // host_permissions, sends cookies — and ship the bytes back as base64, a
  // primitive that crosses the realm boundary cleanly, then rebuild a clean
  // content-script Blob. Adapters call this FIRST on Firefox for http(s) URLs.
  // blob:/data: URLs are page-local (the worker can't fetch them) so those stay on
  // the content-script path. Chrome reads its own fetch blobs fine → unaffected.
  // (isGecko is declared once, up near the realm-safe blob readers.)

  function blobFromBase64(b64, mime) {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime || "application/octet-stream" });
  }

  // Resolves to a CLEAN content-script Blob, or null. Never rejects.
  function fetchViaWorker(url) {
    // The worker runs in the EXTENSION origin (moz-extension://…), so a relative URL
    // like "/api/…/preview" would resolve against the extension and abort. Resolve it
    // to absolute against the PAGE origin (claude.ai/chatgpt.com/…) here, in the
    // content script, where location.href is the page URL.
    let absUrl = url;
    try {
      absUrl = new URL(url, location.href).href;
    } catch (e) {
      /* leave as-is; worker will report failure */
    }
    return new Promise((resolve) => {
      let settled = false;
      try {
        chrome.runtime.sendMessage({ type: "continuum-fetch", url: absUrl }, (resp) => {
          if (settled) return;
          settled = true;
          const lastErr = chrome.runtime.lastError;
          if (lastErr || !resp || !resp.ok || !resp.base64) {
            if (lastErr) console.warn("[Continuum] worker media fetch error:", absUrl, lastErr.message);
            else if (resp && resp.error) console.warn("[Continuum] worker media fetch failed:", absUrl, resp.error);
            return resolve(null);
          }
          try {
            resolve(blobFromBase64(resp.base64, resp.mime));
          } catch (e) {
            resolve(null);
          }
        });
      } catch (e) {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      }
    });
  }

  // Read a URL in the PAGE'S MAIN WORLD (via the media-reader.js bridge) and rebuild
  // a clean Blob. This is the ONLY way to get bytes for page-local blob:/data: URLs
  // (the worker can't fetch them) and a useful same-origin fallback when the worker
  // fetch fails. Resolves to a clean content-script Blob, or null. Never rejects.
  const pageReads = new Map(); // id → resolver
  let pageReadSeq = 0;
  window.addEventListener("message", function (ev) {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.__continuumReadRes !== true || !d.id) return;
    const cb = pageReads.get(d.id);
    if (cb) {
      pageReads.delete(d.id);
      cb(d);
    }
  });

  function fetchViaPage(url) {
    return new Promise((resolve) => {
      if (!url) return resolve(null);
      // blob:/data: are already absolute & page-local; resolve only http(s) relatives.
      let reqUrl = url;
      if (!/^(blob:|data:)/i.test(url)) {
        try {
          reqUrl = new URL(url, location.href).href;
        } catch (e) {
          /* leave as-is */
        }
      }
      const id = "cm" + ++pageReadSeq + "_" + Date.now();
      let done = false;
      const finish = (blob) => {
        if (done) return;
        done = true;
        pageReads.delete(id);
        resolve(blob);
      };
      pageReads.set(id, (d) => {
        if (!d.ok || !d.b64) {
          if (d && d.error) console.warn("[Continuum] page media read failed:", reqUrl, d.error);
          return finish(null);
        }
        try {
          finish(blobFromBase64(d.b64, d.mime));
        } catch (e) {
          finish(null);
        }
      });
      try {
        window.postMessage({ __continuumReadReq: true, id: id, url: reqUrl }, location.origin);
      } catch (e) {
        return finish(null);
      }
      setTimeout(() => finish(null), 15000); // don't hang capture if the page never replies
    });
  }

  // Normalize a (possibly page-realm) blob into a guaranteed-clean CONTENT-SCRIPT
  // blob, by reading its bytes NOW (at capture time, while the page blob is alive)
  // and rebuilding it in our realm. A page-realm blob is readable right after fetch
  // but becomes unreadable later (it dies by save time → dropped images/files), so
  // adapters call this on every fetched blob on Firefox before handing it to
  // addMedia. Idempotent for already-clean blobs. Returns the clean blob, or the
  // original if it truly can't be read.
  async function toCleanBlob(blob) {
    if (!blob) return blob;
    let t = "";
    try {
      t = blob.type || "";
    } catch (e) {
      /* page-realm .type getter denied — type is optional */
    }
    // Route through BASE64, not new Blob([bytes]): readBlobBytes may hand back a
    // Uint8Array that VIEWS the page-realm ArrayBuffer, and a Blob built from that view
    // stays page-tied and dies before save. blobFromBase64 builds a FRESH content-script
    // Uint8Array from a base64 string, fully severing the page realm.
    const r = await readBlobB64(blob);
    if (!r || !r.b64) return blob;
    return blobFromBase64(r.b64, t);
  }

  Continuum.media = {
    isGecko: isGecko,
    blobFromBase64: blobFromBase64,
    fetchViaWorker: fetchViaWorker,
    fetchViaPage: fetchViaPage,
    readBlobBytes: readBlobBytes,
    readBlobB64: readBlobB64,
    toCleanBlob: toCleanBlob,
  };

  Continuum.storage = { saveSession, listSessions, getSession, deleteSession };
})();
