// pdf-export.js — builds the single-file "conversation-history.pdf" used by the
// resume flow. The AI sites can't read inside a .zip in-chat, but they CAN read a
// PDF (text) and SEE images embedded in PDF pages (vision) — so a PDF is the only
// single attachment that carries the whole conversation in a form the model can
// actually use.
//
// RENDERING: the handoff markdown is rendered to look like the original AI chat —
// proportional Helvetica prose, rendered **bold**/headings/bullets/links, user
// messages in right-aligned grey bubbles, and each assistant turn headed by the
// source model's logo + name (Claude, ChatGPT, …). Code/fenced blocks stay in a
// monospaced (Courier) band so ASCII diagrams and code keep their alignment. The
// text is still real, selectable PDF text, so a resuming model reads it fine.
// Each image is embedded INLINE at the point its reference appears, so it stays in
// the transcript's order/flow. Text-file contents are already inlined in the markdown.
//
// Binary DOCUMENTS (PDF, DOCX, …) are deliberately NOT merged into this PDF — they
// ride alongside as their own attachments (the AI sites read multiple files fine),
// and the transcript references them by name. `collectResumeDocuments` gathers
// them for the resume flow. Only images get embedded here.
//
// SCALE: large chats can carry ~100 images. Embedding full-resolution PNGs makes
// a huge (50–100 MB), slow-to-build PDF that the AI sites reject on upload. So we
// DOWNSCALE every image to a sane max dimension and JPEG-encode it — model vision
// downsamples large images anyway (Claude, e.g., to ~1568px), so this loses nothing the
// model would see while cutting the file to a few MB. We also yield to the event
// loop during the build so the tab doesn't freeze.
//
// Depends on the vendored jsPDF (window.jspdf.jsPDF) and Continuum.handoff.

(function () {
  "use strict";

  const Continuum = (window.Continuum = window.Continuum || {});

  // Image downscaling: cap the longest side and JPEG-encode. Tuned for VISION
  // TOKEN cost + PDF size, not visual fidelity — the resume PDF exists for the
  // model to READ, not for a human to admire. Both target models downsample
  // internally, so anything above their ceiling is pure waste (more tokens, bigger
  // upload, zero benefit the model sees):
  //   • Claude resizes the long edge to ≤1568px and caps ~1600 tokens/image.
  //   • GPT-4o tiles at 512px (high-detail cap 768×2048).
  // 1024px sits comfortably above what either model resolves for typical
  // screenshots/diagrams/charts (text stays legible) while cutting the encoded
  // pixels ~2× vs the old 1400 and far below the 1568 ceiling — so images get
  // noticeably smaller with no readable loss. 0.72 JPEG keeps text crisp at a
  // smaller byte size than 0.8.
  const MAX_IMG_DIM = 1024;
  const JPEG_QUALITY = 0.72;
  // How tall ONE image may be drawn on the page — capped so a tall/portrait image
  // can't hog a whole page (which also pushed the byte size up via a huge draw).
  // 60% of the usable page height is plenty for the model to read it.
  const MAX_IMG_PAGE_FRACTION = 0.5;

  // Restrained, neutral "AI chat" palette (RGB). Matches ChatGPT/Claude reader
  // surfaces: white paper, near-black text, slate greys, one blue for links.
  const COL = {
    text: [15, 23, 42], // slate-900 — body
    muted: [100, 116, 139], // slate-500 — meta / captions
    bubble: [241, 245, 249], // slate-100 — user message bubble
    codeBg: [246, 248, 250], // near slate-50 — code band
    border: [226, 232, 240], // slate-200 — chips / dividers
    link: [37, 99, 235], // blue-600
    white: [255, 255, 255],
  };

  // Source-AI brand identity for the assistant header (name + brand colour). The
  // glyphs below are the official brand marks, drawn in the brand colour; unknown
  // providers fall back to a neutral monogram avatar.
  const PROVIDER = {
    claude: { name: "Claude", color: [217, 119, 87] },
    chatgpt: { name: "ChatGPT", color: [13, 13, 13] },
    openai: { name: "ChatGPT", color: [13, 13, 13] },
    gemini: { name: "Gemini", color: [142, 117, 248] },
    perplexity: { name: "Perplexity", color: [32, 184, 205] },
    grok: { name: "Grok", color: [31, 31, 31] },
    deepseek: { name: "DeepSeek", color: [77, 107, 254] },
    copilot: { name: "Copilot", color: [22, 119, 179] },
  };
  // Official brand glyphs (Simple Icons), rendered in each provider's brand colour.
  const PROVIDER_GLYPH = {
    claude: "m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z",
    chatgpt: "M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z",
    openai: "M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z",
    gemini: "M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81",
    perplexity: "M22.3977 7.0896h-2.3106V.0676l-7.5094 6.3542V.1577h-1.1554v6.1966L4.4904 0v7.0896H1.6023v10.3976h2.8882V24l6.932-6.3591v6.2005h1.1554v-6.0469l6.9318 6.1807v-6.4879h2.8882V7.0896zm-3.4657-4.531v4.531h-5.355l5.355-4.531zm-13.2862.0676 4.8691 4.4634H5.6458V2.6262zM2.7576 16.332V8.245h7.8476l-6.1149 6.1147v1.9723H2.7576zm2.8882 5.0404v-3.8852h.0001v-2.6488l5.7763-5.7764v7.0111l-5.7764 5.2993zm12.7086.0248-5.7766-5.1509V9.0618l5.7766 5.7766v6.5588zm2.8882-5.0652h-1.733v-1.9723L13.3948 8.245h7.8478v8.087z",
  };
  function brandFor(provider) {
    const k = String(provider || "").toLowerCase();
    return (
      PROVIDER[k] || {
        name: k ? k.charAt(0).toUpperCase() + k.slice(1) : "Assistant",
        color: [100, 116, 139],
      }
    );
  }

  function getJsPDF() {
    // The vendored jsPDF UMD attaches to `globalThis`. On Chrome a content
    // script's globalThis === window, so window.jspdf works; on Firefox the
    // content-script sandbox's globalThis is a SEPARATE object from the page
    // window, so window.jspdf is undefined and we'd wrongly conclude jsPDF isn't
    // loaded (→ resume silently falls back to Markdown). Check globalThis first,
    // then window/self, so the PDF path works in both browsers.
    const ns =
      (typeof globalThis !== "undefined" && globalThis.jspdf) ||
      (typeof window !== "undefined" && window.jspdf) ||
      (typeof self !== "undefined" && self.jspdf) ||
      null;
    return ns && ns.jsPDF ? ns.jsPDF : null;
  }

  const yieldToEventLoop = () => new Promise((r) => setTimeout(r, 0));

  // Strip cosmetic Markdown so the handoff reads as clean prose (the model doesn't
  // need the ** / _ syntax — it's visual noise). KEPT because the resume
  // conversation-history.md still uses it (via resume-injector); the PDF path no
  // longer strips Markdown — it RENDERS it (see buildResumePdf). buildHandoff
  // itself KEEPS the Markdown — only the .md render layer strips it — so the ZIP
  // transcript.md + eval-gate parser stay intact.
  //   speaker labels (## User/## Assistant) → "# User" (one #) / "## Assistant"
  //   the compressor's "## Compressed N messages" header → kept at ##
  //   other headings (# Title)               → bare text
  //   **bold** / __bold__                    → text
  //   _italic_ / *italic*                    → text  (so _[Image: x]_ → [Image: x])
  //   `code`                                 → code  (drop backticks, keep the word)
  // Fenced ``` lines and image refs ![](…) pass through unchanged.
  const BRIEF_HEADINGS = /^(Completed work|Current state|In progress|Next steps|Constraints|Critical context|Discarded attempts|Images|Files)\s*$/i;
  function stripMarkdownLine(line) {
    let s = String(line == null ? "" : line);
    const speaker = s.match(/^\s{0,3}#{1,6}\s+(User|Assistant)\s*$/i);
    if (speaker) return (/^user$/i.test(speaker[1]) ? "# " : "## ") + speaker[1];
    if (/^\s{0,3}#{1,6}\s+Compressed \d/i.test(s)) return s.replace(/^\s{0,3}#{1,6}\s+/, "## ");
    const headingMatch = s.match(/^\s{0,3}#{1,6}\s+(.+?)\s*$/);
    if (headingMatch && BRIEF_HEADINGS.test(headingMatch[1])) return "## " + headingMatch[1].trim();
    s = s.replace(/^\s{0,3}#{1,6}\s+/, "");
    s = s.replace(/^_(\[(?:Image|File)[^\]]*\][^_]*|Captured from .*|Verbatim .*|.*\(summary\).*)_$/i, "$1");
    s = s.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1");
    s = s.replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?![\w*])/g, "$1$2");
    s = s.replace(/(^|[^\w_])_(?!\s)([^_\n]+?)_(?![\w_])/g, "$1$2");
    s = s.replace(/`([^`\n]+)`/g, "$1");
    return s;
  }
  const cleanHandoffMarkdown = (text) => {
    const lines = String(text == null ? "" : text).split("\n");
    let inFence = false;
    const out = [];
    for (const line of lines) {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        out.push(line); // the fence delimiter itself is left as-is
        continue;
      }
      out.push(inFence ? line : stripMarkdownLine(line));
    }
    return out.join("\n");
  };

  // Strip characters jsPDF's built-in (Latin-1) fonts CANNOT encode — chiefly
  // emoji and other astral-plane chars (surrogate pairs). ROOT CAUSE of the
  // "M a d r i d" letter-spacing: when a line contains even one such char, jsPDF
  // re-encodes the WHOLE line as UTF-16, putting a null byte (\0) before every
  // character, which PDF viewers render as a visible gap between every letter.
  // Smart punctuation is folded to ASCII; a removed emoji just disappears. Newline
  // + tab are explicitly kept so line/structure survives.
  function stripUnencodable(s) {
    return String(s == null ? "" : s)
      .replace(/[‘’‚‛]/g, "'")
      .replace(/[“”„]/g, '"')
      .replace(/[–—―]/g, "-")
      .replace(/…/g, "...")
      .replace(/ /g, " ")
      .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "")
      .replace(/[\uD800-\uDFFF]/g, "")
      .replace(/[^ -ÿ\n\t]/g, "");
  }

  // Decode an image blob, downscale to MAX_IMG_DIM, and JPEG-encode via canvas.
  // (jsPDF also doesn't reliably accept WEBP, which the AI sites serve a lot of —
  // re-encoding to JPEG fixes that too.) Returns { dataUrl, format, w, h } or null.
  async function blobToImage(blob) {
    try {
      // Realm-safe: a Firefox page-realm blob (just-captured in-memory session) can
      // break createImageBitmap the same way it breaks arrayBuffer(). Read its bytes
      // via the shared realm-safe reader and rebuild a clean content-script blob.
      let src = blob;
      if (Continuum.media && Continuum.media.readBlobBytes) {
        const r = await Continuum.media.readBlobBytes(blob);
        if (r && r.bytes) src = new Blob([r.bytes], { type: (blob && blob.type) || "image/png" });
      }
      const bmp = await createImageBitmap(src);
      let w = bmp.width;
      let h = bmp.height;
      const scale = Math.min(1, MAX_IMG_DIM / Math.max(w, h));
      w = Math.max(1, Math.round(w * scale));
      h = Math.max(1, Math.round(h * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      // JPEG has no alpha — matte transparency to white so it isn't filled black.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(bmp, 0, 0, w, h);
      if (bmp.close) bmp.close();
      return { dataUrl: canvas.toDataURL("image/jpeg", JPEG_QUALITY), format: "JPEG", w, h };
    } catch (e) {
      console.warn("[Continuum] pdf: could not decode image:", e);
      return null;
    }
  }

  // Rasterize a provider's brand mark (the official glyph in its brand colour) to a
  // PNG data URL for embedding once per document. Returns null for unknown providers
  // or on any failure → the caller draws a monogram circle instead.
  async function makeAvatar(brand, providerKey, px) {
    const glyph = PROVIDER_GLYPH[String(providerKey || "").toLowerCase()];
    if (!glyph) return null; // unknown provider -> drawAvatar() falls back to a monogram
    const rgb = "rgb(" + brand.color[0] + "," + brand.color[1] + "," + brand.color[2] + ")";
    // The brand mark itself, in its brand colour (no circle), padded slightly so it
    // never touches the bitmap edge.
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1.2 -1.2 26.4 26.4" width="' + px + '" height="' + px +
      '"><path fill="' + rgb + '" d="' + glyph + '"/></svg>';
    try {
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
      const img = await new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = rej;
        im.src = url;
      });
      const c = document.createElement("canvas");
      c.width = px;
      c.height = px;
      c.getContext("2d").drawImage(img, 0, 0, px, px);
      URL.revokeObjectURL(url);
      return c.toDataURL("image/png");
    } catch (e) {
      return null;
    }
  }

  // Split a Markdown line into styled runs: **bold**, __bold__, *italic*, `code`,
  // [text](url) links, and bare http(s) URLs. Unencodable chars are stripped up
  // front so every downstream measure/draw is safe.
  function parseInline(raw) {
    const s = stripUnencodable(raw);
    const runs = [];
    const re = /(`+)([^`]*?)\1|\*\*([^*]+?)\*\*|__([^_]+?)__|\*(?!\s)([^*\n]+?)\*|\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s)]+)/g;
    let last = 0;
    let m;
    while ((m = re.exec(s))) {
      if (m.index > last) runs.push({ text: s.slice(last, m.index) });
      if (m[2] != null) runs.push({ text: m[2], code: true });
      else if (m[3] != null) runs.push({ text: m[3], bold: true });
      else if (m[4] != null) runs.push({ text: m[4], bold: true });
      else if (m[5] != null) runs.push({ text: m[5], italic: true });
      else if (m[6] != null) runs.push({ text: m[6], link: m[7] });
      else if (m[8] != null) runs.push({ text: m[8], link: m[8] });
      last = re.lastIndex;
    }
    if (last < s.length) runs.push({ text: s.slice(last) });
    return runs.length ? runs : [{ text: s }];
  }

  // Builds the PDF and returns a Blob (application/pdf). Async: images are decoded
  // and the main thread is yielded periodically. `opts.compress` → buildHandoff;
  // `opts.onProgress(msg)` (optional) is called with human-readable progress.
  async function buildResumePdf(session, opts) {
    const JsPDF = getJsPDF();
    if (!JsPDF) throw new Error("jsPDF not loaded");
    if (!Continuum.handoff || !Continuum.handoff.buildHandoff) {
      throw new Error("Continuum.handoff.buildHandoff missing");
    }
    const onProgress = opts && typeof opts.onProgress === "function" ? opts.onProgress : function () {};

    // buildHandoff also runs assignArchivePaths(session), so att._path is set.
    const text = Continuum.handoff.buildHandoff(session, opts) || "";

    // Two lookups, so an image reference in the text stream finds its bytes whichever
    // form it took: verbatim per-turn refs are "![alt](path)" → matched by PATH; the
    // AI-compression summary refs are "[image: name — context]" (no path) → matched by
    // NAME. Names aren't guaranteed unique, so the name map holds a per-name queue that
    // we consume in transcript order.
    const normName = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
    const media = session.media || {};
    const imgByPath = new Map();
    const imgByName = new Map();
    for (const turn of session.turns || []) {
      for (const att of turn.attachments || []) {
        if (att.type === "image" && att.mediaId) {
          const m = media[att.mediaId];
          if (m && m.blob) {
            const info = { blob: m.blob, name: att.name };
            if (att._path) imgByPath.set(att._path, info);
            const nm = normName(att.name);
            if (nm) {
              if (!imgByName.has(nm)) imgByName.set(nm, []);
              imgByName.get(nm).push(info);
            }
          }
        }
      }
    }

    // compress: true → jsPDF deflate-compresses the content streams (lossless).
    // Shrinks the FILE for upload; does NOT change what the model reads.
    const doc = new JsPDF({ unit: "pt", format: "a4", compress: true });
    // Compact layout: tuned for a dense, few-pages PDF (cheaper for the resuming
    // model to read — a PDF is billed as text PLUS a vision pass per page) while
    // keeping the chat-style formatting.
    const MARGIN = 38;
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const contentW = pageW - MARGIN * 2;
    const BODY = 9; // body font size (pt)
    const LINEH = 11.5; // body line height
    const TURN_GAP = 9; // vertical space between turns

    // ---- low-level text layout: lay styled runs out word-by-word, wrapping to
    // `cfg.maxW`, switching font/colour per run. Advances cursor.y; with
    // cfg.atomic the caller has pre-reserved space so no page breaks happen
    // (used inside bubbles). With draw:false it only measures (height + widest
    // line, recorded in metrics.maxLineW).
    function fontFor(run) {
      if (run.code) return ["courier", "normal"];
      if (run.bold && run.italic) return ["helvetica", "bolditalic"];
      if (run.bold) return ["helvetica", "bold"];
      if (run.italic) return ["helvetica", "italic"];
      return ["helvetica", "normal"];
    }
    function renderRuns(runs, cfg, cursor, metrics) {
      const size = cfg.size;
      const lineH = cfg.lineH;
      const x = cfg.x;
      const maxW = cfg.maxW;
      const setRunFont = (run) => {
        const f = fontFor(run);
        doc.setFont(f[0], f[1]);
        doc.setFontSize(run.code ? size - 0.5 : size);
      };
      const spaceW = () => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(size);
        return doc.getTextWidth(" ");
      };
      // Build a word stream, remembering when a word should glue to the previous
      // one with no space (run boundaries with no whitespace between them).
      const words = [];
      let prevTrail = true;
      let havePrev = false;
      for (const run of runs) {
        const txt = String(run.text == null ? "" : run.text);
        if (!txt) continue;
        const leadSpace = /^\s/.test(txt);
        const trailSpace = /\s$/.test(txt);
        const parts = txt.split(/\s+/).filter((p) => p.length);
        parts.forEach((w, idx) => {
          const glue = idx === 0 ? havePrev && !leadSpace && !prevTrail : false;
          words.push({ text: w, run, glue });
        });
        if (parts.length) {
          havePrev = true;
          prevTrail = trailSpace;
        }
      }

      let line = [];
      let lineW = 0;
      const flush = () => {
        if (cfg.draw && !cfg.atomic && cursor.y + lineH > pageH - MARGIN) {
          doc.addPage();
          cursor.y = MARGIN;
        }
        if (cfg.draw && line.length) {
          let dx = x;
          const baseline = cursor.y + size * 0.78;
          for (const seg of line) {
            setRunFont(seg.run);
            doc.setTextColor.apply(doc, seg.run.link ? COL.link : cfg.color);
            doc.text(seg.text, dx + seg.lead, baseline);
            if (seg.run.link) {
              doc.setDrawColor.apply(doc, COL.link);
              doc.setLineWidth(0.4);
              doc.line(dx + seg.lead, baseline + 1.4, dx + seg.lead + seg.w, baseline + 1.4);
            }
            dx += seg.lead + seg.w;
          }
        }
        if (metrics && lineW > metrics.maxLineW) metrics.maxLineW = lineW;
        cursor.y += lineH;
        line = [];
        lineW = 0;
      };

      for (const word of words) {
        setRunFont(word.run);
        const w = doc.getTextWidth(word.text);
        const sp = line.length === 0 || word.glue ? 0 : spaceW();
        if (w > maxW) {
          // Hard-break an over-wide token (long URL / unbroken string).
          if (line.length) flush();
          let cur = "";
          for (const ch of word.text) {
            if (doc.getTextWidth(cur + ch) > maxW && cur) {
              const cw = doc.getTextWidth(cur);
              line.push({ text: cur, run: word.run, lead: 0, w: cw });
              lineW = cw;
              flush();
              cur = ch;
            } else {
              cur += ch;
            }
          }
          if (cur) {
            line.push({ text: cur, run: word.run, lead: 0, w: doc.getTextWidth(cur) });
            lineW = doc.getTextWidth(cur);
          }
          continue;
        }
        if (line.length && lineW + sp + w > maxW) {
          flush();
          line.push({ text: word.text, run: word.run, lead: 0, w });
          lineW = w;
        } else {
          line.push({ text: word.text, run: word.run, lead: sp, w });
          lineW += sp + w;
        }
      }
      if (line.length) flush();
    }

    // ---- block-level rendering. Each helper advances cursor.y and (when
    // measuring) records the widest content in metrics.maxLineW so a user bubble
    // can be sized to its content.
    function renderHeading(blk, cfg, cursor, metrics) {
      const size = blk.level <= 1 ? 12 : blk.level === 2 ? 10.5 : 10;
      cursor.y += 3;
      const runs = parseInline(blk.text).map((r) => ({ text: r.text, code: r.code, bold: !r.code, link: r.link }));
      renderRuns(runs, { x: cfg.x, maxW: cfg.maxW, size, lineH: size * 1.28, color: COL.text, atomic: cfg.atomic, draw: cfg.draw }, cursor, metrics);
      cursor.y += 1;
    }
    function renderBullet(blk, cfg, cursor, metrics) {
      const indent = (blk.depth || 0) * 14;
      const x = cfg.x + indent;
      const markerW = 13;
      if (cfg.draw && !cfg.atomic && cursor.y + LINEH > pageH - MARGIN) {
        doc.addPage();
        cursor.y = MARGIN;
      }
      const marker = blk.num ? blk.num + "." : "•";
      if (cfg.draw) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(BODY);
        doc.setTextColor.apply(doc, blk.num ? COL.text : COL.muted);
        doc.text(marker, x, cursor.y + BODY * 0.78);
      }
      renderRuns(
        parseInline(blk.text),
        { x: x + markerW, maxW: cfg.maxW - indent - markerW, size: BODY, lineH: LINEH, color: cfg.color, atomic: cfg.atomic, draw: cfg.draw },
        cursor,
        metrics
      );
      if (metrics) metrics.maxLineW = Math.min(cfg.maxW, metrics.maxLineW + indent + markerW);
    }
    function renderCode(blk, cfg, cursor, metrics) {
      const size = 8;
      const clh = 9.8;
      const padX = 7;
      const innerW = cfg.maxW - padX * 2;
      doc.setFont("courier", "normal");
      doc.setFontSize(size);
      const wrapped = [];
      for (const raw of String(blk.code == null ? "" : blk.code).split("\n")) {
        const ln = stripUnencodable(raw).replace(/\t/g, "    ");
        if (!ln || doc.getTextWidth(ln) <= innerW) {
          wrapped.push(ln);
          continue;
        }
        let cur = "";
        for (const ch of ln) {
          if (doc.getTextWidth(cur + ch) > innerW && cur) {
            wrapped.push(cur);
            cur = ch;
          } else {
            cur += ch;
          }
        }
        if (cur) wrapped.push(cur);
      }
      cursor.y += 2;
      // Top pad band.
      const drawBand = (h) => {
        if (cfg.draw) {
          doc.setFillColor.apply(doc, COL.codeBg);
          doc.rect(cfg.x, cursor.y, cfg.maxW, h, "F");
        }
        cursor.y += h;
      };
      drawBand(3);
      for (const wl of wrapped) {
        if (cfg.draw && !cfg.atomic && cursor.y + clh > pageH - MARGIN) {
          doc.addPage();
          cursor.y = MARGIN;
        }
        if (cfg.draw) {
          doc.setFillColor.apply(doc, COL.codeBg);
          doc.rect(cfg.x, cursor.y, cfg.maxW, clh, "F");
          doc.setFont("courier", "normal");
          doc.setFontSize(size);
          doc.setTextColor.apply(doc, COL.text);
          doc.text(wl, cfg.x + padX, cursor.y + clh * 0.72);
        }
        cursor.y += clh;
      }
      drawBand(3);
      cursor.y += 2;
      if (metrics) metrics.maxLineW = cfg.maxW;
    }
    function renderImage(blk, cfg, cursor, metrics) {
      const img = blk.img;
      if (!img) {
        // No bytes for this image → show a minimal IMAGE chip instead of embedding.
        renderChip({ kind: "image", label: blk.name || "image" }, cfg, cursor, metrics);
        return;
      }
      if (blk.caption) {
        renderRuns([{ text: blk.caption, italic: true }], { x: cfg.x, maxW: cfg.maxW, size: 8.5, lineH: 11, color: COL.muted, atomic: cfg.atomic, draw: cfg.draw }, cursor, metrics);
      }
      let drawW = Math.min(cfg.maxW, img.w);
      let drawH = img.h * (drawW / img.w);
      const maxH = (pageH - MARGIN * 2) * MAX_IMG_PAGE_FRACTION;
      if (drawH > maxH) {
        drawH = maxH;
        drawW = img.w * (drawH / img.h);
      }
      if (cfg.draw && !cfg.atomic && cursor.y + drawH > pageH - MARGIN) {
        doc.addPage();
        cursor.y = MARGIN;
      }
      cursor.y += 2;
      if (cfg.draw) {
        try {
          doc.addImage(img.dataUrl, img.format, cfg.x, cursor.y, drawW, drawH);
        } catch (e) {
          /* skip an image jsPDF rejects */
        }
      }
      cursor.y += drawH + 4;
      if (metrics && drawW > metrics.maxLineW) metrics.maxLineW = drawW;
    }
    function drawDocIcon(x, y, s) {
      doc.setDrawColor.apply(doc, COL.muted);
      doc.setLineWidth(0.8);
      doc.roundedRect(x + s * 0.14, y, s * 0.72, s, 1.2, 1.2, "S");
    }
    function drawImageIcon(x, y, s) {
      // A minimal "photo" glyph (frame + sun + mountain) so an image chip reads as an
      // image — distinct from the document glyph used for file chips.
      const fh = s * 0.84;
      const top = y + (s - fh) / 2;
      doc.setDrawColor.apply(doc, COL.muted);
      doc.setFillColor.apply(doc, COL.muted);
      doc.setLineWidth(0.8);
      doc.roundedRect(x, top, s, fh, 1.4, 1.4, "S");
      doc.circle(x + s * 0.3, top + fh * 0.3, s * 0.09, "F");
      doc.triangle(x + s * 0.14, top + fh * 0.86, x + s * 0.46, top + fh * 0.44, x + s * 0.8, top + fh * 0.86, "F");
    }
    // A small attachment chip. `blk.kind` ("image" | "file") picks the glyph so each
    // chip is clearly named as an image or a file. Used for files and for images we
    // couldn't embed (name-only).
    function renderChip(blk, cfg, cursor, metrics) {
      const isImage = blk.kind === "image";
      const h = 17;
      const padX = 7;
      const icon = 10;
      const gap = 5;
      const radius = 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      // Name each chip as a File or Image (in addition to the glyph), e.g. "File · manifest".
      const label = (isImage ? "Image" : "File") + " · " + String(blk.label == null ? "" : blk.label);
      const fullTextW = doc.getTextWidth(label);
      const chipW = Math.min(cfg.maxW, padX * 2 + icon + gap + fullTextW);
      const availTextW = chipW - padX * 2 - icon - gap;
      let shown = label;
      if (fullTextW > availTextW) {
        while (shown.length > 1 && doc.getTextWidth(shown + "…") > availTextW) shown = shown.slice(0, -1);
        shown += "…";
      }
      if (cfg.draw && !cfg.atomic && cursor.y + h > pageH - MARGIN) {
        doc.addPage();
        cursor.y = MARGIN;
      }
      cursor.y += 2;
      if (cfg.draw) {
        doc.setDrawColor.apply(doc, COL.border);
        doc.setFillColor.apply(doc, COL.white);
        doc.setLineWidth(0.8);
        doc.roundedRect(cfg.x, cursor.y, chipW, h, radius, radius, "FD");
        if (isImage) drawImageIcon(cfg.x + padX, cursor.y + (h - icon) / 2, icon);
        else drawDocIcon(cfg.x + padX, cursor.y + (h - icon) / 2, icon);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor.apply(doc, COL.text);
        doc.text(shown, cfg.x + padX + icon + gap, cursor.y + h * 0.66);
      }
      cursor.y += h + 4;
      if (metrics && chipW > metrics.maxLineW) metrics.maxLineW = chipW;
    }
    function renderBlocks(blocks, cfg, cursor, metrics) {
      let prevBlank = true;
      for (const blk of blocks) {
        if (blk.b === "blank") {
          if (!prevBlank) cursor.y += BODY * 0.5;
          prevBlank = true;
          continue;
        }
        prevBlank = false;
        if (blk.b === "h") renderHeading(blk, cfg, cursor, metrics);
        else if (blk.b === "li") renderBullet(blk, cfg, cursor, metrics);
        else if (blk.b === "code") renderCode(blk, cfg, cursor, metrics);
        else if (blk.b === "img") renderImage(blk, cfg, cursor, metrics);
        else if (blk.b === "chip") renderChip(blk, cfg, cursor, metrics);
        else
          renderRuns(
            parseInline(blk.text),
            { x: cfg.x, maxW: cfg.maxW, size: BODY, lineH: LINEH, color: cfg.color, atomic: cfg.atomic, draw: cfg.draw },
            cursor,
            metrics
          );
      }
    }

    // ---- parse the handoff markdown into header items + turns of blocks. Image
    // refs are resolved to their captured bytes here (consumed in transcript order).
    function resolveImage(label, byPath, path) {
      if (path) {
        const info = imgByPath.get(path);
        return info ? { info, caption: label && label !== path ? label : null } : null;
      }
      const sep = label.indexOf(" — ");
      const nm = normName(sep === -1 ? label : label.slice(0, sep));
      const q = imgByName.get(nm);
      const info = q && q.length ? q.shift() : null;
      if (!info) return null;
      return { info, caption: sep === -1 ? null : label.slice(sep + 3).trim() };
    }
    function parseHandoff(src) {
      const lines = src.split("\n");
      const items = [];
      let turn = null;
      let inCode = false;
      let codeLang = "";
      let codeBuf = [];
      let headerDone = false;
      const ensureTurn = () => {
        if (!turn) {
          turn = { t: "turn", role: "assistant", blocks: [] };
          items.push(turn);
        }
        return turn;
      };
      const startTurn = (role) => {
        turn = { t: "turn", role, blocks: [] };
        items.push(turn);
      };
      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        const fence = line.match(/^\s*(```|~~~)(.*)$/);
        if (fence) {
          if (!inCode) {
            inCode = true;
            codeLang = fence[2].trim();
            codeBuf = [];
          } else {
            inCode = false;
            ensureTurn().blocks.push({ b: "code", lang: codeLang, code: codeBuf.join("\n") });
          }
          continue;
        }
        if (inCode) {
          codeBuf.push(line);
          continue;
        }
        const trimmed = line.trim();
        if (!headerDone) {
          const h1 = line.match(/^#\s+(.+)$/);
          if (h1 && items.length === 0) {
            items.push({ t: "title", text: h1[1].trim() });
            continue;
          }
          if (/^_.*_$/.test(trimmed)) {
            items.push({ t: "meta", text: trimmed.replace(/^_/, "").replace(/_$/, "") });
            continue;
          }
          if (trimmed === "---") {
            items.push({ t: "hr" });
            headerDone = true;
            continue;
          }
          if (trimmed === "") continue;
        }
        const sp = line.match(/^##\s+(User|Assistant)\s*$/);
        if (sp) {
          startTurn(sp[1].toLowerCase());
          continue;
        }
        if (trimmed === "") {
          if (turn) turn.blocks.push({ b: "blank" });
          continue;
        }
        ensureTurn();
        let m;
        if ((m = trimmed.match(/^\[image:\s*(.+?)\s*\]$/i))) {
          const r = resolveImage(m[1].trim(), false, null);
          if (r) turn.blocks.push({ b: "img", info: r.info, caption: r.caption, name: m[1].trim() });
          else turn.blocks.push({ b: "chip", kind: "image", label: m[1].trim().split(" — ")[0].trim() });
          continue;
        }
        if ((m = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/))) {
          const r = resolveImage(m[1].trim(), true, m[2].trim());
          if (r) turn.blocks.push({ b: "img", info: r.info, caption: r.caption, name: m[1].trim() });
          else turn.blocks.push({ b: "chip", kind: "image", label: m[1] ? m[1].trim().split(" — ")[0].trim() : "image" });
          continue;
        }
        if ((m = trimmed.match(/^\[(?:generated file|file):\s*(.+?)\s*\]$/i))) {
          turn.blocks.push({ b: "chip", kind: "file", label: m[1].replace(/\s*→\s*\S+$/, "").trim().split(" — ")[0].trim() });
          continue;
        }
        if ((m = line.match(/^(#{1,6})\s+(.+)$/))) {
          turn.blocks.push({ b: "h", level: m[1].length, text: m[2].trim() });
          continue;
        }
        if ((m = line.match(/^(\s*)[-*+]\s+(.+)$/))) {
          turn.blocks.push({ b: "li", text: m[2], depth: Math.floor(m[1].length / 2) });
          continue;
        }
        if ((m = line.match(/^(\s*)(\d+)[.)]\s+(.+)$/))) {
          turn.blocks.push({ b: "li", text: m[3], depth: Math.floor(m[1].length / 2), num: m[2] });
          continue;
        }
        turn.blocks.push({ b: "p", text: line });
      }
      if (inCode) ensureTurn().blocks.push({ b: "code", lang: codeLang, code: codeBuf.join("\n") });
      return items;
    }

    const docModel = parseHandoff(text);

    // Decode every embeddable image up front (with yields + progress) so the layout
    // pass below stays synchronous (bubbles must measure image heights).
    const imgBlocks = [];
    for (const item of docModel) {
      if (item.t === "turn") for (const b of item.blocks) if (b.b === "img") imgBlocks.push(b);
    }
    let imagesDone = 0;
    for (const b of imgBlocks) {
      b.img = await blobToImage(b.info.blob);
      imagesDone++;
      onProgress("Embedding images… (" + imagesDone + "/" + imgBlocks.length + ")");
      await yieldToEventLoop();
    }

    // Prebuild the assistant avatar once (reused via alias on every assistant turn).
    const brand = brandFor(session.sourceProvider);
    const avatarUrl = await makeAvatar(brand, session.sourceProvider, 64);

    // ---- render pass ----
    onProgress("Laying out the conversation…");
    const cursor = { y: MARGIN };
    const drawAvatar = (x, y, D) => {
      if (avatarUrl) {
        try {
          doc.addImage(avatarUrl, "PNG", x, y, D, D, "cn-avatar", "FAST");
          return;
        } catch (e) {
          /* fall through to monogram */
        }
      }
      doc.setFillColor.apply(doc, brand.color);
      doc.circle(x + D / 2, y + D / 2, D / 2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      doc.text((brand.name.charAt(0) || "A").toUpperCase(), x + D / 2, y + D / 2, { align: "center", baseline: "middle" });
    };
    const drawAssistantHeader = () => {
      const D = 15;
      if (cursor.y + D + 4 > pageH - MARGIN) {
        doc.addPage();
        cursor.y = MARGIN;
      }
      drawAvatar(MARGIN, cursor.y, D);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor.apply(doc, COL.text);
      doc.text(brand.name, MARGIN + D + 6, cursor.y + D * 0.5 + 3.2);
      cursor.y += D + 5;
    };
    const renderUserTurn = (t) => {
      const innerMaxW = Math.min(contentW * 0.72, contentW - 40);
      const mCur = { y: 0 };
      const metrics = { maxLineW: 0 };
      renderBlocks(t.blocks, { x: 0, maxW: innerMaxW, color: COL.text, atomic: true, draw: false }, mCur, metrics);
      const padX = 11;
      const padY = 7;
      const bubbleW = Math.min(innerMaxW, Math.max(metrics.maxLineW, 24)) + padX * 2;
      const bubbleH = mCur.y + padY * 2;
      // Generous corners: a one-line bubble becomes a clean pill (radius = half its
      // height); taller multi-line bubbles cap at 14pt so they stay tidy, not blobby.
      const radius = Math.min(14, bubbleH / 2, bubbleW / 2);
      // Bubbles are atomic (drawn as one rect). If one is taller than a whole page,
      // fall back to a plain left-aligned full-width render so nothing is clipped.
      if (bubbleH > pageH - MARGIN * 2) {
        renderBlocks(t.blocks, { x: MARGIN, maxW: contentW, color: COL.text, atomic: false, draw: true }, cursor, { maxLineW: 0 });
        cursor.y += TURN_GAP;
        return;
      }
      if (cursor.y + bubbleH + 4 > pageH - MARGIN) {
        doc.addPage();
        cursor.y = MARGIN;
      }
      const bubbleX = pageW - MARGIN - bubbleW;
      doc.setFillColor.apply(doc, COL.bubble);
      doc.roundedRect(bubbleX, cursor.y, bubbleW, bubbleH, radius, radius, "F");
      const dCur = { y: cursor.y + padY };
      renderBlocks(t.blocks, { x: bubbleX + padX, maxW: bubbleW - padX * 2, color: COL.text, atomic: true, draw: true }, dCur, { maxLineW: 0 });
      cursor.y += bubbleH + TURN_GAP;
    };

    let turnsRendered = 0;
    for (const item of docModel) {
      if (item.t === "title") {
        renderRuns([{ text: item.text, bold: true }], { x: MARGIN, maxW: contentW, size: 14, lineH: 17, color: COL.text, atomic: false, draw: true }, cursor, { maxLineW: 0 });
        cursor.y += 1;
      } else if (item.t === "meta") {
        renderRuns([{ text: item.text }], { x: MARGIN, maxW: contentW, size: 8, lineH: 10.5, color: COL.muted, atomic: false, draw: true }, cursor, { maxLineW: 0 });
      } else if (item.t === "hr") {
        cursor.y += 5;
        doc.setDrawColor.apply(doc, COL.border);
        doc.setLineWidth(1);
        doc.line(MARGIN, cursor.y, pageW - MARGIN, cursor.y);
        cursor.y += 9;
      } else if (item.t === "turn") {
        if (item.role === "user") {
          renderUserTurn(item);
        } else {
          drawAssistantHeader();
          renderBlocks(item.blocks, { x: MARGIN, maxW: contentW, color: COL.text, atomic: false, draw: true }, cursor, { maxLineW: 0 });
          cursor.y += TURN_GAP;
        }
        if (++turnsRendered % 8 === 0) await yieldToEventLoop();
      }
    }

    const blob = doc.output("blob");
    try {
      console.log(
        "[Continuum] resume PDF: " +
          (blob.size / 1048576).toFixed(2) +
          " MB, " +
          imagesDone +
          "/" +
          imgBlocks.length +
          " images embedded"
      );
    } catch (e) {
      /* logging only */
    }
    return blob;
  }

  // Collects the FILES to attach alongside conversation-history.pdf: every
  // byte-backed file attachment (PDF, DOCX, XLSX, …) whose bytes were captured.
  // Inlined-text files (pasted content, uploaded .md/.csv whose text is already
  // in the transcript) are skipped — re-attaching them would just duplicate the
  // content. Images are excluded — they're embedded in the PDF.
  // De-duped by mediaId. Returns [{ name, blob, type }] in transcript order.
  // Uses the same predicate as the Markdown path (collectResumeFiles) and the
  // panel's "Attach files" toggle count, so the count always equals what
  // actually attaches.
  function collectResumeDocuments(session) {
    const media = (session && session.media) || {};
    const M = Continuum.model;
    const out = [];
    const seen = new Set();
    for (const turn of (session && session.turns) || []) {
      for (const att of turn.attachments || []) {
        if (!M.attachableFile(att, media)) continue;
        if (seen.has(att.mediaId)) continue;
        const m = media[att.mediaId];
        seen.add(att.mediaId);
        out.push({
          name: att.name || "document",
          blob: m.blob,
          type: m.blob.type || m.mimeType || "application/octet-stream",
        });
      }
    }
    return out;
  }

  Continuum.pdfExport = { buildResumePdf, collectResumeDocuments, cleanHandoffMarkdown };
})();
