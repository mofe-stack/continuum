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
  // estimate. The divisor is CALIBRATED against the o200k_base BPE tokenizer
  // (the GPT-4o / GPT-5.x family, the closest public proxy for modern frontier
  // tokenizers) over the test corpus, whose aggregate is ~4.26 chars/token across
  // prose and code-heavy transcripts — so chars / 4.2 tracks it closely. Counting
  // whitespace is correct (leading-space tokens mean spaces aren't "free").
  // eval-gate.js prints the live o200k error when gpt-tokenizer is installed.
  function estimateTokens(text) {
    return Math.ceil((text || "").length / 4.2);
  }

  // Compact display: "850", "1.2K", "85K".
  function formatTokens(n) {
    if (n < 1000) return String(n);
    if (n < 10000) return (n / 1000).toFixed(1) + "K";
    return Math.round(n / 1000) + "K";
  }

  Continuum.compressor = { estimateTokens, formatTokens };
})();
