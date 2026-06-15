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
// system prompt's "roughly halve" keeps real output ~half the input). A flat 4096
// silently TRUNCATED the summary on long chats — exactly where compression matters
// most. So size the cap to the input: the summary targets ~half the middle, so we
// budget ~0.6× the estimated input tokens (a little headroom over half) and clamp.
const MAX_TOKENS_FLOOR = 1024;   // tiny middles still get room for a clean summary
const MAX_TOKENS_CEIL = 16384;   // safety ceiling; well under model limits
function maxTokensFor(text) {
  const inputTokens = Math.ceil((text || "").length / 4.35); // same estimator as the panel
  const budget = Math.ceil(inputTokens * 0.6);
  return Math.min(MAX_TOKENS_CEIL, Math.max(MAX_TOKENS_FLOOR, budget));
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
    body: JSON.stringify({ model: a.model, max_tokens: maxTokensFor(a.text), system: a.system, messages: [{ role: "user", content: a.text }] }),
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
      max_tokens: maxTokensFor(a.text),
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
      generationConfig: { maxOutputTokens: maxTokensFor(a.text) },
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
  const a = { apiKey: req.apiKey, model: model, system: req.system, text: req.text };
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
  console.log("[Continuum bg] summarize request — provider:", msg.provider, "| key set:", !!msg.apiKey, "| chars:", (msg.text || "").length);
  summarize(msg)
    .then((text) => {
      console.log("[Continuum bg] summarize ok — " + text.length + " chars");
      sendResponse({ ok: true, text: text });
    })
    .catch((e) => {
      const err = e && e.message ? e.message : String(e);
      console.error("[Continuum bg] summarize failed:", err, e);
      sendResponse({ ok: false, error: err });
    });
  return true; // keep the message channel open for the async response
});
