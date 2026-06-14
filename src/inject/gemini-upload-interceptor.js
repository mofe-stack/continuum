// gemini-upload-interceptor.js — runs in the PAGE'S MAIN WORLD (manifest
// content_scripts entry with "world": "MAIN", at document_start).
//
// WHY THIS EXISTS: when you upload an image to Gemini, the page previews it from
// a page-local blob: URL (URL.createObjectURL). The browser revokes that blob:
// on navigation, and on a later revisit Gemini re-serves your upload from a
// LOCKED googleusercontent URL an extension can't fetch — so re-capturing an old
// chat got the upload by name only (probe-confirmed 2026-06). The bytes only
// exist, reachable, at the MOMENT of upload. So we patch URL.createObjectURL here
// (main world — an isolated content script's patch wouldn't see the page's own
// calls) and read the bytes right then, before they're locked away.
//
// We can't use chrome.* from the main world, so we hand the bytes to the isolated
// content script via window.postMessage; upload-vault.js (isolated) persists them.
//
// Uploads vs. generated images: a USER upload is a File passed to
// createObjectURL; an image Gemini GENERATES is a plain Blob (decoded from a
// fetch). We only vault File images, so generated images don't pollute the vault
// (which would break the order-based matching the adapter relies on).

(function () {
  "use strict";
  if (window.__continuumUploadHooked) return; // guard against double-injection
  window.__continuumUploadHooked = true;

  const MAX_BYTES = 30 * 1024 * 1024; // skip very large images — keep storage sane
  const _create = URL.createObjectURL.bind(URL);
  const seen = new WeakSet(); // dedupe repeated createObjectURL calls on one File

  function bytesToB64(bytes) {
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  function vault(file) {
    try {
      const reader = new FileReader();
      reader.onload = function () {
        try {
          const b64 = bytesToB64(new Uint8Array(reader.result));
          window.postMessage(
            {
              __continuumUpload: true,
              name: file.name || "",
              size: file.size || 0,
              type: file.type || "image/png",
              b64: b64,
              path: location.pathname,
            },
            location.origin
          );
        } catch (e) {
          /* best-effort — a failed read just leaves the upload name-only */
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (e) {
      /* ignore */
    }
  }

  URL.createObjectURL = function (obj) {
    const url = _create(obj);
    try {
      if (
        obj instanceof File &&
        /^image\//i.test(obj.type || "") &&
        obj.size > 0 &&
        obj.size <= MAX_BYTES &&
        !seen.has(obj)
      ) {
        seen.add(obj);
        vault(obj);
      }
    } catch (e) {
      /* never let the hook break the page's upload */
    }
    return url;
  };
})();
