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

  // Per-image vision-token cost for an EMBEDDED (downscaled ~1024px) image — the
  // MEDIAN across the four supported providers' published formulas, so it isn't
  // tied to any one model. A PDF embeds each image (the model pays these tokens to
  // actually see it); Markdown only references images by name (≈0 extra).
  function visionTokensPerImage() {
    const w = 1024, h = 1024; // pdf-export caps the embedded long edge ~1024px
    const claude = Math.round((w * h) / 750); // ~1398 (Anthropic tiles)
    const oaiTiles = Math.ceil(w / 512) * Math.ceil(h / 512); // 2×2 = 4
    const openai = 85 + 170 * oaiTiles; // ~765
    const gemini = 258 * Math.ceil(w / 768) * Math.ceil(h / 768); // 258 × 2×2 = 1032
    const perplexity = openai; // OpenAI-shaped
    const vals = [claude, openai, gemini, perplexity].sort((a, b) => a - b);
    return Math.round((vals[1] + vals[2]) / 2); // median of 4 ≈ 900
  }
  const VISION_TOKENS_PER_IMAGE = visionTokensPerImage();

  function embeddedImageCount(session) {
    let n = 0;
    for (const turn of (session && session.turns) || []) {
      for (const att of turn.attachments || []) {
        if (att && att.type === "image" && att.mediaId) n++;
      }
    }
    return n;
  }

  // Format-aware token estimate for the resume payload: the handoff text PLUS, for
  // PDF, the vision cost of each embedded image (Markdown references images by name
  // so it pays ≈0 extra → genuinely cheaper). The SAME function backs the per-chat
  // estimate in the panel and the real before/after readout on resume, so the two
  // always agree. Pass { markdown: true } for the MD format.
  function payloadTokens(session, opts) {
    const markdown = !!(opts && opts.markdown);
    const build = Continuum.handoff && Continuum.handoff.buildHandoff;
    const text = build ? build(session) : "";
    return estimateTokens(text) + (markdown ? 0 : embeddedImageCount(session) * VISION_TOKENS_PER_IMAGE);
  }

  Continuum.compressor = {
    estimateTokens, formatTokens, payloadTokens, embeddedImageCount, VISION_TOKENS_PER_IMAGE,
  };
})();
