// compressor.js — token estimation for the handoff transcript.
//
// NOTE: the rule-based compression passes (fluff stripping, extractive
// summarization, supersession detection, code dedup, user-message scoring) were
// REMOVED — compression is being rebuilt from scratch (LLM-based). The handoff
// is currently VERBATIM. Only the token estimator remains here, used by the
// panel and the eval gate. New compression will be added back deliberately.

(function () {
  "use strict";
  const Continuum = (window.Continuum = window.Continuum || {});

  // Token estimate. There is NO exact offline tokenizer for current Claude
  // models (Anthropic only counts via its API), so this is necessarily an
  // estimate. The divisor is CALIBRATED against a real BPE tokenizer
  // (gpt-tokenizer) over the test corpus: chars / 4.35 gives ~6% mean absolute
  // error across transcripts spanning prose and heavy code/log content — better
  // than a flat chars/4 (~7.7%). Counting whitespace is correct (leading-space
  // tokens mean spaces aren't "free").
  function estimateTokens(text) {
    return Math.ceil((text || "").length / 4.35);
  }

  // Compact display: "850", "1.2K", "85K".
  function formatTokens(n) {
    if (n < 1000) return String(n);
    if (n < 10000) return (n / 1000).toFixed(1) + "K";
    return Math.round(n / 1000) + "K";
  }

  Continuum.compressor = { estimateTokens, formatTokens };
})();
