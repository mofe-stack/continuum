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
  $("provider").textContent = name;
  $("provider-2").textContent = name;
  $("provider-3").textContent = name;
  $("provider-4").textContent = name;
  $("host").textContent = host || "the provider API";
  document.title = "Continuum — Allow access to " + name;

  const allowBtn = $("allow");
  const note = $("note");

  function setNote(msg, isErr) {
    note.textContent = msg || "";
    note.classList.toggle("err", !!isErr);
  }

  allowBtn.addEventListener("click", async () => {
    if (!origin) {
      setNote("Missing provider details — close this and try again.", true);
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
        setNote("Access is needed to compress with " + name + ".");
      }
    } catch (e) {
      allowBtn.disabled = false;
      setNote((e && e.message) || "Couldn't request access — try again.", true);
    }
  });

  $("cancel").addEventListener("click", () => window.close());
})();
