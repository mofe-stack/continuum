// capture-panel.js — the slide-in panel. Two views share one column:
//   • main   — current-chat stats, capture button, saved-sessions list
//   • detail — a single saved session with Resume / Copy / Save / Delete
// plus a delete-confirmation dialog. Renders into the shared shadow root so
// the host page's styles can't leak in.

(function () {
  "use strict";

  const Continuum = (window.Continuum = window.Continuum || {});

  // Lucide icons (24x24, stroke). Inline so the extension needs no network /
  // icon-font dependency, and so nothing renders as an emoji.
  const ICON = {
    close: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    back: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
    camera:
      '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    image:
      '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
    file: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    play: '<polygon points="6 4 20 12 6 20 6 4"/>',
    copy:
      '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    download:
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    trash:
      '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
    code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
    chevron: '<polyline points="6 9 12 15 18 9"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    gear:
      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  };

  function svg(name, size) {
    const s = size || 18;
    return (
      '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true">' + ICON[name] + "</svg>"
    );
  }

  // Brand mark: charcoal bookmark with two sparkles. Matches the FAB. Monochrome.
  function logoMark(size) {
    const s = size || 16;
    return (
      '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" aria-hidden="true">' +
      '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M10 5.5 11 7.55 13 8.5 11 9.45 10 11.5 9 9.45 7 8.5 9 7.55Z" fill="currentColor"/>' +
      '<path d="M13 9.4 13.52 10.48 14.6 11 13.52 11.52 13 12.6 12.48 11.52 11.4 11 12.48 10.48Z" fill="currentColor"/>' +
      "</svg>"
    );
  }

  // Source-AI marks, keyed by provider id. Each is a small inline SVG colored via
  // a per-brand CSS var (set through currentColor so it stays themeable). The
  // non-Claude marks are simple stylized placeholders — official brand assets can
  // be dropped in later. Unknown/legacy → the neutral Continuum mark.
  const CLAUDE_BURST =
    '<path d="M12 2.5 10.9 12 13.1 12Z M12 21.5 13.1 12 10.9 12Z ' +
    "M2.5 12 12 13.1 12 10.9Z M21.5 12 12 10.9 12 13.1Z " +
    "M7.4 7.4 12.7 11.3 11.3 12.7Z M16.6 7.4 12.7 12.7 11.3 11.3Z " +
    'M16.6 16.6 11.3 12.7 12.7 11.3Z M7.4 16.6 11.3 11.3 12.7 12.7Z"/>' +
    '<circle cx="12" cy="12" r="2.1"/>';
  const PROVIDER_MARK = {
    claude: { color: "--cn-claude", svg: CLAUDE_BURST },
    // ChatGPT — hexagon outline (stand-in for the knot mark). Keyed under both
    // "chatgpt" (the AI identity / captured sourceProvider) and "openai" (the
    // compression-vendor id) so either resolves to the same mark.
    chatgpt: {
      color: "--cn-openai",
      svg: '<path d="M12 2.6 20.1 7.3 20.1 16.7 12 21.4 3.9 16.7 3.9 7.3Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    },
    openai: {
      color: "--cn-openai",
      svg: '<path d="M12 2.6 20.1 7.3 20.1 16.7 12 21.4 3.9 16.7 3.9 7.3Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    },
    // Gemini — four-point spark.
    gemini: {
      color: "--cn-gemini",
      svg: '<path d="M12 2c.45 5.35 4.3 9.2 9.65 9.65v.7C16.3 12.8 12.45 16.65 12 22h-.7C10.85 16.65 7 12.8 1.65 12.35v-.7C7 11.2 10.85 7.35 11.3 2Z"/>',
    },
    // Perplexity — ringed monogram (stylized).
    perplexity: {
      color: "--cn-perplexity",
      svg: '<circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 4.2v15.6M5.2 9l6.8 3.9L18.8 9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    },
    // Grok (xAI) — the slashed-X mark (stylized).
    grok: {
      color: "--cn-grok",
      svg: '<path d="M5 5 19 19M19 5 5 19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    },
    // DeepSeek — abstract whale curve with an eye (stylized).
    deepseek: {
      color: "--cn-deepseek",
      svg: '<path d="M4 13c0-4 3.4-7 7.8-7 3.9 0 6.2 2.5 6.2 5 0 2-1.5 3.6-3.6 3.6-1.7 0-2.8-1.1-2.8-2.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="11" r="1" fill="currentColor"/>',
    },
    // Copilot — rounded visor/bot face with two eyes (stylized).
    copilot: {
      color: "--cn-copilot",
      svg: '<path d="M5 12a7 7 0 0 1 14 0v2.5a3.5 3.5 0 0 1-3.5 3.5h-7A3.5 3.5 0 0 1 5 14.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="9.3" cy="13" r="1.1" fill="currentColor"/><circle cx="14.7" cy="13" r="1.1" fill="currentColor"/>',
    },
  };
  function providerLogo(provider, size) {
    const s = size || 16;
    const mark = PROVIDER_MARK[String(provider || "").toLowerCase()];
    if (!mark) return logoMark(s); // unknown / legacy provider → neutral mark
    return (
      '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" role="img" aria-label="' +
      providerName(provider) + '" style="color:var(' + mark.color + ')" fill="currentColor">' +
      mark.svg + "</svg>"
    );
  }

  // Brand marks (Simple Icons) for the "coming soon" integration teasers in Settings.
  // Obsidian keeps its purple; Notion follows the panel's ink so it adapts to dark.
  function obsidianLogo(size) {
    const s = size || 16;
    return (
      '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" role="img" aria-label="Obsidian" fill="#7c3aed">' +
      '<path d="M19.355 18.538a68.967 68.959 0 0 0 1.858-2.954.81.81 0 0 0-.062-.9c-.516-.685-1.504-2.075-2.042-3.362-.553-1.321-.636-3.375-.64-4.377a1.707 1.707 0 0 0-.358-1.05l-3.198-4.064a3.744 3.744 0 0 1-.076.543c-.106.503-.307 1.004-.536 1.5-.134.29-.29.6-.446.914l-.31.626c-.516 1.068-.997 2.227-1.132 3.59-.124 1.26.046 2.73.815 4.481.128.011.257.025.386.044a6.363 6.363 0 0 1 3.326 1.505c.916.79 1.744 1.922 2.415 3.5zM8.199 22.569c.073.012.146.02.22.02.78.024 2.095.092 3.16.29.87.16 2.593.64 4.01 1.055 1.083.316 2.198-.548 2.355-1.664.114-.814.33-1.735.725-2.58l-.01.005c-.67-1.87-1.522-3.078-2.416-3.849a5.295 5.295 0 0 0-2.778-1.257c-1.54-.216-2.952.19-3.84.45.532 2.218.368 4.829-1.425 7.531zM5.533 9.938c-.023.1-.056.197-.098.29L2.82 16.059a1.602 1.602 0 0 0 .313 1.772l4.116 4.24c2.103-3.101 1.796-6.02.836-8.3-.728-1.73-1.832-3.081-2.55-3.831zM9.32 14.01c.615-.183 1.606-.465 2.745-.534-.683-1.725-.848-3.233-.716-4.577.154-1.552.7-2.847 1.235-3.95.113-.235.223-.454.328-.664.149-.297.288-.577.419-.86.217-.47.379-.885.46-1.27.08-.38.08-.72-.014-1.043-.095-.325-.297-.675-.68-1.06a1.6 1.6 0 0 0-1.475.36l-4.95 4.452a1.602 1.602 0 0 0-.513.952l-.427 2.83c.672.59 2.328 2.316 3.335 4.711.09.21.175.43.253.653z"/>' +
      "</svg>"
    );
  }
  function notionLogo(size) {
    const s = size || 16;
    return (
      '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" role="img" aria-label="Notion" fill="currentColor">' +
      '<path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19.99s0 .84-1.168.84l-3.222.186c-.093-.187 0-.654.327-.747l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.216-1.632z"/>' +
      "</svg>"
    );
  }

  // Human-readable name for an AI/provider id (folder labels, picker, export names).
  // Unknown ids are Title-cased so a new provider still reads sensibly.
  const PROVIDER_NAMES = {
    claude: "Claude", openai: "ChatGPT", chatgpt: "ChatGPT", gemini: "Gemini", perplexity: "Perplexity",
    grok: "Grok", deepseek: "DeepSeek", copilot: "Copilot",
  };
  function providerName(provider) {
    const p = String(provider || "").toLowerCase();
    if (!p) return "Unknown";
    return PROVIDER_NAMES[p] || p.charAt(0).toUpperCase() + p.slice(1);
  }

  // The provider id of the page we're CURRENTLY on (the platform being captured),
  // derived from the hostname. Used to auto-expand that platform's folder in the
  // saved-sessions list. null on an unrecognized host.
  function currentProviderId() {
    const h = (location.hostname || "").toLowerCase();
    if (/(^|\.)claude\.ai$/.test(h)) return "claude";
    if (/(^|\.)chatgpt\.com$/.test(h) || /(^|\.)chat\.openai\.com$/.test(h)) return "chatgpt";
    if (/(^|\.)gemini\.google\.com$/.test(h)) return "gemini";
    if (/(^|\.)perplexity\.ai$/.test(h)) return "perplexity";
    return null;
  }

  let panelEl = null;
  let backdropEl = null;
  let isOpen = false;
  let currentDetail = null; // full session record currently shown in detail view
  // Per-conversation cache of the detected "started" date (keyed by URL path), so
  // the Current-chat block shows it instantly on every panel open instead of
  // re-fetching it from the network each time (which made it flicker/blank). Once
  // known, it never has to be recomputed. Persisted across page reloads.
  const STARTED_CACHE_KEY = "continuum.startedCache";
  // Cache of the last-known stats line (messages/images/files) per conversation.
  // Unlike the start date, stats CAN change as the chat grows — so we show the
  // cached counts instantly (no 1–2s blank while the API peek runs) and then let
  // the live peekStatsFast() update them if they actually changed.
  const STATS_CACHE_KEY = "continuum.statsCache";
  let startedCache = {};
  let statsCache = {};
  try {
    chrome.storage.local.get([STARTED_CACHE_KEY, STATS_CACHE_KEY], (it) => {
      if (it && it[STARTED_CACHE_KEY]) startedCache = it[STARTED_CACHE_KEY];
      if (it && it[STATS_CACHE_KEY]) statsCache = it[STATS_CACHE_KEY];
    });
  } catch (e) {
    /* storage unavailable — fall back to live fetch each time */
  }
  function persistStartedCache() {
    try {
      chrome.storage.local.set({ [STARTED_CACHE_KEY]: startedCache });
    } catch (e) {
      /* ignore */
    }
  }
  function persistStatsCache() {
    try {
      chrome.storage.local.set({ [STATS_CACHE_KEY]: statsCache });
    } catch (e) {
      /* ignore */
    }
  }
  let includeFilesEnabled = true; // "Attach files" checkbox — documents (both formats)
  let includeImagesEnabled = false; // "Attach images" checkbox — Markdown only (PDF embeds images)
  let compressEnabled = false; // toggled by the "Compress with AI" checkbox in the detail view
  let markdownEnabled = false; // toggled by the "Resume as Markdown" checkbox (default off → PDF)
  let _expandProviderOnce = null; // provider folder to auto-expand on the NEXT list render (set after a capture)
  let _savedQuery = ""; // saved-sessions search/filter text (matches title or AI name)
  let _selectMode = false; // multi-select mode in the saved list (checkboxes + bulk delete)
  const _selectedIds = new Set(); // ids ticked while in select mode
  let _bulkDeleteIds = null; // ids queued for the delete dialog's bulk path (vs single currentDetail)
  let _detailFileCount = 0; // open session's file attachments — drives the "Attach files" row
  let _detailImageCount = 0; // open session's images — drives the "Attach images" row (Markdown)
  // Show/label the two attach rows for the CURRENT format. FILES row: shown whenever
  // the chat has files (PDF attaches the documents alongside; Markdown references
  // them — the toggle attaches the bytes). IMAGES row: Markdown ONLY (PDF embeds
  // images, nothing to toggle). Both off by default; the injector reads
  // marker.includeFiles / marker.includeImages.
  function updateAttachRows() {
    const filesRow = panelEl.querySelector("[data-addfiles-row]");
    const filesLabel = panelEl.querySelector("[data-addfiles-label]");
    const imagesRow = panelEl.querySelector("[data-addimages-row]");
    const imagesLabel = panelEl.querySelector("[data-addimages-label]");
    if (filesRow) {
      filesRow.hidden = _detailFileCount === 0;
      if (filesLabel && _detailFileCount > 0) filesLabel.textContent = "Attach " + plural(_detailFileCount, "file") + " to the new chat";
    }
    if (imagesRow) {
      imagesRow.hidden = !(markdownEnabled && _detailImageCount > 0);
      if (imagesLabel && _detailImageCount > 0) imagesLabel.textContent = "Attach " + plural(_detailImageCount, "image") + " to the new chat";
    }
  }
  // Settings → "Resume message": FOUR editable messages — {verbatim, compressed}
  // × {PDF, Markdown}. _preambleFormat + _preambleCompressed track which the
  // textarea is editing; _preambleDrafts holds each live (possibly unsaved) draft so
  // the format radio + the Compress-with-AI toggle can swap the textarea instantly.
  let _preambleFormat = "pdf"; // "pdf" | "markdown"
  let _preambleCompressed = false; // editing the AI-compressed brief's message?
  const _preambleDrafts = { pdf: "", markdown: "", pdfC: "", markdownC: "" };
  const preambleDraftKey = (fmt, c) => (fmt === "markdown" ? "markdown" : "pdf") + (c ? "C" : "");
  const preambleKeyFor = (fmt, c) =>
    c
      ? fmt === "markdown" ? "resumePreambleCompressedMd" : "resumePreambleCompressed"
      : fmt === "markdown" ? "resumePreambleMd" : "resumePreamble";
  const preambleDefaultFor = (fmt, c) => {
    const S = Continuum.settings;
    if (c) return (fmt === "markdown" ? S.DEFAULT_RESUME_PREAMBLE_COMPRESSED_MD : S.DEFAULT_RESUME_PREAMBLE_COMPRESSED) || "";
    return (fmt === "markdown" ? S.DEFAULT_RESUME_PREAMBLE_MD : S.DEFAULT_RESUME_PREAMBLE) || "";
  };
  let _pendingMainStatus = null; // { text, ok } shown under Capture when settings closes
  let _settingsReturnTo = "main"; // where the Back arrow returns after Settings ("main" | "detail")
  let _apiKeyBaseline = ""; // last-known key value, so a no-op change doesn't show "API key saved"

  // ── Formatting helpers ──────────────────────────────────────────────
  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d)) return "—";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function fmtDateTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d)) return "—";
    return (
      d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
      " · " +
      d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    );
  }

  function plural(n, word) {
    return n + " " + word + (n === 1 ? "" : "s");
  }

  // Strip characters that are INVISIBLE in a chat UI but render as blank cells in
  // the monospace PDF (the "M a d r i d" / blank-gap symptom). Verified root cause:
  // ChatGPT wraps inline citations/entities in Private-Use markers (U+E200..E202)
  // that are hidden in the web UI but show as gaps in Courier; the same class of
  // problem (format/control/odd-space chars) can appear from either provider, so we
  // sweep by CATEGORY, not a hand-picked list. Regexes use \u escapes / \p{} property
  // classes only (no literal exotic chars in source). Real text, newlines, tabs,
  // punctuation, and emoji are kept. Applied once at each transcript builder's
  // output, so it also cleans ALREADY-SAVED sessions (re-rendered on every export).
  // Remove genuinely-invisible junk that some providers embed in message text:
  // ChatGPT wraps inline citations/entities in Private-Use markers (U+E200..E202,
  // verified in real transcripts), and stray format/zero-width chars can ride
  // along. These add nothing and only confuse a resumed model. We do NOT touch
  // spacing or letter-runs here \u2014 the "M a d r i d" letter-spacing was a PDF font
  // limitation (emoji forcing UTF-16), fixed in pdf-export.stripUnencodable, NOT a
  // data problem \u2014 so the transcript text itself stays verbatim.
  function sanitizeText(s) {
    return String(s == null ? "" : s)
      .replace(/\p{Co}/gu, "")  // private-use (ChatGPT citation/entity markers)
      .replace(/\p{Cf}/gu, ""); // format chars (zero-width joiner/non-joiner, BOM, bidi)
  }

  function statLine(stats) {
    if (!stats) return "—";
    return (
      plural(stats.messages, "message") + " · " +
      plural(stats.images, "image") + " · " +
      plural(stats.files, "file")
    );
  }

  // --- Archive helpers (shared by the handoff text and the ZIP export) -----

  function safeName(s) {
    return (s || "").replace(/[^\w.\-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
  }

  // Readable, filesystem-safe folder name for the export tree: keeps spaces and
  // normal punctuation, strips only characters illegal in Windows/macOS paths +
  // control chars, collapses whitespace, removes trailing dots/spaces (Windows
  // rejects those — they were producing the malformed/blank entry), caps length,
  // and never returns empty.
  function folderName(s) {
    const name = String(s || "")
      .replace(/[\\/:*?"<>|\x00-\x1f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[. ]+$/g, "")
      .slice(0, 100)
      .trim();
    return name || "chat";
  }

  // Assigns each byte-backed attachment a unique path under images/ or files/,
  // so the transcript references and the ZIP entries always agree.
  function assignArchivePaths(session) {
    const used = new Set();
    for (const turn of session.turns || []) {
      for (const att of turn.attachments || []) {
        if (!att.mediaId || (att.type !== "image" && att.type !== "file")) continue;
        // Pasted text gets a synthetic text/plain blob, but it's message content,
        // not a file — never give it an archive path (else it lands in files/).
        if (att.isPasted) continue;
        const kind = att.type === "image" ? "images" : "files";
        let base = safeName(att.name) || (att.type === "image" ? "image" : "file");
        let path = kind + "/" + base;
        let n = 1;
        while (used.has(path)) {
          const dot = base.lastIndexOf(".");
          const stem = dot > 0 ? base.slice(0, dot) : base;
          const ext = dot > 0 ? base.slice(dot) : "";
          path = kind + "/" + stem + "-" + n++ + ext;
        }
        used.add(path);
        att._path = path;
      }
    }
  }

  // Maps a filename to a Markdown code-fence language tag.
  function fenceLang(name) {
    const m = (name || "").match(/\.([a-z0-9]+)$/i);
    const ext = m ? m[1].toLowerCase() : "";
    const map = {
      md: "", markdown: "", txt: "", log: "", csv: "", tsv: "",
      json: "json", js: "js", ts: "ts", tsx: "tsx", jsx: "jsx", py: "python",
      rb: "ruby", rs: "rust", go: "go", java: "java", c: "c", cpp: "cpp",
      h: "c", hpp: "cpp", css: "css", html: "html", htm: "html", xml: "xml",
      yaml: "yaml", yml: "yaml", sh: "bash", sql: "sql",
    };
    return map[ext] != null ? map[ext] : ext;
  }

  // Build a readable Markdown handoff transcript from a full session record.
  // Inlines artifacts + text-file contents; references images/binary files by
  // their archive path (images/… , files/…) so it matches the ZIP layout.
  //
  // The handoff is currently VERBATIM — every turn's text, attachments, code,
  // and order are preserved exactly. (The rule-based compression was removed;
  // compression is being rebuilt. `opts` is accepted for call-site
  // compatibility but is currently unused.)
  function buildHandoff(session, opts) {
    assignArchivePaths(session);
    const lines = [];
    lines.push("# " + (session.title || "Untitled conversation"));
    const s = session.stats || {};
    const meta = [statLine(s)];
    if (s.artifacts) meta.push(plural(s.artifacts, "artifact"));
    if (session.startedAt) meta.push("started " + fmtDate(session.startedAt));
    // Name the ACTUAL source AI (was hardcoded "Claude" — wrong for ChatGPT etc.).
    lines.push("_Captured from " + providerName(session.sourceProvider) + " · " + meta.join(" · ") + "_");
    // Compression status line. compressionStats is attached by the resume flow
    // when "Compress with AI" ran; absent → this handoff is fully verbatim.
    const cs = session.compressionStats;
    if (cs && cs.compressed) {
      lines.push(
        "_Compressed with AI · structured handoff brief · " + cs.beforeTokens + "→" + cs.afterTokens +
          " tokens (−" + cs.pct + "%) · condensed " + cs.summarized + " messages · referenced code preserved exactly_"
      );
    } else {
      lines.push("_Verbatim · full conversation, nothing summarized_");
    }
    lines.push("");
    lines.push("---");
    const turnList = session.turns || [];

    for (let ti = 0; ti < turnList.length; ti++) {
      const turn = turnList[ti];
      lines.push("");
      if (turn.role === "summary") {
        // Synthetic turn from the LLM compressor: the WHOLE conversation condensed
        // into the structured handoff brief (its own 7 ## headings live in the
        // text, kept as real sections by cleanHandoffMarkdown's whitelist).
        for (const block of turn.content || []) {
          if (block.type === "text" && block.text) lines.push(block.text);
        }
        // Every image/file from the conversation, carried onto the summary turn by
        // the compressor (the brief replaced all turns). Each gets the one-line
        // context the model wrote (att._context). The ![](images/…) ref is what the
        // resume PDF embeds inline; in Markdown it's a name-only reference.
        const sumImgs = (turn.attachments || []).filter((a) => a.type === "image");
        if (sumImgs.length) {
          lines.push("");
          lines.push("## Images");
          for (const att of sumImgs) {
            lines.push("");
            // ONE clean caption line per image: "[image: name — context]". No Markdown
            // ! / () wrapper and no "→ path" tail — the archive path was just noise in the
            // .md (the picture is attached/embedded separately and the name already names
            // it). The resume PDF re-matches this line to the image BY NAME to embed it and
            // render the context as a caption (see pdf-export). Whitespace is collapsed so a
            // multi-line description can't split the single-line ref.
            const oneLine = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
            const ctx = att._context ? " — " + oneLine(att._context) : "";
            const label = oneLine(att.name || "image") + ctx;
            lines.push(att._path ? "[image: " + label + "]" : "[image: " + label + " — not saved (original upload no longer downloadable)]");
          }
        }
        const sumFiles = (turn.attachments || []).filter((a) => a.type === "file" && !a.isPasted);
        if (sumFiles.length) {
          lines.push("");
          lines.push("## Files");
          for (const att of sumFiles) {
            lines.push("");
            const ctx = att._context ? " — " + att._context : "";
            lines.push(att._path ? "[file: " + att.name + ctx + " → " + att._path + "]" : "[file: " + att.name + ctx + "]");
          }
        }
        continue;
      }
      lines.push("## " + (turn.role === "assistant" ? "Assistant" : "User"));
      for (const block of turn.content || []) {
        if (block.type !== "text" || !block.text) continue;
        lines.push(block.text);
      }
      for (const att of turn.attachments || []) {
        lines.push("");
        if (att.type === "image") {
          // Clean caption ref "[image: name]" (NOT Markdown ![](path)) — same form as the
          // AI-compression summary, so verbatim and compressed exports read alike and the
          // resume PDF embeds it by name (see pdf-export). No _path = bytes weren't
          // captured (e.g. an upload added before the extension was capturing it, whose
          // remote URL is locked afterward), so say so briefly instead of a bare name.
          lines.push(att._path ? "[image: " + att.name + "]" : "[image: " + att.name + " — not saved (original upload no longer downloadable)]");
        } else if (att.type === "file") {
          if (att.isPasted && att.text != null) {
            // Pasted text the user dropped into their message — it's message content,
            // NOT a file. Inline it (no "File:" label, and never a files/ entry).
            lines.push("```" + fenceLang(att.name));
            lines.push(att.text);
            lines.push("```");
          } else if (att.text != null) {
            lines.push("**File: " + att.name + "**");
            lines.push("```" + fenceLang(att.name));
            lines.push(att.text);
            lines.push("```");
          } else if (att.generated) {
            lines.push("[generated file: " + att.name + "]");
          } else if (att._path) {
            lines.push("[file: " + att.name + " → " + att._path + "]");
          } else {
            // No bytes/text/path → a name-only reference (e.g. code-sandbox "blob"
            // uploads like .zip whose bytes claude.ai won't serve back). Listed by
            // name so the resumed chat knows the file existed.
            lines.push("[file: " + att.name + "]");
          }
        }
      }
      for (const art of turn.artifacts || []) {
        lines.push("");
        lines.push("**Artifact: " + (art.title || "untitled") + "**");
        if (art.content) {
          lines.push("```" + (art.type || ""));
          lines.push(art.content);
          lines.push("```");
        } else {
          lines.push("_(artifact body not captured)_");
        }
      }
    }
    lines.push("");
    // sanitizeText strips invisible junk (ChatGPT PUA citation markers, format/
    // control chars, odd spaces) + de-letter-spaces, so the monospace PDF/ZIP don't
    // show blank gaps or "M a d r i d". Provider-agnostic; also fixes old sessions.
    return sanitizeText(lines.join("\n"));
  }

  // Builds the ZIP entry map: transcript.md + every byte-backed attachment.
  async function buildZipEntries(session, opts) {
    const enc = new TextEncoder();
    // Firefox: a content script's TextEncoder.encode() returns a Uint8Array from
    // a different JS realm than the one fflate captured, so fflate's file-vs-dir
    // check (`val instanceof Uint8Array`) fails and it writes the bytes as a
    // *directory* — a folder "transcript.md" with one empty sub-folder per byte
    // (the "0 files / thousands of folders" zip). Re-wrapping with our own
    // Uint8Array forces a same-realm typed array fflate recognizes as a file.
    // (Binary attachments already use `new Uint8Array(...)` below, so they were
    // unaffected — this only bit the text entries.)
    const u8 = (s) => new Uint8Array(enc.encode(s));
    const entries = { "transcript.md": u8(buildHandoff(session, opts)) };
    const media = session.media || {};
    // Diagnostic: how much byte-backed content actually made it into this session?
    let attTotal = 0, withMediaId = 0, withBlob = 0, added = 0, textFallback = 0;
    for (const turn of session.turns || []) {
      for (const att of turn.attachments || []) {
        if (att.type === "image" || att.type === "file") attTotal++;
        const m = att.mediaId ? media[att.mediaId] : null;
        if (att.mediaId) withMediaId++;
        if (m && m.blob) withBlob++;
        if (m && m.blob && att._path) {
          // Realm-safe read — a bare `new Uint8Array(await m.blob.arrayBuffer())`
          // throws on Firefox page-realm blobs (the just-captured in-memory session),
          // which silently dropped every image/file from the ZIP.
          const r =
            Continuum.media && Continuum.media.readBlobBytes
              ? await Continuum.media.readBlobBytes(m.blob)
              : null;
          if (r && r.bytes) {
            entries[att._path] = r.bytes;
            added++;
            continue;
          }
        }
        // No blob but we have the file's inlined text → still save it under files/
        // so a text upload always lands in the archive even if its blob is missing.
        // EXCEPT pasted content (isPasted): that's inline message text, not a file,
        // so it must not become a files/attachment entry.
        if (att.type === "file" && !att.isPasted && typeof att.text === "string" && att.text) {
          const p = att._path || "files/" + (safeName(att.name) || "file");
          entries[p] = u8(att.text);
          textFallback++;
        }
      }
    }
    console.log(
      "[Continuum] buildZipEntries: media blobs=" + Object.keys(media).length +
        " | attachments=" + attTotal + " (mediaId=" + withMediaId + ", blob=" + withBlob +
        ") | files written=" + added + " + textFallback=" + textFallback
    );
    return entries;
  }

  // Builds what the resume-injector uploads into a fresh chat: the handoff
  // markdown (as conversation-history.md) plus the byte-backed attachments the
  // model needs as real files — every IMAGE (so a vision model can see it) and
  // every NON-TEXT file (so the AI can read it natively). Text files are skipped
  // here because their contents are already inlined in the markdown (att.text),
  // so re-uploading them would just duplicate tokens.
  // Returns { historyText, files: [{ name, blob, type }] }.
  function collectResumeFiles(session, opts) {
    const historyText = buildHandoff(session, opts);
    const media = session.media || {};
    const M = Continuum.model;
    const files = [];
    const seen = new Set();
    for (const turn of session.turns || []) {
      for (const att of turn.attachments || []) {
        const isImage = M.attachableImage(att, media);
        if (!isImage && !M.attachableFile(att, media)) continue;
        if (seen.has(att.mediaId)) continue; // dedupe shared blobs
        seen.add(att.mediaId);
        const m = media[att.mediaId];
        files.push({ name: att.name || (isImage ? "image" : "file"), blob: m.blob, type: m.blob.type || m.mimeType || "" });
      }
    }
    return { historyText, files };
  }

  // Clean, human-readable transcript for the "Copy chat history" button — meant
  // to be pasted into a doc / shared. "Bold labels" style: a **You** / **Assistant**
  // label above each message, blank lines between turns, attachments shown as
  // tidy references (text-file contents inlined in a fenced block; images/binaries
  // as `_[Image: …]_` / `_[File: …]_`). Always verbatim — no compression, no
  // supersession collapse, no code-dedup. This is intentionally SEPARATE from
  // buildHandoff (which stays the machine format the resume PDF/ZIP and the gate
  // rely on).
  function buildReadableTranscript(session) {
    const lines = [];
    // Author label of the captured AI (Claude/ChatGPT) so "Copy chat history"
    // reads naturally instead of always saying "Claude".
    const aiName = providerName(session.sourceProvider);
    lines.push(session.title || "Conversation");
    const s = session.stats || {};
    const date = fmtDate(session.startedAt || session.capturedAt);
    const metaBits = [plural(s.messages || (session.turns || []).length, "message")];
    if (date && date !== "—") metaBits.push(date);
    lines.push(aiName + " · " + metaBits.join(" · "));
    lines.push("");

    for (const turn of session.turns || []) {
      // Speaker labels: "# User" (one #) and "## Assistant" (two #), per request.
      lines.push(turn.role === "assistant" ? "## Assistant" : "# User");
      lines.push("");
      const text = (turn.content || [])
        .filter((b) => b.type === "text" && b.text)
        .map((b) => b.text)
        .join("\n\n")
        .trim();
      if (text) lines.push(stripChatMarkdown(text));

      for (const att of turn.attachments || []) {
        if (att.type === "image") {
          lines.push("");
          lines.push("[Image: " + (att.name || "image") + "]");
        } else if (att.type === "file") {
          lines.push("");
          if (att.isPasted && att.text != null) {
            // Pasted text → message content, not a file. Inline it without a label.
            lines.push(att.text);
          } else if (att.text != null) {
            lines.push("[File: " + (att.name || "file") + "]");
            lines.push(att.text);
          } else if (att.generated) {
            lines.push("[File: " + (att.name || "file") + " (generated)]");
          } else {
            lines.push("[File: " + (att.name || "file") + "]");
          }
        }
      }
      for (const art of turn.artifacts || []) {
        lines.push("");
        lines.push("Artifact: " + (art.title || "untitled"));
        if (art.content) lines.push(art.content);
      }
      lines.push(""); // breathing room between turns
    }
    return sanitizeText(lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()) + "\n";
  }

  // Strips cosmetic Markdown (**bold**, _italic_, ## headings, `code`, ![img](…))
  // from a message body so the "Copy chat history" output is clean plain text.
  // (Separate from pdf-export.cleanHandoffMarkdown, which the resume PDF + .md use —
  // this one also drops image refs entirely, which "Copy chat history" wants.)
  function stripChatMarkdown(text) {
    return String(text == null ? "" : text)
      .split("\n")
      .map((line) =>
        line
          .replace(/^\s{0,3}#{1,6}\s+/, "")                 // ## heading → text
          .replace(/!\[[^\]]*\]\([^)]*\)/g, "")             // ![alt](path) image refs → drop
          .replace(/\*\*([^*]+)\*\*/g, "$1")                // **bold**
          .replace(/__([^_]+)__/g, "$1")                    // __bold__
          .replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?![\w*])/g, "$1$2") // *italic*
          .replace(/(^|[^\w_])_(?!\s)([^_\n]+?)_(?![\w_])/g, "$1$2")   // _italic_
          .replace(/`([^`\n]+)`/g, "$1")                    // `code`
      )
      .join("\n");
  }

  // Build DOM nodes from a static HTML string WITHOUT innerHTML (which AMO's
  // reviewer linter flags on dynamic values). DOMParser is an accepted, non-sink
  // API; we adopt the parsed body children into the target, replacing its content.
  function setHTML(el, html) {
    const doc = new DOMParser().parseFromString(String(html), "text/html");
    el.replaceChildren(...Array.from(doc.body.childNodes));
  }

  // ── DOM construction ────────────────────────────────────────────────
  function build(root) {
    backdropEl = document.createElement("div");
    backdropEl.className = "continuum-backdrop";

    panelEl = document.createElement("div");
    panelEl.className = "continuum-panel";
    setHTML(panelEl, [
      // Header (back button visible in detail/settings views)
      '<div class="cn-header">',
      '  <button class="cn-iconbtn cn-back" data-back aria-label="Back" hidden>' + svg("back", 20) + "</button>",
      '  <span class="cn-mark" data-mark>' + logoMark(16) + "</span>",
      '  <span class="cn-title">Continuum</span>',
      // Rate/review CTA — hollow star + "Review", opens the store's reviews page.
      '  <button class="cn-review" data-review aria-label="Rate Continuum" title="Rate Continuum">' +
        svg("star", 15) + "<span>Review</span></button>",
      '  <button class="cn-iconbtn" data-settings aria-label="Settings">' + svg("gear", 20) + "</button>",
      '  <button class="cn-iconbtn" data-close aria-label="Close">' + svg("close", 20) + "</button>",
      "</div>",

      // ── Main view ──
      '<div data-view-main>',
      '  <div class="cn-section">',
      '    <div class="cn-label">Current chat</div>',
      '    <div class="cn-chat-title" data-chat-title>…</div>',
      '    <div class="cn-stats" data-chat-stats>…</div>',
      '    <div class="cn-started" data-chat-started></div>',
      '    <button class="cn-btn-primary" data-capture>' + svg("camera") + "<span>Capture this session</span></button>",
      '    <div class="cn-progress" data-progress></div>',
      '    <div class="cn-status" data-capture-status></div>',
      "  </div>",
      '  <div class="cn-divider"></div>',
      '  <div class="cn-section">',
      '    <div class="cn-saved-head">',
      '      <div class="cn-label" data-saved-label>Saved sessions</div>',
      '      <button class="cn-btn-link" data-select-toggle hidden>Select</button>',
      "    </div>",
      // Filter the saved list — shown once there's anything to search. The clear (×)
      // appears only while there's text in the field.
      '    <div class="cn-search" data-search-row hidden>',
      '      <span class="cn-search-icon">' + svg("search", 15) + "</span>",
      '      <input class="cn-search-input" data-search type="search" placeholder="Search saved chats" aria-label="Search saved chats" autocomplete="off" spellcheck="false" />',
      '      <button class="cn-search-clear" data-search-clear type="button" aria-label="Clear search" hidden>' + svg("close", 14) + "</button>",
      "    </div>",
      '    <div class="cn-select-bar" data-select-bar hidden>',
      '      <button class="cn-btn-ghost cn-btn-small" data-select-all>Select all</button>',
      '      <button class="cn-btn-danger cn-btn-small" data-delete-selected disabled>Delete (0)</button>',
      "    </div>",
      '    <ul class="cn-list" data-list></ul>',
      "  </div>",
      "</div>",

      // ── Detail view ──
      '<div data-view-detail hidden>',
      '  <div class="cn-detail-head">',
      '    <div class="cn-chat-title" data-d-title></div>',
      '    <div class="cn-detail-dates" data-d-dates></div>',
      "  </div>",
      '  <div class="cn-statrow" data-d-stats></div>',
      '  <div class="cn-actions">',
      // Resume → expands an inline picker of target AIs. Claude, ChatGPT,
      // Gemini, and Perplexity are wired up; the rest (Grok, DeepSeek, Copilot)
      // are placeholders (disabled) until per-site injectors exist.
      '    <div class="cn-resume" data-resume-wrap>',
      '      <button class="cn-btn-primary" data-resume-btn>' + svg("play") +
        "<span>Resume in new chat</span>" +
        '<span class="cn-resume-caret">' + svg("chevron", 16) + "</span></button>",
      '      <div class="cn-resume-targets" data-resume-targets>',
      '        <div class="cn-resume-targets-inner">',
      '        <button class="cn-resume-target" data-resume-target="claude">' +
        '<span class="cn-resume-logo">' + providerLogo("claude", 18) + "</span><span>Claude</span></button>",
      '        <button class="cn-resume-target" data-resume-target="chatgpt">' +
        '<span class="cn-resume-logo">' + providerLogo("chatgpt", 18) +
        "</span><span>ChatGPT</span></button>",
      '        <button class="cn-resume-target" data-resume-target="gemini">' +
        '<span class="cn-resume-logo">' + providerLogo("gemini", 18) +
        "</span><span>Gemini</span></button>",
      '        <button class="cn-resume-target" data-resume-target="perplexity">' +
        '<span class="cn-resume-logo">' + providerLogo("perplexity", 18) +
        "</span><span>Perplexity</span></button>",
      '        <button class="cn-resume-target disabled" data-resume-target="grok" disabled>' +
        '<span class="cn-resume-logo">' + providerLogo("grok", 18) +
        '</span><span>Grok</span><span class="cn-soon">soon</span></button>',
      '        <button class="cn-resume-target disabled" data-resume-target="deepseek" disabled>' +
        '<span class="cn-resume-logo">' + providerLogo("deepseek", 18) +
        '</span><span>DeepSeek</span><span class="cn-soon">soon</span></button>',
      '        <button class="cn-resume-target disabled" data-resume-target="copilot" disabled>' +
        '<span class="cn-resume-logo">' + providerLogo("copilot", 18) +
        '</span><span>Copilot</span><span class="cn-soon">soon</span></button>',
      "        </div>",
      "      </div>",
      "    </div>",
      // Resume format selector — pick PDF or Markdown before resuming. Independent
      // of "Compress with AI": either format can be compressed.
      '    <div class="cn-format-select" data-format-row>',
      '      <div class="cn-radio-group" role="radiogroup" aria-label="Resume format">',
      '        <label class="cn-radio"><input type="radio" name="cn-resume-fmt" value="pdf" data-resume-fmt checked /><span>PDF</span></label>',
      '        <label class="cn-radio"><input type="radio" name="cn-resume-fmt" value="markdown" data-resume-fmt /><span>MD</span></label>',
      "      </div>",
      '      <div class="cn-hint cn-format-hint"><strong>PDF</strong> embeds images and references files — heavier, but the model can <em>see</em> the images. <strong>MD</strong> references images and files by name only — much lighter (fewer tokens), text-only.</div>',
      "    </div>",
      // Compress with AI: condense the whole chat into a structured handoff brief
      // (needs an API key in Settings). Works with either format.
      '    <label class="cn-compress" data-compress-row>',
      '      <input type="checkbox" data-compress-toggle />',
      '      <span class="cn-compress-text" data-compress-label>Compress with AI (structured handoff brief)</span>',
      "    </label>",
      // Only shown when the chat has files — lets you choose whether the uploaded
      // documents ride along to the new chat (the images are always in the PDF).
      '    <label class="cn-compress" data-addfiles-row hidden>',
      '      <input type="checkbox" data-addfiles-toggle />',
      '      <span class="cn-compress-text" data-addfiles-label>Attach files to the new chat</span>',
      "    </label>",
      // Markdown only — attach the referenced images too (PDF embeds them instead).
      '    <label class="cn-compress" data-addimages-row hidden>',
      '      <input type="checkbox" data-addimages-toggle />',
      '      <span class="cn-compress-text" data-addimages-label>Attach images to the new chat</span>',
      "    </label>",
      '    <button class="cn-btn-ghost" data-copy>' + svg("copy") + "<span>Copy chat history</span></button>",
      // Download the exact resume handoff in the selected format (PDF/MD), named —
      // before resuming. Label tracks the format radio above.
      '    <button class="cn-btn-ghost" data-download-resume>' + svg("download") + '<span data-download-resume-label>Download PDF</span></button>',
      '    <button class="cn-btn-ghost" data-savefile>' + svg("download") + "<span>Save as file (.zip)</span></button>",
      "  </div>",
      '  <button class="cn-btn-danger" data-delete>' + svg("trash") + "<span>Delete session</span></button>",
      "</div>",

      // ── Settings view ──
      '<div data-view-settings hidden>',
      // Sync & integrations — placeholders for now. Quiet, non-interactive teaser
      // rows (brand mark + name + "Soon" pill) so the destinations are visible but
      // clearly not yet live.
      '  <div class="cn-section">',
      '    <div class="cn-label">Sync &amp; integrations</div>',
      '    <div class="cn-soon" aria-disabled="true">',
      '      <span class="cn-soon-logo">' + obsidianLogo(18) + "</span>",
      '      <span class="cn-soon-name">Obsidian sync</span>',
      '      <span class="cn-soon-badge">Soon</span>',
      "    </div>",
      '    <div class="cn-soon" aria-disabled="true">',
      '      <span class="cn-soon-logo">' + notionLogo(18) + "</span>",
      '      <span class="cn-soon-name">Notion sync</span>',
      '      <span class="cn-soon-badge">Soon</span>',
      "    </div>",
      "  </div>",
      '  <div class="cn-divider"></div>',
      '  <div class="cn-section">',
      '    <div class="cn-label">Theme</div>',
      '    <label class="cn-toggle-row">',
      '      <span class="cn-radio-label">Dark mode</span>',
      '      <span class="cn-switch">',
      '        <input type="checkbox" data-theme-toggle aria-label="Dark mode">',
      '        <span class="cn-switch-track"></span>',
      "      </span>",
      "    </label>",
      "  </div>",
      '  <div class="cn-divider"></div>',
      '  <div class="cn-section">',
      '    <div class="cn-label">Resume</div>',
      '    <label class="cn-toggle-row">',
      '      <span class="cn-radio-label">Auto-send after resume</span>',
      '      <span class="cn-switch">',
      '        <input type="checkbox" data-autosend-toggle aria-label="Auto-send after resume">',
      '        <span class="cn-switch-track"></span>',
      "      </span>",
      "    </label>",
      '    <div class="cn-hint">When on, Continuum sends the message for you automatically — right after the attached chat history finishes uploading. When off, it fills in the message and attachment, then waits for you to review and press Send.</div>',
      "  </div>",
      '  <div class="cn-divider"></div>',
      '  <div class="cn-section">',
      '    <label class="cn-label" for="cn-preamble-pick">Resume message</label>',
      '    <div class="cn-hint">Auto-typed into the new chat when you resume. Each format keeps its own message, so pick which one to edit.</div>',
      '    <select class="cn-input" id="cn-preamble-pick" data-preamble-pick>',
      '      <option value="pdf">PDF</option>',
      '      <option value="markdown">Markdown</option>',
      '      <option value="pdf-c">PDF (AI brief)</option>',
      '      <option value="markdown-c">Markdown (AI brief)</option>',
      "    </select>",
      '    <textarea class="cn-textarea" id="cn-resume-preamble" data-resume-preamble rows="6" maxlength="4000" spellcheck="true"></textarea>',
      '    <button class="cn-btn-ghost cn-btn-small" data-resume-reset>Reset to default</button>',
      "  </div>",
      '  <div class="cn-divider"></div>',
      '  <div class="cn-section">',
      '    <label class="cn-label" for="cn-provider">AI compression</label>',
      '    <div class="cn-hint">Used only when you tick "Compress with AI" on a chat. Pick a provider and paste its API key — stored locally in this browser and sent only to that provider to condense the whole chat into a structured handoff brief.</div>',
      '    <select class="cn-input" id="cn-provider" data-compress-provider>',
      '      <option value="anthropic">Claude (Anthropic)</option>',
      '      <option value="openai">ChatGPT (OpenAI)</option>',
      '      <option value="gemini">Gemini (Google)</option>',
      '      <option value="perplexity">Perplexity</option>',
      '      <option value="grok">Grok (xAI)</option>',
      '      <option value="deepseek">DeepSeek</option>',
      "    </select>",
      '    <input class="cn-input" id="cn-api-key" data-api-key type="password" autocomplete="off" spellcheck="false" placeholder="API key" readonly />',
      '    <div class="cn-brief-sections">',
      '      <div class="cn-brief-sections-label">The handoff brief is organized as</div>',
      '      <div class="cn-chips">',
      '        <span class="cn-chip">Completed work</span>',
      '        <span class="cn-chip">Current state</span>',
      '        <span class="cn-chip">In progress</span>',
      '        <span class="cn-chip">Next steps</span>',
      '        <span class="cn-chip">Constraints</span>',
      '        <span class="cn-chip">Critical context</span>',
      '        <span class="cn-chip">Discarded attempts</span>',
      "      </div>",
      '      <div class="cn-hint">Compresses the whole conversation into a structured brief while keeping full context. All your key details are kept (decisions, instructions, code, files, and images) and everything else is summarized. Empty sections just say None.</div>',
      "    </div>",
      "  </div>",

      '  <div class="cn-divider"></div>',
      '  <button class="cn-btn-danger" data-factory-reset>' + svg("trash") + "<span>Factory reset</span></button>",
      "</div>",

      // ── Delete confirmation dialog ──
      '<div class="cn-dialog-backdrop" data-dialog>',
      '  <div class="cn-dialog" role="dialog" aria-modal="true" aria-labelledby="cn-dlg-title">',
      '    <div class="cn-dialog-title" id="cn-dlg-title" data-dlg-title>Delete this session?</div>',
      '    <div class="cn-dialog-sub" data-dlg-sub>This can\'t be undone.</div>',
      '    <div class="cn-dialog-row">',
      '      <button class="cn-dialog-cancel" data-dlg-cancel>Cancel</button>',
      '      <button class="cn-dialog-confirm" data-dlg-confirm>Delete</button>',
      "    </div>",
      "  </div>",
      "</div>",

      // ── File-name dialog (shared by "Save as file" and "Download resume file") ──
      '<div class="cn-dialog-backdrop" data-savefile-dialog>',
      '  <div class="cn-dialog" role="dialog" aria-modal="true" aria-labelledby="cn-savefile-title">',
      '    <div class="cn-dialog-title" id="cn-savefile-title" data-savefile-title>Save chat as file</div>',
      '    <label class="cn-dialog-label" for="cn-savefile-name">File name</label>',
      '    <div class="cn-savefile-field">',
      '      <input class="cn-savefile-name" id="cn-savefile-name" type="text" data-savefile-name spellcheck="false" autocomplete="off" aria-label="File name" />',
      '      <span class="cn-savefile-ext" data-savefile-ext>.zip</span>',
      "    </div>",
      '    <div class="cn-dialog-row">',
      '      <button class="cn-dialog-cancel" data-savefile-cancel>Cancel</button>',
      '      <button class="cn-dialog-confirm cn-dialog-go" data-savefile-confirm>Save</button>',
      "    </div>",
      "  </div>",
      "</div>",

      // ── Factory-reset confirmation dialog ──
      '<div class="cn-dialog-backdrop" data-reset-dialog>',
      '  <div class="cn-dialog" role="dialog" aria-modal="true" aria-labelledby="cn-reset-title">',
      '    <div class="cn-dialog-title" id="cn-reset-title">Factory reset?</div>',
      '    <div class="cn-dialog-sub">Deletes all saved sessions and resets every setting. This can\'t be undone.</div>',
      '    <div class="cn-dialog-row">',
      '      <button class="cn-dialog-cancel" data-reset-cancel>Cancel</button>',
      '      <button class="cn-dialog-confirm" data-reset-confirm>Reset</button>',
      "    </div>",
      "  </div>",
      "</div>",

      '<div class="cn-toast-anchor"><div class="cn-toast" data-toast></div></div>',
    ].join(""));

    root.appendChild(backdropEl);
    root.appendChild(panelEl);

    // Some AI sites have a global "type anywhere → focus the chat composer" key
    // handler on the document. Without this, keystrokes in our textarea bubble
    // out of the panel, the site grabs them, and the text lands in its chat box.
    // Stop key/input events from leaving the panel so our inputs keep them.
    ["keydown", "keyup", "keypress", "input", "beforeinput"].forEach((type) => {
      panelEl.addEventListener(type, (e) => e.stopPropagation());
    });

    const $ = (sel) => panelEl.querySelector(sel);
    $("[data-close]").addEventListener("click", close);
    backdropEl.addEventListener("click", close);
    $("[data-back]").addEventListener("click", onBack);
    $("[data-review]").addEventListener("click", onReview);
    $("[data-settings]").addEventListener("click", onSettingsClick);
    $("[data-capture]").addEventListener("click", onCapture);
    $("[data-addfiles-toggle]").addEventListener("change", (e) => {
      includeFilesEnabled = !!e.target.checked;
    });
    $("[data-addimages-toggle]").addEventListener("change", (e) => {
      includeImagesEnabled = !!e.target.checked;
    });
    $("[data-compress-toggle]").addEventListener("change", (e) => {
      compressEnabled = !!e.target.checked;
    });
    panelEl.querySelectorAll("[data-resume-fmt]").forEach((r) => {
      r.addEventListener("change", (e) => {
        if (!e.target.checked) return;
        markdownEnabled = e.target.value === "markdown";
        // The images row is Markdown-only; the files row is shared — re-evaluate
        // both rows' visibility + labels for the newly-selected format.
        updateAttachRows();
        updateDownloadLabel(); // "Download PDF" / "Download MD" tracks the format
      });
    });
    // Resume button toggles the inline AI picker; each enabled target row runs
    // the resume into that AI. (Disabled rows fire nothing.)
    $("[data-resume-btn]").addEventListener("click", () => {
      const wrap = $("[data-resume-wrap]");
      if (wrap) wrap.classList.toggle("cn-resume-open");
    });
    panelEl.querySelectorAll("[data-resume-target]").forEach((btn) => {
      if (btn.disabled) return;
      btn.addEventListener("click", () => onResume(btn.getAttribute("data-resume-target")));
    });
    $("[data-copy]").addEventListener("click", onCopy);
    $("[data-savefile]").addEventListener("click", onSaveFile);
    $("[data-delete]").addEventListener("click", () => {
      _bulkDeleteIds = null; // single delete (the open session), not a bulk batch
      const titleEl = panelEl.querySelector("[data-dlg-title]");
      const subEl = panelEl.querySelector("[data-dlg-sub]");
      if (titleEl) titleEl.textContent = "Delete this session?";
      if (subEl) subEl.textContent = "This can't be undone.";
      openDialog();
    });
    // Saved-list search: debounced filter as you type, plus a clear (×) button.
    const searchEl = panelEl.querySelector("[data-search]");
    if (searchEl) {
      let searchTimer = null;
      searchEl.addEventListener("input", (e) => {
        _savedQuery = e.target.value;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => refreshSavedList(), 140);
      });
    }
    const searchClearBtn = panelEl.querySelector("[data-search-clear]");
    if (searchClearBtn) {
      searchClearBtn.addEventListener("click", () => {
        _savedQuery = "";
        if (searchEl) {
          searchEl.value = "";
          searchEl.focus();
        }
        refreshSavedList();
      });
    }
    $("[data-select-toggle]").addEventListener("click", () => (_selectMode ? exitSelectMode() : enterSelectMode()));
    $("[data-select-all]").addEventListener("click", selectAllVisible);
    $("[data-delete-selected]").addEventListener("click", () => {
      if (_selectedIds.size) openBulkDeleteDialog();
    });
    $("[data-dlg-cancel]").addEventListener("click", closeDialog);
    $("[data-dlg-confirm]").addEventListener("click", onConfirmDelete);
    $("[data-dialog]").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) closeDialog();
    });

    // Download the selected-format resume file (named), before resuming.
    $("[data-download-resume]").addEventListener("click", onDownloadResume);
    // File-name dialog (shared) — Save (primary), Cancel, backdrop, and keys.
    $("[data-savefile-cancel]").addEventListener("click", closeNameDialog);
    $("[data-savefile-confirm]").addEventListener("click", onNameConfirm);
    $("[data-savefile-dialog]").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) closeNameDialog();
    });
    $("[data-savefile-name]").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onNameConfirm();
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeNameDialog();
      }
    });

    // Factory reset (Settings → bottom) — same confirm pattern as delete.
    $("[data-factory-reset]").addEventListener("click", openResetDialog);
    $("[data-reset-cancel]").addEventListener("click", closeResetDialog);
    $("[data-reset-confirm]").addEventListener("click", onConfirmReset);
    $("[data-reset-dialog]").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) closeResetDialog();
    });

    // Settings inputs — change events persist immediately via settings module.
    const themeToggle = panelEl.querySelector("[data-theme-toggle]");
    if (themeToggle) {
      themeToggle.addEventListener("change", (e) => {
        const next = e.target.checked ? "dark" : "light";
        Continuum.settings.setSetting("theme", next).catch((err) =>
          console.warn("[Continuum] theme set failed:", err)
        );
      });
    }

    // Settings confirmations show as the inline status under the Capture button
    // when you LEAVE settings (queued in _pendingMainStatus, flushed by showMain),
    // instead of a floating toast that overlaps the list while you're in settings.
    // Queue the confirmation SYNCHRONOUSLY (not in .then) — leaving settings
    // calls showMain() on the same click that blurs the textarea, which would
    // run before an async setSetting resolves. We clear the queue only if the
    // save actually fails.
    const preambleEl = panelEl.querySelector("[data-resume-preamble]");
    // Swap the textarea to the draft for the currently-selected (format, compressed).
    const syncPreambleTextarea = () => {
      if (preambleEl) preambleEl.value = _preambleDrafts[preambleDraftKey(_preambleFormat, _preambleCompressed)] || "";
    };
    if (preambleEl) {
      // Keep the active draft synced as the user types, so flipping format / the
      // Compress-with-AI toggle shows the right (possibly unsaved) text immediately.
      preambleEl.addEventListener("input", (e) => {
        _preambleDrafts[preambleDraftKey(_preambleFormat, _preambleCompressed)] = e.target.value;
      });
      preambleEl.addEventListener("change", (e) => {
        _preambleDrafts[preambleDraftKey(_preambleFormat, _preambleCompressed)] = e.target.value;
        _pendingMainStatus = { text: "Resume message saved", ok: true };
        Continuum.settings.setSetting(preambleKeyFor(_preambleFormat, _preambleCompressed), e.target.value).catch((err) => {
          console.warn("[Continuum] resume message set failed:", err);
          _pendingMainStatus = null;
          showToast("Couldn't save message — see console", false);
        });
      });
    }
    // One dropdown picks which of the four messages to edit (format × verbatim/
    // AI-brief). Value encodes both: "<format>" or "<format>-c" (compressed).
    const preamblePickEl = panelEl.querySelector("[data-preamble-pick]");
    if (preamblePickEl) {
      preamblePickEl.addEventListener("change", (e) => {
        const v = e.target.value;
        _preambleCompressed = /-c$/.test(v);
        _preambleFormat = /^markdown/.test(v) ? "markdown" : "pdf";
        syncPreambleTextarea();
      });
    }
    const autosendToggle = panelEl.querySelector("[data-autosend-toggle]");
    if (autosendToggle) {
      autosendToggle.addEventListener("change", (e) => {
        const on = e.target.checked;
        _pendingMainStatus = { text: on ? "Auto-send turned on" : "Auto-send turned off", ok: true };
        Continuum.settings.setSetting("autoSendOnResume", on).catch((err) => {
          console.warn("[Continuum] autoSendOnResume set failed:", err);
          _pendingMainStatus = null;
        });
      });
    }
    const preambleReset = panelEl.querySelector("[data-resume-reset]");
    if (preambleReset) {
      preambleReset.addEventListener("click", () => {
        const def = preambleDefaultFor(_preambleFormat, _preambleCompressed);
        if (preambleEl) preambleEl.value = def;
        _preambleDrafts[preambleDraftKey(_preambleFormat, _preambleCompressed)] = def;
        Continuum.settings
          .setSetting(preambleKeyFor(_preambleFormat, _preambleCompressed), def)
          .then(() => showToast("Reset to default", true)) // immediate, as before
          .catch((err) => console.warn("[Continuum] resume message reset failed:", err));
      });
    }
    const providerEl = panelEl.querySelector("[data-compress-provider]");
    const apiKeyEl = panelEl.querySelector("[data-api-key]");
    if (providerEl) {
      providerEl.addEventListener("change", (e) => {
        const provider = e.target.value;
        Continuum.settings.setSetting("compressProvider", provider).catch((err) =>
          console.warn("[Continuum] compressProvider set failed:", err)
        );
        // Swap the key field to show the selected provider's stored key.
        if (apiKeyEl) {
          Continuum.settings.getSettings().then((s) => {
            apiKeyEl.value = (s.compressApiKeys && s.compressApiKeys[provider]) || "";
            _apiKeyBaseline = apiKeyEl.value.trim();
          });
        }
      });
    }
    if (apiKeyEl) {
      // Held `readonly` so the browser won't autofill a saved credential into it
      // (which fired spurious "API key saved" and could overwrite the real key).
      // Becomes editable only while the user has it focused.
      apiKeyEl.addEventListener("focus", () => apiKeyEl.removeAttribute("readonly"));
      apiKeyEl.addEventListener("blur", () => apiKeyEl.setAttribute("readonly", ""));
      apiKeyEl.addEventListener("change", (e) => {
        const provider = providerEl ? providerEl.value : "anthropic";
        const newKey = e.target.value.trim();
        // Only save (and flash "API key saved") when it ACTUALLY changed. The
        // password field can emit `change` on its own (browser autofill / refocus)
        // without a real edit — that must not show a save status.
        if (newKey === _apiKeyBaseline) return;
        _apiKeyBaseline = newKey;
        _pendingMainStatus = { text: newKey ? "API key saved" : "API key cleared", ok: true };
        Continuum.settings.setSetting("compressApiKey", { provider: provider, key: newKey }).catch((err) => {
          console.warn("[Continuum] compressApiKey set failed:", err);
          _pendingMainStatus = null;
          showToast("Couldn't save key — see console", false);
        });
      });
    }
    // Initial theme application + subscribe to setting changes so the panel
    // updates instantly when the toggle flips.
    applyTheme();
    Continuum.settings.onThemeChange(applyTheme);
  }

  function applyTheme() {
    if (!panelEl || !Continuum.settings) return;
    const resolved = Continuum.settings.getResolvedTheme();
    panelEl.dataset.theme = resolved;
    // Also set it on the shadow HOST so the dark CSS variables cascade to the
    // floating button (a sibling of the panel), not just the panel.
    const root = panelEl.getRootNode();
    if (root && root.host) root.host.dataset.theme = resolved;
  }

  // ── View switching ──────────────────────────────────────────────────
  function showMain() {
    currentDetail = null;
    panelEl.querySelector("[data-view-detail]").hidden = true;
    panelEl.querySelector("[data-view-settings]").hidden = true;
    panelEl.querySelector("[data-view-main]").hidden = false;
    panelEl.querySelector("[data-back]").hidden = true;
    panelEl.querySelector("[data-mark]").hidden = false;
    panelEl.scrollTop = 0;
    // Returning to the main view from elsewhere clears any leftover select mode.
    if (_selectMode) exitSelectMode();
    // Flush any queued settings confirmation as the inline status under Capture.
    if (_pendingMainStatus) {
      const p = _pendingMainStatus;
      _pendingMainStatus = null;
      showCaptureStatus(p.text, p.ok);
    }
  }

  // Per spec: clicking the gear opens settings; clicking it again returns to main.
  // Clicking the back arrow from settings also returns to main.
  async function showSettings() {
    if (!Continuum.settings) return;
    // Remember where we came from so Back returns there (detail vs main).
    const detailVisible = !panelEl.querySelector("[data-view-detail]").hidden;
    _settingsReturnTo = detailVisible && currentDetail ? "detail" : "main";
    let s;
    try {
      s = await Continuum.settings.getSettings();
    } catch (e) {
      console.warn("[Continuum] settings load failed:", e);
      return;
    }
    // Sync control state from persisted settings each time we open the view.
    const themeToggle = panelEl.querySelector("[data-theme-toggle]");
    if (themeToggle) themeToggle.checked = s.theme === "dark";
    const autosendToggle = panelEl.querySelector("[data-autosend-toggle]");
    if (autosendToggle) autosendToggle.checked = !!s.autoSendOnResume;
    const preambleEl = panelEl.querySelector("[data-resume-preamble]");
    if (preambleEl) {
      const D = Continuum.settings;
      const draft = (val, def) => (typeof val === "string" ? val : def || "");
      _preambleDrafts.pdf = draft(s.resumePreamble, D.DEFAULT_RESUME_PREAMBLE);
      _preambleDrafts.markdown = draft(s.resumePreambleMd, D.DEFAULT_RESUME_PREAMBLE_MD);
      _preambleDrafts.pdfC = draft(s.resumePreambleCompressed, D.DEFAULT_RESUME_PREAMBLE_COMPRESSED);
      _preambleDrafts.markdownC = draft(s.resumePreambleCompressedMd, D.DEFAULT_RESUME_PREAMBLE_COMPRESSED_MD);
      // Open on the PDF / verbatim message each time Settings is shown.
      _preambleFormat = "pdf";
      _preambleCompressed = false;
      const pick = panelEl.querySelector("[data-preamble-pick]");
      if (pick) pick.value = "pdf";
      preambleEl.value = _preambleDrafts.pdf;
    }
    const provider = s.compressProvider || "anthropic";
    const providerEl = panelEl.querySelector("[data-compress-provider]");
    if (providerEl) providerEl.value = provider;
    const apiKeyEl = panelEl.querySelector("[data-api-key]");
    if (apiKeyEl) {
      apiKeyEl.value = (s.compressApiKeys && s.compressApiKeys[provider]) || "";
      _apiKeyBaseline = apiKeyEl.value.trim(); // baseline so a no-op change won't flash "saved"
    }
    panelEl.querySelector("[data-view-main]").hidden = true;
    panelEl.querySelector("[data-view-detail]").hidden = true;
    panelEl.querySelector("[data-view-settings]").hidden = false;
    panelEl.querySelector("[data-back]").hidden = false;
    panelEl.querySelector("[data-mark]").hidden = true;
    panelEl.scrollTop = 0;
  }

  // Opens the extension's store reviews page in a new tab — the right store for the
  // current browser (Chrome Web Store vs Firefox Add-ons).
  function onReview() {
    const url = /firefox/i.test(navigator.userAgent)
      ? "https://addons.mozilla.org/en-US/firefox/addon/continuum/reviews/"
      : "https://chromewebstore.google.com/detail/continuum-capture-save-re/nnohcpdjcfhkpmplgpcabpfipnokinbi/reviews";
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function onSettingsClick() {
    const settingsView = panelEl.querySelector("[data-view-settings]");
    // Already in Settings → do nothing (leave via the back arrow). Clicking the
    // gear only ever opens Settings.
    if (settingsView && !settingsView.hidden) return;
    showSettings();
  }

  // Back arrow: from Settings, return to where it was opened from (the session
  // detail or the main list); from a session detail, go to the main list.
  function onBack() {
    const settingsView = panelEl.querySelector("[data-view-settings]");
    if (settingsView && !settingsView.hidden) {
      if (_settingsReturnTo === "detail" && currentDetail) showDetail(currentDetail.id);
      else showMain();
      return;
    }
    showMain();
  }

  async function showDetail(id) {
    let session;
    try {
      session = await Continuum.storage.getSession(id);
    } catch (err) {
      console.warn("[Continuum] getSession failed:", err);
    }
    if (!session) {
      showToast("Could not open session", false);
      return;
    }
    currentDetail = session;

    panelEl.querySelector("[data-d-title]").textContent = session.title;
    // Only show the "Started" line when we actually know the start date — otherwise
    // (e.g. Gemini, whose DOM exposes no timestamp) it'd just read "Started —". The
    // "Saved" date is always known.
    const startedStr = fmtDate(session.startedAt);
    setHTML(panelEl.querySelector("[data-d-dates]"),
      (startedStr !== "—" ? "Started " + startedStr + "<br>" : "") +
      "Saved " + fmtDateTime(session.capturedAt));

    const s = session.stats || { messages: 0, images: 0, files: 0 };
    const stats = [
      '<span class="cn-stat">' + svg("message", 15) + "<span>" + plural(s.messages, "message") + "</span></span>",
      '<span class="cn-stat">' + svg("image", 15) + "<span>" + plural(s.images, "image") + "</span></span>",
      '<span class="cn-stat">' + svg("file", 15) + "<span>" + plural(s.files, "file") + "</span></span>",
    ];
    if (s.artifacts) {
      stats.push('<span class="cn-stat">' + svg("code", 15) + "<span>" + plural(s.artifacts, "artifact") + "</span></span>");
    }
    setHTML(panelEl.querySelector("[data-d-stats]"), stats.join(""));

    // Collapse the Resume AI-picker each time a session is opened.
    const resumeWrap = panelEl.querySelector("[data-resume-wrap]");
    if (resumeWrap) resumeWrap.classList.remove("cn-resume-open");

    // "Compress with AI" — reset to OFF, and only show the toggle when the chat is
    // long enough to be worth condensing into a brief. Too-short chats resume
    // verbatim, so the option is hidden.
    compressEnabled = false;
    panelEl.querySelector("[data-compress-toggle]").checked = false;
    // Resume format resets to PDF (default) each time a session is opened.
    markdownEnabled = false;
    const pdfFmtRadio = panelEl.querySelector('[data-resume-fmt][value="pdf"]');
    if (pdfFmtRadio) pdfFmtRadio.checked = true;
    updateDownloadLabel(); // reset the download button label to "Download PDF"
    const compressRow = panelEl.querySelector("[data-compress-row]");
    const minTurns = (Continuum.llmCompressor && Continuum.llmCompressor.MIN_TURNS) || 4;
    if (compressRow) compressRow.hidden = (session.turns || []).length < minTurns;

    // Attach rows — both default OFF (opt-in). They're driven by the count of
    // ATTACHABLE media (bytes captured / mediaId), NOT the displayed chat-content
    // stat: if an image/file could only be NAME-referenced (e.g. Gemini's token-
    // gated images, AI file cards), there's nothing to attach, so the toggle must
    // not appear. Counting only mediaId media means the toggles show only when a
    // real attach is possible. Visibility/labels per format → updateAttachRows().
    _detailFileCount = 0;
    _detailImageCount = 0;
    const _media = session.media || {};
    for (const turn of session.turns || []) {
      for (const att of turn.attachments || []) {
        // Same predicate the resume builders use, so the toggle count always
        // equals what actually attaches.
        if (Continuum.model.attachableImage(att, _media)) _detailImageCount++;
        else if (Continuum.model.attachableFile(att, _media)) _detailFileCount++;
      }
    }
    includeFilesEnabled = false;
    includeImagesEnabled = false;
    panelEl.querySelector("[data-addfiles-toggle]").checked = false;
    panelEl.querySelector("[data-addimages-toggle]").checked = false;
    updateAttachRows();

    panelEl.querySelector("[data-view-main]").hidden = true;
    panelEl.querySelector("[data-view-settings]").hidden = true;
    panelEl.querySelector("[data-view-detail]").hidden = false;
    panelEl.querySelector("[data-back]").hidden = false;
    panelEl.querySelector("[data-mark]").hidden = true;
    panelEl.scrollTop = 0;
  }

  // The capture adapter for whatever site we're on (Claude / ChatGPT / …).
  function activeAdapter() {
    return (Continuum.getActiveAdapter && Continuum.getActiveAdapter()) || Continuum.claudeAdapter;
  }

  // True when the current page actually has message turns to capture. On a fresh,
  // empty new-chat tab (claude.ai/new, chatgpt.com/, …) this is false — there's
  // nothing to capture, so Capture is disabled and a simple note explains why. The
  // adapter's peekSignal() is a cheap "<count>:<…>" string off one querySelectorAll.
  function currentChatHasMessages() {
    try {
      const a = activeAdapter();
      if (a && typeof a.peekSignal === "function") return parseInt(a.peekSignal(), 10) > 0;
    } catch (e) {
      /* best-effort */
    }
    return false;
  }

  // Disable Capture and show a simple red note on an empty new-chat tab; re-enable
  // it the moment the chat has turns. Only acts on a state CHANGE so the live loop
  // doesn't re-trigger the note's animation every tick (or fight an in-flight
  // capture, during which the chat already has messages so the state can't flip).
  let _captureGateEmpty = null; // null = unknown, true = empty, false = has messages
  function updateCaptureGate() {
    if (!panelEl) return;
    const empty = !currentChatHasMessages();
    if (empty === _captureGateEmpty) return;
    _captureGateEmpty = empty;
    const btn = panelEl.querySelector("[data-capture]"); // .cn-btn-primary:disabled dims it
    if (btn) btn.disabled = empty;
    const el = panelEl.querySelector("[data-capture-status]");
    if (!el) return;
    if (empty) {
      // Kept deliberately short and plain (per request): there's no chat here yet.
      el.textContent = "This chat is empty — there's nothing to capture yet. Pick a saved chat below to resume it here, or in a new tab on another AI.";
      el.className = "cn-status err show"; // persistent (no auto-hide timer)
      clearTimeout(_captureStatusTimer);
    } else {
      el.classList.remove("show");
    }
  }

  // ── Main-view rendering ──────────────────────────────────────────────
  // `force` bypasses the adapter's short-lived stats cache (and skips repainting
  // from the panel's own last-known cache) so a genuinely fresh API peek runs.
  // The live-refresh loop passes force=true when the conversation visibly changes
  // so new message/image/file counts show without the user reloading the page or
  // reopening the panel.
  function refreshCurrentChat(force) {
    if (!panelEl) return;
    refreshTitleAndStats(force);
    refreshStarted();
    updateCaptureGate();
  }

  function refreshTitleAndStats(force) {
    const adapter = activeAdapter();
    const title = adapter ? adapter.detectTitle() : "Current conversation";
    const convKey = location.pathname;
    panelEl.querySelector("[data-chat-title]").textContent = title;
    const statsEl = panelEl.querySelector("[data-chat-stats]");
    if (!statsEl) return;

    // Show the last-known stats immediately (cached from a previous open) so the
    // file/image counts don't take 1–2s to appear. Prefer the cache; otherwise
    // fall back to the instant DOM peek (which can't see file uploads). On a
    // forced refresh we keep whatever's already shown until the fresh value lands
    // (no flicker back to a stale cache).
    if (!force) {
      const cachedStats = statsCache[convKey];
      statsEl.textContent = statLine(cachedStats || (adapter ? adapter.peekStats() : null));
    }

    // The DOM peek under-counts (lazy-loaded turns) and misses file uploads.
    // Capture uses the API, so refine with the SAME API source — and update the
    // cache, so if the chat GREW since last time the new counts show (and are
    // remembered for next open). Matching the saved session's counts.
    // Returns the in-flight promise so the live loop can gate overlapping pulls.
    if (adapter && adapter.peekStatsFast) {
      return adapter.peekStatsFast(force).then((fast) => {
        if (fast && statsEl.isConnected) {
          statsCache[convKey] = fast;
          persistStatsCache();
          statsEl.textContent = statLine(fast);
        }
      }).catch(() => {});
    }
    return Promise.resolve();
  }

  function refreshStarted() {
    const adapter = activeAdapter();
    const convKey = location.pathname;
    const startedEl = panelEl.querySelector("[data-chat-started]");
    if (!startedEl) return;
    // Show the cached start date immediately (no flicker), then confirm/refresh
    // it in the background. If the live fetch fails, the cached value stays.
    const cached = startedCache[convKey];
    startedEl.textContent = cached ? "Started " + fmtDate(cached) : "";
    if (adapter && adapter.detectStartedAt) {
      adapter.detectStartedAt().then((iso) => {
        if (!startedEl.isConnected) return;
        if (iso) {
          if (startedCache[convKey] !== iso) {
            startedCache[convKey] = iso;
            persistStartedCache();
          }
          startedEl.textContent = "Started " + fmtDate(iso);
        } else if (!cached) {
          startedEl.textContent = ""; // never knew it and still don't
        }
        // iso null but we had a cached value → keep showing the cached one.
      });
    }
  }

  // ── Live refresh ─────────────────────────────────────────────────────
  // While the panel is open, poll a cheap per-adapter DOM signal (message count
  // + streaming state) and re-pull the stats from the API the moment it changes —
  // so sending/receiving a message updates messages/images/files in place. This
  // fixes Claude needing a full page reload and ChatGPT needing the panel
  // closed+reopened before the counts moved. `liveSig` starts null so the first
  // tick always forces one fresh API peek shortly after open (correcting a stale
  // cached count); a rapid open→close toggle clears the timer before that tick
  // fires, so the cheap-reopen path is preserved.
  let liveTimer = null;
  let liveKickTimer = null; // one-shot, fires the first fresh pull soon after open
  let liveSig = null;
  let liveBusy = false; // a forced API peek is in flight — don't stack another
  let liveLastForced = 0;
  const LIVE_INTERVAL_MS = 1500;
  // How soon after opening to do the first fresh API pull. The interval is 1.5s, but
  // waiting that long left Claude showing a stale cached count on open (its turn-count
  // signal is flat under virtualization, so nothing forced an earlier refresh) — which
  // is why the panel had to be reopened a few times before messages/images/files
  // updated. A short kick refreshes almost immediately; it's still long enough that a
  // truly-rapid open→close toggle clears the timer first (cheap-reopen path preserved).
  const LIVE_KICK_MS = 250;
  // Re-pull at least this often while the panel is open, even if the cheap DOM
  // signal didn't change. Belt-and-suspenders for Claude: its turn list
  // virtualizes (older turns unmount as new ones mount), so the turn-count signal
  // can stay flat across a new message — the timed fallback catches that, while
  // the signal path still gives an instant update whenever it CAN detect a change.
  const LIVE_FALLBACK_MS = 3500;

  function currentSignal() {
    const adapter = activeAdapter();
    let sig = "";
    try {
      if (adapter && adapter.peekSignal) sig = adapter.peekSignal();
    } catch (e) {
      /* adapter signal is best-effort */
    }
    return location.pathname + "|" + sig;
  }

  function liveTick() {
    if (!panelEl || !isOpen || liveBusy) return;
    const sig = currentSignal();
    const changed = sig !== liveSig;
    // The timed fallback (re-pull even when the signal is flat) is ONLY for Claude,
    // whose virtualized turn list can keep the count flat across a new message. It's
    // what kept poking ChatGPT's rate-limited /backend-api in the background (429s),
    // and ChatGPT's message-count signal is reliable — so for ChatGPT (and Gemini,
    // whose peek is DOM-only anyway) we refresh ONLY when the signal actually changes.
    const stale = currentProviderId() === "claude" && Date.now() - liveLastForced >= LIVE_FALLBACK_MS;
    if (!changed && !stale) return;
    liveSig = sig;
    liveBusy = true;
    liveLastForced = Date.now();
    Promise.resolve(refreshTitleAndStats(true)).then(() => {
      liveBusy = false;
    }, () => {
      liveBusy = false;
    });
    // Re-evaluate the empty-chat gate too: if the user sends the first message
    // here, Capture should enable (and the "empty" note clear) without a reopen.
    updateCaptureGate();
  }

  function startLiveRefresh() {
    stopLiveRefresh();
    _captureGateEmpty = null; // re-evaluate the empty-chat gate fresh on each open
    liveSig = null; // force one fresh peek on the first tick after open
    liveBusy = false;
    liveLastForced = 0;
    liveKickTimer = setTimeout(liveTick, LIVE_KICK_MS); // refresh promptly on open
    liveTimer = setInterval(liveTick, LIVE_INTERVAL_MS);
  }

  function stopLiveRefresh() {
    if (liveKickTimer) {
      clearTimeout(liveKickTimer);
      liveKickTimer = null;
    }
    if (liveTimer) {
      clearInterval(liveTimer);
      liveTimer = null;
    }
  }

  async function refreshSavedList() {
    if (!panelEl) return;
    const listEl = panelEl.querySelector("[data-list]");
    const labelEl = panelEl.querySelector("[data-saved-label]");
    let allSessions = [];
    try {
      allSessions = await Continuum.storage.listSessions();
    } catch (err) {
      console.warn("[Continuum] listSessions failed:", err);
    }
    const totalCount = allSessions.length;
    // Drop any selected ids that no longer exist — based on the FULL list, so a
    // search filter never silently deselects.
    const liveIds = new Set(allSessions.map((s) => s.id));
    for (const id of [..._selectedIds]) if (!liveIds.has(id)) _selectedIds.delete(id);

    // Search filter — matches the chat TITLE only (not the AI/folder name, so
    // typing "c" doesn't pull in every Claude chat). Empty = show all.
    const q = String(_savedQuery || "").trim().toLowerCase();
    const filtering = q.length > 0;
    const sessions = filtering
      ? allSessions.filter((s) => String(s.title || "").toLowerCase().indexOf(q) !== -1)
      : allSessions;

    labelEl.textContent = filtering
      ? "Saved sessions (" + sessions.length + " of " + totalCount + ")"
      : "Saved sessions (" + totalCount + ")";

    // Search bar appears once there's anything to search; the clear (×) only while typing.
    const searchRow = panelEl.querySelector("[data-search-row]");
    if (searchRow) searchRow.hidden = totalCount === 0;
    const searchClear = panelEl.querySelector("[data-search-clear]");
    if (searchClear) searchClear.hidden = !filtering;

    // Sync the multi-select controls to availability (the full list, not the filter).
    const selectToggle = panelEl.querySelector("[data-select-toggle]");
    const selectBar = panelEl.querySelector("[data-select-bar]");
    if (selectToggle) {
      selectToggle.hidden = totalCount === 0;
      selectToggle.textContent = _selectMode ? "Cancel" : "Select";
    }
    if (selectBar) selectBar.hidden = !_selectMode || totalCount === 0;
    updateSelectBar();

    listEl.innerHTML = "";
    if (!totalCount) {
      const li = document.createElement("li");
      li.className = "cn-empty";
      li.textContent = "No saved sessions yet.";
      listEl.appendChild(li);
      return;
    }
    if (!sessions.length) {
      const li = document.createElement("li");
      li.className = "cn-empty";
      li.textContent = 'No chats match "' + String(_savedQuery).trim() + '".';
      listEl.appendChild(li);
      return;
    }

    // Group by AI/provider; listSessions is already newest-first, so rows WITHIN
    // each group stay newest-first. Tree: All saved chats → per-AI → chat rows.
    const groups = new Map(); // providerId → [meta]
    for (const s of sessions) {
      const key = String(s.sourceProvider || "").toLowerCase() || "unknown";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }

    // Folder order = RECENCY: the provider of the most recently captured/saved
    // session floats to the top. `sessions` is newest-first, so the `groups` Map's
    // insertion order already reflects "whichever provider owns the newest session
    // first" — capturing a ChatGPT chat brings the ChatGPT folder up; capturing a
    // Claude chat brings Claude up. "unknown" is always kept last.
    // The provider just acted on (captured to, or deleted from) — set by onCapture /
    // single-delete. It both AUTO-EXPANDS and FLOATS TO THE TOP, so you keep working
    // with that AI at the top of the list. One-shot: cleared here. On a plain panel
    // open it's null → folders ordered purely by recency, none auto-expanded.
    const activeProvider = _expandProviderOnce;
    _expandProviderOnce = null;
    const orderedProviders = Array.from(groups.keys()).sort((a, b) => {
      if (a === activeProvider) return -1; // the acted-on AI first
      if (b === activeProvider) return 1;
      if (a === "unknown") return 1; // "unknown" last
      if (b === "unknown") return -1;
      return 0; // otherwise keep insertion (recency) order — stable sort
    });

    // Root "All saved chats": no count, no logo. Sub-folders: the AI's logo +
    // a "(N)" count matching the "SAVED SESSIONS (N)" label format.
    const root = makeFolder("All saved chats", { onExport: () => exportFolder("all"), depth: 0 });
    listEl.appendChild(root.el);
    for (const provider of orderedProviders) {
      const metas = groups.get(provider);
      const sub = makeFolder(providerName(provider), {
        count: metas.length,
        logoHtml: providerLogo(provider, 16),
        onExport: () => exportFolder(provider),
        depth: 1,
        // Open every folder in select mode (reach any chat to tick it) and while
        // searching (so matches are visible); otherwise only the just-captured
        // provider's folder auto-expands.
        collapsed: _selectMode || filtering ? false : provider !== activeProvider,
      });
      root.body.appendChild(sub.el);
      for (const s of metas) sub.body.appendChild(makeSessionRow(s));
    }
  }

  // A collapsible folder: header (chevron + optional AI logo + name + "(N)" count
  // + Export button) over an indented body the caller fills. `opts` = { count?,
  // logoHtml?, onExport, depth }. Clicking the head toggles; the Export button is
  // isolated so it never also toggles the folder.
  function makeFolder(label, opts) {
    const o = opts || {};
    const el = document.createElement("div");
    el.className = "cn-folder";
    if (o.collapsed) el.classList.add("collapsed"); // start folded (caller decides)
    el.style.setProperty("--cn-depth", o.depth || 0);
    const head = document.createElement("div");
    head.className = "cn-folder-head";
    head.tabIndex = 0;
    head.setAttribute("role", "button");
    setHTML(head,
      '<span class="cn-folder-chevron">' + svg("chevron", 16) + "</span>" +
      '<span class="cn-folder-name"></span>' +
      (o.logoHtml ? '<span class="cn-folder-logo">' + o.logoHtml + "</span>" : "") +
      '<span class="cn-folder-count"></span>' +
      '<button class="cn-folder-export" title="Extract this folder as a .zip" aria-label="Extract folder">' +
      svg("download", 15) + "</button>");
    head.querySelector(".cn-folder-name").textContent = label;
    head.querySelector(".cn-folder-count").textContent = o.count != null ? "(" + o.count + ")" : "";
    const toggle = () => el.classList.toggle("collapsed");
    head.addEventListener("click", (e) => {
      if (e.target.closest(".cn-folder-export")) return;
      toggle();
    });
    head.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    });
    head.querySelector(".cn-folder-export").addEventListener("click", (e) => {
      e.stopPropagation();
      o.onExport && o.onExport();
    });
    const body = document.createElement("div");
    body.className = "cn-folder-body";
    el.appendChild(head);
    el.appendChild(body);
    return { el, body };
  }

  function makeSessionRow(s) {
    const row = document.createElement("div");
    row.className = "cn-item";
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    // Single-line row: title on the left, saved date on the right. The AI logo
    // lives on the folder header, not the row.
    row.innerHTML = '<span class="cn-item-title"></span><span class="cn-item-date"></span>';
    row.querySelector(".cn-item-title").textContent = s.title;
    // Date shown = when the session was SAVED (capturedAt), not when the chat started.
    row.querySelector(".cn-item-date").textContent = fmtDate(s.capturedAt || s.startedAt);
    row.title = s.title;
    if (_selectMode) {
      // Select mode: a checkbox on the left; clicking the row toggles selection
      // (instead of opening the detail). The bulk-delete bar reflects the count.
      row.classList.add("cn-item-selectable");
      const box = document.createElement("span");
      box.className = "cn-item-check";
      row.prepend(box);
      const sync = () => row.classList.toggle("selected", _selectedIds.has(s.id));
      sync();
      const toggle = () => {
        if (_selectedIds.has(s.id)) _selectedIds.delete(s.id);
        else _selectedIds.add(s.id);
        sync();
        updateSelectBar();
      };
      row.addEventListener("click", (e) => {
        e.preventDefault();
        toggle();
      });
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      });
      return row;
    }
    row.addEventListener("click", () => showDetail(s.id));
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        showDetail(s.id);
      }
    });
    return row;
  }

  // ── Folder export ("extract") ─────────────────────────────────────────
  // Builds ONE zip-entries map placing each session in its own folder. When
  // `groupByProvider` is true the top level is "<AI>/" (the All export); otherwise
  // chat folders sit at the root (single-AI export — the filename names the AI).
  // Reuses buildZipEntries per session (transcript.md + images/ + files/).
  async function buildFolderZipEntries(metas, groupByProvider) {
    const entries = {};
    const usedPaths = new Set();
    for (const meta of metas) {
      let session;
      try {
        session = await Continuum.storage.getSession(meta.id);
      } catch (e) {
        console.warn("[Continuum] export: could not load session", meta.id, e);
        continue;
      }
      if (!session) continue;
      const parent = groupByProvider ? folderName(providerName(session.sourceProvider)) + "/" : "";
      const base = folderName(session.title);
      let folder = parent + base;
      let n = 2;
      while (usedPaths.has(folder)) folder = parent + base + " (" + n++ + ")"; // de-dupe collisions
      usedPaths.add(folder);
      const sessEntries = await buildZipEntries(session);
      for (const p of Object.keys(sessEntries)) {
        if (!p) continue; // never create a root/empty-named entry
        entries[folder + "/" + p] = sessEntries[p];
      }
    }
    return entries;
  }

  async function exportFolder(scope) {
    const ff = self.fflate || (typeof fflate !== "undefined" ? fflate : null);
    if (!ff) {
      showToast("Zip library missing — see console", false);
      console.error("[Continuum] fflate not loaded");
      return;
    }
    let metas = [];
    try {
      metas = await Continuum.storage.listSessions();
    } catch (e) {
      console.warn("[Continuum] export: listSessions failed:", e);
    }
    const all = scope === "all";
    // Mirror refreshSavedList's grouping key so an empty provider ("unknown") matches.
    if (!all) metas = metas.filter((m) => (String(m.sourceProvider || "").toLowerCase() || "unknown") === scope);
    if (!metas.length) {
      showToast("Nothing to export", false);
      return;
    }
    showToast("Preparing export…", true);
    try {
      const entries = await buildFolderZipEntries(metas, all);
      const zipped = ff.zipSync(entries, { level: 9 });
      const blob = new Blob([zipped], { type: "application/zip" });
      const fname = all
        ? "continuum-all-chats.zip"
        : "continuum-" + safeName(providerName(scope)).toLowerCase() + "-chats.zip";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fname;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast("Exported " + metas.length + " chat" + (metas.length === 1 ? "" : "s") + " to downloads", true);
    } catch (err) {
      console.error("[Continuum] export failed:", err);
      showToast("Export failed — see console", false);
    }
  }

  function setProgress(text) {
    if (!panelEl) return;
    panelEl.querySelector("[data-progress]").textContent = text || "";
  }

  function showToast(text, ok, durationMs) {
    if (!panelEl) return;
    const toast = panelEl.querySelector("[data-toast]");
    toast.textContent = text;
    toast.className = "cn-toast show" + (ok ? " ok" : " err");
    setTimeout(() => {
      toast.className = "cn-toast";
    }, durationMs || 2600);
  }

  // Inline confirmation shown directly under the Capture button (used for
  // "Session saved" / "Session deleted" so they appear in a fixed, sensible
  // spot instead of the floating toast landing over the saved-sessions list).
  let _captureStatusTimer = null;
  function showCaptureStatus(text, ok) {
    if (!panelEl) return;
    const el = panelEl.querySelector("[data-capture-status]");
    if (!el) return;
    el.textContent = text;
    el.className = "cn-status " + (ok ? "ok" : "err"); // collapsed (no .show yet)
    void el.offsetHeight; // reflow so re-showing always re-runs the open animation
    el.classList.add("show");
    clearTimeout(_captureStatusTimer);
    _captureStatusTimer = setTimeout(() => {
      el.classList.remove("show"); // animates closed; text stays but collapses out of view
    }, 2000);
  }

  // ── Actions ──────────────────────────────────────────────────────────
  async function onCapture() {
    const btn = panelEl.querySelector("[data-capture]");
    // Guard: nothing to capture on an empty new-chat tab (the button is disabled
    // there, but cover the keyboard/programmatic path too).
    if (!currentChatHasMessages()) {
      showCaptureStatus("This chat is empty — there's nothing to capture yet.", false);
      return;
    }
    btn.disabled = true;
    try {
      // Always Fast capture (reads the full active tree + files from the API).
      // captureFast itself falls back to the DOM scraper if the API call fails.
      const session = await activeAdapter().captureFast(setProgress);
      await Continuum.storage.saveSession(session);
      console.log("[Continuum] saved session:", session);
      // Auto-expand THIS provider's folder on the upcoming list refresh (only on a
      // fresh capture — opening the panel normally leaves folders collapsed).
      _expandProviderOnce = String(session.sourceProvider || "").toLowerCase() || null;
      _selectMode = false; // a fresh capture leaves the list in normal (non-select) mode
      _selectedIds.clear();
      setProgress("");
      // Guard against a silently broken capture: if the AI's replies weren't
      // detected, the transcript would be user-only. Warn instead of pretending.
      const assistantTurns = (session.turns || []).filter((t) => t.role === "assistant").length;
      if (assistantTurns === 0 && (session.turns || []).length > 0) {
        showCaptureStatus("Saved, but no AI replies were captured — see console", false);
        console.warn(
          "[Continuum] capture saved 0 assistant turns (method: " +
            (session.captureMethod || "?") +
            "). The site likely changed its markup — run Continuum.getActiveAdapter().probe()."
        );
      } else if (/-virtualized$/.test(session.captureMethod || "")) {
        // DOM capture mounted turns that then unmounted (virtualization), so
        // some may be missing. Steer the user to Fast capture, which is complete.
        showCaptureStatus("Saved — some turns may be missing. Try Fast capture.", false);
      } else {
        showCaptureStatus("Session saved", true);
      }
      await refreshSavedList();
    } catch (err) {
      console.error("[Continuum] capture failed:", err);
      setProgress("");
      // "Extension context invalidated" = Continuum was updated/reloaded while this
      // tab stayed open, so its content script is orphaned (its chrome.* calls throw)
      // until the page reloads. Can't be retried — tell the user to refresh instead.
      const msg = (err && err.message) || "";
      const orphaned = /context invalidated|extension context/i.test(msg) || !(chrome.runtime && chrome.runtime.id);
      showCaptureStatus(orphaned ? "Refresh the page, then capture again" : "Capture failed", false);
    } finally {
      btn.disabled = false;
    }
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn("[Continuum] clipboard write failed:", err);
      return false;
    }
  }

  // New-chat URL per resume target.
  const RESUME_URLS = {
    claude: "https://claude.ai/new",
    chatgpt: "https://chatgpt.com/",
    gemini: "https://gemini.google.com/app",
    perplexity: "https://www.perplexity.ai/",
  };

  // Provider API hosts are OPTIONAL host permissions (kept out of the install-time
  // prompt — least privilege for the store/featured review). They're requested at
  // runtime here, on the resume click (a user gesture), only for the provider the
  // user actually chose. The grant is extension-wide, so the background worker's
  // fetch (verifyKey + the compression call in the new tab) is covered.
  const PROVIDER_HOST = {
    anthropic: "https://api.anthropic.com/*",
    openai: "https://api.openai.com/*",
    gemini: "https://generativelanguage.googleapis.com/*",
    perplexity: "https://api.perplexity.ai/*",
    grok: "https://api.x.ai/*",
    deepseek: "https://api.deepseek.com/*",
  };
  function sendBg(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (resp) => {
          void chrome.runtime.lastError; // swallow "no receiver" etc.
          resolve(resp || null);
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  // Content scripts can't call chrome.permissions, so the background worker checks
  // whether the chosen provider's API host is already granted. If not, it opens the
  // themed grant page (where the prompt CAN fire); the user grants once per provider,
  // then clicks Resume again. Returns true only when access is already in place.
  async function ensureProviderHost(provider) {
    const origin = PROVIDER_HOST[provider];
    if (!origin) return true;
    const check = await sendBg({ type: "continuum-has-host", origin: origin });
    if (check && check.granted) return true;
    let theme = "light";
    try {
      if (Continuum.settings && Continuum.settings.getResolvedTheme) theme = Continuum.settings.getResolvedTheme();
    } catch (e) {}
    await sendBg({ type: "continuum-open-grant", provider: provider, origin: origin, theme: theme });
    return false;
  }

  async function onResume(target) {
    if (!currentDetail) return;
    target = RESUME_URLS[target] ? target : "claude";
    // If "Compress with AI" is on, validate the chosen provider's key HERE (in
    // the panel) before opening a new tab — so both "no key" and "invalid key"
    // errors surface in this window, and we never upload the uncompressed chat.
    if (compressEnabled) {
      let provider = "anthropic";
      let key = "";
      try {
        const s = await Continuum.settings.getSettings();
        provider = (s && s.compressProvider) || "anthropic";
        key = (s && s.compressApiKeys && s.compressApiKeys[provider]) || "";
      } catch (e) {
        /* settings unavailable — fall through and resume verbatim */
      }
      if (!key) {
        showToast("Resume canceled — add a " + providerName(provider) + " API key in Settings.", false);
        return;
      }
      // Provider API hosts are optional permissions and content scripts can't
      // prompt — so if access isn't granted yet, this opens the grant window and
      // asks the user to approve, then click Resume again. (We never ship an
      // uncompressed chat when compression was requested.)
      const allowed = await ensureProviderHost(provider);
      if (!allowed) {
        showToast("Allow access to " + providerName(provider) + " in the window that opened, then click Resume again.", false);
        return;
      }
      // Confirm the key actually works (catches invalid/expired keys here).
      showToast("Checking your " + providerName(provider) + " API key…", true);
      try {
        await Continuum.llmCompressor.verifyKey({ provider: provider, apiKey: key });
      } catch (e) {
        console.warn("[Continuum] resume: key check failed:", e);
        const reason = Continuum.llmCompressor.friendlyError ? Continuum.llmCompressor.friendlyError(e) : "couldn't compress";
        showToast("Resume canceled — " + reason + ". Check Settings.", false);
        return;
      }
    }
    // Clipboard copy is the fallback: if auto-fill fails (e.g. the AI site changed
    // its composer markup), the user can still paste.
    const ok = await copyToClipboard(buildHandoff(currentDetail));
    const marker = {
      sessionId: currentDetail.id,
      includeFiles: includeFilesEnabled,
      includeImages: includeImagesEnabled,
      compress: compressEnabled,
      format: markdownEnabled ? "markdown" : "pdf",
      target: target,
      ts: Date.now(),
    };

    // Resume IN THIS TAB when the chat we're resuming targets the same AI this
    // empty new-chat tab is already on — no second tab opened, the saved chat just
    // fills into the composer right here. (If the chat already has turns, or the
    // target AI differs, fall through to opening a fresh tab on that AI.)
    const resumeHere =
      currentProviderId() === target &&
      !currentChatHasMessages() &&
      Continuum.resumeInjector &&
      typeof Continuum.resumeInjector.performResume === "function";
    if (resumeHere) {
      showToast(ok ? "Resuming in this chat…" : "Resuming (clipboard copy failed)", ok);
      close(); // get the panel out of the way so the composer is visible as it fills
      try {
        await Continuum.resumeInjector.performResume(marker);
      } catch (e) {
        console.warn("[Continuum] in-place resume failed:", e);
      }
      return;
    }

    // Otherwise hand off to a fresh tab via a small marker; the resume-injector
    // there reads it, loads this session from IndexedDB, and auto-fills the
    // composer + files.
    try {
      await new Promise((resolve) => {
        chrome.storage.local.set({ "continuum.pendingResume": marker }, () => resolve());
      });
    } catch (e) {
      console.warn("[Continuum] could not set pendingResume marker:", e);
    }
    window.open(RESUME_URLS[target], "_blank", "noopener");
    showToast(ok ? "Opening " + providerName(target) + " — filling it in…" : "Opened chat (clipboard copy failed)", ok);
  }

  async function onCopy() {
    if (!currentDetail) return;
    // Copy is the clean, shareable verbatim view (buildReadableTranscript) —
    // "You"/"Claude" labels, tidy attachment refs. Never compressed; distinct
    // from the machine-format handoff used by Resume/ZIP.
    const ok = await copyToClipboard(buildReadableTranscript(currentDetail));
    showToast(ok ? "Chat history copied" : "Copy failed — see console", ok);
  }

  // The default base name (no extension) for a session's saved file.
  function defaultSaveName(session) {
    const safe = ((session && session.title) || "session").replace(/[^\w.-]+/g, "-").slice(0, 60);
    return "continuum-" + safe;
  }
  // Clean a user-typed name into a safe base (no extension): drop a typed extension,
  // allow letters/digits/space/().-_, collapse runs, cap length; fall back to default.
  function sanitizeSaveName(raw, session) {
    const base = String(raw == null ? "" : raw)
      .replace(/\.(zip|pdf|md|markdown)$/i, "")
      .replace(/[^\w.\- ()]+/g, "-")
      .replace(/\s+/g, " ")
      .replace(/-{2,}/g, "-")
      .trim()
      .slice(0, 80)
      .replace(/^[.\-]+|[.\-]+$/g, "")
      .trim();
    return base || defaultSaveName(session);
  }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ── Shared file-name dialog ──
  // Both "Save as file" (.zip) and "Download resume file" (.pdf/.md) open the same
  // small modal to name the download first. `onConfirm(name)` does the actual build.
  let _nameDialogOnConfirm = null;
  function openNameDialog(opts) {
    _nameDialogOnConfirm = opts.onConfirm || null;
    panelEl.querySelector("[data-savefile-title]").textContent = opts.title || "Save as file";
    panelEl.querySelector("[data-savefile-ext]").textContent = "." + opts.ext;
    const input = panelEl.querySelector("[data-savefile-name]");
    if (input) input.value = opts.defaultName || "";
    lockPanelForDialog();
    panelEl.querySelector("[data-savefile-dialog]").classList.add("open");
    if (input) {
      input.focus();
      input.select(); // select-all so the user can immediately retype
    }
  }
  function closeNameDialog() {
    _nameDialogOnConfirm = null;
    panelEl.querySelector("[data-savefile-dialog]").classList.remove("open");
    unlockPanelForDialog();
  }
  function onNameConfirm() {
    const cb = _nameDialogOnConfirm;
    const input = panelEl.querySelector("[data-savefile-name]");
    const name = sanitizeSaveName(input && input.value, currentDetail);
    closeNameDialog();
    if (cb) cb(name);
  }

  // "Save as file" → name + download the .zip archive (transcript.md + attachments).
  function onSaveFile() {
    if (!currentDetail) return;
    openNameDialog({
      title: "Save chat as file",
      defaultName: defaultSaveName(currentDetail),
      ext: "zip",
      onConfirm: doZipSave,
    });
  }
  async function doZipSave(name) {
    const session = currentDetail;
    if (!session) return;
    const ff = self.fflate || (typeof fflate !== "undefined" ? fflate : null);
    if (!ff) {
      showToast("Zip library missing — see console", false);
      console.error("[Continuum] fflate not loaded");
      return;
    }
    try {
      // The .zip carries the full verbatim conversation as transcript.md plus
      // its attachments — the readable record.
      const entries = await buildZipEntries(session);
      // fflate level 9 = max DEFLATE compression (same as 7-Zip "Ultra" on the
      // zip format). Bigger win on text, near-zero on PNG/JPG/PDF since those
      // are already compressed inside themselves — but harmless to ask for.
      const zipped = ff.zipSync(entries, { level: 9 });
      downloadBlob(new Blob([zipped], { type: "application/zip" }), name + ".zip");
      showToast("Saved .zip to downloads", true);
    } catch (err) {
      console.error("[Continuum] save failed:", err);
      showToast("Save failed — see console", false);
    }
  }

  // "Download resume file" → name + download the EXACT handoff that gets attached on
  // resume, in the selected format (PDF/MD) and honoring "Compress with AI".
  function downloadFmtLabel() {
    return markdownEnabled ? "MD" : "PDF";
  }
  function updateDownloadLabel() {
    const el = panelEl && panelEl.querySelector("[data-download-resume-label]");
    if (el) el.textContent = "Download " + downloadFmtLabel();
  }
  function onDownloadResume() {
    if (!currentDetail) return;
    const fmt = markdownEnabled ? "md" : "pdf";
    openNameDialog({
      title: "Download resume file",
      defaultName: defaultSaveName(currentDetail),
      ext: fmt,
      onConfirm: (name) => doDownloadResume(name, fmt),
    });
  }
  // Runs the same AI compression the resume uses (only when the toggle is on).
  // Returns the (possibly compressed) session, or null if compression was requested
  // but couldn't run — caller aborts so we never hand over the wrong file silently.
  async function compressForDownload(session) {
    if (!(Continuum.llmCompressor && Continuum.llmCompressor.compressSession)) {
      showToast("AI compression unavailable — see console", false);
      return null;
    }
    let provider = "anthropic";
    let apiKey = "";
    try {
      const s = await Continuum.settings.getSettings();
      if (s && s.compressProvider) provider = s.compressProvider;
      if (s && s.compressApiKeys && typeof s.compressApiKeys[provider] === "string") apiKey = s.compressApiKeys[provider];
    } catch (e) {
      /* fall through to the no-key guard */
    }
    if (!apiKey) {
      showToast("Add an API key in Settings to compress", false);
      return null;
    }
    try {
      showToast("Compressing with AI…", true);
      const compressed = await Continuum.llmCompressor.compressSession(session, { provider: provider, apiKey: apiKey, onProgress: function () {} });
      return compressed || session;
    } catch (e) {
      const reason = Continuum.llmCompressor.friendlyError ? Continuum.llmCompressor.friendlyError(e) : "compression failed";
      console.error("[Continuum] download: compression failed:", e);
      showToast("Compression failed — " + reason, false);
      return null;
    }
  }
  async function doDownloadResume(name, fmt) {
    let session = currentDetail;
    if (!session) return;
    try {
      if (compressEnabled) {
        const c = await compressForDownload(session);
        if (!c) return; // requested but couldn't run — abort (toast already shown)
        session = c;
      }
      if (fmt === "md") {
        const raw = buildHandoff(session);
        const md =
          Continuum.pdfExport && Continuum.pdfExport.cleanHandoffMarkdown
            ? Continuum.pdfExport.cleanHandoffMarkdown(raw)
            : raw;
        downloadBlob(new Blob([md], { type: "text/markdown" }), name + ".md");
        showToast("Saved .md to downloads", true);
      } else {
        if (!(Continuum.pdfExport && Continuum.pdfExport.buildResumePdf)) {
          showToast("PDF export unavailable — see console", false);
          return;
        }
        showToast("Building PDF…", true);
        const blob = await Continuum.pdfExport.buildResumePdf(session, { onProgress: function () {} });
        downloadBlob(blob, name + ".pdf");
        showToast("Saved .pdf to downloads", true);
      }
    } catch (err) {
      console.error("[Continuum] download resume file failed:", err);
      showToast("Download failed — see console", false);
    }
  }

  // ── Delete dialog ──
  // Freeze + top-align the panel scroll while a dialog is open, so the inset:0
  // backdrop dims the whole visible card (not a content-height slice anchored to a
  // scrolled-down position). Restored on close.
  function lockPanelForDialog() {
    panelEl.scrollTop = 0;
    panelEl.classList.add("cn-dialog-open");
  }
  function unlockPanelForDialog() {
    panelEl.classList.remove("cn-dialog-open");
  }
  function openDialog() {
    lockPanelForDialog();
    panelEl.querySelector("[data-dialog]").classList.add("open");
    panelEl.querySelector("[data-dlg-confirm]").focus();
  }
  function closeDialog() {
    _bulkDeleteIds = null; // a cancelled/closed dialog must not leave a bulk batch queued
    panelEl.querySelector("[data-dialog]").classList.remove("open");
    unlockPanelForDialog();
  }
  async function onConfirmDelete() {
    // Bulk path: a set of ids was queued from select mode.
    if (_bulkDeleteIds && _bulkDeleteIds.length) {
      const ids = _bulkDeleteIds;
      _bulkDeleteIds = null;
      let ok = 0;
      for (const id of ids) {
        try {
          await Continuum.storage.deleteSession(id);
          ok++;
        } catch (err) {
          console.error("[Continuum] bulk delete failed for", id, err);
        }
      }
      closeDialog();
      exitSelectMode(); // clears selection + re-renders the list
      showCaptureStatus(ok + (ok === 1 ? " session deleted" : " sessions deleted"), true);
      return;
    }
    // Single path: the session open in the detail view.
    if (!currentDetail) return closeDialog();
    const id = currentDetail.id;
    // Keep that AI's folder OPEN after the delete (read before showMain nulls it),
    // so you can keep deleting chats from the same provider without re-expanding.
    const provider = String(currentDetail.sourceProvider || "").toLowerCase() || null;
    try {
      await Continuum.storage.deleteSession(id);
      _expandProviderOnce = provider;
      closeDialog();
      showMain();
      await refreshSavedList();
      showCaptureStatus("Session deleted", true);
    } catch (err) {
      console.error("[Continuum] delete failed:", err);
      closeDialog();
      showToast("Delete failed — see console", false); // still in detail view
    }
  }

  // ── multi-select (bulk delete) ─────────────────────────────────────────
  function updateSelectBar() {
    const btn = panelEl && panelEl.querySelector("[data-delete-selected]");
    if (!btn) return;
    const n = _selectedIds.size;
    btn.textContent = "Delete (" + n + ")";
    btn.disabled = n === 0;
  }
  function enterSelectMode() {
    _selectMode = true;
    _selectedIds.clear();
    refreshSavedList(); // re-render: checkboxes on, all folders open, bar shown
  }
  function exitSelectMode() {
    _selectMode = false;
    _selectedIds.clear();
    refreshSavedList();
  }
  // Tick every session currently in the list (across all provider folders).
  async function selectAllVisible() {
    try {
      const all = await Continuum.storage.listSessions();
      for (const s of all) _selectedIds.add(s.id);
    } catch (e) {
      /* best-effort */
    }
    refreshSavedList();
  }
  function openBulkDeleteDialog() {
    _bulkDeleteIds = [..._selectedIds];
    const n = _bulkDeleteIds.length;
    const titleEl = panelEl.querySelector("[data-dlg-title]");
    const subEl = panelEl.querySelector("[data-dlg-sub]");
    if (titleEl) titleEl.textContent = "Delete " + n + (n === 1 ? " session?" : " sessions?");
    if (subEl) subEl.textContent = "This can't be undone.";
    openDialog();
  }

  function openResetDialog() {
    lockPanelForDialog();
    panelEl.querySelector("[data-reset-dialog]").classList.add("open");
    panelEl.querySelector("[data-reset-cancel]").focus(); // default to the safe choice
  }
  function closeResetDialog() {
    panelEl.querySelector("[data-reset-dialog]").classList.remove("open");
    unlockPanelForDialog();
  }
  async function onConfirmReset() {
    try {
      await Continuum.settings.resetAll(); // wipe sessions, media, settings, caches
      statsCache = {};
      startedCache = {};
      currentDetail = null;
      closeResetDialog();
      applyTheme();             // theme is back to default — reflect it now
      showMain();               // land on the main view (Current chat + Capture)
      await refreshSavedList(); // saved list is now empty
      refreshCurrentChat();
      // Green inline confirmation under the Capture button (matches "Session
      // saved"/"Session deleted"), auto-hides after ~2s.
      showCaptureStatus("Continuum reset to defaults", true);
    } catch (err) {
      console.error("[Continuum] factory reset failed:", err);
      closeResetDialog();
      showToast("Reset failed — see console", false);
    }
  }

  // ── Open / close ─────────────────────────────────────────────────────
  function open(root) {
    // Kick off settings init in the background; it's safe to run on every open
    // because init() is idempotent (returns a cached promise after the first call).
    // We don't await here — the panel can render before init resolves, and the
    // theme applies the moment settings finishes loading.
    if (Continuum.settings) {
      Continuum.settings.init().then(() => {
        if (panelEl) applyTheme();
      }).catch((err) => console.warn("[Continuum] settings init failed:", err));
    }
    if (!panelEl) build(root);
    showMain();
    refreshCurrentChat();
    refreshSavedList();
    requestAnimationFrame(() => {
      panelEl.classList.add("open");
      backdropEl.classList.add("open");
    });
    isOpen = true;
    startLiveRefresh();
  }

  function close() {
    stopLiveRefresh();
    if (panelEl) panelEl.classList.remove("open");
    if (backdropEl) backdropEl.classList.remove("open");
    closeDialog && panelEl && closeDialog();
    _pendingMainStatus = null; // don't surface a stale "saved" status on reopen
    isOpen = false;
  }

  function toggle(root) {
    if (isOpen) close();
    else open(root);
  }

  Continuum.ui = Continuum.ui || {};
  Continuum.ui.panel = { open, close, toggle, refreshSavedList, isOpen: () => isOpen };

  // Exposed for the resume-injector (runs in the freshly-opened chat tab), so it
  // can rebuild the same handoff markdown + attachment files this panel produces.
  Continuum.handoff = { buildHandoff, collectResumeFiles };
})();
