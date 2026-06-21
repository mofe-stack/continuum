// settings.js — user-facing preferences persisted in chrome.storage.local.
//
// Settings: theme (light | dark, default light) and resumePreamble (the editable
// instruction text auto-typed into the message box when resuming in a new chat).
// Capture mode is no longer a setting — Fast capture (full active tree + files
// from the API) is always used, with the DOM scraper as an automatic fallback
// inside captureFast when the API call fails.
//
// settings.installedAt is a one-shot gate retained so a future migration can
// detect first-run without re-running on every update.

(function () {
  "use strict";
  const Continuum = (window.Continuum = window.Continuum || {});

  const KEY_THEME = "settings.theme";
  const KEY_INSTALLED_AT = "settings.installedAt";
  const KEY_RESUME_PREAMBLE = "settings.resumePreamble";       // PDF, verbatim
  const KEY_RESUME_PREAMBLE_MD = "settings.resumePreambleMd";  // Markdown, verbatim
  const KEY_RESUME_PREAMBLE_C = "settings.resumePreambleCompressed";     // PDF, AI-compressed brief
  const KEY_RESUME_PREAMBLE_C_MD = "settings.resumePreambleCompressedMd"; // Markdown, AI-compressed brief
  const KEY_AUTO_SEND = "settings.autoSendOnResume";
  // LLM compression — whole-conversation → structured handoff brief on resume.
  const KEY_PROVIDER = "settings.compressProvider";  // anthropic | openai | gemini | perplexity
  const KEY_KEYS = "settings.compressApiKeys";       // { anthropic, openai, gemini, perplexity }
  const KEY_OLD_API_KEY = "settings.anthropicApiKey"; // legacy single key → migrated into KEY_KEYS

  const DEFAULT_THEME = "light";           // light | dark
  const VALID_THEME = new Set(["light", "dark"]);
  const DEFAULT_AUTO_SEND = false;         // opt-in: off = fill box, user presses Send
  const VALID_PROVIDERS = new Set(["anthropic", "openai", "gemini", "perplexity", "grok", "deepseek"]);
  const DEFAULT_PROVIDER = "anthropic";
  const MAX_KEY_LEN = 400;
  // Normalize a stored keys blob to a full {provider: string} map.
  const cleanKeys = (obj) => {
    const out = { anthropic: "", openai: "", gemini: "", perplexity: "", grok: "", deepseek: "" };
    if (obj && typeof obj === "object") {
      for (const p of VALID_PROVIDERS) if (typeof obj[p] === "string") out[p] = obj[p];
    }
    return out;
  };

  // Auto-typed into the new chat's composer on resume. Tells the model the full
  // prior conversation is attached so it continues seamlessly. User-editable.
  const DEFAULT_RESUME_PREAMBLE =
    "Continue from our previous conversation. The entire chat history is attached " +
    "as `conversation-history.pdf` — every message, with uploaded files' contents " +
    "inlined and the images embedded inline so you can read AND see everything. " +
    "You have the complete prior context, so pick up exactly where we left off — " +
    "same goals, decisions, constraints, and current state. Don't recap the " +
    "history back to me; just continue as if this is the same conversation.";
  // Markdown-format default: only the .md is attached (text-only, lighter than the
  // PDF). Text-file contents are inlined; images and binary files are referenced by
  // name but NOT attached — so the message must NOT promise the model can see them.
  const DEFAULT_RESUME_PREAMBLE_MD =
    "Continue from our previous conversation. The entire chat history is attached " +
    "as `conversation-history.md` — every message, with uploaded text files' " +
    "contents inlined. Images and binary files are referenced by name (not " +
    "attached), so you won't see those directly. You have the complete prior " +
    "context, so pick up exactly where we left off — same goals, decisions, " +
    "constraints, and current state. Don't recap the history back to me; just " +
    "continue as if this is the same conversation.";
  // AI-compressed resume messages — the attachment is a structured handoff brief
  // (not the full transcript), so the wording differs. PDF embeds the images;
  // Markdown references everything by name. Both user-editable, like the verbatim
  // pair above.
  const DEFAULT_RESUME_PREAMBLE_COMPRESSED =
    "Continue from our previous conversation. Attached as `conversation-history.pdf` is a " +
    "structured handoff brief of our entire chat so far — organized under Completed work, Current " +
    "state, In progress, Next steps, Constraints, Critical context, and Discarded attempts, with " +
    "the important decisions, instructions, code, files, and images preserved — images embedded " +
    "inline and files referenced by name, with a one-line note on each. " +
    "This brief is your complete prior context — pick up exactly where we left off and follow the " +
    "Next steps. Don't recap it back to me; just continue as if this is the same conversation.";
  const DEFAULT_RESUME_PREAMBLE_COMPRESSED_MD =
    "Continue from our previous conversation. Attached as `conversation-history.md` is a structured " +
    "handoff brief of our entire chat so far — organized under Completed work, Current state, In " +
    "progress, Next steps, Constraints, Critical context, and Discarded attempts, with the " +
    "important decisions, instructions, code, files, and images preserved — images and files " +
    "referenced by name (not attached), with a one-line note on each. This " +
    "brief is your complete prior context — pick up exactly where we left off and follow the Next " +
    "steps. Don't recap it back to me; just continue as if this is the same conversation.";
  const MAX_PREAMBLE_LEN = 4000; // guard against pathological input

  let _cache = null;                       // last known settings, populated by init()
  let _initPromise = null;
  const _themeListeners = new Set();

  // ── chrome.storage.local wrappers (promise-based) ────────────────────
  function storageGet(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (items) => {
        const err = chrome.runtime.lastError;
        if (err) reject(new Error(err.message || "chrome.storage.local.get failed"));
        else resolve(items || {});
      });
    });
  }

  function storageSet(obj) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(obj, () => {
        const err = chrome.runtime.lastError;
        if (err) reject(new Error(err.message || "chrome.storage.local.set failed"));
        else resolve();
      });
    });
  }

  // ── Init: loads (and defaults) settings, then caches. Idempotent. ──────
  async function init() {
    if (_initPromise) return _initPromise;
    _initPromise = (async () => {
      const items = await storageGet([
        KEY_THEME, KEY_INSTALLED_AT, KEY_RESUME_PREAMBLE, KEY_RESUME_PREAMBLE_MD,
        KEY_RESUME_PREAMBLE_C, KEY_RESUME_PREAMBLE_C_MD, KEY_AUTO_SEND,
        KEY_PROVIDER, KEY_KEYS, KEY_OLD_API_KEY,
      ]);
      const writes = {};

      if (!items[KEY_INSTALLED_AT]) writes[KEY_INSTALLED_AT] = new Date().toISOString();
      if (!VALID_THEME.has(items[KEY_THEME])) writes[KEY_THEME] = DEFAULT_THEME;
      // Only default the preamble when it's never been set (allow an empty
      // string once the user deliberately clears it — undefined vs "" matters).
      if (typeof items[KEY_RESUME_PREAMBLE] !== "string") writes[KEY_RESUME_PREAMBLE] = DEFAULT_RESUME_PREAMBLE;
      if (typeof items[KEY_RESUME_PREAMBLE_MD] !== "string") writes[KEY_RESUME_PREAMBLE_MD] = DEFAULT_RESUME_PREAMBLE_MD;
      if (typeof items[KEY_RESUME_PREAMBLE_C] !== "string") writes[KEY_RESUME_PREAMBLE_C] = DEFAULT_RESUME_PREAMBLE_COMPRESSED;
      if (typeof items[KEY_RESUME_PREAMBLE_C_MD] !== "string") writes[KEY_RESUME_PREAMBLE_C_MD] = DEFAULT_RESUME_PREAMBLE_COMPRESSED_MD;
      if (typeof items[KEY_AUTO_SEND] !== "boolean") writes[KEY_AUTO_SEND] = DEFAULT_AUTO_SEND;
      if (!VALID_PROVIDERS.has(items[KEY_PROVIDER])) writes[KEY_PROVIDER] = DEFAULT_PROVIDER;

      // Per-provider keys. Migrate the legacy single Anthropic key if present.
      const keys = cleanKeys(items[KEY_KEYS]);
      let keysChanged = items[KEY_KEYS] === undefined;
      if (typeof items[KEY_OLD_API_KEY] === "string" && items[KEY_OLD_API_KEY] && !keys.anthropic) {
        keys.anthropic = items[KEY_OLD_API_KEY].slice(0, MAX_KEY_LEN);
        keysChanged = true;
      }
      if (keysChanged) writes[KEY_KEYS] = keys;
      if (Object.keys(writes).length) await storageSet(writes);

      const pick = (k, fallback) => (writes[k] !== undefined ? writes[k] : items[k] !== undefined ? items[k] : fallback);
      _cache = {
        theme: pick(KEY_THEME, DEFAULT_THEME),
        installedAt: pick(KEY_INSTALLED_AT),
        resumePreamble: pick(KEY_RESUME_PREAMBLE, DEFAULT_RESUME_PREAMBLE),
        resumePreambleMd: pick(KEY_RESUME_PREAMBLE_MD, DEFAULT_RESUME_PREAMBLE_MD),
        resumePreambleCompressed: pick(KEY_RESUME_PREAMBLE_C, DEFAULT_RESUME_PREAMBLE_COMPRESSED),
        resumePreambleCompressedMd: pick(KEY_RESUME_PREAMBLE_C_MD, DEFAULT_RESUME_PREAMBLE_COMPRESSED_MD),
        autoSendOnResume: pick(KEY_AUTO_SEND, DEFAULT_AUTO_SEND),
        compressProvider: pick(KEY_PROVIDER, DEFAULT_PROVIDER),
        compressApiKeys: keys,
      };

      return _cache;
    })();
    return _initPromise;
  }

  // Every getSettings call is async; consumers should always await init implicitly.
  async function getSettings() {
    if (!_cache) await init();
    return Object.assign({}, _cache);
  }

  async function setSetting(key, value) {
    if (!_cache) await init();
    if (key === "theme") {
      if (!VALID_THEME.has(value)) throw new Error("invalid theme: " + value);
      await storageSet({ [KEY_THEME]: value });
      _cache.theme = value;
      notifyTheme();
    } else if (key === "resumePreamble") {
      const v = String(value == null ? "" : value).slice(0, MAX_PREAMBLE_LEN);
      await storageSet({ [KEY_RESUME_PREAMBLE]: v });
      _cache.resumePreamble = v;
    } else if (key === "resumePreambleMd") {
      const v = String(value == null ? "" : value).slice(0, MAX_PREAMBLE_LEN);
      await storageSet({ [KEY_RESUME_PREAMBLE_MD]: v });
      _cache.resumePreambleMd = v;
    } else if (key === "resumePreambleCompressed") {
      const v = String(value == null ? "" : value).slice(0, MAX_PREAMBLE_LEN);
      await storageSet({ [KEY_RESUME_PREAMBLE_C]: v });
      _cache.resumePreambleCompressed = v;
    } else if (key === "resumePreambleCompressedMd") {
      const v = String(value == null ? "" : value).slice(0, MAX_PREAMBLE_LEN);
      await storageSet({ [KEY_RESUME_PREAMBLE_C_MD]: v });
      _cache.resumePreambleCompressedMd = v;
    } else if (key === "autoSendOnResume") {
      const v = !!value;
      await storageSet({ [KEY_AUTO_SEND]: v });
      _cache.autoSendOnResume = v;
    } else if (key === "compressProvider") {
      const v = VALID_PROVIDERS.has(value) ? value : DEFAULT_PROVIDER;
      await storageSet({ [KEY_PROVIDER]: v });
      _cache.compressProvider = v;
    } else if (key === "compressApiKey") {
      // value = { provider, key } — merge into the per-provider key map.
      const provider = value && VALID_PROVIDERS.has(value.provider) ? value.provider : null;
      if (!provider) throw new Error("invalid provider for compressApiKey");
      const k = String(value.key == null ? "" : value.key).trim().slice(0, MAX_KEY_LEN);
      const next = Object.assign({}, _cache.compressApiKeys, { [provider]: k });
      await storageSet({ [KEY_KEYS]: next });
      _cache.compressApiKeys = next;
    } else {
      throw new Error("unknown setting: " + key);
    }
  }

  // Convenience for callers that just want the resume preamble (falls back to
  // the default if settings haven't loaded yet, so the injector never blocks).
  function getResumePreamble() {
    if (_cache && typeof _cache.resumePreamble === "string") return _cache.resumePreamble;
    return DEFAULT_RESUME_PREAMBLE;
  }

  // ── Theme resolution ─────────────────────────────────────────────────
  function getResolvedTheme() {
    if (!_cache) return DEFAULT_THEME; // never block — caller will refresh after init()
    return _cache.theme;
  }

  function notifyTheme() {
    const resolved = getResolvedTheme();
    _themeListeners.forEach((fn) => {
      try { fn(resolved); } catch (e) { /* swallow listener errors */ }
    });
  }

  function onThemeChange(fn) {
    if (typeof fn !== "function") return () => {};
    _themeListeners.add(fn);
    return () => _themeListeners.delete(fn);
  }

  // Factory reset: wipe ALL extension state (sessions, media, settings, caches)
  // back to a fresh-install baseline. chrome.storage.local holds everything, so
  // clearing it is the whole reset; we then re-run init() to re-lay the defaults
  // and notify theme listeners so the open panel flips back to the default theme.
  async function resetAll() {
    await new Promise((resolve, reject) => {
      chrome.storage.local.clear(() => {
        const err = chrome.runtime.lastError;
        if (err) reject(new Error(err.message || "clear failed"));
        else resolve();
      });
    });
    _cache = null;
    _initPromise = null;
    await init();
    notifyTheme();
    return _cache;
  }

  Continuum.settings = {
    init,
    getSettings,
    setSetting,
    getResolvedTheme,
    getResumePreamble,
    onThemeChange,
    resetAll,
    DEFAULT_RESUME_PREAMBLE,
    DEFAULT_RESUME_PREAMBLE_MD,
    DEFAULT_RESUME_PREAMBLE_COMPRESSED,
    DEFAULT_RESUME_PREAMBLE_COMPRESSED_MD,
  };
})();
