// grant.js — the in-page logic for grant.html, the small extension page that
// requests an OPTIONAL provider-API host permission. It exists because content
// scripts can't call chrome.permissions.request(), but an extension page can.
// The content-script panel asks the background to open this page (one per
// provider, the first time AI compression needs it); the user clicks "Allow
// access" here, the prompt fires, and the grant is extension-wide afterward.
"use strict";

(function () {
  const PROVIDER_NAMES = {
    anthropic: "Claude (Anthropic)",
    openai: "ChatGPT (OpenAI)",
    gemini: "Gemini (Google)",
    perplexity: "Perplexity",
    grok: "Grok (xAI)",
    deepseek: "DeepSeek",
  };

  const params = new URLSearchParams(location.search);

  // Match Continuum's own theme (passed from the panel), not the OS preference —
  // set it first thing so the popup paints in the right colours.
  let theme = params.get("theme");
  if (theme !== "dark" && theme !== "light") {
    theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.dataset.theme = theme;

  const provider = params.get("provider") || "";
  const origin = params.get("origin") || "";
  const name = PROVIDER_NAMES[provider] || provider || "this provider";
  // "https://api.openai.com/*" → "api.openai.com"
  const host = origin.replace(/^https?:\/\//, "").replace(/\/\*?$/, "");

  const $ = (id) => document.getElementById(id);

  // Localized copy. The provider name is passed as the $1 substitution so each
  // language owns its whole sentence instead of a fragment glued around a span.
  const t = (key, subs) => {
    const out = chrome.i18n.getMessage(key, subs === undefined ? undefined : [String(subs)]);
    return out || key;
  };

  // Two strings intentionally carry <strong>. They come from our own bundled
  // _locales, never from user input — parsed rather than assigned via innerHTML
  // so AMO's reviewer linter has no dynamic sink to flag.
  function setRich(el, html) {
    const doc = new DOMParser().parseFromString(String(html), "text/html");
    el.replaceChildren(...Array.from(doc.body.childNodes));
  }

  document.documentElement.lang = chrome.i18n.getUILanguage
    ? chrome.i18n.getUILanguage()
    : "en";

  $("eyebrow").textContent = t("uiGrantEyebrow");
  $("title").textContent = t("uiGrantTitle", name);
  setRich($("desc"), t("uiGrantDesc", name));
  $("allow").textContent = t("uiGrantAllow");
  $("cancel").textContent = t("uiGrantNotNow");
  $("granted-title").textContent = t("uiGrantedTitle");
  setRich($("granted-desc"), t("uiGrantedDesc", name));

  // Host is a bare domain (api.openai.com) — technical, never translated.
  $("host").textContent = host || "the provider API";
  document.title = "Continuum — " + t("uiGrantTitle", name);

  const allowBtn = $("allow");
  const note = $("note");

  function setNote(msg, isErr) {
    note.textContent = msg || "";
    note.classList.toggle("err", !!isErr);
  }

  allowBtn.addEventListener("click", async () => {
    if (!origin) {
      setNote(t("uiGrantMissing"), true);
      return;
    }
    allowBtn.disabled = true;
    setNote("");
    try {
      const granted = await chrome.permissions.request({ origins: [origin] });
      if (granted) {
        document.body.classList.add("granted");
        // Give the user a moment to read the confirmation, then close.
        setTimeout(() => window.close(), 2200);
      } else {
        allowBtn.disabled = false;
        setNote(t("uiGrantNeeded", name));
      }
    } catch (e) {
      allowBtn.disabled = false;
      setNote((e && e.message) || t("uiGrantFailed"), true);
    }
  });

  $("cancel").addEventListener("click", () => window.close());
})();
