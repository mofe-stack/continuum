// locale-names.js — locale code → plain English folder name.
//
// The store-listing output folders are named in English rather than by locale
// code, because "de" / "pt_BR" / "zh_CN" don't tell you at a glance which
// language you're uploading. The code still appears inside each listing.txt,
// since that's what the dashboard's language picker is keyed on.
//
// Not tracked in git: marketing tooling, same as tiles.js and frames.js.
"use strict";

const ENGLISH_NAME = {
  en: "english",
  es: "spanish",
  pt_BR: "portuguese-brazil",
  de: "german",
  fr: "french",
  ja: "japanese",
  zh_CN: "chinese-simplified",
  ru: "russian",
  ko: "korean",
  it: "italian",
  tr: "turkish",
};

// The label the Chrome Web Store dashboard shows in its language dropdown, so
// listing.txt can name the exact entry to pick.
const STORE_LABEL = {
  en: "English",
  es: "Spanish",
  pt_BR: "Portuguese (Brazil)",
  de: "German",
  fr: "French",
  ja: "Japanese",
  zh_CN: "Chinese (Simplified)",
  ru: "Russian",
  ko: "Korean",
  it: "Italian",
  tr: "Turkish",
};

module.exports = { ENGLISH_NAME, STORE_LABEL };
