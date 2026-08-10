// i18n.js — the single accessor for Continuum's localized interface strings.
//
// WHAT BELONGS HERE: labels Continuum itself draws — buttons, headings, hints,
// dialog copy, aria-labels.
//
// WHAT DOES NOT: anything the user captured. Chat titles, message bodies,
// attachment names, and filenames derived from a chat title are the user's own
// content and must render byte-for-byte as captured, in every locale. Someone
// running Claude in English with Continuum's UI in Spanish still gets their
// English chat titles, and their exported PDF/Markdown is unchanged — those
// exporters are deliberately not wired to i18n, because an exported document
// is a portable artifact handed to another model or another person.
//
// Falls back to the raw key rather than throwing if a message is missing, so a
// gap shows up as a visible token in the UI instead of a blank control. (In
// practice tools/build-locales.js fails the build first — every locale is
// verified complete before a package is written.)

(function () {
  "use strict";

  const Continuum = (window.Continuum = window.Continuum || {});

  // chrome.i18n exists in content scripts on both Chrome and Firefox, but guard
  // anyway: the panel also renders in contexts (tests, the odd torn-down page)
  // where the extension APIs have gone away.
  function getMessage(key, subs) {
    try {
      if (typeof chrome !== "undefined" && chrome.i18n && chrome.i18n.getMessage) {
        const out = chrome.i18n.getMessage(key, subs);
        if (out) return out;
      }
    } catch (e) {
      /* extension context invalidated — fall through to the key */
    }
    return key;
  }

  // t("uiDeleteCount", 3) → "Delete (3)". Substitutions map to $1..$9 in
  // messages.json; pass a single value or an array.
  function t(key, subs) {
    if (subs === undefined || subs === null) return getMessage(key);
    return getMessage(key, Array.isArray(subs) ? subs.map(String) : [String(subs)]);
  }

  // Escapes a translated string for interpolation into an HTML template. Used
  // for every message EXCEPT the handful that intentionally carry markup
  // (uiFormatHint, uiGrantedDesc) — those are authored by us and bundled, never
  // user-supplied, so they go in raw via tRaw.
  function tEsc(key, subs) {
    return String(t(key, subs))
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const tRaw = t;

  Continuum.i18n = { t, tEsc, tRaw };
})();
