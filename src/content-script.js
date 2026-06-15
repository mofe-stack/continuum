// content-script.js — entry point. Runs last in the js[] load order, so the
// namespace pieces (model, storage, claudeAdapter, ui.button, ui.panel) already
// exist on window.Continuum. Decides when the button should be visible and keeps
// it in sync with the AI site's client-side (SPA) navigation.

(function () {
  "use strict";

  const Continuum = (window.Continuum = window.Continuum || {});

  // Pick the capture adapter for the current site. Default to Claude.
  function getActiveAdapter() {
    const h = location.hostname;
    if (/(?:^|\.)(?:chatgpt\.com|chat\.openai\.com)$/i.test(h) && Continuum.chatgptAdapter) {
      return Continuum.chatgptAdapter;
    }
    if (/(?:^|\.)gemini\.google\.com$/i.test(h) && Continuum.geminiAdapter) {
      return Continuum.geminiAdapter;
    }
    if (/(?:^|\.)perplexity\.ai$/i.test(h) && Continuum.perplexityAdapter) {
      return Continuum.perplexityAdapter;
    }
    return Continuum.claudeAdapter;
  }
  Continuum.getActiveAdapter = getActiveAdapter;

  // A conversation page is claude.ai /chat/<id> or chatgpt.com /c/<id>. Home,
  // /new, /gpts, /projects, etc. are not conversations → button hidden there.
  function isConversationPage() {
    const h = location.hostname;
    // Conversations live at /c/<id>, but custom-GPT and project chats nest them
    // under /g/<gpt-id>/c/<id> — allow that optional prefix so the button shows there too.
    if (/(?:^|\.)(?:chatgpt\.com|chat\.openai\.com)$/i.test(h)) return /^(?:\/g\/[^/]+)?\/c\//.test(location.pathname);
    // Gemini conversation URLs are /app/<id> (the home /app is not a conversation).
    // Multi-account sessions prefix the path with /u/<n> (e.g. /u/1/app/<id>), so
    // allow that optional segment — otherwise the button never mounts on a 2nd+ account.
    if (/(?:^|\.)gemini\.google\.com$/i.test(h)) return /^(?:\/u\/\d+)?\/app\/[^/]+/.test(location.pathname);
    // Perplexity threads live at /search/<slug> (PROVISIONAL until the probe
    // confirms — the probe itself runs via the localStorage flag on ANY
    // perplexity.ai page, independent of this gate).
    if (/(?:^|\.)perplexity\.ai$/i.test(h)) return /^\/search\/[^/]+/.test(location.pathname);
    return /^\/chat\//.test(location.pathname);
  }

  function sync() {
    if (!Continuum.ui || !Continuum.ui.button) return;
    if (isConversationPage()) Continuum.ui.button.mount();
    else Continuum.ui.button.unmount();
  }

  let debounceTimer = null;
  function scheduleSync() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(sync, 120);
  }

  // The AI sites are React SPAs: clicking a chat changes the URL via React Router
  // WITHOUT a page reload, and React's initial render can wipe DOM nodes we added
  // too early (this is why the button was missing on the FIRST chat of a fresh
  // tab but fine when switching chats afterward). We can't reliably intercept
  // route changes from a content script's isolated world (patching
  // history.pushState there doesn't see the page's own calls), so we just re-run
  // sync() on a light interval. sync()/mount() are idempotent and re-attach the
  // button if React detached it — so this self-heals both navigation and the
  // first-render race. popstate covers back/forward instantly.
  function watchNavigation() {
    setInterval(sync, 400);
    window.addEventListener("popstate", scheduleSync);
  }

  // Dev helpers: console context-switching is flaky on these SPAs, so allow
  // triggering the diagnostics via a localStorage flag set from the page's own
  // console (page + content script share localStorage on the same origin):
  //   localStorage.setItem("continuum_probe", "1"); location.reload();
  //     → dumps the capture/DOM probe (assistant selectors, attachments, …)
  //   localStorage.setItem("continuum_probe_composer", "1"); location.reload();
  //     → dumps the resume composer/file-input selectors (run on a chat with the
  //       message box visible). Useful when auto-fill on Resume doesn't take.
  //   localStorage.setItem("continuum_probe_api", "1"); location.reload();
  //     → dumps the raw API attachment shapes (file/image objects) so we can see
  //       how uploaded files expose their name / download URL / extracted text.
  //   localStorage.setItem("continuum_probe_dl", "1"); location.reload();
  //     → for the first URL-less file (blob uploads like zip/json), tries the
  //       likely /api/{org}/files/{uuid}/<variant> endpoints and reports which
  //       returns the bytes (status/type/length) so we can wire the right one.
  // Each report is console.logged (visible regardless of console context).
  function maybeAutoProbe() {
    try {
      if (localStorage.getItem("continuum_probe")) {
        localStorage.removeItem("continuum_probe");
        console.log("[Continuum] auto-probe flag detected — running probe()…");
        setTimeout(function () {
          const a = getActiveAdapter();
          if (a && a.probe) a.probe();
        }, 800);
      }
      if (localStorage.getItem("continuum_probe_composer")) {
        localStorage.removeItem("continuum_probe_composer");
        console.log("[Continuum] composer-probe flag detected — running probeComposer()…");
        setTimeout(function () {
          if (Continuum.resumeInjector && Continuum.resumeInjector.probeComposer) {
            Continuum.resumeInjector.probeComposer();
          }
        }, 800);
      }
      if (localStorage.getItem("continuum_probe_api")) {
        localStorage.removeItem("continuum_probe_api");
        console.log("[Continuum] api-probe flag detected — running probeApiAttachments()…");
        setTimeout(function () {
          const a = getActiveAdapter();
          if (a && a.probeApiAttachments) a.probeApiAttachments();
        }, 400);
      }
      if (localStorage.getItem("continuum_probe_msgs")) {
        localStorage.removeItem("continuum_probe_msgs");
        console.log("[Continuum] message-probe flag detected — running probeMessages()…");
        setTimeout(function () {
          const a = getActiveAdapter();
          if (a && a.probeMessages) a.probeMessages();
        }, 400);
      }
      if (localStorage.getItem("continuum_probe_dl")) {
        localStorage.removeItem("continuum_probe_dl");
        console.log("[Continuum] download-probe flag detected — running probeFileDownload()…");
        setTimeout(function () {
          const a = getActiveAdapter();
          if (a && a.probeFileDownload) a.probeFileDownload();
        }, 400);
      }
    } catch (e) {
      /* localStorage may be unavailable */
    }
  }

  // Toolbar action click (relayed from the background) → open/close the panel,
  // exactly like the in-page floating button. ensureHost() builds the shadow root
  // if needed, so this works even on a non-conversation page where the floating
  // button is hidden. Top frame only — content scripts also run in subframes.
  function listenForToolbar() {
    if (window.top !== window) return;
    try {
      chrome.runtime.onMessage.addListener((msg) => {
        if (!msg || msg.type !== "continuum-toggle-panel") return;
        // Only on an actual conversation page — same gate as the floating button.
        // Otherwise the next sync() tick unmounts the button and closes the panel
        // right after it opens (the "opens then immediately closes" on a home page).
        if (!isConversationPage()) return;
        try {
          if (Continuum.ui && Continuum.ui.button && Continuum.ui.panel) {
            Continuum.ui.panel.toggle(Continuum.ui.button.ensureHost());
          }
        } catch (e) {
          /* ignore */
        }
      });
    } catch (e) {
      /* runtime messaging unavailable */
    }
  }

  function init() {
    watchNavigation();
    scheduleSync();
    listenForToolbar();
    maybeAutoProbe();
    // If the user just clicked "Resume in new chat", a marker is waiting in
    // storage — auto-fill this fresh tab's composer + attachments. Runs on any
    // supported AI page (the resume target, e.g. /new, is not a /chat/ page).
    if (Continuum.resumeInjector && Continuum.resumeInjector.checkPendingResume) {
      Continuum.resumeInjector.checkPendingResume();
    }
    console.log("[Continuum] content script ready (" + location.hostname + "). Continuum.getActiveAdapter() is the active capture adapter.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
