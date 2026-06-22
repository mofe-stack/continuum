// media-reader.js — runs in the PAGE'S MAIN WORLD (manifest content_scripts entry
// with "world":"MAIN", document_start) on every supported provider host.
//
// WHY THIS EXISTS: on Firefox a content-script fetch().blob() returns a PAGE-REALM
// Blob the isolated content script CANNOT read — arrayBuffer()/FileReader/
// createObjectURL all throw the Xray error "permission denied to access property
// constructor", so captured images/files were silently dropped. The background
// worker can re-fetch http(s) URLs, but it CANNOT fetch page-local blob:/data:
// URLs — only the page that created them can. This reader lives in the page realm:
// on request it fetches a URL (its own blob:/data:/same-origin) and hands the bytes
// back to the isolated content script as base64 — a primitive that crosses the
// realm boundary cleanly. The content script rebuilds a clean Blob. See storage.js
// (Continuum.media.fetchViaPage), which is the only caller.
//
// We can't use chrome.* from the main world, so the bridge is window.postMessage
// (same mechanism gemini-upload-interceptor.js uses): request {__continuumReadReq}
// in, response {__continuumReadRes} out, matched by a per-call id.

(function () {
  "use strict";
  if (window.__continuumMediaReader) return; // guard against double-injection
  window.__continuumMediaReader = true;

  const MAX_BYTES = 40 * 1024 * 1024; // refuse absurdly large reads — keep storage sane

  function bytesToB64(bytes) {
    let bin = "";
    const chunk = 0x8000; // chunk so String.fromCharCode doesn't blow the arg limit
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  window.addEventListener("message", function (ev) {
    // Only our own page's messages (postMessage echoes to the same window).
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.__continuumReadReq !== true || !d.id) return;
    const id = d.id;
    const url = d.url;
    const reply = (msg) =>
      window.postMessage(Object.assign({ __continuumReadRes: true, id: id }, msg), location.origin);
    if (!url) {
      reply({ ok: false, error: "no url" });
      return;
    }
    const isLocal = /^(blob:|data:)/i.test(url);
    // The page realm reads its OWN blob:/data: URLs natively, and same-origin
    // resources with the user's cookies. Cross-origin is left to the background
    // worker (the caller tries that first for http(s)).
    fetch(url, isLocal ? {} : { credentials: "include" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.arrayBuffer().then(function (buf) {
          return { buf: buf, mime: res.headers.get("content-type") || "" };
        });
      })
      .then(function (r) {
        if (r.buf.byteLength > MAX_BYTES) throw new Error("too large (" + r.buf.byteLength + " bytes)");
        reply({ ok: true, b64: bytesToB64(new Uint8Array(r.buf)), mime: r.mime });
      })
      .catch(function (e) {
        reply({ ok: false, error: (e && e.message) || String(e) });
      });
  });
})();
