// pdf-export.js — builds the single-file "conversation-history.pdf" used by the
// resume flow. The AI sites can't read inside a .zip in-chat, but they CAN read a
// PDF (text) and SEE images embedded in PDF pages (vision) — so a PDF is the only
// single attachment that carries the whole conversation in a form the model can
// actually use.
//
// Layout: the handoff markdown is laid out as monospaced text (Courier keeps the
// ASCII diagrams / code aligned), paginated automatically. Each image is embedded
// INLINE at the point its `![…](images/…)` reference appears, so it stays in the
// transcript's order/flow. Text-file contents are already inlined in the markdown.
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
  const MAX_IMG_PAGE_FRACTION = 0.6;
  const YIELD_EVERY_LINES = 1500; // unblock the main thread on huge transcripts

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
  // need the ** / _ syntax — it's visual noise). Used by BOTH the resume PDF and the
  // resume conversation-history.md (via cleanHandoffMarkdown), so the two formats
  // render identically. buildHandoff itself KEEPS the Markdown — only this resume
  // render layer strips it — so the ZIP transcript.md + eval-gate parser stay intact.
  //   speaker labels (## User/## Assistant) → "# User" (one #) / "## Assistant"
  //   the compressor's "## Compressed N messages" header → kept at ##
  //   other headings (# Title)               → bare text
  //   **bold** / __bold__                    → text
  //   _italic_ / *italic*                    → text  (so _[Image: x]_ → [Image: x])
  //   `code`                                 → code  (drop backticks, keep the word)
  // Fenced ``` lines and image refs ![](…) pass through unchanged.
  // The compressed handoff brief's own section headings — keep these as real ##
  // sections (re-leveled to ##) instead of stripping their hashes.
  const BRIEF_HEADINGS = /^(Completed work|Current state|In progress|Next steps|Constraints|Critical context|Discarded attempts|Images|Files)\s*$/i;
  function stripMarkdownLine(line) {
    let s = String(line == null ? "" : line);
    const speaker = s.match(/^\s{0,3}#{1,6}\s+(User|Assistant)\s*$/i);
    if (speaker) return (/^user$/i.test(speaker[1]) ? "# " : "## ") + speaker[1];
    if (/^\s{0,3}#{1,6}\s+Compressed \d/i.test(s)) return s.replace(/^\s{0,3}#{1,6}\s+/, "## ");
    // Continuum handoff-brief heading? Re-level to ## and keep it as a section.
    const headingMatch = s.match(/^\s{0,3}#{1,6}\s+(.+?)\s*$/);
    if (headingMatch && BRIEF_HEADINGS.test(headingMatch[1])) return "## " + headingMatch[1].trim();
    s = s.replace(/^\s{0,3}#{1,6}\s+/, "");
    // Continuum's own whole-line italic markers: _[Image: …]_, _[File: …]_,
    // _Captured from …_, _Verbatim …_. Peel the outer _…_ (inner may hold underscores).
    s = s.replace(/^_(\[(?:Image|File)[^\]]*\][^_]*|Captured from .*|Verbatim .*|.*\(summary\).*)_$/i, "$1");
    s = s.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1");
    s = s.replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?![\w*])/g, "$1$2");
    s = s.replace(/(^|[^\w_])_(?!\s)([^_\n]+?)_(?![\w_])/g, "$1$2");
    s = s.replace(/`([^`\n]+)`/g, "$1");
    return s;
  }
  // Apply the per-line stripper across a whole handoff transcript — but NEVER
  // inside a fenced code block. A ``` / ~~~ line toggles "code mode"; the fence
  // delimiters and every line between them pass through byte-for-byte, so code
  // keeps its `#` comments, `**`/`*` (exponents, pointers, globs), backticks, and
  // indentation exactly. (Without this, the resume PDF/.md silently corrupted code
  // even though the compressor preserved it verbatim.)
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

  // Decode an image blob, downscale to MAX_IMG_DIM, and JPEG-encode via canvas.
  // (jsPDF also doesn't reliably accept WEBP, which the AI sites serve a lot of —
  // re-encoding to JPEG fixes that too.) Returns { dataUrl, format, w, h } or null.
  async function blobToImage(blob) {
    try {
      const bmp = await createImageBitmap(blob);
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

    // Map archive path (e.g. "images/foo.png") → image blob, so we can embed the
    // right picture when its reference is reached in the text stream.
    const media = session.media || {};
    const imgByPath = new Map();
    for (const turn of session.turns || []) {
      for (const att of turn.attachments || []) {
        if (att.type === "image" && att._path && att.mediaId) {
          const m = media[att.mediaId];
          if (m && m.blob) imgByPath.set(att._path, { blob: m.blob, name: att.name });
        }
      }
    }
    const totalImages = imgByPath.size;

    // compress: true → jsPDF deflate-compresses the content streams (lossless).
    // Shrinks the FILE for upload; does NOT change what the model reads (that's
    // opts.compress → buildHandoff above).
    const doc = new JsPDF({ unit: "pt", format: "a4", compress: true });
    const MARGIN = 40;
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const contentW = pageW - MARGIN * 2;
    const LINE_H = 12;
    doc.setFont("courier", "normal");
    doc.setFontSize(9);

    let y = MARGIN;
    let lineCount = 0;
    let imagesDone = 0;
    const newPage = () => {
      doc.addPage();
      y = MARGIN;
    };
    const ensure = (h) => {
      if (y + h > pageH - MARGIN) newPage();
    };

    // Strip characters jsPDF's built-in (Latin-1) fonts CANNOT encode — chiefly
    // emoji and other astral-plane chars (surrogate pairs). ROOT CAUSE of the
    // "M a d r i d" letter-spacing: when a line contains even one such char, jsPDF
    // re-encodes the WHOLE line as UTF-16, putting a null byte (\0) before every
    // character, which PDF viewers render as a visible gap between every letter. The
    // transcript text itself is fine — this is purely a render-time font limitation,
    // so we fix it here (not in buildHandoff). Smart punctuation is folded to ASCII
    // so it renders cleanly too; a placeholder marks where an emoji was removed.
    function stripUnencodable(s) {
      return String(s == null ? "" : s)
        .replace(/[‘’‚‛]/g, "'")
        .replace(/[“”„]/g, '"')
        .replace(/[–—―]/g, "-")
        .replace(/…/g, "...")
        .replace(/ /g, " ")
        // Emoji / astral-plane (surrogate pairs) — drop them (and any lone surrogate).
        .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "")
        .replace(/[\uD800-\uDFFF]/g, "")
        // Any remaining char outside Latin-1 (what the standard font can show) →
        // drop, so a single stray glyph can never re-trigger the UTF-16 whole-line
        // spacing. Newline + tab are explicitly KEPT (they're below U+0020) so the
        // transcript's line structure survives — splitTextToSize relies on them.
        .replace(/[^ -ÿ\n\t]/g, "");
    }

    // Hard-break any single token longer than the content width (long URLs,
    // unbroken strings) so it wraps instead of running off the page.
    function hardWrapLongTokens(line) {
      const words = line.split(" ");
      const out = [];
      for (const w of words) {
        if (doc.getTextWidth(w) <= contentW) { out.push(w); continue; }
        let cur = "";
        for (const ch of w) {
          if (doc.getTextWidth(cur + ch) > contentW && cur) { out.push(cur); cur = ch; }
          else cur += ch;
        }
        if (cur) out.push(cur);
      }
      return out.join(" ");
    }

    async function writeText(block) {
      // Strip cosmetic Markdown (cleanHandoffMarkdown), then strip unencodable chars
      // + hard-wrap. The resume .md applies the SAME cleanup, so PDF and .md match.
      // (Image refs ![](…) are pulled out upstream and embedded, never reaching here.)
      const normalized = hardWrapLongTokens(stripUnencodable(cleanHandoffMarkdown(block)));
      const lines = doc.splitTextToSize(normalized, contentW);
      for (const ln of lines) {
        ensure(LINE_H);
        doc.text(ln, MARGIN, y);
        y += LINE_H;
        if (++lineCount % YIELD_EVERY_LINES === 0) {
          onProgress("Laying out text…");
          await yieldToEventLoop();
        }
      }
    }

    async function embedImage(info) {
      const img = await blobToImage(info.blob);
      imagesDone++;
      onProgress("Embedding images… (" + imagesDone + "/" + totalImages + ")");
      if (!img) {
        await writeText("[image could not be embedded: " + (info.name || "") + "]");
        return;
      }
      let w = contentW;
      let h = img.h * (w / img.w);
      // Cap drawn height so a tall image doesn't take a whole page (see constant).
      const maxH = (pageH - MARGIN * 2) * MAX_IMG_PAGE_FRACTION;
      if (h > maxH) {
        h = maxH;
        w = img.w * (h / img.h);
      }
      ensure(h + 8);
      try {
        doc.addImage(img.dataUrl, img.format, MARGIN, y, w, h);
        y += h + 8;
      } catch (e) {
        await writeText("[image embed failed: " + (info.name || "") + "]");
      }
      await yieldToEventLoop(); // keep the tab responsive between images
    }

    // Stream the transcript; flush accumulated text, then embed an image whenever
    // a line is an image reference we have the bytes for.
    const imgRefRe = /!\[[^\]]*\]\(([^)]+)\)/;
    const lines = text.split("\n");
    let buf = [];
    const flush = async () => {
      if (buf.length) {
        const block = buf.join("\n");
        buf = [];
        await writeText(block);
      }
    };
    for (const line of lines) {
      const m = line.match(imgRefRe);
      if (m && imgByPath.has(m[1])) {
        await flush();
        await embedImage(imgByPath.get(m[1]));
      } else {
        buf.push(line);
      }
    }
    await flush();

    // Documents (PDF/DOCX/…) are NOT merged — they're attached separately by the
    // resume flow (see collectResumeDocuments). The transcript already references
    // them by name, so nothing more to add here.
    const blob = doc.output("blob");

    try {
      console.log(
        "[Continuum] resume PDF: " +
          (blob.size / 1048576).toFixed(2) +
          " MB, " +
          imagesDone +
          "/" +
          totalImages +
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
