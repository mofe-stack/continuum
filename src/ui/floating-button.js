// floating-button.js — injects the quiet bottom-right button and owns the single
// shadow-DOM host that isolates all Continuum UI from claude.ai's CSS (and vice
// versa). The panel (capture-panel.js) renders into this same shadow root.

(function () {
  "use strict";

  const Continuum = (window.Continuum = window.Continuum || {});

  const HOST_ID = "continuum-host";

  // Build DOM nodes from a static HTML string WITHOUT innerHTML (which AMO's
  // reviewer linter flags on dynamic values). DOMParser is an accepted, non-sink API.
  function setHTML(el, html) {
    const doc = new DOMParser().parseFromString(String(html), "text/html");
    el.replaceChildren(...Array.from(doc.body.childNodes));
  }

  let host = null;
  let shadow = null;
  let buttonEl = null;
  let mounted = false;

  // Logo: charcoal bookmark with two sparkles — a big one and a small one.
  // Fully monochrome (everything is currentColor).
  const LOGO_SVG =
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">' +
    '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M10 5.5 11 7.55 13 8.5 11 9.45 10 11.5 9 9.45 7 8.5 9 7.55Z" fill="currentColor"/>' +
    '<path d="M13 9.4 13.52 10.48 14.6 11 13.52 11.52 13 12.6 12.48 11.52 11.4 11 12.48 10.48Z" fill="currentColor"/>' +
    "</svg>";

  // Creates the shadow host (once) and links the isolated stylesheet into it.
  function ensureHost() {
    if (host && document.body.contains(host)) return shadow;
    host = document.getElementById(HOST_ID) || document.createElement("div");
    host.id = HOST_ID;
    // Host itself stays out of layout; children use position:fixed.
    host.style.all = "initial";
    if (!host.isConnected) document.body.appendChild(host);

    shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
    if (!shadow.querySelector('link[data-continuum-css]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.setAttribute("data-continuum-css", "");
      link.href = chrome.runtime.getURL("src/ui/panel.css");
      shadow.appendChild(link);
    }
    // Theme the host so the floating button matches light/dark immediately —
    // even before the panel is ever opened. The dark CSS vars live on
    // :host([data-theme="dark"]) and cascade to the button + panel.
    if (Continuum.settings) {
      const applyHostTheme = () => {
        if (host) host.dataset.theme = Continuum.settings.getResolvedTheme();
      };
      applyHostTheme(); // immediate (cached value or 'light' default)
      Continuum.settings.init().then(applyHostTheme).catch(function () {});
      Continuum.settings.onThemeChange(applyHostTheme);
    }
    return shadow;
  }

  function mount() {
    const root = ensureHost();
    if (!buttonEl) {
      buttonEl = document.createElement("button");
      buttonEl.className = "continuum-fab";
      buttonEl.title = "Continuum — capture this session";
      buttonEl.setAttribute("aria-label", "Open Continuum");
      setHTML(buttonEl, LOGO_SVG);
      buttonEl.addEventListener("click", () => {
        if (Continuum.ui && Continuum.ui.panel) Continuum.ui.panel.toggle(root);
      });
    }
    // Re-append if React wiped it or it isn't attached yet — keeps the button
    // visible across SPA navigation without relying on the `mounted` flag.
    if (!buttonEl.isConnected) root.appendChild(buttonEl);
    mounted = true;
  }

  function unmount() {
    if (buttonEl && buttonEl.parentNode) buttonEl.parentNode.removeChild(buttonEl);
    if (Continuum.ui && Continuum.ui.panel) Continuum.ui.panel.close();
    mounted = false;
  }

  Continuum.ui = Continuum.ui || {};
  Continuum.ui.button = { mount, unmount, ensureHost, isMounted: () => mounted };
})();
