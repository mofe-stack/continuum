// background.js — MV3 service worker. Makes the LLM summarization call for the
// compressor. A service worker runs in a privileged extension context, so its
// fetches use the extension's host_permissions and BYPASS CORS — this is what
// lets us call providers that block direct browser calls (OpenAI, Perplexity)
// and not just the CORS-friendly ones (Anthropic with its browser flag, Gemini).
//
// Content scripts message us with { type:"continuum-summarize", provider, apiKey,
// model, system, text }; we hit the right provider endpoint and return the text.

"use strict";

// NOTE: Gemini's uploaded/generated image URLs (lh3.googleusercontent.com/gg/… →
// /rd-gg/…) are TOKEN-GATED: they 403 every separate fetch (with or without cookies,
// and even with a spoofed Referer via declarativeNetRequest — tried and removed).
// The <img> only renders them via a one-time, page-scoped grant we can't replay, so
// those images stay name-only references. Other media still fetches via fetchBytes.
const DEFAULT_MODELS = {
  anthropic: "claude-haiku-4-5-20251001",
  openai: "gpt-4o-mini",
  gemini: "gemini-2.0-flash",
  perplexity: "sonar",
  grok: "grok-2-latest",
  deepseek: "deepseek-chat",
};

// OpenAI-chat-completions-compatible endpoints, keyed by provider. Grok (xAI) and
// DeepSeek both speak the same request/response shape as OpenAI, so they share
// callOpenAICompatible — only the URL differs.
const OPENAI_COMPATIBLE_URLS = {
  openai: "https://api.openai.com/v1/chat/completions",
  perplexity: "https://api.perplexity.ai/chat/completions",
  grok: "https://api.x.ai/v1/chat/completions",
  deepseek: "https://api.deepseek.com/chat/completions",
};

// Output-token cap. This is a CEILING, not a cost: providers bill only for tokens
// actually generated, so a higher cap is free unless the model writes more (and the
// brief is a condensed ~25–40% of the input). A flat 4096 silently TRUNCATED the
// brief on long chats — exactly where compression matters most. So size the cap to
// the input: budget ~0.5× the estimated input tokens (headroom over the ~25–40% the
// brief actually needs) and clamp to the per-provider output limit.
const MAX_TOKENS_FLOOR = 1024;   // tiny chats still get room for a clean brief
// Per-provider output ceilings — kept at/under each default model's real cap so a
// large brief isn't rejected or silently clamped (which would trip the truncation
// guard and force a verbatim fallback). gemini-2.0-flash + sonar cap lower.
const MAX_TOKENS_CEIL = {
  anthropic: 32000, // claude-haiku-4-5 supports far more; 32k is plenty for a brief
  openai: 16384,    // gpt-4o-mini output cap
  gemini: 8192,     // gemini-2.0-flash output cap
  perplexity: 8000, // sonar
  grok: 16384,
  deepseek: 8192,
};
function maxTokensFor(text, provider) {
  const inputTokens = Math.ceil((text || "").length / 4.2); // ~o200k estimator, matches the panel
  const budget = Math.ceil(inputTokens * 0.5);
  const ceil = MAX_TOKENS_CEIL[provider] || 16384;
  return Math.min(ceil, Math.max(MAX_TOKENS_FLOOR, budget));
}

// Truncation guard: if the model stopped because it hit the output cap, the summary
// is cut off mid-thought — returning it would silently drop context. We throw so the
// resume falls back to the full verbatim session instead (compression never ships a
// partial summary). Each provider reports the stop reason under a different field.
function assertNotTruncated(reason) {
  if (reason && /^(max_tokens|length|MAX_TOKENS)$/i.test(String(reason))) {
    throw new Error("summary was truncated (hit output limit) — sending the chat in full instead");
  }
}

async function readJson(res) {
  try {
    return await res.json();
  } catch (e) {
    return {};
  }
}

function errMsg(data, res) {
  const m = (data && data.error && (data.error.message || data.error)) || (data && data.message);
  return "HTTP " + res.status + (m ? ": " + (typeof m === "string" ? m : JSON.stringify(m)) : "");
}

// Anthropic — Messages API. (No browser flag needed: a service-worker fetch
// isn't subject to CORS.)
async function callAnthropic(a) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": a.apiKey,
      "anthropic-version": "2023-06-01",
      // Insurance in case CORS is enforced on the worker fetch; harmless otherwise.
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model: a.model, max_tokens: maxTokensFor(a.text, "anthropic"), system: a.system, messages: [{ role: "user", content: a.text }] }),
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(errMsg(data, res));
  assertNotTruncated(data.stop_reason); // Anthropic: "end_turn" ok, "max_tokens" = cut off
  const block = Array.isArray(data.content) ? data.content.find((b) => b && b.type === "text") : null;
  return (block && block.text) || "";
}

// OpenAI + Perplexity share the OpenAI chat-completions shape.
async function callOpenAICompatible(url, a) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + a.apiKey },
    body: JSON.stringify({
      model: a.model,
      max_tokens: maxTokensFor(a.text, a.provider),
      messages: [
        { role: "system", content: a.system },
        { role: "user", content: a.text },
      ],
    }),
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(errMsg(data, res));
  const choice = data.choices && data.choices[0];
  assertNotTruncated(choice && choice.finish_reason); // OpenAI-shape: "length" = cut off
  return (choice && choice.message && choice.message.content) || "";
}

// Google Gemini — generateContent. API key goes in the query string.
async function callGemini(a) {
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(a.model) + ":generateContent?key=" + encodeURIComponent(a.apiKey);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: a.system }] },
      contents: [{ role: "user", parts: [{ text: a.text }] }],
      generationConfig: { maxOutputTokens: maxTokensFor(a.text, "gemini") },
    }),
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(errMsg(data, res));
  const cand = data.candidates && data.candidates[0];
  assertNotTruncated(cand && cand.finishReason === "MAX_TOKENS" ? "MAX_TOKENS" : null); // Gemini: finishReason
  const parts = cand && cand.content && cand.content.parts;
  return (parts && parts.map((p) => p.text || "").join("")) || "";
}

async function summarize(req) {
  const provider = req.provider || "anthropic";
  if (!req.apiKey) throw new Error("No API key for " + provider);
  const model = req.model || DEFAULT_MODELS[provider] || DEFAULT_MODELS.anthropic;
  const a = { apiKey: req.apiKey, model: model, system: req.system, text: req.text, provider: provider };
  let text;
  if (provider === "anthropic") text = await callAnthropic(a);
  else if (provider === "gemini") text = await callGemini(a);
  else if (OPENAI_COMPATIBLE_URLS[provider]) text = await callOpenAICompatible(OPENAI_COMPATIBLE_URLS[provider], a);
  else throw new Error("Unknown provider: " + provider);
  text = (text || "").trim();
  if (!text) throw new Error("Provider returned no text");
  return text;
}

// Fetch arbitrary bytes from a privileged context so CROSS-ORIGIN media (e.g.
// Gemini's lh3.googleusercontent.com images) can be captured — a content-script
// fetch to those is blocked by CORS, but the worker's fetch uses host_permissions
// and isn't. Returned base64-encoded so it survives runtime messaging (a Blob
// doesn't structured-clone reliably across the boundary).
async function fetchBytes(req) {
  // Try WITH cookies first (private user media), then WITHOUT — some Google media
  // URLs 403 when credentials are sent (signed/public URLs that reject cookies).
  let res = await fetch(req.url, { credentials: "include" });
  if (!res.ok) {
    try {
      const r2 = await fetch(req.url, { credentials: "omit" });
      if (r2.ok) res = r2;
    } catch (e) {
      /* keep the first response's error below */
    }
  }
  if (!res.ok) throw new Error("HTTP " + res.status);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000; // chunk so String.fromCharCode doesn't blow the arg limit
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return { base64: btoa(binary), mime: res.headers.get("content-type") || "application/octet-stream" };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "continuum-fetch") return false;
  fetchBytes(msg)
    .then((r) => sendResponse(Object.assign({ ok: true }, r)))
    .catch((e) => sendResponse({ ok: false, error: e && e.message ? e.message : String(e) }));
  return true; // async response
});

// Toolbar button → toggle the in-page Continuum panel (same as the floating
// button). The action has no popup, so onClicked fires here; we ask the active
// tab's content script to open/close the panel. On a tab with no content script
// (an unsupported site) the message just no-ops — we swallow the lastError.
chrome.action.onClicked.addListener((tab) => {
  if (!tab || tab.id == null) return;
  try {
    chrome.tabs.sendMessage(tab.id, { type: "continuum-toggle-panel" }, () => {
      void chrome.runtime.lastError;
    });
  } catch (e) {
    /* ignore */
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "continuum-summarize") return false;
  summarize(msg)
    .then((text) => {
      sendResponse({ ok: true, text: text });
    })
    .catch((e) => {
      const err = e && e.message ? e.message : String(e);
      sendResponse({ ok: false, error: err });
    });
  return true; // keep the message channel open for the async response
});

// Provider-API hosts are OPTIONAL host permissions. Content scripts can't call
// chrome.permissions, so the panel asks the worker to (1) check whether a host is
// already granted and (2) open the small grant page (where the prompt can fire).
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "continuum-has-host") return false;
  chrome.permissions
    .contains({ origins: [msg.origin] })
    .then((granted) => sendResponse({ ok: true, granted: !!granted }))
    .catch((e) => sendResponse({ ok: false, granted: false, error: e && e.message ? e.message : String(e) }));
  return true;
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "continuum-open-grant") return false;
  const url =
    chrome.runtime.getURL("src/grant.html") +
    "?provider=" + encodeURIComponent(msg.provider || "") +
    "&origin=" + encodeURIComponent(msg.origin || "") +
    "&theme=" + encodeURIComponent(msg.theme || "");
  // A small, focused popup that opens at the TOP-RIGHT of the browser window, next
  // to where Continuum's panel sits — so it reads as part of the extension rather
  // than a stray window. Position is derived from the caller's window bounds.
  const W = 372;
  const H = 416;
  const openAt = (bounds) => {
    const opts = { url: url, type: "popup", width: W, height: H, focused: true };
    if (bounds && bounds.width) {
      opts.left = Math.max(0, (bounds.left || 0) + bounds.width - W - 18);
      opts.top = Math.max(0, (bounds.top || 0) + 84);
    }
    try {
      chrome.windows.create(opts, () => {
        void chrome.runtime.lastError;
        sendResponse({ ok: true });
      });
    } catch (e) {
      try {
        chrome.tabs.create({ url: url }, () => {
          void chrome.runtime.lastError;
          sendResponse({ ok: true });
        });
      } catch (e2) {
        sendResponse({ ok: false, error: String(e2) });
      }
    }
  };
  const wid = sender && sender.tab && sender.tab.windowId;
  if (wid != null && chrome.windows && chrome.windows.get) {
    chrome.windows.get(wid, (win) => {
      void chrome.runtime.lastError;
      openAt(win || null);
    });
  } else {
    openAt(null);
  }
  return true;
});
