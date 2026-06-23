// session-model.js — helpers for the normalized session format.
// Provider adapters PRODUCE this shape; core (storage, future handoff builder)
// CONSUMES it. Keeping the shape in one place means adapters stay swappable.
//
// Normalized shape:
// {
//   id, sourceProvider, title, capturedAt, startedAt,
//   stats: { messages, images, files },
//   turns: [ { role, content:[{type:"text",text}], attachments:[{type,mediaId,name}], artifacts:[] } ],
//   media: { [mediaId]: { blob, mimeType, name } }
// }

(function () {
  "use strict";

  const Continuum = (window.Continuum = window.Continuum || {});

  function uuid() {
    if (crypto && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    // Fallback for older runtimes — good enough for local IDs.
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function createSession({ title, startedAt = null, sourceProvider = "claude" } = {}) {
    return {
      id: uuid(),
      sourceProvider,
      title: title || "Untitled conversation",
      capturedAt: new Date().toISOString(),
      startedAt: startedAt || null,
      stats: { messages: 0, images: 0, files: 0 },
      turns: [],
      media: {},
    };
  }

  // Stores a blob in the session's media map and returns the generated mediaId.
  // Adapters reference this id from a turn's attachments[].
  function addMedia(session, blob, mimeType, name) {
    const mediaId = uuid();
    session.media[mediaId] = { blob, mimeType: mimeType || (blob && blob.type) || "", name: name || "" };
    return mediaId;
  }

  // Recomputes stats.{messages,images,files,artifacts} from the turns.
  // Call after capture.
  function recomputeStats(session) {
    let images = 0;
    let files = 0;
    let artifacts = 0;
    for (const turn of session.turns) {
      const fromUser = turn.role === "user";
      for (const att of turn.attachments || []) {
        if (att.type === "image") images++;
        // A file YOU uploaded always COUNTS — it's real chat content worth showing,
        // even if its bytes can't be retrieved (e.g. a Claude code-sandbox .zip blob).
        // AI-generated files count when attachable (mediaId) OR when explicitly
        // flagged `generated` — files the model produced (e.g. Claude's download
        // cards) are real chat content worth surfacing by name even though their
        // bytes aren't fetchable. Whether a counted file can actually be ATTACHED
        // is a SEPARATE check: the "Attach files" toggle keys on mediaId, so an
        // un-fetchable file shows in the count but offers no attach option (you
        // can't attach what we couldn't capture). Applies to all providers.
        // Pasted content (text pasted into the chat) is NOT a file — it rides in the
        // transcript as text — so it never counts here.
        else if (att.type === "file" && !att.isPasted && (att.mediaId || fromUser || att.generated)) files++;
      }
      artifacts += (turn.artifacts || []).length;
    }
    session.stats = { messages: session.turns.length, images, files, artifacts };
    return session.stats;
  }

  // Single source of truth for "will this attachment actually be UPLOADED on
  // resume?" — used by the panel's "Attach files/images" toggle counts AND both
  // resume builders (collectResumeFiles, collectResumeDocuments), so the count
  // always equals what actually attaches.
  //
  // hasBytes = we captured the file's bytes (mediaId + a real blob). A too-big /
  // download-only upload we could only name-reference has no blob.
  //
  // A FILE is attachable only when we have its bytes AND it isn't text that's
  // already inlined in the transcript: text content (pasted blocks, .md/.csv)
  // rides in the transcript, so re-attaching it would be redundant — only binary
  // files (PDF, DOCX, …) need to ride along as real attachments. Images are
  // attachable whenever we have their bytes.
  function hasBytes(att, media) {
    if (!att || !att.mediaId) return false;
    const m = (media || {})[att.mediaId];
    return !!(m && m.blob);
  }
  function attachableImage(att, media) {
    return !!att && att.type === "image" && hasBytes(att, media);
  }
  function attachableFile(att, media) {
    return !!att && att.type === "file" && att.text == null && hasBytes(att, media);
  }

  // Collapse duplicate attachments. Provider-agnostic; runs once on the whole session at
  // save time. The duplicate identity key (per type) is name + byte-size, so only
  // genuinely identical bytes count as a duplicate — two distinct files/images that share
  // a generic name (Claude's per-page extractions like several "1.png"/"preview-1.jpg")
  // are kept.
  //
  // The two attachment kinds need different policies:
  //   • IMAGES — collapse EVERY duplicate to a single copy. The same picture re-shown
  //     across turns (a user upload the AI echoes, or images Claude extracts from a zip
  //     and re-views over a long agentic chat) should appear once, not many times.
  //   • FILES — ROLE-AWARE: drop a duplicate only when the FIRST occurrence was on a
  //     USER turn (your upload, echoed by the AI). Files that ORIGINATE from the
  //     assistant — a generated .docx it re-presents across turns — are KEPT each time,
  //     so their chip shows on every turn (deduping those wrongly stripped the chips).
  //
  // Pasted text is never touched. Orphaned media blobs left by removed copies are pruned.
  function dedupeAttachments(session) {
    if (!session || !Array.isArray(session.turns)) return session;
    const media = session.media || {};
    const seenRole = new Map(); // key -> role of the FIRST turn it appeared on
    const keyFor = (att) => {
      const name = att.name || "";
      const m = att.mediaId ? media[att.mediaId] : null;
      const size = m && m.blob ? m.blob.size : "";
      if (!name && size === "") return null; // too little to match on — never dedup
      // Always include byte-size: two DIFFERENT files/images can share a name (Claude
      // names per-page extractions generically, e.g. several "preview-1.jpg"/"1.png").
      // Keying on name alone collapsed those distinct images into one and dropped the
      // rest. Same name AND same size = genuinely the same bytes → the real duplicate.
      return att.type + "|" + name.toLowerCase() + "|" + size;
    };
    for (const turn of session.turns) {
      if (!Array.isArray(turn.attachments)) continue;
      turn.attachments = turn.attachments.filter((att) => {
        if (!att || att.isPasted || (att.type !== "image" && att.type !== "file")) return true;
        const key = keyFor(att);
        if (key == null) return true;
        if (seenRole.has(key)) {
          // IMAGES: collapse every duplicate to one copy — the SAME picture re-shown
          // across turns (a user upload echoed, or images Claude extracts from a zip and
          // re-views over a long agentic chat) should appear once, not repeatedly.
          if (att.type === "image") return false;
          // FILES: keep the assistant's re-presented files (so a generated .docx shows
          // its chip on every turn it appears); only drop an echo of a file YOU uploaded.
          return seenRole.get(key) !== "user";
        }
        seenRole.set(key, turn.role);
        return true;
      });
    }
    // Prune media blobs no longer referenced by any surviving attachment.
    const used = new Set();
    for (const turn of session.turns) for (const att of turn.attachments || []) if (att.mediaId) used.add(att.mediaId);
    for (const id of Object.keys(media)) if (!used.has(id)) delete media[id];
    return session;
  }

  Continuum.model = {
    uuid, createSession, addMedia, recomputeStats, dedupeAttachments,
    attachableImage, attachableFile,
  };
})();
