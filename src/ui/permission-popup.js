// permission-popup.js — the Firefox toolbar popup. One click grants Continuum
// PERSISTENT host access to the supported AI sites, so its content script auto-
// injects from then on. Without this, Firefox (unlike Chrome) doesn't grant MV3
// host permissions until the user allows them — so the floating button never
// appeared and resume couldn't run on a freshly-opened chat unless you clicked
// the toolbar to grant temporary access every time.
//
// These origins are declared as `optional_host_permissions` in the Firefox
// manifest (Chrome keeps them as required `host_permissions`, granted silently at
// install, and never shows this popup).

"use strict";
(function () {
  // Same set as the Firefox manifest's optional_host_permissions: the chat sites
  // (content-script injection) + googleusercontent (image capture) + the API
  // endpoints the background worker calls for optional compression.
  const ORIGINS = [
    "https://claude.ai/*",
    "https://chatgpt.com/*",
    "https://chat.openai.com/*",
    "https://gemini.google.com/*",
    "https://www.perplexity.ai/*",
    "https://perplexity.ai/*",
    "https://*.googleusercontent.com/*",
    "https://api.anthropic.com/*",
    "https://api.openai.com/*",
    "https://generativelanguage.googleapis.com/*",
    "https://api.perplexity.ai/*",
    "https://api.x.ai/*",
    "https://api.deepseek.com/*",
  ];

  const usingBrowser = typeof browser !== "undefined" && browser.permissions;
  const api = usingBrowser ? browser : typeof chrome !== "undefined" ? chrome : null;

  const btn = document.getElementById("enable");
  const statusEl = document.getElementById("status");
  const hintEl = document.getElementById("hint");
  const lede = document.getElementById("lede");

  // browser.* returns promises (Firefox); chrome.* uses callbacks — normalize both.
  function contains(p) {
    return usingBrowser
      ? browser.permissions.contains(p)
      : new Promise((r) => chrome.permissions.contains(p, r));
  }
  function request(p) {
    return usingBrowser
      ? browser.permissions.request(p)
      : new Promise((r) => chrome.permissions.request(p, r));
  }

  function showEnabled() {
    btn.textContent = "Enabled";
    btn.disabled = true;
    statusEl.textContent = "✓ Active on your AI chat sites";
    statusEl.className = "status ok";
    lede.textContent =
      "Continuum is enabled. Open or reload a supported AI chat and the button appears bottom-right.";
  }

  if (!api || !api.permissions) {
    statusEl.textContent = "Permissions API unavailable.";
    btn.disabled = true;
    return;
  }

  // Reflect current state on open: if already granted, show the enabled state.
  contains({ origins: ORIGINS })
    .then((has) => {
      if (has) showEnabled();
    })
    .catch(() => {});

  btn.addEventListener("click", () => {
    statusEl.textContent = "";
    statusEl.className = "status";
    // Must run in the click handler (a user gesture) for permissions.request.
    request({ origins: ORIGINS })
      .then((granted) => {
        if (granted) {
          showEnabled();
          hintEl.hidden = false;
        } else {
          statusEl.textContent = "Permission was declined.";
        }
      })
      .catch((e) => {
        statusEl.textContent = "Couldn't enable: " + (e && e.message ? e.message : e);
      });
  });
})();
